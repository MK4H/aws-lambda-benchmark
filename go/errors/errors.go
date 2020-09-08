package errors

import (
	"fmt"
)

type ArgumentError struct {
	message string
}

type NotFoundError struct {
	message string
}

type ServerError struct {
	message string
}

type ForbiddenError struct {
	message string
}

type ConflictError struct {
	message string
}

func (err ArgumentError) Error() string {
	return err.message
}

func (err NotFoundError) Error() string {
	return err.message
}

func (err ServerError) Error() string {
	return err.message
}

func (err ForbiddenError) Error() string {
	return err.message
}

func (err ConflictError) Error() string {
	return err.message
}

func NewArgumentError(message string) error {
	return ArgumentError{
		message: fmt.Sprintf("Argument error: %s", message),
	}
}

func NewNotFoundError(message string) error {
	return NotFoundError{
		message: fmt.Sprintf("Not found: %s", message),
	}
}

func NewServerError(message string) error {
	return ServerError{
		message: fmt.Sprintf("Server error: %s", message),
	}
}

func NewForbiddenError(message string) error {
	return ForbiddenError{
		message: fmt.Sprintf("Forbidden: %s", message),
	}
}

func NewConflictError(message string) error {
	return ConflictError{
		message: fmt.Sprintf("Conflict: %s", message),
	}
}
