// -----------------------------------------------------------------------------
// LinkPlay HTTP API client: `GET /httpapi.asp?command=<command>`.
//
// The same API runs on every LinkPlay player (WiiM, Arylic, Audio Pro, iEAST,
// ArtSound...), on HTTPS port 443 for the recent firmwares (self-signed) and
// HTTP port 80 for the older ones. An address without an explicit scheme tries
// both, HTTPS first, and remembers the one that answered.
//
// Answers: JSON for the status commands, the plain text "OK" for the orders,
// "unknown command" when the firmware does not know the command.
// -----------------------------------------------------------------------------

import { httpGet, LinkPlayError } from './http.js';

/** What an address without scheme tries, in order. */
export const DEFAULT_ENDPOINTS = [
  { scheme: 'https', port: 443 },
  { scheme: 'http', port: 80 },
];

const HOSTNAME =
  /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)*$/;
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0)$/i;

/**
 * Parse what a user typed: `192.0.2.10`, `wiim.local`, `http://192.0.2.10`,
 * `192.0.2.10:8080`. Throws on anything else.
 * @param {string} input
 * @returns {{ hostname: string, scheme?: 'http' | 'https', port?: number, key: string }}
 */
export function parseAddress(input) {
  const text = String(input ?? '').trim();
  const match = text.match(/^(?:(https?):\/\/)?([^/:?#@\s]+)(?::(\d{1,5}))?\/?$/i);
  if (!match || !HOSTNAME.test(match[2])) {
    throw new LinkPlayError('invalid', `invalid address "${text}"`);
  }
  const hostname = match[2].toLowerCase();
  if (LOOPBACK.test(hostname)) {
    throw new LinkPlayError('invalid', `"${text}" is the integration container itself`);
  }
  const scheme = match[1]?.toLowerCase();
  const port = match[3] ? Number(match[3]) : undefined;
  if (port !== undefined && (port < 1 || port > 65535)) {
    throw new LinkPlayError('invalid', `invalid port in "${text}"`);
  }
  const key = `${scheme ? `${scheme}://` : ''}${hostname}${port ? `:${port}` : ''}`;
  return { hostname, scheme, port, key };
}

/**
 * Percent-encode what cannot travel raw in the query string (`&`, `#`, `+`,
 * `%`, spaces, non-ASCII...), keeping the separators of the commands (`:`)
 * and of the URLs they carry readable. The player decodes the parameter.
 * @param {string} command
 */
export function encodeCommand(command) {
  return String(command).replace(/[^A-Za-z0-9\-._~:/?=,@!$'()*;]/gu, (c) => encodeURIComponent(c));
}

export class LinkPlayClient {
  /**
   * @param {string | object} address what parseAddress accepts, or its result
   * @param {object} [options]
   * @param {typeof httpGet} [options.get] the transport (tests)
   * @param {number} [options.timeoutMs]
   */
  constructor(address, { get = httpGet, timeoutMs = 5000 } = {}) {
    this.address = typeof address === 'string' ? parseAddress(address) : address;
    this.get = get;
    this.timeoutMs = timeoutMs;
    const { scheme, port } = this.address;
    this.fixed = scheme !== undefined || port !== undefined;
    this.endpoint = this.fixed
      ? {
          scheme: scheme ?? (port === 443 ? 'https' : 'http'),
          port: port ?? (scheme === 'https' ? 443 : 80),
        }
      : null;
  }

  get hostname() {
    return this.address.hostname;
  }

  /** `https://192.0.2.10` (no command, no credentials: safe to log). */
  get origin() {
    const endpoint = this.endpoint ?? DEFAULT_ENDPOINTS[0];
    return originOf(this.address.hostname, endpoint);
  }

  /** The endpoints to try for the next request. */
  candidates() {
    if (this.endpoint) {
      return [this.endpoint];
    }
    return DEFAULT_ENDPOINTS;
  }

  /**
   * Send a command, resolve the raw text of the answer.
   * @param {string} command
   * @param {{ timeoutMs?: number }} [options]
   */
  async command(command, { timeoutMs = this.timeoutMs } = {}) {
    let lastError = null;
    for (const endpoint of this.candidates()) {
      const url = `${originOf(this.address.hostname, endpoint)}/httpapi.asp?command=${encodeCommand(command)}`;
      let answer;
      try {
        answer = await this.get(url, { timeoutMs });
      } catch (err) {
        lastError =
          err instanceof LinkPlayError ? err : new LinkPlayError('unreachable', err.message);
        continue;
      }
      if (answer.status < 200 || answer.status >= 300) {
        lastError = new LinkPlayError('http', `HTTP ${answer.status}`);
        continue;
      }
      if (!this.fixed) {
        this.endpoint = endpoint;
      }
      const text = answer.body.trim();
      if (/^unknown command/i.test(text)) {
        throw new LinkPlayError('unsupported', `"${command.split(':')[0]}" is not supported`);
      }
      return text;
    }
    // The remembered endpoint may be gone (firmware update, other device on
    // the address): try both again next time.
    if (!this.fixed) {
      this.endpoint = null;
    }
    throw lastError ?? new LinkPlayError('unreachable', 'no answer');
  }

  /** Send a status command, resolve its JSON. */
  async json(command, options) {
    const text = await this.command(command, options);
    try {
      return JSON.parse(text);
    } catch {
      if (/^fail/i.test(text)) {
        throw new LinkPlayError('failed', `"${command.split(':')[0]}" failed`);
      }
      throw new LinkPlayError('invalid', 'not a LinkPlay answer');
    }
  }

  /** Send an order, check the player accepted it ("OK", or a JSON status OK). */
  async ok(command, options) {
    const text = await this.command(command, options);
    if (/^ok$/i.test(text)) {
      return;
    }
    try {
      const json = JSON.parse(text);
      if (json && typeof json === 'object' && /^ok$/i.test(String(json.status ?? ''))) {
        return;
      }
    } catch {
      // not JSON: refused below
    }
    throw new LinkPlayError('failed', `"${command.split(':')[0]}" refused`);
  }
}

function originOf(hostname, { scheme, port }) {
  const standard = (scheme === 'https' && port === 443) || (scheme === 'http' && port === 80);
  return `${scheme}://${hostname}${standard ? '' : `:${port}`}`;
}
