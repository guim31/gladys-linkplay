// -----------------------------------------------------------------------------
// The players known to the integration, their polling, their states in Gladys,
// and the orders Gladys sends them.
//
// Polling (GladysAssistant/Gladys#3198): the core cannot be trusted to call
// onPoll, so the container polls the players the user added, on its own
// timer, at an adaptive pace — every 5 s while a player plays, every 30 s
// otherwise, every minute while it does not answer. onPoll stays as a
// fallback that skips a player polled recently. Only the changed states are
// published (SDK deduplication), with a heartbeat every 6 hours.
//
// Logs (info): the lifecycle only — players found, a player lost and back,
// one line per order. The polling itself is debug.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import {
  DEVICE_TYPE,
  EMPTY_TEXT,
  FEATURES,
  PLAYBACK_STATE,
  buildDevice,
  featureKeyOf,
  paramOf,
  uuidOf,
} from './devices.js';
import { Discovery } from './discovery.js';
import { ERRORS, GROUP_TEXT, sourceLabel, textsOf } from './i18n.js';
import { createIssueLog } from './issues.js';
import { parseAddress } from './linkplay/client.js';
import { LinkPlayError } from './linkplay/http.js';
import { displayModel } from './linkplay/models.js';
import { PLAYBACK } from './linkplay/status.js';
import { Player, loggableUrl, playableUrl } from './player.js';

const logger = createLogger({ name: 'linkplay' });

export const TIMINGS = {
  tick: 1000,
  playing: 5000,
  idle: 30000,
  lost: 60000,
  // right after an order, to show its effect
  soon: 700,
  followUp: 2000,
  // while an announcement may need the input back
  restore: 2000,
  restoreMax: 120000,
  group: 30000,
  info: 10 * 60 * 1000,
  rediscover: 5 * 60 * 1000,
  heartbeat: 6 * 60 * 60 * 1000,
  // a source change the integration ordered is not a trigger
  expected: 15000,
};

// Failed polls in a row before a player is said lost.
const LOST_AFTER = 2;

export const WIDGET_KEY = 'player';
export const SCENE_TRIGGER_KEYS = ['source_changed'];

const isActive = (snapshot) =>
  snapshot?.playback === PLAYBACK.PLAYING || snapshot?.playback === PLAYBACK.LOADING;

