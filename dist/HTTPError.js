"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class HTTPError extends Error {
    code;
    constructor(code, message) {
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
exports.default = HTTPError;
