// -----------------------------------------------------------------------------
// The LinkPlay protocol layer: addresses, command encoding, HTTPS then HTTP,
// and the reading of real and reconstructed answers.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LinkPlayClient, encodeCommand, parseAddress } from '../src/linkplay/client.js';
import { displayModel, lookupModel } from '../src/linkplay/models.js';
import {
  decodeText,
  parseDeviceStatus,
  parseEqualizerList,
  parseFollowers,
  parseMetaInfo,
  parsePlayerStatus,
  parsePresetInfo,
} from '../src/linkplay/status.js';
import { FakePlayer, fakeNetwork, hex, loadFixtures } from './helpers/fakePlayers.js';

test('titles are decoded from hexadecimal UTF-8, plain titles are kept', () => {
  assert.equal(decodeText(hex('The Beatles')), 'The Beatles');
  assert.equal(decodeText(hex('Débussy — Clair de lune')), 'Débussy — Clair de lune');
  assert.equal(decodeText(hex('日本語')), '日本語');
  // Plain titles that happen to be hexadecimal: not valid UTF-8, or control characters.
  assert.equal(decodeText('ABBA'), 'ABBA');
  assert.equal(decodeText('CAFE'), 'CAFE');
  assert.equal(decodeText('1234'), '1234');
  assert.equal(decodeText('Kind of Blue'), 'Kind of Blue');
  // The placeholders of the firmwares.
  assert.equal(decodeText(hex('Unknown')), '');
  assert.equal(decodeText('unknow'), 'unknow');
  assert.equal(decodeText(''), '');
  assert.equal(decodeText(undefined), '');
});

test('a real getStatusEx (ArtSound, Home Assistant fixtures) gives the player', () => {
  const info = parseDeviceStatus(loadFixtures('artsound-smart-zone-4').getStatusEx);
  assert.equal(info.uuid, 'FF31F09E5001FBDE0546AB12CD34EF56');
  assert.equal(info.name, 'Smart Zone 1_54B9');
  assert.equal(info.manufacturer, 'ArtSound');
  assert.equal(info.model, 'Smart Zone 4 AMP');
  assert.equal(info.wiim, false);
  assert.equal(info.firmware, '4.6.415145');
  assert.equal(info.ip, '192.0.2.21');
  assert.equal(info.presetCount, 10);
  // plm_support 0x40152: line in, optical, coaxial, line in 2, optical 2.
  assert.deepEqual(info.inputs, [
    'wifi',
    'line-in',
    'line-in-2',
    'optical',
    'optical-2',
    'coaxial',
  ]);
});

test('a WiiM gets the inputs of its model, an unknown project stays usable', () => {
  const wiim = parseDeviceStatus(loadFixtures('wiim-pro').getStatusEx);
  assert.equal(wiim.model, 'WiiM Pro');
  assert.equal(wiim.wiim, true);
  assert.equal(wiim.ip, '192.0.2.10');
  assert.equal(wiim.presetCount, 12);
  assert.deepEqual(wiim.inputs, ['wifi', 'bluetooth', 'line-in', 'optical']);
  assert.equal(displayModel(wiim), 'WiiM Pro');

  const amp = parseDeviceStatus(loadFixtures('wiim-amp').getStatusEx);
  assert.deepEqual(amp.inputs, ['wifi', 'bluetooth', 'line-in', 'optical', 'hdmi']);

  const arylic = parseDeviceStatus(loadFixtures('arylic-up2stream-amp-v4').getStatusEx);
  assert.equal(displayModel(arylic), 'Arylic Up2Stream Amp v4');
  assert.deepEqual(arylic.inputs, ['wifi', 'bluetooth', 'line-in', 'sd-card']);
  assert.equal(arylic.ip, '192.0.2.12');

  assert.deepEqual(lookupModel('WiiM_Sub_Pro'), {
    manufacturer: 'WiiM',
    model: 'WiiM Sub Pro',
    wiim: true,
  });
  assert.equal(lookupModel('').model, 'LinkPlay');
  assert.throws(() => parseDeviceStatus({ DeviceName: 'x' }), /uuid/);
});

