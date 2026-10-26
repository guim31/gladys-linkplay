// -----------------------------------------------------------------------------
// Reading the LinkPlay answers: `getStatusEx` (the device), `getPlayerStatusEx`
// (the playback), `multiroom:getSlaveList` (the group), and the WiiM extras.
//
// Field meanings follow python-linkplay (MIT, Velleman Group nv), the library
// of the Home Assistant `linkplay` integration, and its real answers.
// -----------------------------------------------------------------------------

import { lookupModel, wiimModelInputs } from './models.js';

/** Playback status of the player, as the integration names it. */
export const PLAYBACK = {
  PLAYING: 'playing',
  LOADING: 'loading',
  PAUSED: 'paused',
  STOPPED: 'stopped',
};

const STATUS_MAP = { play: PLAYBACK.PLAYING, load: PLAYBACK.LOADING, pause: PLAYBACK.PAUSED };

// Inputs a player can switch to: the integration's key (part of the source
// feature's options, frozen once published) → the `switchmode` name the
// firmware expects (case sensitive).
export const INPUTS = {
  wifi: 'wifi',
  bluetooth: 'bluetooth',
  'line-in': 'line-in',
  'line-in-2': 'line-in2',
  optical: 'optical',
  'optical-2': 'optical2',
  coaxial: 'co-axial',
  'coaxial-2': 'co-axial2',
  rca: 'RCA',
  xlr: 'XLR',
  hdmi: 'HDMI',
  arc: 'ARC',
  phono: 'phono',
  usb: 'udisk',
  'usb-dac': 'PCUSB',
  'sd-card': 'TFcard',
  cd: 'cd',
  fm: 'FM',
  dab: 'DAB',
  'external-bluetooth': 'extern_bluetooth',
};

// `plm_support` bit → input key (the wifi input is always there).
const PLM_BITS = [
  [0x2, 'line-in'],
  [0x4, 'bluetooth'],
  [0x8, 'usb'],
  [0x10, 'optical'],
  [0x20, 'rca'],
  [0x40, 'coaxial'],
  [0x80, 'fm'],
  [0x100, 'line-in-2'],
  [0x200, 'xlr'],
  [0x400, 'hdmi'],
  [0x800, 'cd'],
  [0x2000, 'sd-card'],
  [0x4000, 'external-bluetooth'],
  [0x8000, 'usb-dac'],
  [0x10000, 'phono'],
  [0x40000, 'optical-2'],
  [0x80000, 'coaxial-2'],
  [0x400000, 'arc'],
];

// `mode` of the player status → what plays, finer than the input: the
// network family (AirPlay, Spotify...) all switch back through "wifi".
const MODES = {
  '-96': 'dab',
  '-1': 'idle',
  0: 'idle',
  1: 'airplay',
  2: 'dlna',
  3: 'qplay',
  10: 'network',
  11: 'usb',
  12: 'network',
  13: 'network',
  14: 'network',
  16: 'sd-card',
  19: 'network',
  20: 'network',
  21: 'usb',
  29: 'network',
  30: 'alarm',
  31: 'spotify',
  32: 'tidal',
  36: 'qobuz',
  40: 'line-in',
  41: 'bluetooth',
  43: 'optical',
  44: 'rca',
  45: 'coaxial',
  46: 'fm',
  47: 'line-in-2',
  48: 'xlr',
  49: 'hdmi',
  50: 'cd',
  51: 'usb-dac',
  52: 'sd-card',
  53: 'external-bluetooth',
  54: 'phono',
  56: 'optical-2',
  57: 'coaxial-2',
  58: 'arc',
  60: 'talk',
  99: 'follower',
};

/** What plays (MODES value) → the input it belongs to, null for a follower. */
export function inputOfSource(source) {
  if (source === 'follower') {
    return null;
  }
  return Object.hasOwn(INPUTS, source) ? source : 'wifi';
}

// A printable text: no control character (a hex decode that went wrong).
const PRINTABLE = /^[^\p{Cc}]*$/u;
const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * The titles of `getPlayerStatusEx` are hex-encoded UTF-8 on most firmwares
 * ("54686520426561746C6573"), plain on a few. Decodes the former, keeps the
 * latter, and turns the "Unknown" placeholders into an empty text.
 * @param {unknown} value
 */
