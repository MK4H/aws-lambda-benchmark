import S3 from "aws-sdk/clients/s3";
import { checkExistence } from "./env";
import { PermDB, EntryAlreadyExistsError } from "./db";
import { FilePath } from "./filepath";
import {
    BackendError,
    ConflictError,
    ServerError,
    ForbiddenError,
    isAWSError
} from "./errors";

// AWSError is not provided at runtime as object https://github.com/aws/aws-sdk-js/issues/2611 and
// most likely it is just present as a type definition in the library
// import type { AWSError } from "aws-sdk/lib/error"

interface DataCreateRequest {
    userID: string;
    filePath: string;
}

interface DataCreateResponse {
    filePath: string;
}

const tableName: string = checkExistence(process.env.TABLE_NAME, "Table name");
const bucketName: string = checkExistence(process.env.BUCKET_NAME, "Bucket name");

const db = new PermDB(tableName);
const s3 = new S3();

async function putToS3(bucket: string, path: FilePath) {
    const params: S3.PutObjectRequest = {
        Bucket: bucket,
        Key: path.normalizedPath
        // TODO: Maybe some properties
    };
    // Don't really need anything from the response
    const result = await s3.putObject(params).promise();
    if (isAWSError(result.$response.error)) {
        throw result.$response.error;
    }
}

async function checkS3ObjectPresence(
    bucket: string,
    path: FilePath
): Promise<boolean | ServerError> {
    const params: S3.HeadObjectRequest = {
        Bucket: bucket,
        Key: path.normalizedPath
    };
    try {
        const err = (await s3.headObject(params).promise()).$response.error;
        if (err === null) {
            return true;
        }

        if (isAWSError(err) && err.code === "NotFound") {
            return false;
        }
        console.error(`Failed while checking S3 object presence: ${err}`);
        return new ServerError("S3 failure");
    }
    catch (err) {
        if (typeof err.code === "string" && err.code === "NotFound") {
            return false;
        }
        console.error(`Failed while checking S3 object presence: ${err}`);
        return new ServerError("S3 failure");
    }
}

async function createMasterEntry(path: FilePath): Promise<boolean | ServerError> {
    try {
        await db.createMasterEntry(path);
        return false;
    }
    catch (err) {
        if (err instanceof EntryAlreadyExistsError) {
            return true;
        }
        // Already logged in db library
        return new ServerError("Failed to create file");
    }
}

async function createFile(bucket: string, userID: string, path: FilePath): Promise<void> {
    const results = await Promise.all(
        [checkS3ObjectPresence(bucket, path), createMasterEntry(path)]
    );
    // Both db entry and s3 object exist
    if (results.every((result) => result === true)) {
        throw new ConflictError("File already exists");
    }
    // Only the S3 object exists
    // Either the request is in the DynamoDB stream to be deleted
    // or this may be leaked file due to immediate delete
    else if (results[0] === true) {
        // If the master entry was created, just delete it again to rollback the action
        if (results[1] === false) {
            try {
                await db.deleteMasterEntry(path);
            }
            catch (dberr) {
                console.error(`Successfuly created Master entry, but S3 object was still present from previous file or was leaked, and rollback of master entry failed with :${dberr}`);
                throw new ServerError("Failed to create file");
            }
        }
        throw new ServerError("File may still be in the process of being deleted, wait a few seconds and retry the request. If the problem persists, contact administrators.");
    }
    // Creating master entry failed
    else if (results[1] instanceof ServerError) {
        throw results[1];
    }
    // Ignore error of presence check

    // Master entry was created and there is no S3 object present, so create it
    try {
        await putToS3(bucket, path);
    }
    catch (s3err) {
        // const exception: AWSError = err;

        // Remove the dynamoDB entry
        try {
            await db.deleteMasterEntry(path);
        }
        catch (dberr) {
            console.error(`Successfuly created Master entry, but creation in S3 failed and then delete of the created Master entry failed with following errors: ${s3err} \n\n ${dberr}`);
            throw new ServerError("Failed to create file");
        }
        console.error(`Successfuly created Master entry, but creation in S3 failed with following error: ${s3err}`);
        throw new ServerError("Failed to create file.");
    }
}

export async function handler(
    event: DataCreateRequest/* , context: Context */
): Promise<DataCreateResponse> {
    try {
        // TODO: Validate path and user and tokens and stuff
        // REALLY VALIDATE IT
        // Token should be validated by lambda, we will not validate it again

        const userID = event.userID;
        const path = FilePath.fromAbsolute(event.filePath);

        if (path.userID !== userID) {
            throw new ForbiddenError(`Trying to manipulate data of another user`);
        }

        await createFile(bucketName, userID, path);
        return {
            filePath: event.filePath
        };
    }
    catch (err) {
        // Make sure to wrap every error in BackendError so that every error is matched to
        // an error integration response and is not passed back to user as default success response
        if (err instanceof BackendError) {
            throw err;
        }
        console.error(`Unknown top level error: ${err}`);
        throw new ServerError();
    }
}
