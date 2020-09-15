using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Linq;
using System.Text;

using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Amazon.DynamoDBv2.DocumentModel;
using Amazon.Lambda.Core;

namespace DotnetLambdaBenchmark {

    class MasterFileEntry {

        const string UserProperty = "user";
        const string PathProperty = "path";
        const string ReadProperty = "read";
        const string WriteProperty = "write";
        const string UsersProperty = "users";
        const string DeleteTimeProperty = "delete-time";

        public static MasterFileEntry FromDocument(Document document) {
            DateTime? deleteTime = null;
            if (document.TryGetValue(DeleteTimeProperty, out var deleteTimeEntry)) {
                deleteTime = deleteTimeEntry.AsDateTime();
            }
            return new MasterFileEntry(
                document[UserProperty],
                document[PathProperty],
                document[ReadProperty].AsBoolean(),
                document[WriteProperty].AsBoolean(),
                document[UsersProperty].AsArrayOfString(),
                deleteTime
            );
        }

        public static MasterFileEntry FromDocument(string user, string path, Document document) {
            DateTime? deleteTime = null;
            if (document.TryGetValue(DeleteTimeProperty, out var deleteTimeEntry)) {
                deleteTime = deleteTimeEntry.AsDateTime();
            }
            return new MasterFileEntry(
                user,
                path,
                document[ReadProperty].AsBoolean(),
                document[WriteProperty].AsBoolean(),
                document[UsersProperty].AsArrayOfString(),
                deleteTime
            );
        }

        public Document ToDocument() {
            var doc = new Document();
            doc[UserProperty] = this.User;
            doc[PathProperty] = this.Path;
            doc[ReadProperty] = new DynamoDBBool(this.Read);
            doc[WriteProperty] = new DynamoDBBool(this.Write);
            doc[UsersProperty] = this.Users;
            if (this.DeleteTime != null) {
                doc[DeleteTimeProperty] = this.DeleteTime;
            }
            return doc;
        }

        public MasterFileEntry(string user, string path, bool read, bool write, string[] users, DateTime? deleteTime = null) {
            this.User = user;
            this.Path = path;
            this.Read = read;
            this.Write = write;
            this.Users = users;
            this.DeleteTime = deleteTime;
        }

        public string User { get; }
        public string Path { get; }
        public bool Read { get; }
        public bool Write { get; }
        public string[] Users { get; }
        public DateTime? DeleteTime { get; }
    }

    class PermDB: IDisposable {
        public PermDB(string tableName) {
            this.tableName = tableName;
            this.client = new AmazonDynamoDBClient();
            this.table = Table.LoadTable(this.client, this.tableName);
        }

        public async Task<bool> CreateMasterEntry(FilePath path) {
            try {
                var response = await table.PutItemAsync(
                    new MasterFileEntry(
                        path.UserID,
                        path.NormalizedPath,
                        true,
                        true,
                        new string[]{path.UserID}
                    ).ToDocument(),
                    new PutItemOperationConfig(){
                        ConditionalExpression = new Expression(){
                            ExpressionStatement = "attribute_not_exists(#u)",
                            ExpressionAttributeNames = {
                                {"#u", "user"}
                            }
                        }
                    }
                );
                return false;
            }
            catch (ConditionalCheckFailedException) {
                return true;
            }
            catch (Exception e) {
                LambdaLogger.Log($"Master entry creation failed with error: {e.Message}");
                throw new ServerException("Failed to create file master entry");
            }

        }

        public async Task<MasterFileEntry> GetMasterFileEntry(FilePath path) {
            Document? item = null;
            try {
                item = await table.GetItemAsync(
                    path.UserID,
                    path.NormalizedPath,
                    new GetItemOperationConfig(){
                        AttributesToGet = {
                            "read",
                            "write",
                            "users",
                            "delete-time"
                        }
                    });

            }
            catch (Exception e) {
                LambdaLogger.Log($"Get item operation failed with error: {e.Message}");
                throw new ServerException("Retrieving file metadata failed");
            }

            if (item == null) {
                throw new NotFoundException("File not found");
            }
            return MasterFileEntry.FromDocument(path.UserID, path.NormalizedPath, item);
        }

