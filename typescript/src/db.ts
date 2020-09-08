import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { PromiseResult } from "aws-sdk/lib/request";

// AWSError is not provided at runtime as object https://github.com/aws/aws-sdk-js/issues/2611 and
// most likely it is just present as a type definition in the library
import type { AWSError } from "aws-sdk/lib/error";

import { FilePath } from "./filepath";
import { BackendError, isAWSError } from "./errors";

export interface Permissions {
    read: boolean,
    write: boolean
}

/**
 *
 * delete time is retrieved from the master entry of the file
 * Permissions are retrieved from user entry of the file.
 */
export interface PermissionsEntry extends Permissions {
    deleteTime?: Date
}

/** Entry of the owner of the file
 *
 * Tracks every user with access to the file.
 * Tracks mark for delete.
 */
export interface MasterFileEntry extends PermissionsEntry {
    users: string[]
}

export interface MasterEntry {
    user: string,
    path: string,
    read: boolean,
    write: boolean,
    users: string[]
}

export class EntryAlreadyExistsError extends BackendError {
    constructor(additionalMessage?: string) {
        const message = additionalMessage !== undefined ? `: ${additionalMessage}` : "";
        super(`Entry already exists${message}`);
    }
}

export class FileNotFoundError extends BackendError {
    constructor(additionalMessage?: string) {
        const message = additionalMessage !== undefined ? `: ${additionalMessage}` : "";
        super(`File not found${message}`);
    }
}

export class DBError extends BackendError {
    public innerException: unknown;

    constructor(additionalMessage?: string, innerException?: unknown) {
        const message = additionalMessage !== undefined ? `: ${additionalMessage}` : "";
        super(`Server error${message}`);
        this.innerException = innerException;
    }
}

abstract class BatchResult {
    abstract get unprocessedItems(): DocumentClient.BatchWriteItemRequestMap | undefined;

    abstract get exception(): unknown | undefined;
}

class BatchSuccess extends BatchResult {
    get unprocessedItems(): undefined {
        return undefined;
    }

    get exception(): undefined {
        return undefined;
    }
}

class UnprocessedItemsError extends BatchResult {
    public items: DocumentClient.BatchWriteItemRequestMap;

    constructor(unprocessedItems: DocumentClient.BatchWriteItemRequestMap) {
        super();
        this.items = unprocessedItems;
    }

    get unprocessedItems(): DocumentClient.BatchWriteItemRequestMap {
        return this.items;
    }

    get exception(): undefined {
        return undefined;
    }
}

class BatchError extends BatchResult {
    public innerException: unknown;

    constructor(exception?: unknown) {
        super();
        this.innerException = exception;
    }

    get unprocessedItems(): undefined {
        return undefined;
    }

    get exception(): unknown {
        return this.innerException;
    }
}

// Typeguards for validating DynamoDB return values

function isBool(value: unknown): value is boolean {
    return typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) &&
        value.every((element) => typeof element === "string");
}

function isStringSet(value: unknown): value is DocumentClient.StringSet {
    const stringSet = value as DocumentClient.StringSet;
    return stringSet.type === "String" && isStringArray(stringSet.values);
}

function isMapEmpty(map: DocumentClient.BatchWriteItemRequestMap): boolean {
    return Object.keys(map).length === 0;
}

export class PermDB {
    /**
     *
     * @param path
     *
     * @throws EntryAlreadyExistsError when an entry for file at given path already exists
     * @throws DBError when there was an unspecified error with the DB
     */
    public async createMasterEntry(path: FilePath): Promise<void> {
        const params: DocumentClient.PutItemInput = {
            TableName: this.tableName,
            Item: {
                user: path.userID,
                path: path.normalizedPath,
                read: true,
                write: true,
                // Because set cannot be empty, we need to store at least the user himself in it
                users: this.db.createSet([path.userID])
            },
            ConditionExpression: "attribute_not_exists(#u)",
            ExpressionAttributeNames: {
                "#u": "user"
            }
        };

        try {
            const result = await this.db.put(params).promise();
            if (isAWSError(result.$response.error)) {
                throw result.$response.error;
            }
        }
        catch (err) {
            if (err.code === "ConditionalCheckFailedException") {
                throw new EntryAlreadyExistsError();
            }
            console.error(`Creating master entry failed with error: ${err}`);
            throw new DBError("Creating file failed", err);
        }
    }

    /**
     * Retrieves the master file entry of the given file.
     * This entry serves as normal file entry for the owner of the file,
     * but on top of that contains a list of users with any access to the given file.
     *
     * @param path Path of the file
     *
     * @throws FileNotFoundError when a file with given path does not exist
     * @throws DBError when there was an unspecified error with the DB
     */
    public async getMasterEntry(path: FilePath): Promise<MasterFileEntry> {
        const params: DocumentClient.GetItemInput = {
            TableName: this.tableName,
            Key: {
                user: path.userID,
                path: path.normalizedPath
            },
            ProjectionExpression: "#r, #w, #us, #dt",
            ExpressionAttributeNames: {
                "#r": "read",
                "#w": "write",
                "#us": "users",
                "#dt": "delete-time"
            }
        };

        const result = await this.db.get(params).promise().catch((err) => {
            console.error(`Retrieving master entry failed with error: ${err}`);
            throw new DBError("Retrieving file metadata failed", err);
        });

        if (isAWSError(result.$response.error)) {
            console.error(`Retrieving master entry failed with AWS error: ${result.$response.error.message}`);
            throw new DBError("Retrieving file metadata failed", result.$response.error);
        }

        if (result.Item === undefined) {
            throw new FileNotFoundError();
        }

        const read = PermDB.getEntryMember(result.Item, "read");
        const write = PermDB.getEntryMember(result.Item, "write");
        const users = PermDB.getEntryMember(result.Item, "users");
        const deleteTime = PermDB.parseDeleteTime(result.Item["delete-time"]);

        if (isBool(read) &&
            isBool(write) &&
            isStringSet(users)) {
            return {
                read: read,
                write: write,
                users: users.values,
                deleteTime: deleteTime
            };
        }

        console.error(`Invalid data in DB, invalid type in master entry: ${JSON.stringify(read)}, ${JSON.stringify(write)}, ${JSON.stringify(users)}.`);
        throw new DBError("Corrupted file metadata.");
    }

