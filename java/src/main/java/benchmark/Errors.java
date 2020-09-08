package benchmark;

class BackendException extends RuntimeException {
    public BackendException(String code, String additionalMessage) {
        super(code + ": " + additionalMessage);
    }
}

class ArgumentException extends BackendException {
    public ArgumentException(String additionalMessage) {
        super("Argument error", additionalMessage);
    }
}

class NotFoundException extends BackendException {
    public NotFoundException(String additionalMessage) {
        super("Not found", additionalMessage);
    }
}

class ServerException extends BackendException {
    public ServerException(String additionalMessage) {
        super("Server error", additionalMessage);
    }
}

class ForbiddenException extends BackendException {
    public ForbiddenException(String additionalMessage) {
        super("Forbidden", additionalMessage);
    }
}

class ConflictException extends BackendException {
    public ConflictException(String additionalMessage) {
        super("Conflict", additionalMessage);
    }
}
