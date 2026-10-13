// -----------------------------------------------------------------------------
// The "LinkPlay" widget: content within the core vocabulary and budget, bound
// to features that exist, and its four buttons.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from '../src/config.js';
import { BUREAU, CUISINE, SALON, ZONE, setup } from './helpers/setup.js';

async function content(env, ip, language = 'fr') {
  const ack = await env.gladys.fake.widgetGet('player', {
    settings: { device: env.idOf(ip) },
    language,
  });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
}

test('every content fits the vocabulary and the budget of the core', async () => {
  const env = await setup();
  for (const ip of [SALON, CUISINE, BUREAU, ZONE]) {
    for (const language of LANGUAGES) {
      const widget = await content(env, ip, language);
      assert.deepEqual(validateWidgetContent(widget), [], `${ip} ${language}`);
      // The live tile is bound to a feature the device really has.
      const features = new Set(env.deviceOf(ip).features.map((feature) => feature.external_id));
      for (const component of widget.components.filter((c) => c.device_feature)) {
        assert.ok(features.has(component.device_feature), component.device_feature);
      }
    }
  }
  env.players[ZONE].online = false;
  env.hub.players.get(env.players[ZONE].statusEx.uuid).lost = true;
  const lost = await content(env, ZONE);
  assert.deepEqual(validateWidgetContent(lost), []);
  assert.equal(lost.components[1].text, 'Lecteur injoignable');
});

test('title, details, source, state, group and four buttons', async () => {
  const env = await setup();
  const widget = await content(env, SALON);
  const [heading, caption, tile, status, ...buttons] = widget.components;
  assert.deepEqual(heading, { type: 'text', variant: 'heading', text: 'Clair de lune' });
  assert.deepEqual(caption, { type: 'text', variant: 'caption', text: 'Claude Debussy — FIP' });
  assert.equal(tile.device_feature, env.idOf(SALON, 'volume'));
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['Source', 'Réseau'],
      ['État', 'En lecture'],
      ['Groupe', 'Maître de : Cuisine'],
    ],
  );
  assert.deepEqual(
    buttons.map((button) => [button.label, button.action.key]),
    [
      ['Précédent', 'previous'],
      ['Pause', 'toggle'],
      ['Suivant', 'next'],
      ['Préréglages', 'preset'],
    ],
  );
  const options = buttons[3].action.fields[0].options;
  assert.equal(options.length, 12);
  assert.deepEqual(options[0], {
    value: '1',
    label: { en: '1. FIP', fr: '1. FIP', de: '1. FIP', es: '1. FIP' },
  });
  assert.equal(options[5].label.de, 'Voreinstellung 6');
  assert.equal(widget.ttl_seconds, 15);

  // Stopped: a play button, nothing playing, the name of the player.
  const zone = await content(env, ZONE, 'en');
  assert.equal(zone.components[0].text, 'Nothing playing');
  assert.equal(zone.components[1].text, 'Smart Zone 1_54B9');
  assert.ok(zone.components.some((c) => c.type === 'button' && c.label === 'Play'));
  assert.equal(zone.ttl_seconds, 60);
});

test('no player chosen, or a player gone from Gladys: a sentence', async () => {
  const env = await setup();
  const none = await env.gladys.fake.widgetGet('player', { settings: {}, language: 'de' });
  assert.match(none.data.content.components[0].text, /Wähle einen LinkPlay-Player/);
  const gone = await env.gladys.fake.widgetGet('player', {
    settings: { device: 'ext:test-integration:player:0000000000' },
    language: 'es',
  });
  assert.match(gone.data.content.components[0].text, /ya no está en Gladys/);
});

test('the buttons: previous, play/pause, next, and a preset from the form', async () => {
  const env = await setup();
  const settings = { device: env.idOf(SALON) };
  const action = (key, values) =>
    env.gladys.fake.widgetAction('player', key, {}, { settings, values });
  assert.deepEqual(await action('previous'), { success: true });
  assert.deepEqual(await action('toggle'), { success: true });
  assert.deepEqual(await action('next'), { success: true });
  assert.deepEqual(env.players[SALON].orders, [
    'setPlayerCmd:prev',
    'setPlayerCmd:pause',
    'setPlayerCmd:next',
  ]);
  const preset = await action('preset', { preset: '3' });
  assert.equal(preset.success, true);
  assert.deepEqual(preset.data.message, {
    en: 'Preset 3 — Discover Weekly',
    fr: 'Préréglage 3 — Discover Weekly',
    de: 'Voreinstellung 3 — Discover Weekly',
    es: 'Preajuste 3 — Discover Weekly',
  });
  assert.equal(env.players[SALON].orders.at(-1), 'MCUKeyShortClick:3');
  // A core without the forms sends no values: said, nothing played.
  const old = await action('preset');
  assert.match(old.error, /Gladys 5\.2\.0/);
});
