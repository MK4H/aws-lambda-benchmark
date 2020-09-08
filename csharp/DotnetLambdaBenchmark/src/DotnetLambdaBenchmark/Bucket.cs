using System;
using System.Threading.Tasks;

using Amazon.S3;
using Amazon.S3.Model;


namespace DotnetLambdaBenchmark
{
    class Bucket: IDisposable{
        public Bucket(string bucketName) {
            this.client = new AmazonS3Client();
            this.bucketName = bucketName;
        }

        public async Task<bool> CheckObjectPresence(FilePath path) {
            try {
                await client.GetObjectMetadataAsync(this.bucketName, path.NormalizedPath);
                return true;
            }
            catch (Exception) {
                return false;
            }
        }

        public async Task CreateObject(FilePath path) {
            try {
                var response = await client.PutObjectAsync(new PutObjectRequest(){
                    BucketName = this.bucketName,
                    Key = path.NormalizedPath,
                });
            }
            catch(Exception e) {
                Console.WriteLine($"Failed to put object into S3 with error: {e.Message}");
                throw new ServerException("Failed to create S3 object");
            }
        }

        public void Dispose()
        {
            client.Dispose();
        }

        IAmazonS3 client;
        string bucketName;
    }

}