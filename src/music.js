// -----------------------------------------------------------------------------
// The Gladys 5.3 music player (capabilities/music.md): what a player plays,
// as publishNowPlaying wants it, its artwork, and its presets as a catalog.
//
// What the LinkPlay HTTP API gives (python-linkplay, WiiM and Arylic HTTP API
// documents, real answers quoted in public issues, see test/fixtures):
//   - getPlayerStatusEx: status, titles, curpos / totlen (ms), loop, vol, mute;
//   - getMetaInfo (WiiM, some other recent firmwares): the artwork URL. The
//     others give it over UPnP only (AVTransport GetInfoEx): no artwork there.
//   - presets: MCUKeyShortClick:<n>, named by getPresetInfo on a WiiM. No
//     queue, no search, no library: the catalog is the presets, at the root.
// -----------------------------------------------------------------------------

import { isIP } from 'node:net';
import { MUSIC_MEDIA_TYPES, createLogger } from '@gladysassistant/integration-sdk';
import { MAX_ARTWORK_DOWNLOAD, prepareArtwork } from './artwork-resize.js';
import { PLAYBACK_STATE } from './devices.js';
import { WIDGET_TEXT, textsOf } from './i18n.js';
import { httpGetBytes } from './linkplay/http.js';
import { PLAYBACK, decodeLoop } from './linkplay/status.js';

const logger = createLogger({ name: 'linkplay-music' });

const STATES = {
  [PLAYBACK.PLAYING]: PLAYBACK_STATE.PLAYING,
  [PLAYBACK.LOADING]: PLAYBACK_STATE.BUFFERING,
  [PLAYBACK.PAUSED]: PLAYBACK_STATE.PAUSED,
  [PLAYBACK.STOPPED]: PLAYBACK_STATE.IDLE,
};

/**
 * The now playing of a player, for publishNowPlaying. Titles and artwork are
 * what the player reports, empty when it reports none (a player that stops
 * often keeps the track loaded). A live stream has no duration; its position
 * is the time since it started (`elapsed`) when the player does not count
 * it: a 0 published while playing would be republished at every reading, the
 * SDK extrapolating it without a duration to stop at.
 * @param {object} snapshot Player.snapshot
 * @param {object | null} info Player.info
 * @param {number} [elapsed] seconds since this track or stream started
 */
export function nowPlayingOf(snapshot, info, elapsed = 0) {
  const live = snapshot.duration === 0;
  const nowPlaying = {
    playback_state: STATES[snapshot.playback] ?? PLAYBACK_STATE.IDLE,
    title: snapshot.title,
    artist: snapshot.artist,
    album: snapshot.album,
    artwork_url: snapshot.artworkUrl ?? null,
    duration: snapshot.duration,
    position: live ? snapshot.position || elapsed : Math.min(snapshot.position, snapshot.duration),
    mute: snapshot.muted,
  };
  if (snapshot.volume !== null) {
    nowPlaying.volume = snapshot.volume;
  }
  const loop = decodeLoop(snapshot.loop, { wiim: info?.wiim, source: snapshot.source });
  if (loop) {
    nowPlaying.shuffle = loop.shuffle;
    nowPlaying.repeat = loop.repeat;
  }
  return nowPlaying;
}

// --- Artwork -------------------------------------------------------------------

const ARTWORK_TIMEOUT_MS = 10_000;
const PREPARED_ARTWORKS = 20;
const REDIRECTS = 3;

/**
 * A LAN host: its HTTPS certificate is self-signed (the player itself for an
 * AirPlay cover, a Plex server for DLNA), the address is the identity, as for
 * the players. An Internet host keeps a checked certificate.
 */
export function isLanHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const family = isIP(host);
  if (family === 4) {
    return /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  }
  if (family === 6) {
    return /^(fe[89ab][0-9a-f]|f[cd][0-9a-f]{2}):/.test(host);
  }
  return host.endsWith('.local');
}

/** Loopback or unspecified: never fetched (the container itself). */
function isLocalHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1?|::ffff:127\..*)$/.test(host);
}

