"use strict";
// https://www.jsonrpc.org/specification
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialise = exports.call_method = exports.serve = exports.toRPCResponse = exports.json = exports.text = void 0;
const ts_validate_1 = require("ts-validate");
const HTTPError_1 = require("./HTTPError");
function text(socket, code, data) {
    socket.writeHead(code, { 'Content-Type': 'text/plain' });
    socket.end(data);
}
exports.text = text;
function json(socket, data, code = 200) {
    socket.writeHead(code, { 'Content-Type': 'application/json' });
    socket.end(JSON.stringify(data));
}
exports.json = json;
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
exports.toRPCResponse = toRPCResponse;
/** Serves a json-rpc response through http */
function serve(socket, response) {
    if (Array.isArray(response))
        json(socket, response);
    else if ('error' in response)
        json(socket, response, response.error.code);
    else
        json(socket, response);
}
exports.serve = serve;
async function call_method(procedures, env, method, params) {
    try {
        return await procedures[method].procedure(env, ...params);
    }
    catch (e) {
        console.error(e);
        return new HTTPError_1.default(500, 'Internal server error');
    }
}
exports.call_method = call_method;
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
        if (http_request.method !== 'POST')
            return text(socket, 405, 'Method not allowed');
        let body = body_provider(http_request);
        if (body instanceof Promise)
            body = await body;
        const req = request_validator(body);
        if (req instanceof Error)
            return text(socket, 400, 'Bad request');
        const env = env_provider(http_request, socket);
        const res = Array.isArray(req)
            ? await Promise.all(req.map(req => call_method(procedures, env, req.method, req.params)
                .then(res => toRPCResponse(req.id, res))))
            : toRPCResponse(req.id, await call_method(procedures, env, req.method, req.params));
        serve(socket, res);
    };
}
exports.initialise = initialise;
