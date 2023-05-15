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
import type { Unary, ArrayOrItem, Nullary } from 'fpts/data';
import { pop } from 'fpts/map';
import { randint } from 'fpts/maths';
import { pipe } from 'fpts/function';
import { map } from 'fpts/option';
import { T } from 'fpts/combinator';

type RequestRes<
    P extends Procedures,
    I extends ID,
    M extends Method<P>
> = [ RPCRequest<P, I, M>, Unary<Result<P, M>, void> ]

const random_id = () => randint(0, Number.MAX_SAFE_INTEGER);

export function initialise<P extends Procedures>(
    endpoint: string,
    id_provider: Nullary<ID> = random_id,
    next_tick = requestAnimationFrame,
    http: Unary<RequestInfo, Promise<Response>> = fetch,
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

        return http(new Request(endpoint,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request.length === 1 ? request[0] : request),
            }))
            .then(response => response.json())
            .then((response: ArrayOrItem<RPCResponse<P, ID, Method<P>>>) => {
                const help = (x: RPCResponse<P, ID, keyof P>) =>
                    pipe(resolutions, pop(x.id), map(T(parse_response(x))));
                if (Array.isArray(response)) response.forEach(help);
                else help(response);
                for (const f of resolutions.values())
                    f(new HTTPError(500, 'did not receive response for some reason'));
            })
            .catch(e => {
                const err = new HTTPError(500, e.message);
                err.cause = e;
                for (const f of resolutions.values())
                    f(err);
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
                    next_tick(() => commit_requests(endpoint));
                }
            });
        };
    };
}
