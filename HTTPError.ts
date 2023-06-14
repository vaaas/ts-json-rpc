export type ErrorStatus = 400 | 401 | 404 | 500;

export class HTTPError<T extends ErrorStatus> extends Error {
    code: T;

    constructor(code: T, message: string) {
        super(message);
        this.code = code;
    }

    toJSON() {
        return {
            code: this.code,
            message: this.message,
        };
    }
}

export default HTTPError;
