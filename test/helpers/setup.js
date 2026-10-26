// -----------------------------------------------------------------------------
// A whole integration under test: the SDK's fake Gladys, the real wiring of
// src/app.js, and fake players on a fake network:
//   192.0.2.10 WiiM Pro "Salon" (HTTPS, mDNS), leads the group
//   192.0.2.11 WiiM Amp "Cuisine" (HTTPS, SSDP), follows the WiiM Pro
//   192.0.2.12 Arylic Up2Stream Amp v4 "Bureau" (HTTP only, configured address)
//   192.0.2.21 ArtSound Smart Zone 4 (HTTP only, SSDP)
//   192.0.2.50 a TV answering SSDP, not a LinkPlay player
// The clock is manual; the polling timer is off unless asked.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { FakePlayer, fakeNetwork } from './fakePlayers.js';

export const SALON = '192.0.2.10';
export const CUISINE = '192.0.2.11';
export const BUREAU = '192.0.2.12';
export const ZONE = '192.0.2.21';
export const TV = '192.0.2.50';

export const UUIDS = {
  salon: 'FF98F09C3D7A5E21B6C04F18A9E2D7B3',
  cuisine: 'FF98F359A1B2C3D4E5F60718293A4B5C',
  bureau: 'FF31F0A6B2C4D6E8F0A2B4C6D8E0F2A4',
  zone: 'FF31F09E5001FBDE0546AB12CD34EF56',
};

export function defaultPlayers() {
  return {
    [SALON]: new FakePlayer('wiim-pro'),
    [CUISINE]: new FakePlayer('wiim-amp'),
    [BUREAU]: new FakePlayer('arylic-up2stream-amp-v4', { https: false, prompt: false }),
    [ZONE]: new FakePlayer('artsound-smart-zone-4', { https: false }),
  };
}

export const SCAN_RESULTS = {
  mdns: [
    {
      name: 'WiiM Pro-8FA2._linkplay._tcp.local',
      host: 'WiiM-Pro-8FA2.local',
      addresses: [SALON, 'fe80::1'],
      port: 49152,
      txt: ['uuid=FF98F09C-3D7A-5E21-B6C0-4F18A9E2D7B3'],
    },
  ],
  ssdp: [
    {
      source_ip: SALON,
      source_port: 49152,
      headers: 'ST: urn:schemas-upnp-org:device:MediaRenderer:1',
    },
    {
      source_ip: CUISINE,
      source_port: 49152,
      headers: 'ST: urn:schemas-upnp-org:device:MediaRenderer:1',
    },
    {
      source_ip: ZONE,
      source_port: 49152,
      headers: 'ST: urn:schemas-upnp-org:device:MediaRenderer:1',
    },
    {
      source_ip: TV,
      source_port: 9197,
      headers: 'ST: urn:schemas-upnp-org:device:MediaRenderer:1',
    },
  ],
};

/**
 * @param {object} [options]
 * @param {object} [options.players] fake players by IP
 * @param {object} [options.config] stored configuration
 * @param {object} [options.scanResults]
 * @param {boolean | string[]} [options.create] add these discovered players (by IP) to Gladys
 * @param {object} [options.timings] hub timings
 * @param {boolean} [options.timers]
 * @param {(gladys) => void} [options.prepare] called before connect()
 * @param {boolean} [options.realTime] the real clock instead of the manual one
 * @param {Function} [options.artworkGet] transport of the artwork downloads
 */
export async function setup({
  players = defaultPlayers(),
  config = { hosts: BUREAU, language: 'fr' },
  scanResults = SCAN_RESULTS,
  create = [SALON, CUISINE, BUREAU, ZONE],
  timings,
  timers = false,
  prepare,
  realTime = false,
  artworkGet,
} = {}) {
  const network = fakeNetwork(players);
  const clock = { now: 1_000_000 };
  const gladys = createFakeGladys({ config, scanResults });
  const hub = registerHandlers(gladys, {
    get: network.get,
    timers,
    timings,
    now: realTime ? () => Date.now() : () => clock.now,
    wait: async () => {},
    artworkGet,
  });
  prepare?.(gladys);
  await gladys.connect();
  for (const ip of create || []) {
    const uuid = players[ip]?.statusEx.uuid;
    const device = gladys.fake.discoveredDevices.find((d) => d.external_id.endsWith(`:${uuid}`));
    if (device) {
      await gladys.fake.deviceCreated(device);
    }
  }
  const idOf = (ip, key) => {
    const ids = gladys.externalIds('player', players[ip].statusEx.uuid);
    return key ? ids.feature(key) : ids.device;
  };
  const deviceOf = (ip) => gladys.devices.find((device) => device.external_id === idOf(ip));
  return { gladys, hub, network, players, clock, idOf, deviceOf };
}

/** Wait until `check()` is true (real timers), or fail after `timeoutMs`. */
export async function until(check, timeoutMs = 2000) {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Capture the console lines of the SDK logger. */
export function captureLogs(t) {
  const lines = [];
  for (const stream of ['log', 'error']) {
    t.mock.method(console, stream, (...args) => lines.push(args.join(' ')));
  }
  return lines;
}
