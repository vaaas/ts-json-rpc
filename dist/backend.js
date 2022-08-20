"use strict";
// https://www.jsonrpc.org/specification
Object.defineProperty(exports, "__esModule", { value: true });
const ts_validate_1 = require("ts-validate");
const HTTPError_1 = require("./HTTPError");
/**
 * Generates a json-rpc response from a procedure response.
 * Note that errors have a different schema!
 */
function toRPCResponse(id, response) {
    if (response instanceof HTTPError_1.default) {
        return {
            jsonrpc: '2.0',
            id,
            error: response,
        };
    }
    return {
        jsonrpc: '2.0',
        id,
        result: response,
    };
}
/** Serves a json-rpc response through http */
function serve(socket, response) {
    const headers = { 'Content-Type': 'application/json' };
    const data = JSON.stringify(response);
    if (Array.isArray(response)) {
        socket.writeHead(200, headers);
        socket.end(data);
    }
    else if ('error' in response) {
        socket.writeHead(response.error.code, headers);
        socket.end(response);
    }
    else {
        socket.writeHead(200, headers);
        socket.end(response);
    }
}
function call_method(procedures, env, method, params) {
    return procedures[method].procedure(env, ...params).catch(e => {
        console.log(e);
        return new HTTPError_1.default(500, 'Internal server error');
    });
}
function initialise(procedures, env_provider, body_provider) {
    const request_validator = (0, ts_validate_1.validate)((0, ts_validate_1.Union)(validate_one, (0, ts_validate_1.List)(validate_one)));
    function validate_one(x) {
        return Boolean(typeof x === 'object'
            && x !== null
            && x.jsonrpc === '2.0'
            && (0, ts_validate_1.Natural)(x.id)
            && x.method in procedures
            && Array.isArray(x.params)
            && procedures[x.method].validator(x.params));
    }
    return async function (http_request, socket) {
        if (http_request.method !== 'POST') {
            socket.writeHead(405, { 'Content-Type': 'text/plain' });
            socket.end('Method not allowed');
            return;
        }
        let body = body_provider(http_request);
        if (body instanceof Promise)
            body = await body;
        const req = request_validator(body);
        if (req instanceof Error) {
            socket.writeHead(400, { 'Content-Type': 'text/plain' });
            socket.end('Bad request');
            return;
        }
        const env = env_provider(http_request, socket);
        const res = Array.isArray(req)
            ? await Promise.all(req.map(req => call_method(procedures, env, req.method, req.params)
                .then(res => toRPCResponse(req.id, res))))
            : toRPCResponse(req.id, await call_method(procedures, env, req.method, req.params));
        serve(socket, res);
    };
}
exports.default = initialise;
