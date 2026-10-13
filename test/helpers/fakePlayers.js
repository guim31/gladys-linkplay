// -----------------------------------------------------------------------------
// Fake LinkPlay players behind the HTTP transport of the client: every test
// talks to them instead of the network. Each player starts from the answers
// of test/fixtures/players/<folder>/ and keeps a small playback state the
// orders change like a real player does.
// -----------------------------------------------------------------------------

import { readFileSync, readdirSync } from 'node:fs';
import { LinkPlayError } from '../../src/linkplay/http.js';

const FIXTURES = new URL('../fixtures/players/', import.meta.url);

// switchmode name → the `mode` the player reports afterwards.
const MODE_OF = {
  wifi: '10',
  bluetooth: '41',
  'line-in': '40',
  'line-in2': '47',
  optical: '43',
  optical2: '56',
  'co-axial': '45',
  'co-axial2': '57',
  RCA: '44',
  HDMI: '49',
  phono: '54',
};

export const hex = (text) => Buffer.from(text, 'utf8').toString('hex').toUpperCase();

export function loadFixtures(folder) {
  const dir = new URL(`${folder}/`, FIXTURES);
  const answers = {};
  for (const file of readdirSync(dir)) {
    if (file.endsWith('.json')) {
      answers[file.slice(0, -5).replace(/^multiroom-/, 'multiroom:')] = JSON.parse(
        readFileSync(new URL(file, dir), 'utf8'),
      );
    }
  }
  return answers;
}

export class FakePlayer {
  /**
   * @param {string} folder fixture folder
   * @param {object} [options]
   * @param {boolean} [options.https] answers on HTTPS 443 (else HTTP 80 only)
   * @param {boolean} [options.prompt] knows playPromptUrl
   * @param {object} [options.status] getStatusEx overrides
   */
  constructor(folder, { https = true, prompt = true, status = {} } = {}) {
    this.answers = loadFixtures(folder);
    this.statusEx = { ...this.answers.getStatusEx, ...status };
    this.hasEx = this.answers.getPlayerStatusEx !== undefined;
    this.player = { ...(this.answers.getPlayerStatusEx ?? this.answers.getPlayerStatus) };
    this.https = https;
    this.prompt = prompt;
    this.online = true;
    /** Every command received, status reads included. */
    this.received = [];
  }

  /** The orders received (status reads left out). */
  get orders() {
    return this.received.filter(
      (command) =>
        !/^(getStatusEx|getPlayerStatus|getPlayerStatusEx|getMetaInfo|EQGetList|EQGetStat|getPresetInfo|multiroom:getSlaveList)$/.test(
          command,
        ),
    );
  }

  set(fields) {
    Object.assign(this.player, fields);
  }

  json(value) {
    return JSON.stringify(value);
  }

  handle(command) {
    this.received.push(command);
    const [verb, ...rest] = command.split(':');
    const arg = rest.join(':');
    switch (verb) {
      case 'getStatusEx':
        return this.json(this.statusEx);
      case 'getPlayerStatusEx':
        return this.hasEx ? this.json(this.player) : 'unknown command';
      case 'getPlayerStatus':
        return this.json(this.player);
      case 'getMetaInfo':
      case 'EQGetList':
      case 'EQGetStat':
      case 'getPresetInfo':
        return this.answers[verb] !== undefined ? this.json(this.answers[verb]) : 'unknown command';
      case 'multiroom':
        if (arg === 'getSlaveList') {
          return this.json(this.answers['multiroom:getSlaveList'] ?? { slaves: 0 });
        }
        return 'OK';
      case 'setPlayerCmd':
        return this.playerCommand(rest);
      case 'MCUKeyShortClick':
        this.set({ mode: '10', status: 'play' });
        return 'OK';
      case 'playPromptUrl':
        return this.prompt ? 'OK' : 'unknown command';
      case 'EQLoad':
      case 'EQOff':
        this.answers.EQGetStat = { EQStat: verb === 'EQOff' ? 'Off' : 'On' };
        return this.json({ status: 'OK' });
      case 'ConnectMasterAp':
        this.set({ mode: '99' });
        return 'OK';
      default:
        return 'unknown command';
    }
  }

  playerCommand([action, ...args]) {
    const value = args.join(':');
    switch (action) {
      case 'pause':
        this.set({ status: 'pause' });
        return 'OK';
      case 'resume':
        this.set({ status: 'play' });
        return 'OK';
      case 'stop':
        this.set({ status: 'stop' });
        return 'OK';
      case 'prev':
      case 'next':
        return 'OK';
      case 'vol':
        this.set({ vol: value });
        return 'OK';
      case 'mute':
        this.set({ mute: value });
        return 'OK';
      case 'switchmode':
        if (!MODE_OF[value]) {
          return 'Failed';
        }
        this.set({ mode: MODE_OF[value], status: 'play', Title: '', Artist: '', Album: '' });
        return 'OK';
      case 'play':
        this.set({ mode: '10', status: 'play', Title: '', Artist: '', Album: '' });
        return 'OK';
      default:
        return 'unknown command';
    }
  }
}

/**
 * The transport of the client, routed to fake players by host name.
 * @param {Record<string, FakePlayer>} players by IP address
 */
export function fakeNetwork(players) {
  const requests = [];
  const get = async (url) => {
    const target = new URL(url);
    requests.push(url);
    const player = players[target.hostname];
    if (!player || !player.online) {
      throw new LinkPlayError('timeout', 'no answer within 2500 ms');
    }
    if (target.protocol === 'https:' && !player.https) {
      throw new LinkPlayError('unreachable', 'ECONNREFUSED');
    }
    const command = target.searchParams.get('command');
    return { status: 200, body: player.handle(command) };
  };
  return { get, requests, players };
}
