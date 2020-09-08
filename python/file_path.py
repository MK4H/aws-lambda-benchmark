import pathlib
import errors


class FilePath:
    __create_key = object()

    @classmethod
    def from_absolute(cls, absolute_path: str):
        path = pathlib.PurePosixPath(absolute_path)
        if not path.is_absolute():
            raise errors.ArgumentError("Invalid path, should be absolute")
        parts = path.parts[1:]
        if len(parts) < 2:
            raise errors.ArgumentError("Invalid path, missing name of the file")
        return FilePath(cls.__create_key, parts[0], pathlib.PurePosixPath(*parts))

    @classmethod
    def from_normalized(cls, normalized_path: str):
        path = pathlib.PurePosixPath(normalized_path)

        return FilePath(cls.__create_key, path.parts[0], path)

    def __init__(self, create_key, user_id: str, normalized_path: pathlib.PurePosixPath):
        assert (create_key == FilePath.__create_key), \
            "FilePath objects must be created using FilePath.from_absolute or FilePath.from_normalized functions"
        self._user_id = user_id
        self._normalized = normalized_path

    @property
    def absolute(self):
        return pathlib.PurePosixPath("/").joinpath(self._normalized).as_posix()

    @property
    def normalized(self):
        return self._normalized.as_posix()

    @property
    def user_id(self):
        return self._user_id

    @property
    def basename(self):
        return self._normalized.name
