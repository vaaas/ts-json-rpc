import * as assert from 'assert'
import { describe, it } from 'node:test'
import test from './dist/HTTPError.js'
const HTTPError = test.default

describe('HTTPError', () => {
    it('should serialise properly', () => {
        const args = [
            [400, 'Bad request'],
            [404, 'Not found'],
            [500, 'Internal server error'],
        ]

        for (const [code, message] of args) {
            const err = new HTTPError(code, message)
            assert.equal(JSON.stringify(err), JSON.stringify({ code, message }))
        }
    })
})
