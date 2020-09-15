package db

import (
	"fmt"
	"log"
	"sync"
	"strings"
	"github.com/aws/aws-sdk-go/aws/awserr"
	"github.com/MK4H/go-lambda-benchmark/filePath"
	"github.com/MK4H/go-lambda-benchmark/errors"
	"github.com/aws/aws-sdk-go/aws"
    "github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/aws/aws-sdk-go/service/dynamodb/dynamodbattribute"
)

type PermDB struct {
	tableName string
	client *dynamodb.DynamoDB
}

type MasterEntry struct {
	User string `dynamodbav:"user"`
	Path string `dynamodbav:"path"`
	Read bool `dynamodbav:"read"`
	Write bool `dynamodbav:"write"`
	Users []string `dynamodbav:"users,stringset"`
}

func Create(tableName string, sess *session.Session) PermDB {
	return PermDB{
		tableName: tableName,
		client: dynamodb.New(sess),
	}
}

func (db *PermDB) CreateMasterEntry(filePath filePath.FilePath) error {
	entry := MasterEntry{
		User: filePath.UserID,
		Path: filePath.GetNormalizedPath(),
		Read: true,
		Write: true,
		Users: []string{filePath.UserID},
	}

	item, marshalErr := dynamodbattribute.MarshalMap(entry)
	if marshalErr != nil {
		log.Printf("Failed to create master entry with error: %v", marshalErr)
		return errors.NewServerError("Failed to create master entry")
	}

	_, putError := db.client.PutItem(&dynamodb.PutItemInput{
		TableName: &db.tableName,
		Item: item,
		ConditionExpression: aws.String("attribute_not_exists(#u)"),
		ExpressionAttributeNames: map[string]*string {
			"#u": aws.String("user"),
		},
	})
	if putError != nil {
		if awsErr, ok := putError.(awserr.Error); ok && awsErr.Code() == dynamodb.ErrCodeConditionalCheckFailedException {
			return errors.NewConflictError(fmt.Sprintf("File already exists"))
		}
		log.Printf("Failed to create master entry with error: %v", putError)
		return errors.NewServerError("Failed to create master entry")
	}
	return nil
}

func (db *PermDB) GetMasterEntry(p filePath.FilePath) (MasterEntry, error) {
	result, err := db.client.GetItem(&dynamodb.GetItemInput{
		TableName: aws.String(db.tableName),
		Key: map[string]*dynamodb.AttributeValue{
			"user": {
				S: aws.String(p.UserID),
			},
			"path": {
				S: aws.String(p.GetNormalizedPath()),
			},
		},
		ProjectionExpression: aws.String("#r, #w, #us, #dt"),
		ExpressionAttributeNames: map[string]*string{
			"#r": aws.String("read"),
			"#w": aws.String("write"),
			"#us": aws.String("users"),
			"#dt": aws.String("delete-time"),
		},
	})

	if err != nil {
		log.Printf("Retrieveing master entry failed with error: %v", err)
		return MasterEntry{}, errors.NewServerError("Retrieving metadata failed")
	}

	if result.Item == nil {
		return MasterEntry{}, errors.NewNotFoundError("Master entry not found")
	}

	entry := MasterEntry{}

	err = dynamodbattribute.UnmarshalMap(result.Item, &entry)
	if err != nil {
		log.Printf("Failed to unmarshall Master entry with error: %v", err)
		return MasterEntry{}, errors.NewServerError("Corrupted file metadata")
	}

	return entry, nil
}

func (db *PermDB) DeleteMasterEntry(p filePath.FilePath) error {
	entry, getErr := db.GetMasterEntry(p)
	if getErr != nil {
		return getErr
	}
	db.deleteUserEntries(p, entry.Users)

	_, delErr := db.client.DeleteItem(&dynamodb.DeleteItemInput{
		TableName: aws.String(db.tableName),
		Key: map[string]*dynamodb.AttributeValue{
			"user": {
				S: aws.String(p.UserID),
			},
			"path": {
				S: aws.String(p.GetNormalizedPath()),
			},
		},
	})

	if delErr != nil {
		log.Printf("Deleting master entry failed with error: %v", delErr)
		return errors.NewServerError("Changing file metadata failed")
	}
	return nil
}

func min(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

type batchSuccess struct {
}

type batchError struct {
	err error
}

type batchUnprocessedItems struct {
	unprocessedItems map[string][]*dynamodb.WriteRequest
}

func logUnprocessedItems(items []*dynamodb.WriteRequest) {
	var sb strings.Builder
	sb.WriteString("Failed to delete user file entries:\n")
	for _, item := range items {
		sb.WriteString(fmt.Sprintf("{\nUser: %s,\nFile: %s\n}\n", item.DeleteRequest.Key["user"], item.DeleteRequest.Key["path"]))
	}
	log.Print(sb.String())
}

func (db *PermDB) deleteUserEntries(p filePath.FilePath, users []string) error {
	// Batch sizes are limited to 25 operations, as per https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchWriteItem.html
	operations := []*dynamodb.WriteRequest{}
	for _, user := range users {
		operations = append(operations, &dynamodb.WriteRequest{
			DeleteRequest: &dynamodb.DeleteRequest{
				Key: map[string]*dynamodb.AttributeValue{
					"user": &dynamodb.AttributeValue{
						S: aws.String(user),
					},
					"path": &dynamodb.AttributeValue{
						S: aws.String(p.GetNormalizedPath()),
					},
				},
			},
		})
	}

	const batchSize int = 25
	results := make(chan interface{}, (len(users)/batchSize) + 1)
	var ops sync.WaitGroup

	for batchBase := 0; batchBase < len(users); batchBase += batchSize {
		ops.Add(1)
		go func () {
			result, err := db.client.BatchWriteItem(&dynamodb.BatchWriteItemInput{
				RequestItems: map[string][]*dynamodb.WriteRequest{
					db.tableName: operations[batchBase:min(batchBase + batchSize, len(users))],
				},
			})

			if err != nil {
				results <- batchError{err: err}
			} else if len(result.UnprocessedItems) != 0 {
				results <- batchUnprocessedItems{unprocessedItems: result.UnprocessedItems}
			} else {
				results <- batchSuccess{}
			}
			ops.Done()
		}()
	}
	ops.Wait()
	close(results)
	success := true
	for result := range results {
		switch res := result.(type) {
		case batchSuccess: //Nothing
		case batchUnprocessedItems:
			logUnprocessedItems(res.unprocessedItems[db.tableName])
			success = false
		case batchError:
			log.Printf("Failed to delete user file entries with error: %v", res.err)
			success = false
		default:
			success = false
		}
	}

	if !success {
		return errors.NewServerError("Failed to delete user file entries")
	}
	return nil

}