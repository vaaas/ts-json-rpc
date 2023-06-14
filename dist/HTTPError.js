"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HTTPError = void 0;
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
exports.HTTPError = HTTPError;
exports.default = HTTPError;