export function decodeText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  let decoded = text;
  if (text.length >= 2 && text.length % 2 === 0 && /^[0-9A-Fa-f]+$/.test(text)) {
    try {
      const candidate = utf8.decode(Buffer.from(text, 'hex')).trim();
      if (PRINTABLE.test(candidate)) {
        decoded = candidate;
      }
    } catch {
      // not UTF-8: the text was plain ("CAFE", "ABBA")
    }
  }
  return /^(unknown|un_known|none|null)$/i.test(decoded) ? '' : decoded;
}

const usable = (ip) =>
  typeof ip === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(ip) && ip !== '0.0.0.0' ? ip : null;

/** Uppercase hexadecimal, the form `getStatusEx` and the slave lists share. */
export function normalizeUuid(value) {
  const uuid = String(value ?? '')
    .replace(/^uuid:/i, '')
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase();
  return uuid.length >= 8 ? uuid : null;
}

/**
 * The device, from `getStatusEx`.
 * @param {object} raw
 */
export function parseDeviceStatus(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new TypeError('not a getStatusEx answer');
  }
  const uuid = normalizeUuid(raw.uuid) ?? normalizeUuid(raw.upnp_uuid);
  if (!uuid) {
    throw new TypeError('getStatusEx without uuid');
  }
  const project = String(raw.project ?? raw.priv_prj ?? '');
  const { manufacturer, model, wiim } = lookupModel(project);
  const inputs = new Set(['wifi']);
  const plm = Number.parseInt(String(raw.plm_support ?? ''), 16);
  if (Number.isFinite(plm)) {
    for (const [bit, key] of PLM_BITS) {
      if (plm & bit) {
        inputs.add(key);
      }
    }
  }
  for (const key of wiimModelInputs(model)) {
    inputs.add(key);
  }
  const presets = Number.parseInt(String(raw.preset_key ?? ''), 10);
  return {
    uuid,
    name: String(raw.DeviceName || raw.GroupName || raw.ssid || model).trim(),
    project,
    manufacturer,
    model,
    wiim,
    firmware: String(raw.firmware ?? ''),
    ip: usable(raw.eth2) ?? usable(raw.eth0) ?? usable(raw.apcli0),
    inputs: Object.keys(INPUTS).filter((key) => inputs.has(key)),
    presetCount: Number.isInteger(presets) && presets >= 1 && presets <= 20 ? presets : 6,
  };
}

// `loop` of the player status → shuffle and repeat. Values 0 to 4 read the
// same on every documented firmware (Arylic HTTP API; WiiM HTTP API; pywiim
// and rustywiim, checked on WiiM, Audio Pro, iEAST and Arylic players). 5 is
// shuffle + repeat one on the Arylic table, repeat one for Spotify on a WiiM;
// -1 is the "sequence, no loop" of the original LinkPlay API.
export const REPEAT = { OFF: 0, ALL: 1, ONE: 2 };
const LOOPS = {
  '-1': { shuffle: false, repeat: REPEAT.OFF },
  0: { shuffle: false, repeat: REPEAT.ALL },
  1: { shuffle: false, repeat: REPEAT.ONE },
  2: { shuffle: true, repeat: REPEAT.ALL },
  3: { shuffle: true, repeat: REPEAT.OFF },
  4: { shuffle: false, repeat: REPEAT.OFF },
  5: { shuffle: true, repeat: REPEAT.ONE },
};

/**
 * Shuffle and repeat of a `loop` value, null when unknown.
 * @param {unknown} loop
 * @param {{ wiim?: boolean, source?: string }} [context]
 */
export function decodeLoop(loop, { wiim = false, source } = {}) {
  const key = String(loop ?? '').trim();
  if (key === '5' && wiim && source === 'spotify') {
    return { shuffle: false, repeat: REPEAT.ONE };
  }
  return Object.hasOwn(LOOPS, key) ? { ...LOOPS[key] } : null;
}

/**
 * The `loopmode` values that ask for a shuffle and repeat combination, in the
 * order to try them. Current firmwares take the table they report (0 to 5);
 * the WiiM HTTP API documents an older one for writing (-1 all, 0 off, 1 one,
 * 2 shuffle + all), which some units follow: tried second, when it has the
 * combination.
 */
export function loopModesFor(shuffle, repeat) {
  const reported = Object.entries(LOOPS)
    .filter(([key, loop]) => key !== '-1' && loop.shuffle === shuffle && loop.repeat === repeat)
    .map(([key]) => Number(key));
  const legacy = { 'false:0': 0, 'false:1': -1, 'false:2': 1, 'true:1': 2 }[`${shuffle}:${repeat}`];
  return legacy === undefined ? reported : [...reported, legacy];
}

