import { describe, it } from 'node:test'
import { spy } from 'fpts/function'
import { initialise } from './dist/frontend.js'
import * as assert from 'node:assert'
import { last } from 'fpts/array'
import HTTPModule from './dist/HTTPError.js';
const HTTPError = HTTPModule.default;

const hostname = 'https://localhost/api/rpc';

const next_frame = f => setTimeout(() => f(), 1)

const request_maker = x => spy(async () => ({
    json: () => x
}))

const same_request = async (a, b) => {
    assert.equal(a instanceof Request, true);
    assert.equal(b instanceof Request, true);
    assert.deepEqual(Array.from(a.headers), Array.from(b.headers));
    assert.equal(await a.text(), await b.text());
}

describe('frontend', async () => {
    it('make http requests and return their results', async () => {
        const http = request_maker({
            jsonrpc: '2.0',
            id: 1,
            result: 'pong'
        })

        const result = await initialise(hostname, () => 1, next_frame, http)('ping')()

        assert.equal(http.calls.length, 1)
        await same_request(last(http.calls)[0], new Request(hostname, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'ping',
                params: [],
            })
        }));
        assert.equal(result, 'pong')
    })

    it('should batch multiple requests', async () => {
        const http = request_maker([
            {
                jsonrpc: '2.0',
                id: 1,
                result: 'pong'
            },
            {
                jsonrpc: '2.0',
                id: 2,
                result: 'wrong'
            },
        ])

        let i = 1
        const helper = initialise(hostname, () => i++, next_frame, http)
        const ping = helper('ping')
        const wrong = helper('wrong')

        const results = await Promise.all([ping(), wrong(false, false, false)])

        assert.equal(http.calls.length, 1)
        await same_request(
            last(http.calls)[0],
            new Request(
                hostname,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify([
                        {
                            jsonrpc: '2.0',
                            id: 2,
                            method: 'wrong',
                            params: [false, false, false],
                        },
                        {
                            jsonrpc: '2.0',
                            id: 1,
                            method: 'ping',
                            params: [],
                        },
                    ])
                }
            )
        )

        assert.deepEqual(
            results,
            [
                'pong',
                'wrong',
            ]
        )
    })

    it('should return errors as ErrorsWithCode', async () => {
        const http = request_maker({
            jsonrpc: '2.0',
            id: 1,
            error: {
                code: 404,
                message: 'Not found',
            }
        })

        const result = await initialise(hostname, () => 1, next_frame, http)('ping')()
        assert.equal(result instanceof Error, true)
        assert.equal(result.code, 404)
        assert.equal(result.message, 'Not found')
    })

    it('should return missing results as httperrors', async () => {
        const http = request_maker([
            {
                jsonrpc: '2.0',
                id: 1,
                result: 'ping',
            },
        ])

        let i = 1
        const helper = await initialise(hostname, () => i++, next_frame, http)
        const ping = helper('ping')
        const pong = helper('pong')
        const result = await Promise.all([ping(), pong(1,2,3)])
        assert.deepEqual(result, [
            'ping',
            new HTTPError(500, 'did not receive response for some reason')
        ])
    })
})
