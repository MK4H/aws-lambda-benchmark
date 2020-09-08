import { ServerError } from "./errors";

export function checkExistence(envVariable: string | undefined, name: string): string {
    if (envVariable === undefined) {
        console.error(`${name} environment variable was not provided during deployment`);
        throw new ServerError("Invalid server configuration.");
    }
    return envVariable;
}
