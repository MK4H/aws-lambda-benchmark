package benchmark;

import java.nio.file.Path;
import java.nio.file.Paths;

class FilePath {

    public static FilePath fromAbsolute(String absolutePath) {
        Path path = Paths.get(absolutePath);
        if (!path.isAbsolute()) {
            throw new ArgumentException("Invalid path, should be absolute");
        }

        path = path.normalize();
        String userID = path.getName(0).toString();
        return new FilePath(userID, Path.of("/").relativize(path));
    }

    public static FilePath fromNormalized(String normalizedPath) {
        Path path = Paths.get(normalizedPath);
        String userID = path.getName(0).toString();
        return new FilePath(userID, path);
    }

    public String getNormalized() {
        return normalizedPath.toString();
    }

    public String getAbsolute() {
        return "/" + normalizedPath.toString();
    }

    public String getBasename() {
        return normalizedPath.getFileName().toString();
    }

    public String getUserID() {
        return userID;
    }

    private FilePath(String userID, Path normalizedPath) {
        if (normalizedPath.getNameCount() < 2) {
            throw new ArgumentException("Invalid path, missing name of the file");
        }

        this.userID = userID;
        this.normalizedPath = normalizedPath;
    }

    String userID;
    Path normalizedPath;
}
