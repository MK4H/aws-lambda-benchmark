using System;
using System.IO;

namespace DotnetLambdaBenchmark
{

    public class FilePath {

        public static FilePath FromNormalized(string normalizedPath) {
            var userID = normalizedPath.Substring(0, normalizedPath.IndexOf('/'));

            return new FilePath(userID, normalizedPath);
        }

        public static FilePath FromAbsolute(string absolutePath) {
            if (!Path.IsPathRooted(absolutePath)) {
                throw new ArgumentException("Invalid path, should be absolute");
            }

            // Normalizes the path and removes the leading slash
            var normalized = Path.GetFullPath(new Uri(absolutePath).LocalPath).TrimStart('/');
            var userID = normalized.Substring(0, normalized.IndexOf('/'));

            return new FilePath(userID, normalized);
        }

        private FilePath(string userID, string normPath) {
            if (normPath.Length <= userID.Length + 1) {
                throw new ArgumentException("Invalid path, missing name of the file");
            }

            this.UserID = userID;
            this.NormalizedPath = normPath;
        }

        public string NormalizedPath { get; }

        public string AbsolutePath => $"/{this.NormalizedPath}";

        public string Basename => Path.GetFileName(this.NormalizedPath);

        public string UserID { get; }
    }

}