/** Milliseconds (a status text) → whole seconds, 0 when absent. */
function seconds(value) {
  const ms = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
}

/**
 * The playback, from `getPlayerStatusEx` (or `getPlayerStatus`).
 * @param {object} raw
 */
export function parsePlayerStatus(raw) {
  if (!raw || typeof raw !== 'object' || raw.status === undefined) {
    throw new TypeError('not a getPlayerStatus answer');
  }
  const source = MODES[String(raw.mode ?? '')] ?? 'network';
  const volume = Number.parseInt(String(raw.vol ?? ''), 10);
  return {
    playback: STATUS_MAP[String(raw.status).toLowerCase()] ?? PLAYBACK.STOPPED,
    source,
    input: inputOfSource(source),
    follower: source === 'follower',
    volume: Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : null,
    muted: String(raw.mute ?? '0') === '1',
    title: decodeText(raw.Title),
    artist: decodeText(raw.Artist),
    album: decodeText(raw.Album),
    // curpos / totlen are milliseconds; totlen is 0 for a live stream.
    duration: seconds(raw.totlen),
    position: seconds(raw.curpos),
    loop: String(raw.loop ?? ''),
    artworkUrl: null,
  };
}

/**
 * The followers of a leader, from `multiroom:getSlaveList`.
 * @param {object} raw `{ slaves: 1, slave_list: [{ name, uuid, ip }] }`
 */
export function parseFollowers(raw) {
  const list = Array.isArray(raw?.slave_list) ? raw.slave_list : [];
  return list
    .map((entry) => ({
      uuid: normalizeUuid(entry?.uuid),
      name: decodeText(entry?.name) || String(entry?.ip ?? ''),
      ip: usable(entry?.ip),
    }))
    .filter((entry) => entry.uuid || entry.ip);
}

/**
 * The WiiM metadata (`getMetaInfo`), plain texts: the artwork URL (the HTTP
 * API has no other), and the titles when the player status gives none.
 * @param {object} raw `{ metaData: { title, artist, album, albumArtURI } }`
 */
export function parseMetaInfo(raw) {
  const meta = raw?.metaData ?? {};
  // "unknow" (sic): the placeholder of getMetaInfo (python-linkplay#137).
  const text = (value) => {
    const decoded = decodeText(value);
    return /^unknow$/i.test(decoded) ? '' : decoded;
  };
  return {
    title: text(meta.title),
    artist: text(meta.artist),
    album: text(meta.album),
    artworkUrl: httpUrl(text(meta.albumArtURI)),
  };
}

/** An http(s) URL, else null. */
function httpUrl(text) {
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The WiiM presets (`getPresetInfo`): `{ preset_num, preset_list: [{ number, name }] }`.
 * @returns {Map<number, string>} preset number → name
 */
export function parsePresetInfo(raw) {
  const names = new Map();
  for (const entry of Array.isArray(raw?.preset_list) ? raw.preset_list : []) {
    const number = Number(entry?.number);
    const name = decodeText(entry?.name);
    if (Number.isInteger(number) && number >= 1 && name) {
      names.set(number, name.slice(0, 60));
    }
  }
  return names;
}

/**
 * What the music panel shows of the WiiM presets (`getPresetInfo`): whether a
 * preset is a radio (TuneIn and the like) and its picture URL.
 * @returns {Map<number, { radio: boolean, artworkUrl: string | null }>}
 */
export function parsePresetExtras(raw) {
  const extras = new Map();
  for (const entry of Array.isArray(raw?.preset_list) ? raw.preset_list : []) {
    const number = Number(entry?.number);
    if (Number.isInteger(number) && number >= 1) {
      extras.set(number, {
        radio: /tunein|radio|iheart|vtuner/i.test(String(entry?.source ?? '')),
        artworkUrl: httpUrl(decodeText(entry?.picurl)),
      });
    }
  }
  return extras;
}

/** The WiiM equalizer presets (`EQGetList`): an array of names. */
export function parseEqualizerList(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.EQList) ? raw.EQList : [];
  return [...new Set(list.filter((name) => typeof name === 'string' && name.trim() !== ''))].map(
    (name) => name.trim(),
  );
}
