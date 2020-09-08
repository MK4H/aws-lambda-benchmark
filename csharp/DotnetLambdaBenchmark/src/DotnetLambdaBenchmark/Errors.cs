using System;

namespace DotnetLambdaBenchmark {

    class BackendException : Exception {
        public BackendException(string code, string additionalMessage, Exception? innerException = null)
            : base($"{code}: {additionalMessage}", innerException)
        { }
    }

    class ArgumentException : BackendException {
        public ArgumentException(string additionalMessage, Exception? innerException = null)
            :base("Argument error", additionalMessage, innerException)
        { }
    }

    class NotFoundException : BackendException {
        public NotFoundException(string additionalMessage, Exception? innerException = null)
            :base("Not found", additionalMessage, innerException)
        { }
    }

    class ServerException : BackendException {
        public ServerException(string additionalMessage, Exception? innerException = null)
            :base("Server error", additionalMessage, innerException)
        { }
    }

    class ForbiddenException : BackendException {
        public ForbiddenException(string additionalMessage, Exception? innerException = null)
            :base("Forbidden", additionalMessage, innerException)
        { }
    }

    class ConflictException : BackendException {

        public ConflictException(string additionalMessage, Exception? innerException = null)
            :base("Conflict", additionalMessage, innerException)
        { }
    }
}