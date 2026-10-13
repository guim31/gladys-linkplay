// -----------------------------------------------------------------------------
// Finding the players.
//
// The container sits on a Docker bridge: mDNS and SSDP never reach it. The
// core scans for it (mediated discovery, manifest `network_discovery`):
//   - mDNS `_linkplay._tcp`, announced by the WiiM and recent LinkPlay firmwares;
//   - SSDP `urn:schemas-upnp-org:device:MediaRenderer:1`, answered by every
//     LinkPlay player — and by TVs, amplifiers and other renderers, so each
//     answer is asked `getStatusEx`, and only the players that answer it count.
// The addresses of the configuration, those of the players already added, and
// the followers listed by a group leader are asked too.
//
// One scan at a time per integration (core rule): mDNS, then SSDP.
// -----------------------------------------------------------------------------

import { LinkPlayClient } from './linkplay/client.js';
import { parseDeviceStatus, parseFollowers } from './linkplay/status.js';

export const SCAN_TIMEOUT_SECONDS = 5;
const PROBE_TIMEOUT_MS = 2500;
const CONCURRENCY = 6;
// An SSDP renderer that is not a LinkPlay player is not asked again before.
const NOT_LINKPLAY_TTL_MS = 30 * 60 * 1000;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** IPv4 addresses of an mDNS answer `{ addresses, host }`. */
function mdnsAddresses(entry) {
  const list = Array.isArray(entry?.addresses) ? entry.addresses : [];
  return list.filter((address) => IPV4.test(address));
}

/** Run `task` on every item, `limit` at a time. */
async function eachLimited(items, limit, task) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      await task(queue.shift());
    }
  });
  await Promise.all(workers);
}

export class Discovery {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration
   * @param {Function} [options.get] HTTP transport (tests)
   * @param {() => number} [options.now]
   */
  constructor({ gladys, get, now = () => Date.now() }) {
    this.gladys = gladys;
    this.get = get;
    this.now = now;
    /** address → when it was found not to be a LinkPlay player. */
    this.notLinkPlay = new Map();
  }

  /** A mediated scan; 'unavailable' when the core cannot (older core, refused). */
  async scan(type) {
    try {
      const results = await this.gladys.scanNetwork(type, { timeoutSeconds: SCAN_TIMEOUT_SECONDS });
      return { status: 'ok', results: Array.isArray(results) ? results : [] };
    } catch (err) {
      return { status: 'unavailable', results: [], error: err.message };
    }
  }

  /**
   * Ask one address `getStatusEx`.
   * @returns {Promise<{ client: LinkPlayClient, info: object }>}
   */
  async probe(address) {
    const client = new LinkPlayClient(address, { get: this.get, timeoutMs: PROBE_TIMEOUT_MS });
    const info = parseDeviceStatus(await client.json('getStatusEx'));
    // The probe timeout is short; the player's own requests get the default.
    client.timeoutMs = 5000;
    return { client, info };
  }

  /**
   * @param {object} options
   * @param {object[]} options.addresses parsed addresses always asked (configuration,
   *   players already added)
   * @returns {Promise<{ found: Map<string, { client, info, origin }>, mdns: string,
   *   ssdp: string, failed: Map<string, { origin, reason }> }>} found by uuid
   */
  async run({ addresses = [] }) {
    const candidates = new Map();
    const add = (address, origin) => {
      const key = typeof address === 'string' ? address : address.key;
      if (!candidates.has(key)) {
        candidates.set(key, { address, origin });
      }
    };
    for (const address of addresses) {
      add(address, 'config');
    }
    const mdns = await this.scan('mdns');
    for (const entry of mdns.results) {
      for (const ip of mdnsAddresses(entry)) {
        add(ip, 'mdns');
      }
    }
    const ssdp = await this.scan('ssdp');
    for (const entry of ssdp.results) {
      if (IPV4.test(entry?.source_ip ?? '')) {
        add(entry.source_ip, 'ssdp');
      }
    }

    const found = new Map();
    const failed = new Map();
    const probeAll = (entries) =>
      eachLimited(entries, CONCURRENCY, async ([key, { address, origin }]) => {
        const skippedAt = this.notLinkPlay.get(key);
        if (
          origin !== 'config' &&
          skippedAt !== undefined &&
          this.now() - skippedAt < NOT_LINKPLAY_TTL_MS
        ) {
          return;
        }
        try {
          const { client, info } = await this.probe(address);
          this.notLinkPlay.delete(key);
          if (!found.has(info.uuid)) {
            found.set(info.uuid, { client, info, origin });
          }
        } catch (err) {
          failed.set(key, { origin, reason: err.message });
          if (origin !== 'config') {
            this.notLinkPlay.set(key, this.now());
          }
        }
      });
    await probeAll([...candidates]);

    // Followers of a group stop answering SSDP on some firmwares: their
    // leader lists them.
    const followers = new Map();
    await eachLimited([...found.values()], CONCURRENCY, async ({ client }) => {
      try {
        for (const follower of parseFollowers(await client.json('multiroom:getSlaveList'))) {
          if (follower.ip && !candidates.has(follower.ip) && !found.has(follower.uuid)) {
            followers.set(follower.ip, { address: follower.ip, origin: 'group' });
          }
        }
      } catch {
        // no group support: nothing more to find
      }
    });
    await probeAll([...followers]);

    return { found, mdns: mdns.status, ssdp: ssdp.status, failed };
  }
}
