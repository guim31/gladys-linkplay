// -----------------------------------------------------------------------------
// One LinkPlay player: what it is (getStatusEx and the WiiM extras), what it
// plays (getPlayerStatusEx), its multiroom group, and the orders it takes.
//
// No Gladys here: src/hub.js decides when to read and what to publish.
// -----------------------------------------------------------------------------

import { LinkPlayClient } from './linkplay/client.js';
import { LinkPlayError } from './linkplay/http.js';
import {
  INPUTS,
  PLAYBACK,
  decodeLoop,
  loopModesFor,
  parseDeviceStatus,
  parseEqualizerList,
  parseFollowers,
  parseMetaInfo,
  parsePlayerStatus,
  parsePresetExtras,
  parsePresetInfo,
} from './linkplay/status.js';
import { EQUALIZER_OFF } from './devices.js';

// A player applies a loop mode within a few hundred milliseconds.
export const LOOP_CHECK_MS = 400;

/** An http(s) URL a player can fetch, else null. */
export function playableUrl(value) {
  const text = String(value ?? '').trim();
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? text : null;
  } catch {
    return null;
  }
}

/** `https://host/path` without credentials, query or fragment: safe to log. */
export function loggableUrl(value) {
  try {
    const url = new URL(String(value));
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '(invalid URL)';
  }
}

export class Player {
  /**
   * @param {object} options
   * @param {string} options.uuid
   * @param {string | object} options.address what LinkPlayClient accepts
   * @param {LinkPlayClient} [options.client] an already working client
   * @param {Function} [options.get] HTTP transport (tests)
   */
  constructor({ uuid, address, client, get }) {
    this.uuid = uuid;
    this.get = get;
    this.client = client ?? new LinkPlayClient(address, { get });
    /** getStatusEx, parsed, plus the WiiM extras. Null until read once. */
    this.info = null;
    /** The last playback read, null until read once. */
    this.snapshot = null;
    /** Followers when this player leads a group. */
    this.followers = [];
    /** WiiM equalizer: the preset loaded through Gladys (the API never says which). */
    this.equalizer = null;
    // What the firmware turned out not to know: not asked again.
    this.playerCommand = 'getPlayerStatusEx';
    this.unsupported = new Set();
  }

  /** The address as the user or the discovery gave it (`192.0.2.10`). */
  get address() {
    return this.client.address.key;
  }

  get name() {
    return this.info?.name ?? this.client.hostname;
  }

  /** Point the player at a new address (DHCP), keeping what it learnt. */
  moveTo(client) {
    if (client.address.key !== this.client.address.key || !this.client.endpoint) {
      this.client = client;
    }
  }

  /** Read getStatusEx; on a WiiM, the equalizer list and preset names once. */
  async readInfo({ extras = this.info === null } = {}) {
    const info = parseDeviceStatus(await this.client.json('getStatusEx'));
    if (info.uuid !== this.uuid) {
      // Another player took the address (DHCP): not ours.
      throw new LinkPlayError('invalid', 'another player answers on this address');
    }
    return this.setInfo(info, { extras });
  }

  /** Keep a parsed getStatusEx (read here or by the discovery). */
  async setInfo(info, { extras = this.info === null } = {}) {
    const previous = this.info;
    this.info = {
      ...info,
      address: this.address,
      equalizers: previous?.equalizers ?? [],
      presetNames: previous?.presetNames ?? new Map(),
      presetExtras: previous?.presetExtras ?? new Map(),
    };
    if (extras && info.wiim) {
      // Best effort: a player that misses these is still a player.
      await this.readExtras().catch(() => {});
    }
    return this.info;
  }

  /** WiiM only: equalizer presets and preset names. Best effort. */
  async readExtras() {
    const equalizers = await this.optional('EQGetList', parseEqualizerList);
    if (equalizers) {
      this.info.equalizers = equalizers;
    }
    const presets = await this.optional('getPresetInfo', (raw) => [
      parsePresetInfo(raw),
      parsePresetExtras(raw),
    ]);
    if (presets) {
      [this.info.presetNames, this.info.presetExtras] = presets;
    }
  }

