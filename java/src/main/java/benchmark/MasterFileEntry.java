package benchmark;

import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.List;
import java.util.Map;

class MasterFileEntry {
    public static MasterFileEntry fromItem(Map<String, AttributeValue> item, FilePath path) {
        return new MasterFileEntry(
            path.getUserID(),
            path.getNormalized(),
            item.get("read").bool(),
            item.get("write").bool(),
            item.get("users").ss(),
            item.containsKey("delete-time") ? item.get("delete-time").n() : null
        );
    }

    public MasterFileEntry(
        String userID,
        String path,
        boolean read,
        boolean write,
        List<String> users,
        String deleteTime
    ) {
        this.userID = userID;
        this.path = path;
        this.read = read;
        this.write = write;
        this.users = users;
        this.deleteTime = deleteTime;
    }

    public List<String> getUsers() {
        return users;
    }

    private final String userID;
    private final String path;
    private final boolean read;
    private final boolean write;
    private final List<String> users;
    private final String deleteTime;
}
