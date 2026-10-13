// -----------------------------------------------------------------------------
// Conformity with the Gladys core, for EVERY device built from realistic
// fixtures (the real ArtSound answers of the Home Assistant tests, and WiiM
// and Arylic answers reconstructed from public formats), in the four feature
// languages. The table comes from the core code (test/fixtures/
// gladys-feature-table.json). Do not loosen this test: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { LANGUAGES } from '../src/config.js';
import { buildDevice } from '../src/devices.js';
import { parseDeviceStatus, parseEqualizerList } from '../src/linkplay/status.js';
import { loadFixtures } from './helpers/fakePlayers.js';
import { setup } from './helpers/setup.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const FOLDERS = ['wiim-pro', 'wiim-amp', 'arylic-up2stream-amp-v4', 'artsound-smart-zone-4'];

function devicesIn(language) {
  const gladys = createFakeGladys();
  return FOLDERS.map((folder, index) => {
    const answers = loadFixtures(folder);
    const info = {
      ...parseDeviceStatus(answers.getStatusEx),
      address: `192.0.2.${10 + index}`,
      equalizers: parseEqualizerList(answers.EQGetList),
    };
    return buildDevice(gladys, info, { language });
  });
}

test('the fixtures give players of several makes, with and without equalizer', () => {
  const devices = devicesIn('en');
  assert.equal(devices.length, 4);
  const withEqualizer = devices.filter((device) =>
    device.features.some((feature) => feature.external_id.endsWith(':equalizer')),
  );
  assert.equal(withEqualizer.length, 2);
});

for (const language of LANGUAGES) {
  const devices = devicesIn(language);

  for (const device of devices) {
    test(`${device.name} follows the core rules (${language})`, () => {
      assert.equal(typeof device.name, 'string');
      assert.ok(device.name.length > 0);

      // should_poll true if and only if a poll_frequency is given, in ms.
      assert.equal(typeof device.should_poll, 'boolean');
      assert.equal(device.should_poll, device.poll_frequency !== undefined);
      if (device.poll_frequency !== undefined) {
        assert.ok(table.poll_frequencies_ms.includes(device.poll_frequency));
      }

      for (const param of device.params ?? []) {
        assert.equal(typeof param.value, 'string', `param ${param.name}`);
        assert.ok(param.value.length > 0, `param ${param.name} is empty`);
        assert.ok(!param.name.toUpperCase().startsWith('GLADYS_'), 'GLADYS_* params are reserved');
      }

      const ids = new Set();
      const names = new Set();
      for (const feature of device.features) {
        const pair = `${feature.category}/${feature.type}`;
        const entry = table.pairs[pair];
        assert.ok(entry, `${pair} is not a couple the core knows`);
        assert.ok(entry.label_en && entry.label_fr && entry.icon, `${pair} has labels and an icon`);

        assert.equal(typeof feature.min, 'number', `${feature.external_id}: min`);
        assert.equal(typeof feature.max, 'number', `${feature.external_id}: max`);
        assert.ok(feature.min <= feature.max, `${feature.external_id}: min <= max`);
        assert.equal(typeof feature.read_only, 'boolean', `${feature.external_id}: read_only`);
        assert.equal(
          typeof feature.has_feedback,
          'boolean',
          `${feature.external_id}: has_feedback`,
        );
        assert.equal(
          typeof feature.keep_history,
          'boolean',
          `${feature.external_id}: keep_history`,
        );
        if (feature.unit !== undefined && feature.unit !== null) {
          assert.ok(table.units.includes(feature.unit), `${feature.external_id}: unit`);
        }

        // supported_options: string values on text/select only, labelled, unique.
        if (feature.supported_options !== undefined) {
          assert.equal(pair, 'text/select', `${feature.external_id}: options on ${pair}`);
          const values = feature.supported_options.map((option) => option.value);
          assert.equal(new Set(values).size, values.length, `${feature.external_id}: duplicates`);
          for (const option of feature.supported_options) {
            assert.equal(typeof option.value, 'string');
            assert.ok(option.value.length > 0);
            assert.equal(typeof option.label, 'string');
            assert.ok(option.label.length > 0);
            assert.ok(Number.isInteger(option.sort_order));
          }
        }

        assert.ok(feature.external_id.startsWith(`${device.external_id}:`));
        assert.ok(!ids.has(feature.external_id), `duplicate ${feature.external_id}`);
        ids.add(feature.external_id);
        assert.ok(!names.has(feature.name), `duplicate name "${feature.name}"`);
        names.add(feature.name);
      }
    });
  }

  test(`device external ids are unique across the players (${language})`, () => {
    const ids = devices.map((device) => device.external_id);
    assert.equal(new Set(ids).size, ids.length);
  });
}

test('the external ids are the uuid of the player, never its name or address', () => {
  const [wiim] = devicesIn('fr');
  assert.equal(wiim.external_id, 'ext:test-integration:player:FF98F09C3D7A5E21B6C04F18A9E2D7B3');
  assert.deepEqual(
    wiim.features.map((feature) => feature.external_id.split(':').pop()),
    [
      'play',
      'pause',
      'stop',
      'previous',
      'next',
      'volume',
      'mute',
      'playback-state',
      'title',
      'artist',
      'album',
      'source',
      'equalizer',
      'group',
      'notification',
    ],
  );
});

test('every state the integration publishes goes to a feature of a published device', async () => {
  const { gladys } = await setup();
  const features = new Set(
    gladys.fake.discoveredDevices.flatMap((device) => device.features.map((f) => f.external_id)),
  );
  assert.ok(gladys.fake.states.length > 20);
  for (const state of gladys.fake.states) {
    assert.ok(features.has(state.device_feature_external_id), state.device_feature_external_id);
    if (state.text !== undefined) {
      assert.ok(state.text.length > 0, 'a text state is never empty');
    }
  }
});
