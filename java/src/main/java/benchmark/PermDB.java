package benchmark;

import software.amazon.awssdk.core.exception.SdkServiceException;
import software.amazon.awssdk.services.dynamodb.*;
import software.amazon.awssdk.services.dynamodb.model.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

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
                .projectionExpression("#r, #w, #us, #dt")
                .expressionAttributeNames(Map.ofEntries(
                    Map.entry("#r", "read"),
                    Map.entry("#w", "write"),
                    Map.entry("#us", "users"),
                    Map.entry("#dt", "delete-time")
                ))
                .build()
        ).exceptionally((error) -> {
            System.out.printf("Get item operation failed with error: %s", error.toString());
            throw new ServerException("Retrieving file metadata failed");
        }).thenApply((response) -> {
            if (!response.hasItem()) {
                throw new NotFoundException("File not found");
            }
            return MasterFileEntry.fromItem(response.item(), path);
        });
    }

    public CompletableFuture<Void> deleteMasterEntry(FilePath path) {
        return this.getMasterFileEntry(path)
            .thenCompose((masterEntry) -> deleteUserEntries(path, masterEntry.getUsers()))
            .thenCompose(o ->
                this.client.deleteItem(
                    DeleteItemRequest
                        .builder()
                        .key(Map.ofEntries(
                            Map.entry("user", AttributeValue.builder().s(path.getUserID()).build()),
                            Map.entry("path", AttributeValue.builder().s(path.getNormalized()).build())
                        ))
                        .build()
                ).handle((result, error) -> {
                    if (error != null) {
                        System.out.printf("Failed to delete master entry with error: %s", error.toString());
                        throw new ServerException("Failed to delete master entry");
                    }
                    return null;
                })
            );
    }

    String tableName;
    DynamoDbAsyncClient client;

    private CompletableFuture<Void> deleteUserEntries(FilePath path, List<String> users) {
        var batchWrites = createBatches(users, 25)
            .map((batch) ->
                batch.stream().map((userID) ->
                    WriteRequest
                        .builder()
                        .deleteRequest(
                            DeleteRequest
                                .builder()
                                .key(
                                    Map.of(
                                    "user", AttributeValue.builder().s(userID).build(),
                                    "path", AttributeValue.builder().s(path.getNormalized()).build()
                                    ))
                                .build())
                        .build()
                ).collect(Collectors.toList())
            )
            .map((batch) ->
                this.client.batchWriteItem(
                        BatchWriteItemRequest
                                .builder()
                                .requestItems(Map.of(this.tableName, batch))
                                .build()
                )
            )
            .collect(Collectors.toList());
        var completed = CompletableFuture.allOf(batchWrites.toArray(new CompletableFuture[0]));
        return completed.thenApply(o -> batchWrites.stream().map(write -> write.handle(
                    (result, error) -> {
                        if (error != null) {
                            return new BatchError(error);
                        }
                        if (result.hasUnprocessedItems()) {
                            return new BatchUnfinished(result.unprocessedItems().get(this.tableName));
                        }
                        return new BatchSuccess();
                    }
                ).join()
            ).allMatch(result -> {
                if (!result.isSuccess()) {
                    System.out.print(result.getErrorMessage());
                }
                return result.isSuccess();
            })
        ).thenApply(success -> {
            if (!success) {
                throw new ServerException("Failed to delete user file entries");
            }
            return null;
        });
    }

    private static <T> java.util.stream.Stream<List<T>> createBatches(List<T> source, int batchSize) {
        int sourceSize = source.size();
        if (sourceSize <= 0) {
            return java.util.stream.Stream.empty();
        }

        int numChunks = ((sourceSize - 1) / batchSize) + 1;
        return IntStream.range(0, numChunks).mapToObj(
                i -> source.subList(i*batchSize, i < (numChunks - 1) ? (i+1)*batchSize : sourceSize )
        );
    }

    abstract static class BatchResult {
        public abstract boolean isSuccess();
        public abstract String getErrorMessage();
    }

    static class BatchSuccess extends BatchResult {

        @Override
        public boolean isSuccess() {
            return true;
        }

        @Override
        public String getErrorMessage() {
            return "Completed successfully";
        }
    }

    static class BatchError extends BatchResult {

        public BatchError(Throwable error) {
            this.message = "Failed to delete user file entries with error: " + error.toString();
        }

        @Override
        public boolean isSuccess() {
            return false;
        }

        @Override
        public String getErrorMessage() {
            return message;
        }

        private final String message;
    }

    static class BatchUnfinished extends  BatchResult {

        public BatchUnfinished(List<WriteRequest> unfinishedRequests) {
            message = "Failed to delete use file entries: " + unfinishedRequests.stream().map(
                    request -> {
                        var key = request.deleteRequest().key();
                        return "{ user: " + key.get("user") + ", path: " + key.get("path") + " }";
                    }
            ).collect(Collectors.joining(", "));
        }

        @Override
        public boolean isSuccess() {
            return false;
        }

        @Override
        public String getErrorMessage() {
            return message;
        }

        private final String message;
    }
}