export class LinkPlayHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {Function} [options.get] HTTP transport (tests)
   * @param {boolean} [options.timers] run the polling timer (tests may drive it)
   * @param {object} [options.timings] overrides of TIMINGS
   * @param {() => number} [options.now]
   */
  constructor({ gladys, get, timers = true, timings = {}, now = () => Date.now() }) {
    this.gladys = gladys;
    this.get = get;
    this.timers = timers;
    this.timings = { ...TIMINGS, ...timings };
    this.now = now;
    this.config = normalizeConfig();
    /** @type {Map<string, Player>} by uuid */
    this.players = new Map();
    this.discovery = new Discovery({ gladys, get, now });
    this.issues = createIssueLog(logger);
    this.timer = null;
    this.stopped = true;
    this.discovering = null;
    this.lastDiscoveryAt = null;
    this.lastSummary = null;
  }

  get texts() {
    return textsOf(ERRORS, this.config.language);
  }

  /** @param {object} raw the stored configuration */
  setConfig(raw) {
    this.config = normalizeConfig(raw);
    return this.config;
  }

  // --- Players and devices ----------------------------------------------------

  /** The devices the user added to Gladys, by uuid. */
  createdDevices() {
    const devices = new Map();
    for (const device of this.gladys.devices ?? []) {
      const uuid = uuidOf(this.gladys, device.external_id);
      if (uuid) {
        devices.set(uuid, device);
      }
    }
    return devices;
  }

  /** Know every added player, at the address Gladys keeps for it. */
  syncCreated(extra = []) {
    const devices = this.createdDevices();
    for (const device of extra) {
      const uuid = uuidOf(this.gladys, device?.external_id);
      if (uuid) {
        devices.set(uuid, device);
      }
    }
    for (const [uuid, device] of devices) {
      if (this.players.has(uuid)) {
        continue;
      }
      try {
        const address = parseAddress(paramOf(device, 'IP_ADDRESS'));
        const player = new Player({ uuid, address, get: this.get });
        player.label = device.name;
        this.players.set(uuid, player);
      } catch {
        logger.debug(`${device.name}: no usable address yet, waiting for the discovery`);
      }
    }
    return devices;
  }

  /** The player behind a device (or feature) external id; throws a user message. */
  playerOf(externalId) {
    const player = this.players.get(uuidOf(this.gladys, externalId));
    if (!player) {
      throw new Error(this.texts.unknownDevice);
    }
    return player;
  }

  nameOf(player) {
    return player.info?.name ?? player.label ?? player.address;
  }

  /** The presets of a player: number and name (WiiM), 1 to its preset count. */
  presetsOf(player) {
    const count = player.info?.presetCount ?? 6;
    return Array.from({ length: count }, (_, index) => ({
      number: index + 1,
      name: player.info?.presetNames?.get(index + 1) ?? null,
    }));
  }

  // --- Discovery ----------------------------------------------------------------

  /**
   * Find the players (mediated scans, configured and known addresses, group
   * followers), adopt them, publish the Discovery list. Concurrent calls share
   * one run.
   */
  discover() {
    if (!this.discovering) {
      this.discovering = this.#discover().finally(() => {
        this.discovering = null;
      });
    }
    return this.discovering;
  }

  async #discover() {
    this.lastDiscoveryAt = this.now();
    const addresses = [...this.config.hosts];
    for (const player of this.players.values()) {
      addresses.push(player.client.address);
    }
    const result = await this.discovery.run({ addresses });
    if (result.mdns === 'unavailable' && result.ssdp === 'unavailable') {
      this.issues.fail(
        'scan',
        'Automatic discovery through Gladys is unavailable: only the configured addresses are asked',
      );
    } else {
      this.issues.ok('scan', 'Automatic discovery through Gladys works again');
    }
    for (const [uuid, { client, info }] of result.found) {
      let player = this.players.get(uuid);
      if (!player) {
        player = new Player({ uuid, address: client.address, client, get: this.get });
        this.players.set(uuid, player);
      } else if (player.address !== client.address.key) {
        logger.info(`${info.name}: now at ${client.address.key}`);
        player.moveTo(client);
      }
      await player.setInfo(info);
    }
    await this.publishDiscovered();
    const summary = [...this.players.values()]
      .filter((player) => player.info)
      .map((player) => `${player.info.name} (${displayModel(player.info)})`)
      .sort()
      .join(', ');
    if (summary !== this.lastSummary) {
      this.lastSummary = summary;
      logger.info(
        summary ? `LinkPlay players found: ${summary}` : 'No LinkPlay player found on the network',
      );
    }
    return result;
  }

  /** The Discover tab: every player read at least once. */
  async publishDiscovered() {
    const devices = [...this.players.values()]
      .filter((player) => player.info)
      .map((player) => buildDevice(this.gladys, player.info, this.config));
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.issues.ok('discovered', 'Gladys accepts the discovered players again');
    } catch (err) {
      this.issues.fail('discovered', `Gladys refused the discovered players (${err.message})`);
    }
    return devices;
  }

  // --- Polling ------------------------------------------------------------------

  /** (Re)start: know the added players, find the others, poll, then keep polling. */
  async start() {
    this.stopped = false;
    this.syncCreated();
    this.schedule();
    try {
      await this.discover();
    } catch (err) {
      logger.warn(`Discovery failed (${err.message})`);
    }
    await this.pollDue({ force: true });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = null;
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.timers || this.stopped) {
      return;
    }
    this.timer = setTimeout(async () => {
      this.timer = null;
      try {
        await this.pollDue();
      } catch (err) {
        logger.error(`Polling cycle failed (${err.message})`);
      } finally {
        this.schedule();
      }
    }, this.timings.tick);
  }

  /** Poll the added players whose time has come (all of them when forced). */
  async pollDue({ force = false } = {}) {
    if (this.gladys.connected === false) {
      logger.debug('Gladys unreachable: polling skipped');
      return;
    }
    const devices = this.syncCreated();
    const now = this.now();
    const due = [...devices.keys()]
      .map((uuid) => this.players.get(uuid))
      .filter((player) => player && !player.polling && (force || now >= (player.nextPollAt ?? 0)));
    await Promise.all(due.map((player) => this.pollPlayer(player)));
    // An added player the network lost (DHCP): look for it again, now and then.
    const missing = [...devices.keys()].some(
      (uuid) => !this.players.get(uuid)?.info || this.players.get(uuid).lost,
    );
    if (
      missing &&
      !this.discovering &&
      (this.lastDiscoveryAt === null || now - this.lastDiscoveryAt >= this.timings.rediscover)
    ) {
      this.discover().catch((err) => logger.debug(`Background discovery failed (${err.message})`));
    }
  }

  /** The core's onPoll (fallback): poll unless the timer just did. */
  async pollFromCore(device) {
    const player = this.players.get(uuidOf(this.gladys, device.external_id));
    if (!player || player.polling) {
      return;
    }
    const since = this.now() - (player.polledAt ?? -Infinity);
    if (since < this.cadence(player) * 0.9) {
      logger.debug(`${this.nameOf(player)}: polled ${since} ms ago, core poll skipped`);
      return;
    }
    await this.pollPlayer(player);
  }

  /** How long until the next poll of a player. */
  cadence(player) {
    if (player.pendingRestore) {
      return this.timings.restore;
    }
    if ((player.followUps ?? 0) > 0) {
      return this.timings.followUp;
    }
    if (player.lost) {
      return this.timings.lost;
    }
    return isActive(player.snapshot) ? this.timings.playing : this.timings.idle;
  }

  /** Poll one player now, publish what changed. Never throws. */
  pollPlayer(player) {
    if (!player.polling) {
      player.polling = this.#poll(player).finally(() => {
        player.polling = null;
      });
    }
    return player.polling;
  }

  async #poll(player) {
    const now = this.now();
    player.polledAt = now;
    const previous = player.snapshot;
    try {
      if (!player.info || now - (player.infoAt ?? -Infinity) >= this.timings.info || player.lost) {
        await player.readInfo();
        player.infoAt = now;
      }
      const slow = now - (player.groupAt ?? -Infinity) >= this.timings.group;
      await player.refresh({ group: slow, extras: slow });
      if (slow) {
        player.groupAt = now;
      }
      if (player.lost) {
        logger.info(`${this.nameOf(player)}: reachable again`);
      }
      player.failures = 0;
      player.lost = false;
    } catch (err) {
      player.failures = (player.failures ?? 0) + 1;
      if (player.failures === LOST_AFTER) {
        player.lost = true;
        logger.info(`${this.nameOf(player)}: unreachable at ${player.address} (${err.message})`);
      } else {
        logger.debug(`${this.nameOf(player)}: poll failed (${err.message})`);
      }
      player.nextPollAt = this.now() + this.cadence(player);
      return;
    }
    if (player.followUps > 0) {
      player.followUps -= 1;
    }
    await this.#followAnnouncement(player);
    await this.publishStates(player);
    this.#fireTriggers(player, previous);
    this.#refreshWidget(player, previous);
    player.nextPollAt = this.now() + this.cadence(player);
  }

  /** Poll again shortly, to show the effect of an order. */
  pollSoon(player) {
    player.followUps = 2;
    player.nextPollAt = this.now() + this.timings.soon;
  }

  // --- States -------------------------------------------------------------------

  /** The text of the multiroom group of a player, in a language. */
  groupText(player, language = this.config.language) {
    const texts = textsOf(GROUP_TEXT, language);
    const snapshot = player.snapshot;
    if (player.followers.length > 0) {
      const names = player.followers.map(
        (follower) => this.players.get(follower.uuid)?.info?.name ?? follower.name,
      );
      return texts.leader(names.join(', '));
    }
    if (snapshot?.follower) {
      const leader = [...this.players.values()].find((other) =>
        other.followers.some(
          (follower) =>
            follower.uuid === player.uuid || (player.ip !== null && follower.ip === player.ip),
        ),
      );
      return leader ? texts.follower(this.nameOf(leader)) : texts.followerUnknown;
    }
    return texts.alone;
  }

  /** The states of a player, for the features its Gladys device has. */
  statesOf(player, device) {
    const snapshot = player.snapshot;
    if (!snapshot) {
      return [];
    }
    const ids = this.gladys.externalIds(DEVICE_TYPE, player.uuid);
    const states = [
      [
        FEATURES.PLAYBACK_STATE,
        isActive(snapshot) ? PLAYBACK_STATE.PLAYING : PLAYBACK_STATE.NOT_PLAYING,
      ],
      [FEATURES.VOLUME, snapshot.volume],
      [FEATURES.TITLE, { text: snapshot.title || EMPTY_TEXT }],
      [FEATURES.ARTIST, { text: snapshot.artist || EMPTY_TEXT }],
      [FEATURES.ALBUM, { text: snapshot.album || EMPTY_TEXT }],
      [FEATURES.SOURCE, snapshot.input ? { text: snapshot.input } : null],
      [FEATURES.EQUALIZER, snapshot.equalizer ? { text: snapshot.equalizer } : null],
      [FEATURES.GROUP, { text: this.groupText(player) }],
    ];
    const existing = new Set((device?.features ?? []).map((feature) => feature.external_id));
    return states
      .filter(
        ([key, value]) => value !== null && value !== undefined && existing.has(ids.feature(key)),
      )
      .map(([key, value]) =>
        typeof value === 'object'
          ? { device_feature_external_id: ids.feature(key), text: value.text }
          : { device_feature_external_id: ids.feature(key), state: value },
      );
  }

  /** Publish what changed (and, every 6 hours, what did not). */
  async publishStates(player) {
    const device = this.createdDevices().get(player.uuid);
    const states = this.statesOf(player, device);
    if (states.length === 0) {
      return;
    }
    try {
      const { count } = await this.gladys.publishChangedStates(states, {
        heartbeat: this.timings.heartbeat,
      });
      if (count > 0) {
        logger.debug(`${this.nameOf(player)}: ${count} state(s) published`);
      }
      this.issues.ok('states', 'Gladys accepts the states again');
    } catch (err) {
      this.issues.fail('states', `Gladys refused the states (${err.message})`);
    }
  }

  // --- Scene trigger and widget -------------------------------------------------

  #fireTriggers(player, previous) {
    const snapshot = player.snapshot;
    const expected = player.expected;
    if (expected && this.now() > expected.until) {
      player.expected = null;
    }
    if (!previous?.input || !snapshot?.input || previous.input === snapshot.input) {
      return;
    }
    // Not a trigger: a change the integration ordered (no loop through a
    // scene), or the network playback of an announcement.
    if (player.pendingRestore || player.expected?.input === snapshot.input) {
      player.expected = null;
      return;
    }
    const ids = this.gladys.externalIds(DEVICE_TYPE, player.uuid);
    if (!this.createdDevices().has(player.uuid)) {
      return;
    }
    this.gladys
      .publishSceneEvent('source_changed', {
        device: ids.device,
        player: this.nameOf(player),
        source: snapshot.input,
        source_name: sourceLabel(snapshot.input, this.config.language),
        previous_source: previous.input,
      })
      .catch((err) => logger.warn(`Scene trigger refused (${err.message})`));
  }

  #refreshWidget(player, previous) {
    const snapshot = player.snapshot;
    const shown = (s) =>
      s ? [s.playback, s.title, s.artist, s.album, s.source, this.groupText(player)].join('|') : '';
    if (shown(previous) !== shown(snapshot)) {
      try {
        this.gladys.requestWidgetRefresh(WIDGET_KEY);
      } catch (err) {
        logger.debug(`Widget refresh not requested (${err.message})`);
      }
    }
  }

  // --- Announcements --------------------------------------------------------------

  /** After an announcement played as a URL, switch back to the input that played. */
  async #followAnnouncement(player) {
    const restore = player.pendingRestore;
    if (!restore) {
      return;
    }
    const snapshot = player.snapshot;
    if (!restore.started) {
      restore.started = snapshot.input === 'wifi' && isActive(snapshot);
    }
    const timedOut = this.now() - restore.since > this.timings.restoreMax;
    if (restore.started && snapshot.input !== 'wifi') {
      // Someone chose another input meanwhile: nothing to put back.
      player.pendingRestore = null;
      return;
    }
    if (!(restore.started && !isActive(snapshot)) && !timedOut) {
      return;
    }
    player.pendingRestore = null;
    if (snapshot.input !== 'wifi') {
      return;
    }
    try {
      player.expected = { input: restore.input, until: this.now() + this.timings.expected };
      await player.setSource(restore.input);
      logger.info(`${this.nameOf(player)}: back to ${restore.input} after the announcement`);
      this.pollSoon(player);
    } catch (err) {
      logger.warn(
        `${this.nameOf(player)}: could not switch back to ${restore.input} (${err.message})`,
      );
    }
  }

  // --- Orders ---------------------------------------------------------------------

  /** A user message for a failed order. */
  explain(err, player) {
    if (!(err instanceof LinkPlayError)) {
      return err;
    }
    const name = this.nameOf(player);
    const texts = this.texts;
    const message =
      err.code === 'unreachable' || err.code === 'timeout'
        ? texts.unreachable(name)
        : err.code === 'unsupported'
          ? texts.unsupported(name)
          : texts.refused(name);
    return new Error(message);
  }

  /**
   * Run an order on a player: one info line, a user message on failure, a
   * quick poll after.
   * @param {Player} player
   * @param {string} what for the log line
   * @param {() => Promise<unknown>} order
   */
  async order(player, what, order) {
    logger.info(`${this.nameOf(player)}: ${what}`);
    let result;
    try {
      result = await order();
    } catch (err) {
      logger.warn(`${this.nameOf(player)}: ${what} failed (${err.message})`);
      throw this.explain(err, player);
    }
    this.pollSoon(player);
    return result;
  }

  /** The core's commands on the features (onSetValue). Resolves nothing. */
  async setValue(device, feature, value) {
    const player = this.playerOf(device.external_id);
    await this.#command(player, featureKeyOf(feature.external_id), value);
  }

  #command(player, key, value) {
    switch (key) {
      case FEATURES.PLAY:
        return this.order(player, 'play', () => player.play());
      case FEATURES.PAUSE:
        return this.order(player, 'pause', () => player.pause());
      case FEATURES.STOP:
        return this.order(player, 'stop', () => player.stop());
      case FEATURES.PREVIOUS:
        return this.order(player, 'previous', () => player.previous());
      case FEATURES.NEXT:
        return this.order(player, 'next', () => player.next());
      case FEATURES.VOLUME:
        return this.setVolume(player, value);
      case FEATURES.MUTE:
        return this.order(player, 'mute on/off', () => player.toggleMute());
      case FEATURES.SOURCE:
        return this.setSource(player, String(value));
      case FEATURES.EQUALIZER:
        return this.setEqualizer(player, String(value));
      case FEATURES.NOTIFICATION:
        return this.announce(player, value);
      default:
        throw new Error(this.texts.unsupported(this.nameOf(player)));
    }
  }

  async setVolume(player, value) {
    const volume = Math.round(Number(value));
    if (!Number.isFinite(volume) || volume < 0 || volume > 100) {
      throw new Error(this.texts.invalidVolume);
    }
    await this.order(player, `volume ${volume}`, () => player.setVolume(volume));
  }

  async setSource(player, input) {
    if (!player.info?.inputs.includes(input)) {
      throw new Error(this.texts.invalidSource(this.nameOf(player)));
    }
    player.expected = { input, until: this.now() + this.timings.expected };
    await this.order(player, `source ${input}`, () => player.setSource(input));
  }

  async setEqualizer(player, name) {
    const known = player.info?.equalizers ?? [];
    if (name !== 'off' && !known.includes(name)) {
      throw new Error(this.texts.unsupported(this.nameOf(player)));
    }
    await this.order(player, `equalizer ${name}`, () => player.setEqualizer(name));
  }

  async playPreset(player, preset) {
    const max = player.info?.presetCount ?? 6;
    const number = Number(preset);
    if (!Number.isInteger(number) || number < 1 || number > max) {
      throw new Error(this.texts.invalidPreset(max));
    }
    await this.order(player, `preset ${number}`, () => player.playPreset(number));
    return number;
  }

  async playUrl(player, value) {
    const url = playableUrl(value);
    if (!url) {
      throw new Error(this.texts.invalidUrl);
    }
    await this.order(player, `play ${loggableUrl(url)}`, () => player.playUrl(url));
  }

  /** The core's "Talk on a speaker": the URL of a text-to-speech MP3. */
  async announce(player, value) {
    const url = playableUrl(value);
    if (!url) {
      throw new Error(this.texts.invalidUrl);
    }
    // The URL of a Gladys Plus text to speech carries a token: never logged whole.
    return this.order(player, `announcement ${loggableUrl(url)}`, () =>
      player.announce(url, this.now()),
    );
  }

  /** `follower` joins the group `leader` leads (or plays alone in). */
  async joinGroup(follower, leader) {
    if (follower.uuid === leader.uuid) {
      throw new Error(this.texts.sameDevice);
    }
    if (!leader.ip) {
      throw new Error(this.texts.noLeaderAddress(this.nameOf(leader)));
    }
    await this.order(follower, `join the group of ${this.nameOf(leader)}`, () =>
      follower.joinGroupOf(leader),
    );
    leader.groupAt = null;
    this.pollSoon(leader);
  }

  /** A follower leaves its group; a leader dissolves it. */
  async leaveGroup(player) {
    if (player.followers.length > 0) {
      await this.order(player, 'ungroup', () => player.ungroup());
      for (const follower of player.followers) {
        const other = this.players.get(follower.uuid);
        if (other) {
          this.pollSoon(other);
        }
      }
      player.groupAt = null;
      return 'ungrouped';
    }
    const leader = [...this.players.values()].find((other) =>
      other.followers.some((follower) => follower.uuid === player.uuid),
    );
    const ip = leader?.followers.find((follower) => follower.uuid === player.uuid)?.ip ?? player.ip;
    if (leader && ip) {
      await this.order(player, `leave the group of ${this.nameOf(leader)}`, () => leader.kick(ip));
      leader.groupAt = null;
      this.pollSoon(leader);
    } else {
      await this.order(player, 'leave its group', () => player.leaveGroup());
    }
    return 'left';
  }
}
