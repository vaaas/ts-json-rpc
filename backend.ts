// https://www.jsonrpc.org/specification

import type { IncomingMessage, ServerResponse } from 'http';
import { Natural, Union, List, validate } from 'ts-validate';
import { Tail, Intersect, ArrayOrItem } from 'fpts/data';
import HTTPError from './HTTPError';

/** a procedure object */
export type Procedure = {
    procedure: (env: any, ...xs: any[]) => Promise<any | HTTPError<any>>;
    validator: (x: any) => boolean;
}

/** collection of all procedures */
export type Procedures = Record<string, Procedure>;

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
    | HTTPError<500>;

/** only the successful response of a procedure (not the error) */
export type GoodResult<
    P extends Procedures,
    M extends Method<P>
> = Exclude<Result<P, M>, Error>;

/** only the unsuccessful response of an object (the error) */
export type BadResult<
    P extends Procedures,
    M extends Method<P>
> = Extract<Result<P, M>, Error>;

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

export type RPCFailure<
    P extends Procedures,
    I extends ID,
    M extends Method<P>
> = {
    readonly jsonrpc: '2.0';
    readonly id: I;
    readonly error: BadResult<P, M>;
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
    | RPCFailure<P, I, M>

/**
 * Generates a json-rpc response from a procedure response.
 * Note that errors have a different schema!
 */
function toRPCResponse<
    P extends Procedures,
    I extends ID,
    M extends Method<P>
>(
    request: RPCRequest<P, I, M>,
    response: Result<P, M>,
): RPCResponse<P, I, M> {
    if (response instanceof HTTPError) {
        return {
            jsonrpc: '2.0',
            id: request.id,
            error: response as BadResult<P, M>,
        };
    }
    return {
        jsonrpc: '2.0',
        id: request.id,
        result: response as GoodResult<P, M>,
    };
}

/** Serves a json-rpc response through http */
function serve<P extends Procedures, I extends ID, M extends Method<P>>(
    socket: ServerResponse,
    response: ArrayOrItem<RPCResponse<P, I, M>>,
): void {
    const headers = { 'Content-Type': 'application/json' };
    const data = JSON.stringify(response);
    if (Array.isArray(response)) {
        socket.writeHead(200, headers);
        socket.end(data);
    } else if ('error' in response) {
        socket.writeHead((response.error as HTTPError<any>).code, headers)
        socket.end(response);
    } else {
        socket.writeHead(200, headers);
        socket.end(response);
    }
}

function call_method<P extends Procedures, I extends ID, M extends Method<P>>(
    procedures: P,
    request: RPCRequest<P, I, M>,
    env: Env<P>,
): Promise<Result<P, M>> {
    return procedures[request.method]!.procedure(
        env,
        ...request.params,
    ).catch(e => {
        console.log(e);
        return new HTTPError(500, 'Internal server error');
    });
}

export default function initialise<P extends Procedures>(
    procedures: P,
    env_provider: (req: IncomingMessage, res: ServerResponse) => Env<P>,
    body_provider: (req: IncomingMessage) => any,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
    const request_validator = validate<ArrayOrItem<RPCRequest<P, ID, Method<P>>>>(Union(
        validate_one,
        List(validate_one),
    ));

    function validate_one(x: any): boolean {
        return Boolean(
            typeof x === 'object'
            && x !== null
            && x.jsonrpc === '2.0'
            && Natural(x.id)
            && x.method in procedures
            && Array.isArray(x.params)
            && procedures[x.method]!.validator(x.params)
        );
    }

    return async function(req: IncomingMessage, res: ServerResponse) {
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

        let result: ArrayOrItem<RPCResponse<P, ID, Method<P>>>;
        if (Array.isArray(request)) {
            result = await (
                Promise.all(
                    request.map(x =>
                        call_method(procedures, x, env)
                            .then(y => [x, y] as const))
                ).then(xs => xs.map(([request, result]) => toRPCResponse(request, result)))
            );
        } else {
            result = toRPCResponse(
                request,
                await call_method(procedures, request, env),
            );
        }

        serve(res, result);
    }
}
