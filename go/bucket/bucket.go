package bucket

import (
	"log"
	"github.com/aws/aws-sdk-go/aws/awserr"
	"github.com/MK4H/go-lambda-benchmark/filePath"
	"github.com/MK4H/go-lambda-benchmark/errors"
    "github.com/aws/aws-sdk-go/aws"
    "github.com/aws/aws-sdk-go/aws/session"
    "github.com/aws/aws-sdk-go/service/s3"
)

type Bucket struct {
	bucketName string
	client *s3.S3
}

func Create(bucketName string, sess *session.Session) Bucket {
	return Bucket{
		bucketName: bucketName,
		client: s3.New(sess),
	}
}

func (b *Bucket) CheckObjectPresence(p filePath.FilePath) (bool, error) {
	_, err := b.client.HeadObject(&s3.HeadObjectInput{
		Bucket: aws.String(b.bucketName),
		Key: aws.String(p.GetNormalizedPath()),
	})

	if err == nil {
		return true, nil
	}
	// TODO: Check this NoSuchKey, may not work
	if awsErr, ok := err.(awserr.Error); ok && awsErr.Code() == s3.ErrCodeNoSuchKey {
		return false, nil
	}

	log.Printf("S3 Object presence check failed with error: %v", err)
	return false, errors.NewServerError("S3 failure")
}

func (b *Bucket) PutObject(p filePath.FilePath) error {
	_, err := b.client.PutObject(&s3.PutObjectInput{
		Bucket: aws.String(b.bucketName),
		Key: aws.String(p.GetNormalizedPath()),
	})

	if err != nil {
		log.Printf("Failed to put to S3 object with error: %v", err)
		return errors.NewServerError("S3 failure")
	}
	return nil
}