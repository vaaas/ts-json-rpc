"use strict";
// https://www.jsonrpc.org/specification
Object.defineProperty(exports, "__esModule", { value: true });
const ts_validate_1 = require("ts-validate");
const HTTPError_1 = require("./HTTPError");
/**
 * Generates a json-rpc response from a procedure response.
 * Note that errors have a different schema!
 */
function toRPCResponse(request, response) {
    if (response instanceof HTTPError_1.default) {
        return {
            jsonrpc: '2.0',
            id: request.id,
            error: response,
        };
    }
    return {
        jsonrpc: '2.0',
        id: request.id,
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
function call_method(procedures, request, env) {
    return procedures[request.method].procedure(env, ...request.params).catch(e => {
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
    return async function (req, res) {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'text/plain' });
            res.end('Method not allowed');
            return;
        }
        const request = request_validator(body_provider(req));
        if (request instanceof Error) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad request');
            return;
        }
        const env = env_provider(req, res);
        let result;
        if (Array.isArray(request)) {
            result = await (Promise.all(request.map(x => call_method(procedures, x, env)
                .then(y => [x, y]))).then(xs => xs.map(([request, result]) => toRPCResponse(request, result))));
        }
        else {
            result = toRPCResponse(request, await call_method(procedures, request, env));
        }
        serve(res, result);
    };
}
exports.default = initialise;
