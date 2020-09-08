
class BackendError(Exception):
    def __init__(self, code: str, additional_message: str):
        self.message = f"{code}: {additional_message}"

    def __str__(self):
        return self.message


class ArgumentError(BackendError):
    def __init__(self, additional_message: str):
        super().__init__("Argument error", additional_message)


class NotFoundError(BackendError):
    def __init__(self, additional_message: str):
        super().__init__("Not found", additional_message)


class ServerError(BackendError):
    def __init__(self, additional_message: str):
        super().__init__("Server error", additional_message)


class ForbiddenError(BackendError):
    def __init__(self, additional_message: str):
        super().__init__("Forbidden", additional_message)


class ConflictError(BackendError):
    def __init__(self, additional_message: str):
        super().__init__("Conflict", additional_message)