  /** A JSON command the firmware may not know: null when it does not. */
  async optional(command, parse) {
    if (this.unsupported.has(command)) {
      return null;
    }
    try {
      return parse(await this.client.json(command));
    } catch (err) {
      if (err.code === 'unsupported' || err.code === 'invalid') {
        this.unsupported.add(command);
        return null;
      }
      if (err.code === 'failed') {
        // "Failed": nothing to say right now (no metadata while idle), ask again later.
        return null;
      }
      throw err;
    }
  }

  /**
   * Read the playback; the group and the equalizer state when asked.
   * @param {{ group?: boolean, extras?: boolean }} [options]
   */
  async refresh({ group = false, extras = false } = {}) {
    let raw;
    try {
      raw = await this.client.json(this.playerCommand);
    } catch (err) {
      if (err.code !== 'unsupported' || this.playerCommand === 'getPlayerStatus') {
        throw err;
      }
      this.playerCommand = 'getPlayerStatus';
      raw = await this.client.json(this.playerCommand);
    }
    const status = parsePlayerStatus(raw);
    // getMetaInfo: the artwork (the only place the HTTP API gives it), and the
    // titles of a web radio or a Bluetooth phone, which the player status
    // leaves out. WiiM firmwares and some others (a Muzo Mini on 4.6,
    // home-assistant/core#187893) know it; a firmware that does not is not
    // asked again, and gives no artwork (only over UPnP, not read here).
    if (status.playback !== PLAYBACK.STOPPED && !status.follower) {
      const meta = await this.optional('getMetaInfo', parseMetaInfo).catch(() => null);
      if (meta) {
        status.artworkUrl = meta.artworkUrl;
        if (!status.title) {
          status.title = meta.title;
          status.artist ||= meta.artist;
          status.album ||= meta.album;
        }
      }
    }
    if (group) {
      const followers = await this.optional('multiroom:getSlaveList', parseFollowers).catch(
        () => null,
      );
      if (followers) {
        this.followers = followers;
      }
    }
    if (status.follower) {
      this.followers = [];
    }
    if (extras && this.info?.equalizers?.length) {
      const enabled = await this.optional('EQGetStat', (json) =>
        /^on$/i.test(String(json?.EQStat ?? '')),
      ).catch(() => null);
      if (enabled === false) {
        this.equalizer = EQUALIZER_OFF;
      } else if (enabled === true && this.equalizer === EQUALIZER_OFF) {
        // Turned on from the WiiM app: which preset, the API does not say.
        this.equalizer = null;
      }
    }
    this.snapshot = { ...status, followers: this.followers, equalizer: this.equalizer };
    return this.snapshot;
  }

  // --- Orders ---------------------------------------------------------------

  play() {
    return this.client.ok('setPlayerCmd:resume');
  }

  pause() {
    return this.client.ok('setPlayerCmd:pause');
  }

  stop() {
    return this.client.ok('setPlayerCmd:stop');
  }

  previous() {
    return this.client.ok('setPlayerCmd:prev');
  }

  next() {
    return this.client.ok('setPlayerCmd:next');
  }

  /** Play when paused or stopped, pause otherwise. */
  togglePlayback() {
    const playing = this.snapshot?.playback === PLAYBACK.PLAYING;
    return playing ? this.pause() : this.play();
  }

  /** @param {number} volume 0-100 */
  async setVolume(volume) {
    await this.client.ok(`setPlayerCmd:vol:${volume}`);
    if (this.snapshot) {
      this.snapshot.volume = volume;
    }
  }

  /** Mute when not muted, unmute otherwise. */
  toggleMute() {
    return this.setMute(!this.snapshot?.muted);
  }

  /** @param {boolean} muted */
  async setMute(muted) {
    await this.client.ok(`setPlayerCmd:mute:${muted ? 1 : 0}`);
    if (this.snapshot) {
      this.snapshot.muted = muted;
    }
  }

  /** @param {number} position seconds, within the current track */
  seek(position) {
    return this.client.ok(`setPlayerCmd:seek:${position}`);
  }