/**
 * The bytes of an artwork URL: redirects followed, size and time bounded.
 * @param {string} url
 * @param {{ get?: Function, timeoutMs?: number, trusted?: (host: string) => boolean }} [options]
 *   trusted: a host whose self-signed certificate is accepted (a player's)
 */
export async function downloadArtwork(
  url,
  { get = httpGetBytes, timeoutMs = ARTWORK_TIMEOUT_MS, trusted = () => false } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let current = url;
  let fromLan = true;
  for (let hop = 0; hop <= REDIRECTS; hop += 1) {
    const target = new URL(current);
    target.hash = ''; // a track marker (Player.trackArtwork), never sent
    if (!['http:', 'https:'].includes(target.protocol)) {
      throw new Error('not an http(s) URL');
    }
    if (isLocalHost(target.hostname)) {
      throw new Error('a local address');
    }
    const lan = isLanHost(target.hostname) || trusted(target.hostname);
    if (hop > 0 && lan && !fromLan) {
      // An Internet cover that redirects into the LAN: not followed.
      throw new Error('redirected to the local network');
    }
    fromLan = lan;
    const answer = await get(target.href, {
      timeoutMs: Math.max(1000, deadline - Date.now()),
      maxBytes: MAX_ARTWORK_DOWNLOAD,
      insecure: lan,
    });
    if (answer.status >= 300 && answer.status < 400 && answer.location) {
      current = new URL(answer.location, target).href;
      continue;
    }
    if (answer.status < 200 || answer.status >= 300) {
      throw new Error(`HTTP ${answer.status}`);
    }
    return answer.body;
  }
  throw new Error('too many redirects');
}

/**
 * onMusicGetArtwork: the image of a key handed out by artworkKey, made small
 * enough for the core (300 KB, 4096 px) when it is not: a Plex cover asked at
 * 1000 px, a local file served as it is.
 * @param {object} gladys
 * @param {{ get?: Function, trusted?: (host: string) => boolean }} [options]
 */
export function createArtworkHandler(gladys, { get, trusted } = {}) {
  const prepared = new Map();
  return async (key) => {
    const known = prepared.get(key);
    if (known) {
      return known;
    }
    const url = gladys.artworkUrls?.get(key);
    if (!url) {
      throw new Error(`Unknown artwork ${key}`);
    }
    let base64;
    try {
      base64 = (await prepareArtwork(await downloadArtwork(url, { get, trusted }))).toString(
        'base64',
      );
    } catch (err) {
      logger.debug(`Artwork ${key} not served (${err.message})`);
      throw new Error(`Artwork not available: ${err.message}`, { cause: err });
    }
    prepared.set(key, base64);
    while (prepared.size > PREPARED_ARTWORKS) {
      prepared.delete(prepared.keys().next().value);
    }
    return base64;
  };
}

// --- Presets: the catalog ------------------------------------------------------

const PRESET_ID = /^preset:(\d{1,2})$/;

/**
 * The presets of a player as MediaItems. A WiiM names the presets it has
 * (getPresetInfo): only those. Other players only say how many keys they
 * have: all of them, numbered.
 * @param {object} gladys
 * @param {Array<{ number: number, name: string | null }>} presets hub.presetsOf
 * @param {object | null} info Player.info
 * @param {string} language
 */
export function presetItems(gladys, presets, info, language) {
  const named = presets.some((preset) => preset.name);
  const { preset } = textsOf(WIDGET_TEXT, language);
  const label = (number) => `${preset} ${number}`;
  return presets
    .filter((preset) => !named || preset.name)
    .map(({ number, name }) => {
      const extras = info?.presetExtras?.get(number);
      const item = {
        id: `preset:${number}`,
        type: extras?.radio ? MUSIC_MEDIA_TYPES.RADIO : MUSIC_MEDIA_TYPES.PLAYLIST,
        title: name ?? label(number),
        subtitle: name ? label(number) : undefined,
        duration: null,
        browsable: false,
        playable: true,
      };
      if (extras?.artworkUrl) {
        item.artwork_key = gladys.artworkKey(extras.artworkUrl);
      }
      return item;
    });
}

/** The preset number of a MediaItem id, null when it is not one. */
export function presetNumberOf(id) {
  const match = PRESET_ID.exec(String(id ?? ''));
  return match ? Number(match[1]) : null;
}
