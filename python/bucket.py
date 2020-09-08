import logging
from botocore.exceptions import ClientError
import boto3
from file_path import FilePath

logger = logging.getLogger()


class Bucket:
    def __init__(self, bucket_name):
        self.bucket_name = bucket_name
        self.s3 = boto3.resource('s3')
        self.bucket = self.s3.Bucket(self.bucket_name)

    def check_file_presence(self, path: FilePath):
        try:
            self.s3.Object(self.bucket_name, path.normalized).load()
            return True
        except ClientError as e:
            return False

    def create_file(self, path: FilePath):
        try:
            self.bucket.put_object(Key=path.normalized)
        except ClientError as e:
            logger.error(f"Failed to create file in S3 with error: {e}")
            raise errors.ServerError("S3 failure")

