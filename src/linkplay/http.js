// -----------------------------------------------------------------------------
// The one HTTP GET the LinkPlay API needs, on node:http / node:https.
//
// Recent WiiM firmwares answer in HTTPS only, with a self-signed certificate:
// there is no CA to check it against, the LAN address the user typed (or the
// discovery found) is the identity. The https agent below therefore accepts
// any certificate, and is used for these players only.
//
// Bounded on every side: a timeout covering the whole exchange, and a body cap
// (a status answer is ~3 KB; anything bigger is not a LinkPlay player).
// -----------------------------------------------------------------------------

import http from 'node:http';
import https from 'node:https';

export const MAX_BODY_BYTES = 256 * 1024;

// No keep-alive: the players' embedded web servers have few sockets, and one
// request every few seconds gains nothing from holding one open.
const httpAgent = new http.Agent({ keepAlive: false });
const insecureAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: false });
const secureAgent = new https.Agent({ keepAlive: false });

/** A failed exchange, with a code the callers branch on. */
export class LinkPlayError extends Error {
  /**
   * @param {'unreachable' | 'timeout' | 'http' | 'unsupported' | 'failed' | 'invalid'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'LinkPlayError';
    this.code = code;
  }
}

/**
 * GET a URL, resolve `{ status, body }`.
 * @param {string} url
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ status: number, body: string }>}
 */
export async function httpGet(url, { timeoutMs = 5000 } = {}) {
  const answer = await httpGetBytes(url, { timeoutMs, insecure: true });
  return { status: answer.status, body: answer.body.toString('utf8') };
}

/**
 * GET a URL, resolve its raw bytes. Used for the players (`insecure`: their
 * self-signed certificate is accepted) and for artwork (src/music.js), where
 * only a LAN address is `insecure`.
 * @param {string} url
 * @param {{ timeoutMs?: number, maxBytes?: number, insecure?: boolean }} [options]
 * @returns {Promise<{ status: number, location: string | null, body: Buffer }>}
 */
export function httpGetBytes(
  url,
  { timeoutMs = 5000, maxBytes = MAX_BODY_BYTES, insecure = false } = {},
) {
  const target = new URL(url);
  const secure = target.protocol === 'https:';
  const lib = secure ? https : http;
  const agent = secure ? (insecure ? insecureAgent : secureAgent) : httpAgent;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        fn(value);
      }
    };
    const request = lib.get(target, { agent, headers: { Accept: '*/*' } }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          request.destroy();
          finish(reject, new LinkPlayError('invalid', 'answer too large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () =>
        finish(resolve, {
          status: response.statusCode ?? 0,
          location: response.headers.location ?? null,
          body: Buffer.concat(chunks),
        }),
      );
      response.on('error', (err) => finish(reject, new LinkPlayError('unreachable', err.message)));
    });
    const timer = setTimeout(() => {
      request.destroy();
      finish(reject, new LinkPlayError('timeout', `no answer within ${timeoutMs} ms`));
    }, timeoutMs);
    request.on('error', (err) =>
      finish(reject, new LinkPlayError('unreachable', err.code ?? err.message)),
    );
  });
}
