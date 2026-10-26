// -----------------------------------------------------------------------------
// The Gladys device of a LinkPlay player.
//
// The playback features follow the `music` category of the core, completed by
// Gladys 5.3 (capabilities/music.md): its Music widget reads the playback
// state (writable: 0 pause, 1 play, 2 stop), title, artist, album, artwork,
// duration, position (writable: seek), shuffle, repeat, mute and volume, and
// its "Talk on a speaker" scene action targets play_notification. The 1.0
// keys are kept: title, artist and album (text/text in 1.0) and mute (a
// television push button in 1.0) become their music types under the same
// external ids when the user clicks "Update" in Discover. The core has no
// music "stop": it stays a television key, next to playback state 2. The
// group is `text/text`; the source and the WiiM equalizer are `text/select`,
// whose options (string values) are the ones THIS player has.
//
// The device is published with `should_poll: false`: the container polls the
// players itself, faster while they play (src/hub.js), the core scheduler only
// knows fixed paces and does not poll reliably (GladysAssistant/Gladys#3198).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  MUSIC_PLAYBACK_STATE,
} from '@gladysassistant/integration-sdk';
import { NAMES, sourceLabel, textsOf } from './i18n.js';

/** The device type in the external ids: `ext:<selector>:player:<uuid>`. */
export const DEVICE_TYPE = 'player';

// Feature keys: part of the external ids, frozen once published.
export const FEATURES = {
  PLAY: 'play',
  PAUSE: 'pause',
  STOP: 'stop',
  PREVIOUS: 'previous',
  NEXT: 'next',
  VOLUME: 'volume',
  MUTE: 'mute',
  PLAYBACK_STATE: 'playback-state',
  TITLE: 'title',
  ARTIST: 'artist',
  ALBUM: 'album',
  SOURCE: 'source',
  EQUALIZER: 'equalizer',
  GROUP: 'group',
  NOTIFICATION: 'notification',
  // 1.1.0 (Gladys 5.3)
  ARTWORK: 'artwork',
  DURATION: 'duration',
  POSITION: 'position',
  SHUFFLE: 'shuffle',
  REPEAT: 'repeat',
};

/** Feature key → music type, for publishNowPlaying (featureExternalIds). */
export const MUSIC_KEYS = {
  playback_state: 'playback-state',
  title: 'title',
  artist: 'artist',
  album: 'album',
  artwork: 'artwork',
  duration: 'duration',
  position: 'position',
  shuffle: 'shuffle',
  repeat: 'repeat',
  mute: 'mute',
  volume: 'volume',
};

/** The equalizer option that turns it off. */
export const EQUALIZER_OFF = 'off';

export const EQUALIZER_OFF_LABEL = {
  en: 'Off',
  fr: 'Désactivé',
  de: 'Aus',
  es: 'Desactivado',
};

// MUSIC_PLAYBACK_STATE of the core: 0 paused, 1 playing, 2 idle, 3 buffering.
export const PLAYBACK_STATE = MUSIC_PLAYBACK_STATE;

const { MUSIC, TELEVISION, TEXT } = DEVICE_FEATURE_CATEGORIES;
const TYPES = DEVICE_FEATURE_TYPES;
// Bound of the duration and the position (24 h: a long mix, an audiobook).
const LONG = 24 * 60 * 60;
const { SECONDS } = DEVICE_FEATURE_UNITS;

