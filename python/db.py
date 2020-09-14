import logging
from botocore.exceptions import ClientError
import boto3
from boto3.dynamodb.conditions import Attr
from file_path import FilePath
import errors

logger = logging.getLogger()


class PermDB:
    def __init__(self, table_name: str):
        self.table = boto3.resource("dynamodb").Table(table_name)

    def create_master_entry(self, path: FilePath) -> bool:
        try:
            self.table.put_item(
                Item={
                    "user": path.user_id,
                    "path": path.normalized,
                    "read": True,
                    "write": True,
                    "users": {path.user_id}
                },
                ConditionExpression=Attr("user").not_exists()
            )
            return False
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return True
            logger.error(f"Failed to create master entry with error: {e}")
            raise errors.ServerError("Failed to create master entry")

    def get_master_entry(self, path: FilePath):
        try:
            response = self.table.get_item(
                Key={
                    "user": path.user_id,
                    "path": path.normalized,
                },
                ProjectionExpression="#r, #w, #us, #dt",
                ExpressionAttributeNames={
                    "#r": "read",
                    "#w": "write",
                    "#us": "users",
                    "#dt": "delete-time",
                },
            )

            if response["Item"] is None:
                raise errors.NotFoundError("Master entry not found")

            entry = response["Item"]
            entry["user"] = path.user_id
            entry["path"] = path.normalized
            return entry
        except ClientError as e:
            logger.error(f"Failed to retrieve master entry with error: {e}")
            raise errors.ServerError("Retrieving metadata failed")

    def delete_master_entry(self, path: FilePath):
        entry = self.get_master_entry(path)
        self._delete_user_entries(path, entry["users"])

        try:
            self.table.delete_item(
                Key={
                    "user": path.user_id,
                    "path": path.normalized,
                }
            )
        except ClientError as e:
            logger.error(f"Deleting master entry failed with error: {e}")
            raise errors.ServerError("Changing file metadata failed")

    def _delete_user_entries(self, path: FilePath, users):
        # Boto3 does not support asynchronous operations, so we have to do it synchronously
        try:
            with self.table.batch_writer() as batch:
                for user in users:
                    batch.delete_item(
                        Key={
                            "user": user,
                            "path": path.normalized
                        }
                    )
        except ClientError as e:
            logger.error(f"Failed to delete user file entreis with error: {e}")
            raise errors.ServerError("Failed to delete user file entries")
