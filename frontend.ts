import type {
    Procedures,
    RPCResponse,
    RPCRequest,
    Method,
    Result,
    Params,
    ID,
} from './backend';
import HTTPError from './HTTPError';
import { Unary, ArrayOrItem, Nullary } from 'fpts/data';
import { pop } from 'fpts/map';

type RequestRes<
    P extends Procedures,
    I extends ID,
    M extends Method<P>
> = [ RPCRequest<P, I, M>, Unary<Result<P, M>, void> ]

function random_id(): number {
    return Math.floor(Math.random()*Number.MAX_SAFE_INTEGER);
}

export default function rpc_factory_factory<P extends Procedures>(
    endpoint: string,
    id_provider: Nullary<ID> = random_id
) {
    function parse_response<I extends ID, M extends Method<P>>(x: RPCResponse<P, I, M>): Result<P, M> {
        if ('result' in x) {
            return x.result;
        } else if ('error' in x) {
            const y: HTTPError<any> = x.error
            return new HTTPError(y.code, y.message);
        } else {
            return new HTTPError(500, 'Unexpected return value ' + JSON.stringify(x));
        }
    }

    const queue: Array<RequestRes<P, ID, any>> = [];
    let timeout = false;
    function commit_requests(endpoint: string) {
        const request: RPCRequest<P, ID, Method<P>>[] = [];
        const resolutions: Map<ID, Unary<Result<P, Method<P>>, void>> = new Map();
        while (queue.length) {
            const x = queue.pop();
            if (!x) continue;
            request.push(x[0]);
            resolutions.set(x[0].id, x[1]);
        }
        timeout = false;

        return fetch(endpoint,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request.length === 1 ? request[0] : request),
            })
            .then(response => response.json() as Promise<ArrayOrItem<RPCResponse<P, ID, Method<P>>>>)
            .then(response => {
                if (Array.isArray(response))
                    for (const x of response) {
                        const f = pop(x.id)(resolutions);
                        if (f) f(parse_response(x));
                    }
                else {
                    const f = pop(response.id)(resolutions);
                    if (f) f(parse_response(response));
                }
                for (const f of resolutions.values())
                    f(new HTTPError(500, 'did not receive response for some reason'));
            });
    }

    return function rpc_factory<M extends Method<P>>(method: M) {
        return function(...xs: Params<P, M>): Promise<Result<P, M>> {
            return new Promise(yes => {
                const r: RequestRes<P, ID, M> = [
                    {
                        jsonrpc: '2.0',
                        id: id_provider(),
                        method: method,
                        params: xs,
                    },
                    yes,
                ];
                queue.push(r);
                if (!timeout) {
                    timeout = true;
                    requestAnimationFrame(() => commit_requests(endpoint));
                }
            });
        };
    };
}
