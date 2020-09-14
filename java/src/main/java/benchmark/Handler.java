package benchmark;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.concurrent.CompletableFuture;

public class Handler implements RequestHandler<Request, Response> {

    public Handler() {
        this.db = new PermDB(getEnv("TABLE_NAME", "Permission table name"));
        this.bucket = new Bucket(getEnv("BUCKET_NAME", "User data bucket"));
    }

    @Override
    public Response handleRequest(Request input, Context context) {
        try {
            String userID = input.getUserID();
            FilePath path = FilePath.fromAbsolute(input.getFilePath());

            if (!path.getUserID().equals(userID)) {
                throw new ForbiddenException("Trying to manipulate data of another user");
            }

            createFile(path);

            return new Response(path.getAbsolute());
        }
        catch (BackendException e) {
            throw e;
        }
        catch (Exception e) {
            StringWriter stackTrace = new StringWriter();
            e.printStackTrace(new PrintWriter(stackTrace));
            System.out.printf("Unknown top level error: %s", stackTrace.toString());
            throw new ServerException("Unexpected error");
        }
    }

    private final PermDB db;
    private final Bucket bucket;

    private void createFile(FilePath path) {
        System.out.println("Marker 0");
        var objectCheck = this.bucket.CheckObjectPresence(path);
        var entryCreate = this.db.createMasterEntry(path);
        // If CreateMasterEntry fails, just let the exception bubble out
        CompletableFuture.allOf(objectCheck, entryCreate).join();

        boolean objectExists = objectCheck.join();
        boolean entryExisted = entryCreate.join();
        System.out.println("Marker 1");
        if (objectExists && entryExisted) {
            throw new ConflictException("FIle already exists");
        }
        else if (objectExists) {
            try {
                this.db.deleteMasterEntry(path).join();
            }
            catch (Exception e) {
                System.out.printf("Failed to delete master entry after detecting existing s3 object, with error %s", e.toString());
                throw new ServerException("Failed to create file");
            }
            throw new ServerException("File may still be in the process of being deleted, wait a few seconds and retry the request.");
        }
        // Master entry was successfully created and the s3 object was not present

        try {
            this.bucket.CreateObject(path).join();
        }
        catch(Exception e) {
            try {
                this.db.deleteMasterEntry(path).join();
            }
            catch (Exception dbErr) {
                System.out.printf("Failed to delete master entry with error: %s after the creation of S3 object failed with error: %s", dbErr.toString(), e.toString());
                throw new ServerException("Failed to create file");
            }

            System.out.printf("Failed to create S3 object with error: %s", e);
            throw new ServerException("Failed to create file");
        }

    }

    private String getEnv(String envName, String humanName) {
        String value = System.getenv(envName);
        if (value == null) {
            System.out.printf("Environment variable was not provided during deployment: %s", humanName);
            throw new ServerException("Invalid server configuration");
        }
        return value;
    }
}
