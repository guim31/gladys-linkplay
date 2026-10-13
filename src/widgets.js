// -----------------------------------------------------------------------------
// The "LinkPlay" dashboard widget (manifest `widgets`, key `player`, frozen):
// what a player plays, its source and state, its live volume, and four
// buttons — previous, play/pause, next, and the presets (a form, Gladys 5.2+).
//
// Budget of the core: 8 components, 2 texts, 1 status, 4 buttons. Pre-localized
// from `language` (the core caches the content per language).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { DEVICE_TYPE, FEATURES, uuidOf } from './devices.js';
import { WIDGET_TEXT, inAllLanguages, sourceLabel, textsOf } from './i18n.js';
import { PLAYBACK } from './linkplay/status.js';

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const PLAYBACK_COLORS = {
  [PLAYBACK.PLAYING]: WIDGET_COLORS.SUCCESS,
  [PLAYBACK.LOADING]: WIDGET_COLORS.INFO,
  [PLAYBACK.PAUSED]: WIDGET_COLORS.WARNING,
  [PLAYBACK.STOPPED]: WIDGET_COLORS.NEUTRAL,
};

/** A content with one text: nothing chosen, unknown player. */
const message = (text) => ({
  ttl_seconds: 60,
  components: [{ type: 'text', variant: 'body', text }],
});

/**
 * @param {import('./hub.js').LinkPlayHub} hub
 * @param {{ device?: string }} settings
 * @param {string} language
 */
export function buildPlayerContent(hub, settings, language) {
  const texts = textsOf(WIDGET_TEXT, language);
  if (!settings?.device) {
    return message(texts.pick);
  }
  const uuid = uuidOf(hub.gladys, settings.device);
  const player = hub.players.get(uuid);
  if (!player || !hub.createdDevices().has(uuid)) {
    return message(texts.unknown);
  }
  const ids = hub.gladys.externalIds(DEVICE_TYPE, uuid);
  const snapshot = player.snapshot;
  if (!snapshot || player.lost) {
    return {
      ttl_seconds: 60,
      components: [
        { type: 'text', variant: 'heading', text: clip(hub.nameOf(player), 40) },
        { type: 'text', variant: 'caption', text: texts.unreachable },
      ],
    };
  }

  const playing = snapshot.playback === PLAYBACK.PLAYING;
  const details = [snapshot.artist, snapshot.album].filter(Boolean).join(' — ');
  const statusItems = [
    { label: texts.source, value: clip(sourceLabel(snapshot.source, language), 40) },
    {
      label: texts.state,
      value: texts[snapshot.playback],
      color: PLAYBACK_COLORS[snapshot.playback],
    },
  ];
  const group = hub.groupText(player, language);
  if (player.followers.length > 0 || snapshot.follower) {
    statusItems.push({ label: texts.group, value: clip(group, 40), icon: 'speaker' });
  }

  const components = [
    { type: 'text', variant: 'heading', text: clip(snapshot.title || texts.nothing, 40) },
    { type: 'text', variant: 'caption', text: clip(details || hub.nameOf(player), 80) },
    { type: 'value', label: texts.volume, device_feature: ids.feature(FEATURES.VOLUME) },
    { type: 'status', items: statusItems },
    { type: 'button', label: texts.previous, icon: 'skip-back', action: { key: 'previous' } },
    playing
      ? { type: 'button', label: texts.pause, icon: 'pause', action: { key: 'toggle' } }
      : { type: 'button', label: texts.play, icon: 'play', action: { key: 'toggle' } },
    { type: 'button', label: texts.next, icon: 'skip-forward', action: { key: 'next' } },
  ];
  const presets = hub.presetsOf(player);
  if (presets.length > 0) {
    components.push({
      type: 'button',
      label: texts.presets,
      icon: 'star',
      action: {
        key: 'preset',
        fields: [
          {
            // Form texts are multi-language objects (`en` required), 40 characters.
            key: 'preset',
            type: 'select',
            label: inAllLanguages((lang) => textsOf(WIDGET_TEXT, lang).preset),
            required: true,
            default: '1',
            options: presets.map(({ number, name }) => ({
              value: String(number),
              label: inAllLanguages((lang) =>
                clip(
                  name ? `${number}. ${name}` : `${textsOf(WIDGET_TEXT, lang).preset} ${number}`,
                  40,
                ),
              ),
            })),
          },
        ],
      },
    });
  }
  return { ttl_seconds: playing ? 15 : 60, components };
}

/**
 * A button of the widget. The transport buttons resolve nothing (the widget
 * reloads); the preset one says which preset started.
 */
export async function runPlayerAction(hub, actionKey, { settings, values }) {
  const player = hub.playerOf(settings?.device);
  switch (actionKey) {
    case 'previous':
      await hub.order(player, 'previous (widget)', () => player.previous());
      return undefined;
    case 'next':
      await hub.order(player, 'next (widget)', () => player.next());
      return undefined;
    case 'toggle':
      await hub.order(player, 'play/pause (widget)', () => player.togglePlayback());
      return undefined;
    case 'preset': {
      // An older core drops the form and sends no values.
      if (!values || values.preset === undefined) {
        throw new Error(hub.texts.updateGladys);
      }
      const number = await hub.playPreset(player, Number(values.preset));
      const name = hub.presetsOf(player)[number - 1]?.name;
      return inAllLanguages((lang) => {
        const label = `${textsOf(WIDGET_TEXT, lang).preset} ${number}`;
        return clip(name ? `${label} — ${name}` : label, 200);
      });
    }
    default:
      throw new Error(hub.texts.unsupported(hub.nameOf(player)));
  }
}

export const WIDGETS = {
  player: {
    get: (hub, { settings, language }) => buildPlayerContent(hub, settings, language),
    action: (hub, actionKey, params, context) => runPlayerAction(hub, actionKey, context),
  },
};