  /**
   * Shuffle and repeat, through `loopmode`. Firmwares do not agree on the
   * values to write (see loopModesFor): each candidate is checked by reading
   * the status back, and the one that worked is tried first next time.
   * @param {boolean} shuffle
   * @param {number} repeat REPEAT value
   * @param {(ms: number) => Promise<void>} wait
   * @returns {Promise<boolean>} whether the player reports the combination
   */
  async setLoop(shuffle, repeat, wait) {
    const candidates = loopModesFor(shuffle, repeat);
    if (this.loopModes?.has(`${shuffle}:${repeat}`)) {
      candidates.unshift(this.loopModes.get(`${shuffle}:${repeat}`));
    }
    for (const mode of [...new Set(candidates)]) {
      await this.client.ok(`setPlayerCmd:loopmode:${mode}`);
      await wait(LOOP_CHECK_MS);
      const status = parsePlayerStatus(await this.client.json(this.playerCommand));
      const loop = decodeLoop(status.loop, { wiim: this.info?.wiim, source: status.source });
      if (loop?.shuffle === shuffle && loop?.repeat === repeat) {
        this.loopModes ??= new Map();
        this.loopModes.set(`${shuffle}:${repeat}`, mode);
        if (this.snapshot) {
          this.snapshot.loop = status.loop;
        }
        return true;
      }
    }
    return false;
  }

  /** @param {string} input a key of INPUTS this player has */
  setSource(input) {
    return this.client.ok(`setPlayerCmd:switchmode:${INPUTS[input]}`);
  }

  /** @param {string} name an EQGetList name, or EQUALIZER_OFF */
  async setEqualizer(name) {
    await this.client.ok(name === EQUALIZER_OFF ? 'EQOff' : `EQLoad:${name}`);
    this.equalizer = name;
  }

  /** @param {number} preset 1 to presetCount */
  playPreset(preset) {
    return this.client.ok(`MCUKeyShortClick:${preset}`);
  }

  /** @param {string} url checked by playableUrl */
  playUrl(url) {
    return this.client.ok(`setPlayerCmd:play:${url}`);
  }

  /**
   * An announcement (the core's "Talk on a speaker"). `playPromptUrl` plays it
   * over what plays and resumes it (WiiM firmwares); a firmware without it
   * plays the URL instead, and the hub switches back to the physical input
   * that was playing once the announcement is over (see `pendingRestore`).
   * @param {string} url
   * @param {number} now
   * @returns {Promise<'prompt' | 'play'>}
   */
  async announce(url, now) {
    if (!this.unsupported.has('playPromptUrl')) {
      try {
        await this.client.command(`playPromptUrl:${url}`);
        return 'prompt';
      } catch (err) {
        if (err.code !== 'unsupported') {
          throw err;
        }
        this.unsupported.add('playPromptUrl');
      }
    }
    const before = this.snapshot;
    await this.playUrl(url);
    this.pendingRestore =
      before?.input && before.input !== 'wifi' && before.playback === PLAYBACK.PLAYING
        ? { input: before.input, since: now, started: false }
        : null;
    return 'play';
  }

  // --- Multiroom ------------------------------------------------------------

  /** The LAN IP the other players reach this one by. */
  get ip() {
    return (
      this.info?.ip ??
      (/^\d+\.\d+\.\d+\.\d+$/.test(this.client.hostname) ? this.client.hostname : null)
    );
  }

  /** Join the group of `leader` (this player becomes a follower). */
  joinGroupOf(leader) {
    return this.client.command(`ConnectMasterAp:JoinGroupMaster:eth${leader.ip}:wifi0.0.0.0`);
  }

  /** Leader only: dissolve the whole group. */
  ungroup() {
    return this.client.command('multiroom:Ungroup');
  }

  /** Leader only: let one follower go. */
  kick(ip) {
    return this.client.command(`multiroom:SlaveKickout:${ip}`);
  }

  /** Follower only, when its leader is unknown: leave by itself. */
  leaveGroup() {
    return this.client.command('multiroom:LeaveGroup');
  }
}
