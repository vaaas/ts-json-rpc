"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const HTTPError_1 = require("./HTTPError");
const map_1 = require("fpts/map");
const maths_1 = require("fpts/maths");
const function_1 = require("fpts/function");
const option_1 = require("fpts/option");
const combinator_1 = require("fpts/combinator");
const random_id = () => (0, maths_1.randint)(0, Number.MAX_SAFE_INTEGER);
function rpc_factory_factory(endpoint, id_provider = random_id) {
    function parse_response(x) {
        if ('result' in x) {
            return x.result;
        }
        else if ('error' in x) {
            const y = x.error;
            return new HTTPError_1.default(y.code, y.message);
        }
        else {
            return new HTTPError_1.default(500, 'Unexpected return value ' + JSON.stringify(x));
        }
    }
    const queue = [];
    let timeout = false;
    function commit_requests(endpoint) {
        const request = [];
        const resolutions = new Map();
        while (queue.length) {
            const x = queue.pop();
            if (!x)
                continue;
            request.push(x[0]);
            resolutions.set(x[0].id, x[1]);
        }
        timeout = false;
        return fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request.length === 1 ? request[0] : request),
        })
            .then(response => response.json())
            .then(response => {
            const help = (x) => (0, function_1.pipe)(resolutions, (0, map_1.pop)(x.id), (0, option_1.map)((0, combinator_1.T)(parse_response(x))));
            if (Array.isArray(response))
                response.forEach(help);
            else
                help(response);
            for (const f of resolutions.values())
                f(new HTTPError_1.default(500, 'did not receive response for some reason'));
        });
    }
    return function rpc_factory(method) {
        return function (...xs) {
            return new Promise(yes => {
                const r = [
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
exports.default = rpc_factory_factory;
