import * as path from "path";
import { ArgumentError } from "./errors";

export class FilePath {
    /**
     * @param pathParts Normalized path split into parts
     * @param normalizedPath Full normalized path
     *
     * @throws ArgumentError when the provided string path is not valid.
     */
    private constructor(pathParts: string[], normalizedPath: string) {
        // At least 2 elements, first empty for the user ID
        // second for the file name
        if (pathParts.length < 2) {
            throw new ArgumentError("Invalid path, missing parts of the path.");
        }
        this.user = pathParts[0];

        // Do NOT add leading slash, S3 does not like it
        this.normPath = normalizedPath;
    }

    public static fromNormalized(normalizedPath: string): FilePath {
        const pathParts = normalizedPath.split(path.posix.sep);
        return new FilePath(pathParts, normalizedPath);
    }

    public static fromAbsolute(absolutePath: string): FilePath {
        if (!path.posix.isAbsolute(absolutePath)) {
            throw new ArgumentError("Invalid path, should be absolute.");
        }

        const normalizedPath = path.posix.normalize(absolutePath);

        const pathParts = normalizedPath.split(path.posix.sep);
        // Remove the leading empty string which was before the first / separator, /userID/...
        pathParts.shift();
        return new FilePath(pathParts, normalizedPath);
    }

    public get absolutePath(): string {
        return `/${this.normPath}`;
    }

    public get normalizedPath(): string {
        return this.normPath;
    }

    public get basename(): string {
        return path.posix.basename(this.normPath);
    }

    public get userID(): string {
        return this.user;
    }

    private user: string;
    private normPath: string;
}
