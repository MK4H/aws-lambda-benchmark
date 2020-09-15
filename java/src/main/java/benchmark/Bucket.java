package benchmark;

import java.lang.System;
import java.util.concurrent.CompletableFuture;

import software.amazon.awssdk.core.async.AsyncRequestBody;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

class Bucket {
    public Bucket(String bucketName) {
        this.client = S3AsyncClient.create();
        this.bucketName = bucketName;
    }

    public CompletableFuture<Boolean> CheckObjectPresence(FilePath path) {
            return this.client.headObject(
                HeadObjectRequest
                    .builder()
                    .bucket(this.bucketName)
                    .key(path.getNormalized())
                    .build()
            )
            .handle((response, error) -> error == null);
    }

    public CompletableFuture<Void> CreateObject(FilePath path) {
        return this.client.putObject(
                PutObjectRequest
                        .builder()
                        .bucket(this.bucketName)
                        .key(path.getNormalized())
                        .build(),
                AsyncRequestBody.empty()
        ).handle((response, error) -> {
            if (error instanceof S3Exception) {
                System.out.printf("Failed to put object into S3 with error: %s", error.toString());
                throw new ServerException("Failed to create S3 object");
            }
            return null;
        });
    }

    S3AsyncClient client;
    String bucketName;
}