test('the playback reads the status, the source and the titles', () => {
  const idle = parsePlayerStatus(loadFixtures('artsound-smart-zone-4').getPlayerStatusEx);
  assert.deepEqual(idle, {
    playback: 'stopped',
    source: 'idle',
    input: 'wifi',
    follower: false,
    volume: 80,
    muted: false,
    title: '',
    artist: '',
    album: '',
    duration: 0,
    position: 0,
    loop: '0',
    artworkUrl: null,
  });
  const follower = parsePlayerStatus(
    loadFixtures('artsound-smart-zone-4')['getPlayerStatusEx-follower'],
  );
  assert.equal(follower.follower, true);
  assert.equal(follower.input, null);
  assert.equal(follower.playback, 'playing');

  const lineIn = parsePlayerStatus(loadFixtures('arylic-up2stream-amp-v4').getPlayerStatus);
  assert.equal(lineIn.source, 'line-in');
  assert.equal(lineIn.input, 'line-in');
  assert.equal(lineIn.title, 'Line In');
  assert.equal(lineIn.muted, true);

  const network = parsePlayerStatus(
    loadFixtures('arylic-up2stream-amp-v4')['getPlayerStatusEx-network'],
  );
  assert.equal(network.title, 'Blue in Green');
  assert.equal(network.artist, 'Miles Davis');
  assert.equal(network.album, 'Kind of Blue');

  for (const [mode, source, input] of [
    ['31', 'spotify', 'wifi'],
    ['1', 'airplay', 'wifi'],
    ['41', 'bluetooth', 'bluetooth'],
    ['43', 'optical', 'optical'],
    ['49', 'hdmi', 'hdmi'],
    ['58', 'arc', 'arc'],
    ['12345', 'network', 'wifi'],
  ]) {
    const parsed = parsePlayerStatus({ status: 'play', mode });
    assert.equal(parsed.source, source, mode);
    assert.equal(parsed.input, input, mode);
  }
  assert.equal(parsePlayerStatus({ status: 'none' }).playback, 'stopped');
  assert.equal(parsePlayerStatus({ status: 'load' }).playback, 'loading');
  assert.throws(() => parsePlayerStatus({}), /getPlayerStatus/);
});

test('groups, metadata, presets and equalizers of a WiiM are read', () => {
  const wiim = loadFixtures('wiim-pro');
  assert.deepEqual(parseFollowers(wiim['multiroom:getSlaveList']), [
    { uuid: 'FF98F359A1B2C3D4E5F60718293A4B5C', name: 'Cuisine', ip: '192.0.2.11' },
  ]);
  assert.deepEqual(parseFollowers({ slaves: '0' }), []);
  assert.deepEqual(parseMetaInfo(wiim.getMetaInfo), {
    title: 'Clair de lune',
    artist: 'Claude Debussy',
    album: 'FIP',
    artworkUrl: 'https://example.invalid/cover.jpg',
  });
  assert.deepEqual(
    [...parsePresetInfo(wiim.getPresetInfo)],
    [
      [1, 'FIP'],
      [2, 'Radio Paradise'],
      [3, 'Discover Weekly'],
    ],
  );
  assert.equal(parseEqualizerList(wiim.EQGetList).length, 22);
  assert.deepEqual(parseEqualizerList({ EQList: ['Flat', 'Flat', ''] }), ['Flat']);
  assert.deepEqual(parseEqualizerList('nope'), []);
});

test('addresses: IP, host name, scheme and port; never the container itself', () => {
  assert.deepEqual(parseAddress(' 192.0.2.10 '), {
    hostname: '192.0.2.10',
    scheme: undefined,
    port: undefined,
    key: '192.0.2.10',
  });
  assert.equal(parseAddress('WiiM-Salon.local').key, 'wiim-salon.local');
  assert.equal(parseAddress('http://192.0.2.10/').key, 'http://192.0.2.10');
  assert.equal(parseAddress('192.0.2.10:8080').port, 8080);
  for (const bad of [
    '',
    'http://',
    '192.0.2.10/x',
    'user@192.0.2.10',
    'localhost',
    '127.0.0.1',
    'a b',
  ]) {
    assert.throws(() => parseAddress(bad), /address|container/, bad);
  }
});

