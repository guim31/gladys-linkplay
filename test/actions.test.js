// -----------------------------------------------------------------------------
// Configuration actions ("Search for players", "Test an address") and the
// configuration itself.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';
import { BUREAU, SALON, TV, setup } from './helpers/setup.js';

test('the configuration: addresses, ignored entries, language', () => {
  assert.deepEqual(normalizeConfig(), { hosts: [], invalidHosts: [], language: 'fr' });
  assert.equal(DEFAULT_CONFIG.language, 'fr');
  const config = normalizeConfig({
    hosts: '192.0.2.10, 192.0.2.10;http://192.0.2.12  wiim.local, 300 , bad/path',
    language: 'de',
  });
  assert.deepEqual(
    config.hosts.map((host) => host.key),
    ['192.0.2.10', 'http://192.0.2.12', 'wiim.local', '300'],
  );
  assert.deepEqual(config.invalidHosts, ['bad/path']);
  assert.equal(config.language, 'de');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});

test('search: every player, the new ones to add, the silent addresses', async () => {
  const env = await setup({
    config: { hosts: `${BUREAU}, 192.0.2.99, bad/address`, language: 'en' },
    create: [SALON],
  });
  const ack = await env.gladys.fake.action('search');
  assert.equal(ack.success, true);
  const report = ack.data.message;
  assert.deepEqual(Object.keys(report).sort(), ['de', 'en', 'es', 'fr']);
  assert.match(
    report.en,
    /^4 LinkPlay player\(s\): Bureau \(Arylic Up2Stream Amp v4, 192\.0\.2\.12\)/,
  );
  assert.match(report.en, /Add the new ones from the Discover tab\./);
  assert.match(report.en, /No answer from: 192\.0\.2\.99\./);
  assert.ok(!report.en.includes(TV), 'a TV answering SSDP is not reported');
  assert.match(report.fr, /Adresses ignorées : bad\/address\./);
});

test('search without any player nor discovery', async () => {
  const env = await setup({ players: {}, config: {}, create: [] });
  env.gladys.scanNetwork = async () => {
    throw new Error('403');
  };
  const ack = await env.gladys.fake.action('search');
  assert.match(
    ack.data.message.es,
    /^No se ha encontrado ningún reproductor LinkPlay\. El descubrimiento/,
  );
});

test('test an address: what answers, or why not', async () => {
  const env = await setup({ create: [] });
  const ok = await env.gladys.fake.action('test_address', { address: BUREAU });
  assert.equal(
    ok.data.message.en,
    'Bureau: Arylic Up2Stream Amp v4, firmware 4.6.529755.31, answers on http://192.0.2.12. Sources: Network (Wi-Fi), Bluetooth, Line in, SD card.',
  );
  const silent = await env.gladys.fake.action('test_address', { address: '192.0.2.99' });
  assert.match(silent.data.message.fr, /^192\.0\.2\.99 : aucun lecteur LinkPlay ne répond/);
  const invalid = await env.gladys.fake.action('test_address', { address: 'localhost' });
  assert.match(invalid.data.message.de, /„localhost“ ist keine Adresse/);
});

test('a new configuration searches again, with the names in the new language', async () => {
  const env = await setup({ create: [] });
  await env.gladys.fake.configUpdated({ hosts: BUREAU, language: 'es' });
  const bureau = env.gladys.fake.discoveredDevices.find((d) => d.name === 'Bureau');
  assert.equal(bureau.features.find((f) => f.external_id.endsWith(':title')).name, 'Título');
  assert.equal(
    bureau.features.find((f) => f.external_id.endsWith(':source')).supported_options[2].label,
    'Entrada de línea',
  );
});
