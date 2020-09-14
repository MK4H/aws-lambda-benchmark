package main

import (
	"fmt"
	"os"
	"log"
	"github.com/MK4H/go-lambda-benchmark/bucket"
	"github.com/MK4H/go-lambda-benchmark/db"
	"github.com/MK4H/go-lambda-benchmark/filePath"
	"github.com/MK4H/go-lambda-benchmark/errors"
	"github.com/aws/aws-lambda-go/lambda"
    "github.com/aws/aws-sdk-go/aws/session"
)

type request struct {
	UserID string `json:"userID"`
	FilePath  string `json:"filePath"`
}

type response struct {
	FilePath string `json:"filePath"`
}

var (
	buck bucket.Bucket
	permDB db.PermDB
)

func getEnv(name, missingMessage string) string {
	val, present := os.LookupEnv(name)
	if !present {
		log.Printf("Environment variable was not provided during deployment: %s", missingMessage)
		panic("Invalid server configuration")
	}
	return val
}

// Code run on environment creation, shared between invocations
func init() {
	sess, err := session.NewSession()
	if err != nil {
		panic(fmt.Sprintf("Failed to create AWS SDK session with error: %v", err))
	}

	tableName := getEnv("TABLE_NAME", "Permission table name")
	bucketName := getEnv("BUCKET_NAME", "User data bucket")

	buck = bucket.Create(bucketName, sess)
	permDB = db.Create(tableName, sess);
}

func createFile(userID string, path filePath.FilePath) error {
	entryCreate := make(chan error)
	objectCheck := make(chan bool)
	go func() {
		entryCreate <- permDB.CreateMasterEntry(path)
	}()

	go func() {
		exists, err := buck.CheckObjectPresence(path)
		objectCheck <- exists && err != nil
	}()
	createResult := <- entryCreate
	objectExists := <- objectCheck

	_, entryExists := createResult.(errors.ConflictError)
	_, createError := createResult.(errors.ServerError)

	if entryExists && objectExists {
		return errors.NewConflictError("File already exists")
	}

	if objectExists && !createError{
		// Delete the master entry again
		delErr := permDB.DeleteMasterEntry(path)
		if delErr != nil {
			log.Printf("Failed to delete the master entry after an existing s3 object was detected, %v", delErr)
			return errors.NewServerError("Failed to create file")
		}
		return errors.NewServerError("File may still be in the process of being deleted, wait a few seconds and retry the request.")
	}

	if createError {
		return createResult
	}

	// Successfully created a master entry and no object in S3 was detected
	s3Err := buck.PutObject(path)
	if s3Err != nil {
		delErr := permDB.DeleteMasterEntry(path)
		if delErr != nil {
			log.Printf("Failed to delete the master entry after creation of S3 object failed, %v , %v", s3Err, delErr)
			return errors.NewServerError("Failed to create file")
		}
		log.Printf("Failed to create S3 object with error, %v", s3Err)
		return errors.NewServerError("Failed to create file")
	}
	return nil
}

func handleLambdaEvent(rq request) (response, error) {
	path, pathErr := filePath.FromAbsolute(rq.FilePath)
	if pathErr != nil {
		return response{}, pathErr
	}

	if path.UserID != rq.UserID {
		return response{}, errors.NewForbiddenError("Trying to manipulate data of another user")
	}

	err := createFile(rq.UserID, path)
	if err != nil {
		return response{}, err
	}
	return response{FilePath: rq.FilePath}, nil
}

func main() {
	lambda.Start(handleLambdaEvent)
}
