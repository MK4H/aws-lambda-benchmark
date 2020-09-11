import logging
import db
import bucket
import errors
import os
from file_path import FilePath

logging.basicConfig(
    level=logging.ERROR,
    format=f'%(asctime)s %(levelname)s %(message)s'
)
logger = logging.getLogger()
logger.debug('The service is starting.')


def get_env(key:str, message:str):
    val = os.getenv(key)
    if val is None:
        logger.error(f"Environment variable was not providd during deployment: {message}")
        raise errors.ServerError("Invalid server configuration")
    return val


permDB = db.PermDB(get_env("TABLE_NAME", "Permission table name"))
user_bucket = bucket.Bucket(get_env("BUCKET_NAME", "User data bucket"))


def create_file(path: FilePath):
    object_exists = user_bucket.check_file_presence(path)
    entry_existed = permDB.create_master_entry(path)

    if object_exists and entry_existed:
        raise errors.ConflictError("File already exists")
    elif not entry_existed:
        # Delete the entry again
        try:
            permDB.delete_master_entry(path)
        except Exception as e:
            logger.error(f"Failed to delete master entry after detecting existing s3 object, with error: {e}")
            raise errors.ServerError("Failed to create file")
        raise errors.ServerError(
            "File may still be in the process of being deleted, wait a few seconds and retry the request.")

    try:
        user_bucket.create_file(path)
    except Exception as e:
        try:
            permDB.delete_master_entry(path)
        except Exception as db_err:
            logger.error(f"Failed to delete master entry with error: {db_err} after the creation of S3 object failed with error: {e}")
            raise errors.ServerError("Failed to create file")
        logger.error(f"Failed to create S3 object with error: {e}")
        raise errors.ServerError("Failed to create file")


def handle(event, context):
    try:
        if "userID" not in event:
            raise errors.ArgumentError("Missing userID argument")
        if "filePath" not in event:
            raise errors.ArgumentError("Missing filePath argument")

        path = FilePath.from_absolute(event["filePath"])
        if path.user_id != event["userID"]:
            raise errors.ForbiddenError("Trying to manipulate data of another user")
        create_file(path)
        return {
            "filePath": path.absolute
        }
    except errors.BackendError:
        raise
    except Exception as e:
        logger.error(f"Unknown exception caught at top level: {e}")
        raise errors.ServerError("Unexpected error")