        public async Task DeleteMasterEntry(FilePath path) {
            var masterEntry = await GetMasterFileEntry(path);
            await DeleteUserEntries(path, masterEntry.Users);

            try {
                await table.DeleteItemAsync(path.UserID, path.NormalizedPath);
            }
            catch (Exception e) {
                LambdaLogger.Log($"Failed to delete master entry with error: {e.Message}");
                throw new ServerException("Failed to delete master entry");
            }
        }

        public void Dispose()
        {
            client.Dispose();
        }

        string tableName;
        IAmazonDynamoDB client;
        Table table;

        class BatchResult {

        }

        class BatchSuccess : BatchResult {

        }

        class BatchError : BatchResult {
            public BatchError(Exception e)
            {
                this.exception = e;
            }

            public override string ToString()
            {
                return exception.ToString();
            }
            Exception exception;
        }

        class BatchUnprocessed : BatchResult {
            public BatchUnprocessed(List<WriteRequest> unprocessedItems) {
                this.unprocessedItems = unprocessedItems;
            }

            public override string ToString()
            {
                var builder = new StringBuilder();
                foreach (var item in unprocessedItems) {
                    builder.Append("{User: ");
                    builder.Append(item.DeleteRequest.Key["user"]);
                    builder.AppendLine(",");
                    builder.Append("File: ");
                    builder.Append(item.DeleteRequest.Key["path"]);
                    builder.AppendLine("}");
                }

                return builder.ToString();
            }

            List<WriteRequest> unprocessedItems;
        }

        async Task DeleteUserEntries(FilePath path, string[] users) {
            var deletes = from user in users select new WriteRequest(new DeleteRequest(
                new Dictionary<string, AttributeValue>{
                    {"user", new AttributeValue(user)},
                    {"path", new AttributeValue(path.NormalizedPath)}
                }
            ));
            List<Task<BatchResult>> operations = new List<Task<BatchResult>>();
            // Batch sizes are limited to 25 operations, as per https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchWriteItem.html
            foreach (var batch in Batch(deletes, 25)) {
                operations.Add(
                    client.BatchWriteItemAsync(
                        new Dictionary<string, List<WriteRequest>>{
                            {this.tableName, batch}
                    }).ContinueWith<BatchResult>(task => {
                        if (task.IsFaulted) {
                            return new BatchError(task.Exception);
                        }
                        var response = task.Result;
                        if (response.UnprocessedItems.Count != 0) {
                            return new BatchUnprocessed(response.UnprocessedItems[this.tableName]);
                        }
                        return new BatchSuccess();
                    })
                );
            }

            var failed = false;
            var results = await Task.WhenAll(operations);
            foreach (BatchResult result in results) {
                if (result is BatchSuccess) {
                    continue;
                }
                else if (result is BatchUnprocessed u) {
                    failed = true;
                    LambdaLogger.Log($"Failed to delete user file entries: {u}");
                }
                else if (result is BatchError e) {
                    failed = true;
                    LambdaLogger.Log($"Failed to delete user file entries with error: {e}");
                }
                else {
                    failed = true;
                    LambdaLogger.Log($"PROGRAM ERROR, unknown type of batch result: {result}");
                }
            }

            if (failed) {
                throw new ServerException("Failed to delete user file entries");
            }
        }

        static IEnumerable<List<T>> Batch<T>(
            IEnumerable<T> source, int size
        ) {
            List<T> bucket = new List<T>(size);

            foreach (var item in source)
            {
                bucket.Add(item);

                if (bucket.Count != size)
                    continue;

                yield return bucket;

                bucket = new List<T>(size);
            }

            // Return the last bucket with all remaining elements
            if (bucket.Count > 0)
            {
                yield return bucket;
            }
        }
    }


}