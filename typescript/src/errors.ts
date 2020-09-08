// AWSError is not provided at runtime as object https://github.com/aws/aws-sdk-js/issues/2611 and
// most likely it is just present as a type definition in the library
import type { AWSError } from "aws-sdk/lib/error";

/** Base class representing errors created by the backend
 *
 * These errors are safe to pass back out of the function, as they have the correct message to
 * be caught by one of the integration responses
 */
export class BackendError extends Error {

}

export class ArgumentError extends BackendError {
    constructor(additionalMessage?: string) {
        const message = additionalMessage !== undefined ? `: ${additionalMessage}` : "";
        super(`Argument error${message}`);
    }
}

export class NotFoundError extends BackendError {
    constructor(additionalMessage?: string) {
        const message = additionalMessage !== undefined ? `: ${additionalMessage}` : "";
        super(`Not found${message}`);
    }
}

export class ServerError extends BackendError {
    constructor(additionalMessage?: string) {
        const message = additionalMessage !== undefined ? `: ${additionalMessage}` : "";
        super(`Server error${message}`);
    }
}

export class ForbiddenError extends BackendError {
    constructor(additionalMessage?: string) {
        const message = additionalMessage !== undefined ? `: ${additionalMessage}` : "";
        super(`Forbidden${message}`);
    }
}

export class ConflictError extends BackendError {
    constructor(additionalMessage?: string) {
        const message = additionalMessage !== undefined ? `: ${additionalMessage}` : "";
        super(`Conflict${message}`);
    }
}

export function isAWSError(value: unknown): value is AWSError {
    const awsError = value as AWSError;
    return awsError &&
        typeof awsError.code === "string" &&
        typeof awsError.cfId === "string" &&
        typeof awsError.region === "string";
}

export function isAWSErrorResponse(value: unknown): boolean {
    const result = value as { $response: { error: AWSError | void} } | undefined;
    return isAWSError(result?.$response?.error);
}
