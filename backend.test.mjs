import { describe, it } from 'node:test'
import { spy } from 'fpts/function'
import * as assert from 'node:assert'
import { initialise } from './dist/backend.js'
import { last } from 'fpts/array'

console.log(initialise)

const procedures = {
    ping: {
        procedure: spy((env) => Promise.resolve('pong')),
        validator: spy(() => true),
    },
    echo: {
        procedure: spy((env, arg) => Promise.resolve([env, arg])),
        validator: spy((x) => Array.isArray(x) && x.length === 1 && typeof x[0] === 'number'),
    },
    fail: {
        procedure: spy((env) => { throw new Error('yo') }),
        validator: spy(() => true),
    },
}

const res = {
    writeHead: spy((code, headers) => undefined),
    end: spy((x) => true),
}

const handler = initialise(
    procedures,
    () => ({ cool: 'story bro' }),
    x => x.body,
);

describe('backend', () => {
    it('should reject methods that aren\'t POST', async () => {
        const req = {
            method: 'GET',
        };
        for (const method of ['GET', 'PUT', 'HEAD', 'OPTIONS', 'PATCH', 'DELETE']) {
            res.writeHead.calls.length = 0
            res.end.calls.length = 0
            await handler({ method, }, res)
            assert.equal(res.writeHead.calls.length, 1)
            assert.equal(res.end.calls.length, 1)
            assert.deepEqual(
                last(res.writeHead.calls),
                [405, {'Content-Type': 'text/plain'}],
            )
        }
    })

    it('should reject invalid json rpc schema data', async () => {
        const invalids = [
            undefined,
            null,
            'hello',
            {},
            123,
        ]
        for (const body of invalids) {
            res.writeHead.calls.length = 0
            res.end.calls.length = 0
            await handler(
                {
                    method: 'POST',
                    body,
                },
                res
            )
            assert.equal(res.writeHead.calls.length, 1)
            assert.equal(res.end.calls.length, 1)
            assert.deepEqual(
                last(res.writeHead.calls),
                [400, {'Content-Type': 'text/plain'}]
            )
        }
    })

    it('should accept a single call, validate it, and return its result', async () => {
        res.writeHead.calls.length = 0
        res.end.calls.length = 0
        procedures.ping.procedure.calls.length = 0
        procedures.ping.validator.calls.length = 0
        await handler(
            {
                method: 'POST',
                body: {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'ping',
                    params: [],
                }
            },
            res
        )

        assert.equal(procedures.ping.validator.calls.length, 1)
        assert.deepEqual(last(procedures.ping.validator.calls), [[]])
        assert.equal(procedures.ping.procedure.calls.length, 1)
        assert.deepEqual(
            last(procedures.ping.procedure.calls),
            [{ cool: 'story bro' }]
        )
        assert.equal(res.writeHead.calls.length, 1)
        assert.deepEqual(
            last(res.writeHead.calls),
            [200, {'Content-Type': 'application/json'}]
        )
        assert.equal(res.end.calls.length, 1)
        assert.deepEqual(
            last(res.end.calls),
            [
                JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    result: 'pong'
                })
            ]
        )
    })

    it('should reject bad jsonrpc version', async () => {
        res.writeHead.calls.length = 0
        res.end.calls.length = 0
        await handler(
            {
                method: 'POST',
                body: {
                    jsonrpc: '2.1',
                    id: 1,
                    method: 'ping',
                    params: [],
                }
            },
            res
        )

        assert.deepEqual(
            last(res.writeHead.calls),
            [400, {'Content-Type': 'text/plain'}]
        )
        assert.equal(res.end.calls.length, 1)
        assert.deepEqual(
            last(res.end.calls),
            [
                'Bad request'
            ]
        )
    })

    it('should reject bad id', async () => {
        res.writeHead.calls.length = 0
        res.end.calls.length = 0
        await handler(
            {
                method: 'POST',
                body: {
                    jsonrpc: '2.0',
                    id: undefined,
                    method: 'ping',
                    params: [],
                }
            },
            res
        )

        assert.deepEqual(
            last(res.writeHead.calls),
            [400, {'Content-Type': 'text/plain'}]
        )
        assert.equal(res.end.calls.length, 1)
        assert.deepEqual(
            last(res.end.calls),
            [
                'Bad request'
            ]
        )
    })

    it('should reject bad params', async () => {
        res.writeHead.calls.length = 0
        res.end.calls.length = 0
        await handler(
            {
                method: 'POST',
                body: {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'ping',
                    // params: [],
                }
            },
            res
        )

        assert.deepEqual(
            last(res.writeHead.calls),
            [400, {'Content-Type': 'text/plain'}]
        )
        assert.equal(res.end.calls.length, 1)
        assert.deepEqual(
            last(res.end.calls),
            [
                'Bad request'
            ]
        )
    })

    it('should reject invalid params', async () => {
        res.writeHead.calls.length = 0
        res.end.calls.length = 0
        procedures.echo.procedure.calls.length = 0
        procedures.echo.validator.calls.length = 0

        await handler(
            {
                method: 'POST',
                body: {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'echo',
                    params: ['yo'],
                }
            },
            res
        )

        assert.equal(procedures.echo.validator.calls.length, 1)
        assert.deepEqual(
            last(procedures.echo.validator.calls),
            [['yo']],
        )
        assert.equal(procedures.echo.procedure.calls.length, 0)
        assert.deepEqual(
            last(res.writeHead.calls),
            [400, {'Content-Type': 'text/plain'}]
        )
        assert.equal(res.end.calls.length, 1)
        assert.deepEqual(
            last(res.end.calls),
            [
                'Bad request'
            ]
        )
    })

    it('should reject missing method ', async () => {
        res.writeHead.calls.length = 0
        res.end.calls.length = 0

        await handler(
            {
                method: 'POST',
                body: {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'invalid',
                    params: [],
                }
            },
            res
        )

        assert.equal(res.end.calls.length, 1)
        assert.deepEqual(
            last(res.end.calls),
            [
                'Bad request'
            ]
        )
    })

    it('should elevate all uncaught errors to httperror 500', async () => {
        res.writeHead.calls.length = 0
        res.end.calls.length = 0
        procedures.fail.procedure.calls.length = 0
        procedures.fail.validator.calls.length = 0

        await handler(
            {
                method: 'POST',
                body: {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'fail',
                    params: [],
                }
            },
            res
        )

        assert.equal(procedures.fail.validator.calls.length, 1)
        assert.equal(procedures.fail.procedure.calls.length, 1)
        assert.equal(res.writeHead.calls.length, 1)
        assert.deepEqual(
            last(res.writeHead.calls),
            [ 500, { 'Content-Type': 'application/json'} ]
        )
        assert.equal(res.end.calls.length, 1)
        assert.deepEqual(
            last(res.end.calls),
            [
                JSON.stringify( {
                    jsonrpc: '2.0',
                    id: 1,
                    error: {
                        code: 500,
                        message: 'Internal server error'
                    }
                })
            ]
        )
    })

    it('should accept multiple rpc calls', async () => {
        res.writeHead.calls.length = 0
        res.end.calls.length = 0
        procedures.echo.procedure.calls.length = 0
        procedures.echo.validator.calls.length = 0
        procedures.ping.procedure.calls.length = 0
        procedures.ping.validator.calls.length = 0

        await handler(
            {
                method: 'POST',
                body: [
                    {
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'ping',
                        params: [],
                    },
                    {
                        jsonrpc: '2.0',
                        id: 2,
                        method: 'echo',
                        params: [123],
                    },
                    {
                        jsonrpc: '2.0',
                        id: 3,
                        method: 'fail',
                        params: [],
                    }
                ]
            },
            res,
        )

        assert.equal(procedures.ping.validator.calls.length, 1)
        assert.equal(procedures.ping.procedure.calls.length, 1)
        assert.equal(procedures.echo.validator.calls.length, 1)
        assert.equal(procedures.echo.procedure.calls.length, 1)
        assert.deepEqual(
            last(res.end.calls),
            [
                JSON.stringify([
                    {
                        jsonrpc: '2.0',
                        id: 1,
                        result: 'pong'
                    },
                    {
                        jsonrpc: '2.0',
                        id: 2,
                        result: [{ cool: 'story bro' }, 123]
                    },
                    {
                        jsonrpc: '2.0',
                        id: 3,
                        error: {
                            code: 500,
                            message: 'Internal server error'
                        }
                    }
                ])
            ]
        )
    })
})

// describe('routes/rpc.js', () => {

//     it('should turn all uncaught errors into http 500 errors', async () => {
//         jest.mock('../procedures/getUser', () => ({
//             procedure: async () => { throw new Error('test') },
//             validator: () => true,
//         }));

//         const req = {
//             method: 'POST',
//             body: {
//                 jsonrpc: '2.0',
//                 id: 123,
//                 method: 'ping',
//                 params: [],
//             },
//         };

//         await init({})(req, res);
//         expect(res.status).toHaveBeenCalledWith(500);
//         expect(res.json).toHaveBeenCalledWith({
//             jsonrpc: '2.0',
//             id: 123,
//             error: new HTTPError(500, 'Internal server error'),
//         });
//     });
// })
