// -----------------------------------------------------------------------------
// The HTTP transport itself, against a server on the loopback interface (no
// network): answers, timeout, size cap, connection refused.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { MAX_BODY_BYTES, httpGet } from '../src/linkplay/http.js';

async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('an answer comes back whole, with its status', async (t) => {
  const origin = await serve(t, (request, response) => {
    assert.equal(request.url, '/httpapi.asp?command=getStatusEx');
    response.end('{"uuid":"FF00"}');
  });
  assert.deepEqual(await httpGet(`${origin}/httpapi.asp?command=getStatusEx`), {
    status: 200,
    body: '{"uuid":"FF00"}',
  });
});

test('a silent server times out', async (t) => {
  const origin = await serve(t, () => {});
  await assert.rejects(() => httpGet(`${origin}/`, { timeoutMs: 50 }), { code: 'timeout' });
});

test('a huge answer is cut', async (t) => {
  const origin = await serve(t, (request, response) => {
    response.end(Buffer.alloc(MAX_BODY_BYTES + 10, 'a'));
  });
  await assert.rejects(() => httpGet(`${origin}/`), { code: 'invalid' });
});

test('a closed port is unreachable', async () => {
  // Port 1 of the loopback: nobody listens there.
  await assert.rejects(() => httpGet('http://127.0.0.1:1/', { timeoutMs: 1000 }), {
    code: 'unreachable',
  });
});
