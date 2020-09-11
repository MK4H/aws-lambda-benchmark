using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

using Amazon.Lambda.Core;

// Assembly attribute to enable the Lambda function's JSON input to be converted into a .NET class.
[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace DotnetLambdaBenchmark
{
    public class Request {
        public string UserID {get; set;}
        public string FilePath {get; set;}
    }

    public class Response {
        public string FilePath {get; set;}
    }
    public class Function
    {

        public Function() {
            this.db = new PermDB(GetEnv("TABLE_NAME", "Permission table name"));
            this.bucket = new Bucket(GetEnv("BUCKET_NAME", "User data bucket"));
        }

        /// <summary>
        /// A simple function that takes a string and does a ToUpper
        /// </summary>
        /// <param name="input"></param>
        /// <param name="context"></param>
        /// <returns></returns>
        public async Task<Response> FunctionHandler(Request input, ILambdaContext context)
        {
            try {
                var userID = input.UserID;
                var path = FilePath.FromAbsolute(input.FilePath);

                if (path.UserID != userID) {
                    throw new ForbiddenException("Trying to manipulate data of another user");
                }

                await CreateFile(userID, path);
                return new Response{
                    FilePath = path.AbsolutePath
                };
            }
            catch (BackendException) {
                throw;
            }
            catch (Exception e) {
                LambdaLogger.Log($"Unknown top level error: {e}");
                throw new ServerException("Unexpected error");
            }
        }

        public async Task CreateFile(string userID, FilePath path) {

            // If CreateMasterEntry fails, just let the exception bubble out
            var results = await Task.WhenAll(new[]{this.bucket.CheckObjectPresence(path), this.db.CreateMasterEntry(path)});
            if (results.All(exists => exists)) {
                throw new ConflictException("File already exists");
            }

            // If S3 object exists but the Master entry did not exist and was newly created
            if (results[0] && !results[1]) {
                try {
                    await this.db.DeleteMasterEntry(path);
                }
                catch (Exception e) {
                    LambdaLogger.Log($"Failed to delete master entry after detecting existing s3 object, with error: {e}");
                    throw new ServerException("Failed to create file");
                }
                throw new ServerException("File may still be in the process of being deleted, wait a few seconds and retry the request.");
            }
            // Master entry was successfully created and the s3 object was not present

            try {
                await bucket.CreateObject(path);
            }
            catch (Exception e) {
                try {
                    await this.db.DeleteMasterEntry(path);
                }
                catch (ServerException dbErr) {
                    LambdaLogger.Log($"Failed to delete master entry with error: {dbErr} after the creation of S3 object failed with error: {e}");
                    throw new ServerException("Failed to create file");
                }

                LambdaLogger.Log($"Failed to create S3 object with error: {e}");
                throw new ServerException("Failed to create file");
            }
        }

        PermDB db;
        Bucket bucket;

        static string GetEnv(string envName, string humanName){
            var value = Environment.GetEnvironmentVariable(envName);
            if (value == null) {
                LambdaLogger.Log($"Environment variable was not provided during deployment {humanName}");
                throw new ServerException("Invalid server configuration");
            }
            return value;
        }
    }
}
