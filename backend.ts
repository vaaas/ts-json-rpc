// https://www.jsonrpc.org/specification

import type { IncomingMessage, ServerResponse } from 'http';
import { Natural, Union, List, validate, isObject } from 'ts-validate';
import { Tail, Intersect, ArrayOrItem } from 'fpts/data';
import { ErrorStatus } from './HTTPError';

type ErrorWithCode = {
    message: string;
    code: ErrorStatus;
}

/** a procedure object */
export type Procedure<T extends any[]> = {
    procedure: (env: any, ...xs: T) => Promise<any | Error>;
    validator: (x: unknown) => x is T;
}

/** collection of all procedures */
export type Procedures = Record<string, Procedure<any>>;

/** any one of the methods available through json-rpc */
export type Method<T extends Procedures> = keyof T;

/** arguments a procedure takes, sans the first (env) */
export type Params<
    P extends Procedures,
    M extends Method<P>
> = Tail<Parameters<P[M]['procedure']>>

/** the response a procedure returns */
export type Result<
    P extends Procedures,
    M extends Method<P>
> = Awaited<ReturnType<P[M]['procedure']>>
    | Error;

/** only the successful response of a procedure (not the error) */
export type GoodResult<
    P extends Procedures,
    M extends Method<P>
> = Exclude<Result<P, M>, Error>;

/** acceptable JSON RPC ID */
export type ID = string|number;

/** the required Env object */
export type Env<P extends Procedures> = Intersect<Parameters<P[keyof P]['procedure']>[0]>

/** A json-rpc request */
export type RPCRequest<
    P extends Procedures,
    I extends ID,
    M extends Method<P>
> = {
    readonly jsonrpc: '2.0';
    readonly id: I;
    readonly method: M;
    readonly params: Params<P, M>;
}

export type RPCSuccess<
    P extends Procedures,
    I extends ID,
    M extends Method<P>
> = {
    readonly jsonrpc: '2.0';
    readonly id: I;
    readonly result: GoodResult<P, M>;
}

export type RPCFailure<I extends ID> = {
    readonly jsonrpc: '2.0';
    readonly id: I;
    readonly error: ErrorWithCode;
}

/** A json-rpc response.
 *
 * Can be either good or bad.
 * Bad must contain the error object.
 */
export type RPCResponse<
    P extends Procedures,
    I extends ID,
    M extends Method<P>
> = RPCSuccess<P, I, M>
    | RPCFailure<I>

export function text(socket: ServerResponse, code: number, data: string): void {
    socket.writeHead(code, { 'Content-Type': 'text/plain' });
    socket.end(data);
}

export function json(socket: ServerResponse, data: any, code: number = 200): void {
    socket.writeHead(code, { 'Content-Type': 'application/json' });
    socket.end(JSON.stringify(data));
}

/**
 * Generates a json-rpc response from a procedure response.
 * Note that errors have a different schema!
 */
export function toRPCResponse<
    P extends Procedures,
    M extends Method<P>
>(
    id: ID,
    response: Result<P, M>,
): RPCResponse<P, ID, M> {
    if (response instanceof Error) {
        return {
            jsonrpc: '2.0',
            id,
            error: {
                message: response.message,
                // @ts-ignore
                code: response.code ?? 500,
            },
        };
    }
    return {
        jsonrpc: '2.0',
        id,
        result: response as GoodResult<P, M>,
    };
}

/** Serves a json-rpc response through http */
export function serve<P extends Procedures, I extends ID, M extends Method<P>>(
    socket: ServerResponse,
    response: ArrayOrItem<RPCResponse<P, I, M>>,
): void {
    if (Array.isArray(response))
        json(socket, response);
    else if ('error' in response)
        json(socket, response, response.error.code);
    else
        json(socket, response);
}

export async function call_method<P extends Procedures, M extends Method<P>>(
    procedures: P,
    env: Env<P>,
    method: M,
    params: Params<P, M>,
): Promise<Result<P, M>> {
    try {
        return await procedures[method]!.procedure(env, ...params)
    } catch(e) {
        console.error(e);
        return new Error('Internal server error', { cause: e });
    }
}

export function initialise<P extends Procedures>(
    procedures: P,
    env_provider: (req: IncomingMessage, res: ServerResponse) => Env<P>,
    body_provider: (req: IncomingMessage) => number | Promise<number>,
) {
    const request_validator = validate(Union(
        validate_one,
        List(validate_one),
    ));

    function validate_one(x: unknown): x is RPCRequest<P, ID, Method<P>> {
        return isObject(x)
            && x.jsonrpc === '2.0'
            && Natural(x.id)
            && (x.method as string) in procedures
            && Array.isArray(x.params)
            && procedures[(x.method as keyof P)]!.validator(x.params)
    }

    return async function(http_request: IncomingMessage, socket: ServerResponse): Promise<void> {
        if (http_request.method !== 'POST')
            return text(socket, 405, 'Method not allowed');
        let body = body_provider(http_request);
        if (body instanceof Promise)
            body = await body;
        const req = request_validator(body);
        if (req instanceof Error)
            return text(socket, 400, 'Bad request');
        const env = env_provider(http_request, socket);
        const res =
            Array.isArray(req)
                ? await Promise.all(req.map(
                    req => call_method(procedures, env, req.method, req.params)
                        .then(res => toRPCResponse(req.id, res))))
                : toRPCResponse(
                    req.id,
                    await call_method(procedures, env, req.method, req.params));
        serve(socket, res);
    }
}