test('commands keep their separators and encode what would break the query', () => {
  assert.equal(encodeCommand('setPlayerCmd:vol:30'), 'setPlayerCmd:vol:30');
  assert.equal(
    encodeCommand('setPlayerCmd:play:https://radio.example/live?a=1&b=2#x'),
    'setPlayerCmd:play:https://radio.example/live?a=1%26b=2%23x',
  );
  assert.equal(encodeCommand('EQLoad:R&B'), 'EQLoad:R%26B');
  assert.equal(encodeCommand('EQLoad:Bass Booster'), 'EQLoad:Bass%20Booster');
  assert.equal(encodeCommand('x:é+%'), 'x:%C3%A9%2B%25');
});

test('HTTPS is tried first, HTTP after, and the working one is remembered', async () => {
  const arylic = new FakePlayer('arylic-up2stream-amp-v4', { https: false });
  const network = fakeNetwork({ '192.0.2.12': arylic });
  const client = new LinkPlayClient('192.0.2.12', { get: network.get });
  const status = await client.json('getStatusEx');
  assert.equal(status.DeviceName, 'Bureau');
  assert.deepEqual(network.requests, [
    'https://192.0.2.12/httpapi.asp?command=getStatusEx',
    'http://192.0.2.12/httpapi.asp?command=getStatusEx',
  ]);
  await client.ok('setPlayerCmd:pause');
  assert.equal(network.requests.at(-1), 'http://192.0.2.12/httpapi.asp?command=setPlayerCmd:pause');
  assert.equal(client.origin, 'http://192.0.2.12');

  // The player stops answering: both are tried again at the next request.
  arylic.online = false;
  await assert.rejects(() => client.json('getStatusEx'), { code: 'timeout' });
  arylic.online = true;
  network.requests.length = 0;
  await client.json('getStatusEx');
  assert.equal(network.requests.length, 2);
});

test('an explicit scheme or port is the only endpoint asked', async () => {
  const urls = [];
  const get = async (url) => {
    urls.push(url);
    return { status: 200, body: 'OK' };
  };
  await new LinkPlayClient('http://192.0.2.10', { get }).ok('setPlayerCmd:stop');
  await new LinkPlayClient('192.0.2.10:4443', { get }).ok('setPlayerCmd:stop');
  await new LinkPlayClient('https://192.0.2.10:8443', { get }).ok('setPlayerCmd:stop');
  assert.deepEqual(urls, [
    'http://192.0.2.10/httpapi.asp?command=setPlayerCmd:stop',
    'http://192.0.2.10:4443/httpapi.asp?command=setPlayerCmd:stop',
    'https://192.0.2.10:8443/httpapi.asp?command=setPlayerCmd:stop',
  ]);
});

test('answers: unknown command, failure, not JSON, HTTP error', async () => {
  const answers = ['unknown command', 'Failed', '<html></html>', 'nope'];
  const get = async () => ({ status: 200, body: answers.shift() });
  const client = new LinkPlayClient('http://192.0.2.10', { get });
  await assert.rejects(() => client.json('getMetaInfo'), { code: 'unsupported' });
  await assert.rejects(() => client.json('getMetaInfo'), { code: 'failed' });
  await assert.rejects(() => client.json('getStatusEx'), { code: 'invalid' });
  await assert.rejects(() => client.ok('setPlayerCmd:stop'), { code: 'failed' });

  const json = new LinkPlayClient('http://192.0.2.10', {
    get: async () => ({ status: 200, body: '{"status":"OK"}' }),
  });
  await json.ok('EQOff');

  const broken = new LinkPlayClient('http://192.0.2.10', {
    get: async () => ({ status: 404, body: '' }),
  });
  await assert.rejects(() => broken.json('getStatusEx'), { code: 'http' });
});