    public async deleteMasterEntry(path: FilePath): Promise<void> {
        // Delete user entries allowing other user access to given file
        const masterEntry = await this.getMasterEntry(path);
        await this.deleteUserEntries(path.normalizedPath, masterEntry.users);

        // Delete the master entry for the file
        const params: DocumentClient.DeleteItemInput = {
            TableName: this.tableName,
            Key: {
                user: path.userID,
                path: path.normalizedPath
            }
        };

        try {
            const result = await this.db.delete(params).promise();
            if (isAWSError(result.$response.error)) {
                throw result.$response.error;
            }
        }
        catch (err) {
            console.error(`Deleting entry failed with error: ${err}`);
            throw new DBError("Changing file metadata failed", err);
        }
    }

    public async deleteMasterEntryDependencies(masterEntry: MasterEntry): Promise<void> {
        return this.deleteUserEntries(masterEntry.path, masterEntry.users);
    }

    public constructor(tableName: string) {
        this.tableName = tableName;
        this.db = new DocumentClient();
    }

    private tableName: string;
    private db: DocumentClient;

    private static getEntryMember(entry: DocumentClient.AttributeMap, member: string): unknown {
        const value = entry[member];
        if (value === undefined) {
            console.error(`Invalid data in DB, missing entry member ${member} in ${JSON.stringify(entry)}.`);
            throw new DBError("Corrupted file metadata.");
        }
        return value;
    }

    private static parseDeleteTime(deleteTime: unknown | undefined): Date | undefined {
        if (deleteTime !== undefined) {
            const num = Number(deleteTime);
            if (!Number.isNaN(num)) {
                // Date constructor works with milliseconds, delete time is stored in seconds
                return new Date(num * 1000);
            }
            console.error(`Invalid data in DB, invalid value in delete-time: ${deleteTime}.`);
            throw new DBError("Corrupted file metadata.");
        }
        return undefined;
    }

    private async deleteUserEntries(path: string, users: string[]): Promise<void> {
        const dbOperations: Promise<BatchResult>[] = [];

        // Batch sizes are limited to 25 operations, as per https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchWriteItem.html
        const batchSize = 25;
        for (let batch = 0; batch * batchSize < users.length; ++batch) {
            const baseIndex = batch * batchSize;
            const batchOperations: DocumentClient.WriteRequests = [];
            for (let item = 0; item < batchSize; ++item) {
                const itemIndex = baseIndex + item;
                if (itemIndex >= users.length) {
                    break;
                }

                batchOperations.push({
                    DeleteRequest: {
                        Key: {
                            user: users[itemIndex],
                            path: path
                        }
                    }
                });
            }

            const params: DocumentClient.BatchWriteItemInput = {
                RequestItems: {
                    [this.tableName]: batchOperations
                }
            };

            const operation = this.db.batchWrite(params).promise()
                .then((result:PromiseResult<DocumentClient.BatchWriteItemOutput, AWSError>) => {
                    if (isAWSError(result.$response.error)) {
                        return new BatchError(result.$response.error);
                    }
                    if (result.UnprocessedItems === undefined ||
                        isMapEmpty(result.UnprocessedItems)) {
                        return new BatchSuccess();
                    }
                    return new UnprocessedItemsError(result.UnprocessedItems);
                })
                .catch((error) => new BatchError(error));
            dbOperations.push(operation);
        }

        try {
            let success = true;
            // Don't need Promise.allSettled as erros are returned as normal return values
            // so all invocations succeed
            const results = await Promise.all(dbOperations);
            results.forEach((result) => {
                if (result instanceof BatchSuccess) {
                    return;
                }
                success = false;
                if (result instanceof UnprocessedItemsError) {
                    const messages = new Array<string>();
                    const tableItems = result.unprocessedItems[this.tableName];
                    tableItems.forEach((item) => {
                        messages.push(`{\nUser: ${item.DeleteRequest?.Key["user"]}\nFile: ${item.DeleteRequest?.Key["path"]}\n}`);
                    });

                    console.error(`Failed to delete user file entry:\n${messages.join("\n")}`);
                    return;
                }
                // One of the entry delete operations failed,
                // everything will be retried anyway, so just stop and throw.
                console.error(`Failed to delete user file entries: ${result.exception}`);
            });

            if (!success) {
                throw new DBError("Failed to delete user file entries.");
            }
        }
        catch (err) {
            if (err instanceof BackendError) {
                throw err;
            }

            // Invalid program, should not happen
            // all exceptions should have been caught by catch during definition of the operation
            console.error(`Program failure, unexpected exception thrown, exception: ${err}`);
            throw new DBError("Programming error, unexpected exception thrown.");
        }
    }
}