// key → [category, type, read_only, min, max, keep_history, has_feedback, unit]
const DEFINITIONS = {
  [FEATURES.PLAY]: [MUSIC, TYPES.MUSIC.PLAY, false, 0, 1, false, false],
  [FEATURES.PAUSE]: [MUSIC, TYPES.MUSIC.PAUSE, false, 0, 1, false, false],
  [FEATURES.STOP]: [TELEVISION, TYPES.TELEVISION.STOP, false, 0, 1, false, false],
  [FEATURES.PREVIOUS]: [MUSIC, TYPES.MUSIC.PREVIOUS, false, 0, 1, false, false],
  [FEATURES.NEXT]: [MUSIC, TYPES.MUSIC.NEXT, false, 0, 1, false, false],
  [FEATURES.VOLUME]: [MUSIC, TYPES.MUSIC.VOLUME, false, 0, 100, false, true],
  [FEATURES.MUTE]: [MUSIC, TYPES.MUSIC.MUTE, false, 0, 1, false, true],
  [FEATURES.PLAYBACK_STATE]: [MUSIC, TYPES.MUSIC.PLAYBACK_STATE, false, 0, 2, false, true],
  [FEATURES.TITLE]: [MUSIC, TYPES.MUSIC.TITLE, true, 0, 0, false, false],
  [FEATURES.ARTIST]: [MUSIC, TYPES.MUSIC.ARTIST, true, 0, 0, false, false],
  [FEATURES.ALBUM]: [MUSIC, TYPES.MUSIC.ALBUM, true, 0, 0, false, false],
  [FEATURES.ARTWORK]: [MUSIC, TYPES.MUSIC.ARTWORK, true, 0, 0, false, false],
  [FEATURES.DURATION]: [MUSIC, TYPES.MUSIC.DURATION, true, 0, LONG, false, false, SECONDS],
  [FEATURES.POSITION]: [MUSIC, TYPES.MUSIC.POSITION, false, 0, LONG, false, true, SECONDS],
  [FEATURES.SHUFFLE]: [MUSIC, TYPES.MUSIC.SHUFFLE, false, 0, 1, false, true],
  [FEATURES.REPEAT]: [MUSIC, TYPES.MUSIC.REPEAT, false, 0, 2, false, true],
  [FEATURES.SOURCE]: [TEXT, TYPES.TEXT.SELECT, false, 0, 0, false, true],
  [FEATURES.EQUALIZER]: [TEXT, TYPES.TEXT.SELECT, false, 0, 0, false, false],
  [FEATURES.GROUP]: [TEXT, TYPES.TEXT.TEXT, true, 0, 0, false, false],
  [FEATURES.NOTIFICATION]: [MUSIC, TYPES.MUSIC.PLAY_NOTIFICATION, false, 0, 0, false, false],
};

/** The feature keys of a player: the equalizer only where the WiiM API offers it. */
export function featureKeys(info) {
  return Object.values(FEATURES).filter(
    (key) => key !== FEATURES.EQUALIZER || (info.equalizers?.length ?? 0) > 0,
  );
}

function supportedOptions(key, info, language) {
  if (key === FEATURES.SOURCE) {
    return info.inputs.map((input, index) => ({
      value: input,
      label: sourceLabel(input, language),
      sort_order: index,
    }));
  }
  if (key === FEATURES.EQUALIZER) {
    return [
      { value: EQUALIZER_OFF, label: textsOf(EQUALIZER_OFF_LABEL, language), sort_order: 0 },
      ...info.equalizers.map((name, index) => ({
        value: name,
        label: name,
        sort_order: index + 1,
      })),
    ];
  }
  return undefined;
}

/**
 * The discovery payload of a player.
 * @param {object} gladys GladysIntegration
 * @param {object} info see PlayerRegistry: uuid, name, address, manufacturer, model,
 *   firmware, inputs, equalizers
 * @param {{ language: string }} config
 */
export function buildDevice(gladys, info, config) {
  const ids = gladys.externalIds(DEVICE_TYPE, info.uuid);
  const names = textsOf(NAMES, config.language);
  return {
    name: info.name,
    external_id: ids.device,
    should_poll: false,
    params: [
      { name: 'IP_ADDRESS', value: info.address },
      { name: 'MANUFACTURER', value: info.manufacturer },
      { name: 'MODEL', value: info.model },
      { name: 'FIRMWARE', value: info.firmware || '?' },
    ],
    features: featureKeys(info).map((key) => {
      const [category, type, readOnly, min, max, keepHistory, hasFeedback, unit] = DEFINITIONS[key];
      const feature = {
        name: names[key],
        external_id: ids.feature(key),
        category,
        type,
        read_only: readOnly,
        has_feedback: hasFeedback,
        keep_history: keepHistory,
        min,
        max,
      };
      if (unit) {
        feature.unit = unit;
      }
      const options = supportedOptions(key, info, config.language);
      if (options) {
        feature.supported_options = options;
      }
      return feature;
    }),
  };
}

/** The uuid of one of our player external ids (device or feature), else null. */
export function uuidOf(gladys, externalId) {
  const prefix = gladys.externalId(`${DEVICE_TYPE}:`);
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  return externalId.slice(prefix.length).split(':')[0] || null;
}

/** The feature key of one of our feature external ids, else null. */
export function featureKeyOf(externalId) {
  const key = String(externalId ?? '')
    .split(':')
    .pop();
  return Object.values(FEATURES).includes(key) ? key : null;
}

/** The value of a device param, null when absent. */
export function paramOf(device, name) {
  return (device?.params ?? []).find((param) => param.name === name)?.value ?? null;
}
