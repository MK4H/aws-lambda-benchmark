package benchmark;

public class Request {

    public Request() {

    }

    public Request(String userID, String filePath) {
        this.userID = userID;
        this.filePath = filePath;
    }

    public String getUserID() {
        return userID;
    }

    public void setUserID(String userID) {
        this.userID = userID;
    }

    public String getFilePath() {
        return filePath;
    }

    public void setFilePath(String filePath) {
        this.filePath = filePath;
    }

    String userID;
    String filePath;
}
