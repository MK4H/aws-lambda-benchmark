package filePath

import (
	"fmt"
	"path"
	"strings"
	"github.com/MK4H/go-lambda-benchmark/errors"
)

type FilePath struct {
	UserID string
	normalizedPath string
}

func createFilePath(pathParts []string) (FilePath, error) {
	if len(pathParts) < 2 {
		return FilePath{}, errors.NewArgumentError("Invalid path, missing parts of the path")
	}
	return FilePath{
		UserID: pathParts[0],
		normalizedPath: strings.Join(pathParts, "/"),
	}, nil
}

func FromNormalized(pathString string) (FilePath, error) {
	return createFilePath(strings.Split(pathString, "/"))
}

func FromAbsolute(pathString string) (FilePath, error) {
	if !path.IsAbs(pathString) {
		return FilePath{}, errors.NewArgumentError(fmt.Sprintf("Invalid path \"%s\", should be absolute", pathString))
	}

	normalizedPath := path.Clean(pathString)
	parts := strings.Split(normalizedPath, "/")
	return createFilePath(parts[1:])
}

func (p *FilePath) GetNormalizedPath() string {
	return p.normalizedPath
}

func (p *FilePath) GetAbsolutePath() string {
	return "/" + p.normalizedPath
}

func (p *FilePath) GetBasename() string {
	return path.Base(p.normalizedPath)
}