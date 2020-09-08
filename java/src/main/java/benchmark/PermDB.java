package benchmark;

import software.amazon.awssdk.core.exception.SdkServiceException;
import software.amazon.awssdk.services.dynamodb.*;
import software.amazon.awssdk.services.dynamodb.model.*;

import java.util.Map;
import java.util.concurrent.CompletableFuture;

class PermDB {
    public PermDB(String tableName) {
        this.tableName = tableName;
        this.client = DynamoDbAsyncClient.create();
    }

    public CompletableFuture<Boolean> createMasterEntry(FilePath path) {
        return this.client.putItem(
            PutItemRequest
                .builder()
                .tableName(this.tableName)
                .item(Map.ofEntries(
                    Map.entry("user", AttributeValue.builder().s(path.getUserID()).build()),
                    Map.entry("path", AttributeValue.builder().s(path.getNormalized()).build()),
                    Map.entry("read", AttributeValue.builder().bool(true).build()),
                    Map.entry("write", AttributeValue.builder().bool(true).build()),
                    Map.entry("users", AttributeValue.builder().ss(path.userID).build())
                ))
                .conditionExpression("attribute_not_exists(#u)")
                .expressionAttributeNames(Map.ofEntries(
                    Map.entry("#u", "user")
                ))
                .build())
        .handle((response, error) -> {
            if (error == null) {
                return false;
            }
            else if (error instanceof ConditionalCheckFailedException) {
                return true;
            }
            else {
                System.out.printf("Master entry creation failed with error: %s", error.toString());
                throw new ServerException("Failed to create file master entry");
            }
        });
    }

    public CompletableFuture<MasterFileEntry> getMasterFileEntry(FilePath path) {
        return this.client.getItem(
            GetItemRequest
                .builder()
                .tableName(this.tableName)
                .key(Map.ofEntries(
                    Map.entry("user", AttributeValue.builder().s(path.getUserID()).build()),
                    Map.entry("path", AttributeValue.builder().s(path.getNormalized()).build())
                ))
                .build()
        ).exceptionally((error) -> {
            System.out.printf("Get item operation failed with error: %s", error.toString());
            throw new ServerException("Retrieving file metadata failed");
        }).thenApply((response) -> {
            if (!response.hasItem()) {
                throw new NotFoundException("File not found");
            }
            return MasterFileEntry.fromItem(response.item());
        });
    }

    public CompletableFuture<Void> deleteMasterEntry(FilePath path) {
        return this.getMasterFileEntry(path)
                .thenRun()
    }

    String tableName;
    DynamoDbAsyncClient client;
}
