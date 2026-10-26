// -----------------------------------------------------------------------------
// The Gladys 5.3 music player (1.1.0), on the SDK's own fake Gladys: the
// features of the device, what publishNowPlaying sends from real LinkPlay
// answers (public issues, see test/fixtures/players/README.md), the commands
// (playback state, seek, shuffle, repeat, mute), the artwork handler, the
// presets as a catalog, and the "Update" of a player created by 1.0.
// No real player behind any of this.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import jpeg from 'jpeg-js';
import { MUSIC_PLAYBACK_STATE, validateMediaItems } from '@gladysassistant/integration-sdk';
import { FEATURES, buildDevice } from '../src/devices.js';
import { REPEAT, decodeLoop, loopModesFor } from '../src/linkplay/status.js';
import { downloadArtwork, isLanHost } from '../src/music.js';
import { FakePlayer, loadFixtures } from './helpers/fakePlayers.js';
import { BUREAU, CUISINE, SALON, ZONE, defaultPlayers, setup } from './helpers/setup.js';

const COVER = await readFile(new URL('./fixtures/artwork/baseline-420.jpg', import.meta.url));
const WIIM = loadFixtures('wiim-pro');
const ARYLIC = loadFixtures('arylic-up2stream-amp-v4');

const music = (env, ip) => {
  const last = (key) => env.gladys.fake.lastState(env.idOf(ip, key));
  return {
    playback: last('playback-state'),
    title: last('title'),
    artist: last('artist'),
    album: last('album'),
    artwork: last('artwork'),
    duration: last('duration'),
    position: last('position'),
    shuffle: last('shuffle'),
    repeat: last('repeat'),
    mute: last('mute'),
    volume: last('volume'),
  };
};

async function command(env, ip, key, value) {
  const feature = env.deviceOf(ip).features.find((f) => f.external_id === env.idOf(ip, key));
  return env.gladys.fake.setValue(env.deviceOf(ip), feature, value);
}

async function poll(env, ip) {
  await env.hub.pollPlayer(env.hub.players.get(env.players[ip].statusEx.uuid));
}

/** Artwork transport: URL → { status, body }, or a function of the URL. */
function artworkNetwork(routes) {
  const asked = [];
  const get = async (url, options) => {
    asked.push({ url, insecure: options.insecure });
    const route = routes[url];
    if (!route) {
      return { status: 404, location: null, body: Buffer.alloc(0) };
    }
    return { location: null, ...route };
  };
  return { get, asked };
}

test('a player carries the music features of Gladys 5.3, under the 1.0 keys', async () => {
  const env = await setup();
  const device = env.gladys.fake.discoveredDevices.find((d) => d.external_id === env.idOf(SALON));
  const byKey = (key) => device.features.find((f) => f.external_id === env.idOf(SALON, key));
  const expect = {
    'playback-state': ['playback_state', false, 2],
    title: ['title', true, 0],
    artist: ['artist', true, 0],
    album: ['album', true, 0],
    artwork: ['artwork', true, 0],
    duration: ['duration', true, 86400],
    position: ['position', false, 86400],
    shuffle: ['shuffle', false, 1],
    repeat: ['repeat', false, 2],
    mute: ['mute', false, 1],
    volume: ['volume', false, 100],
  };
  for (const [key, [type, readOnly, max]] of Object.entries(expect)) {
    const feature = byKey(key);
    assert.equal(feature.category, 'music', key);
    assert.equal(feature.type, type, key);
    assert.equal(feature.read_only, readOnly, key);
    assert.equal(feature.max, max, key);
    assert.equal(feature.keep_history, false, key);
    // Every writable music feature is confirmed by the player.
    assert.equal(feature.has_feedback, !readOnly, key);
  }
  assert.equal(byKey('duration').unit, 'seconds');
  assert.equal(byKey('position').unit, 'seconds');
  // Kept as they were: the stop key of the television category, the old buttons.
  assert.equal(byKey('stop').category, 'television');
  assert.equal(byKey('play').type, 'play');
});

test('real answers: Spotify on an Arylic, playing then paused', async () => {
  const players = defaultPlayers();
  players[BUREAU].set(ARYLIC['getPlayerStatusEx-spotify']);
  const env = await setup({ players });
  assert.deepEqual(music(env, BUREAU), {
    playback: MUSIC_PLAYBACK_STATE.PLAYING,
    title: 'Fire Inside',
    artist: 'Gemini',
    album: 'Fire Inside',
    // An Arylic firmware without getMetaInfo: no artwork (UPnP only).
    artwork: '',
    duration: 281,
    position: 3,
    // loop 3: shuffle without repeat.
    shuffle: 1,
    repeat: REPEAT.OFF,
    mute: 0,
    volume: 6,
  });
  const before = env.gladys.fake.states.length;
  players[BUREAU].set(ARYLIC['getPlayerStatusEx-spotify-paused']);
  await poll(env, BUREAU);
  const sent = env.gladys.fake.states.slice(before).map((s) => s.device_feature_external_id);
  // A pause is the state and the position, nothing else.
  assert.deepEqual(sent.sort(), [env.idOf(BUREAU, 'playback-state'), env.idOf(BUREAU, 'position')]);
  assert.equal(music(env, BUREAU).playback, MUSIC_PLAYBACK_STATE.PAUSED);
  assert.equal(music(env, BUREAU).position, 7);
  // "unknown command" once: getMetaInfo is not asked again on this firmware.
  await poll(env, BUREAU);
  assert.equal(players[BUREAU].received.filter((c) => c === 'getMetaInfo').length, 1);
});

test('real answers: a WiiM on USB, then on a web radio with "unknow" placeholders', async () => {
  const players = defaultPlayers();
  players[SALON].set(WIIM['getPlayerStatusEx-usb']);
  players[SALON].answers.getMetaInfo = { metaData: { albumArtURI: 'unknow' } };
  const env = await setup({ players });
  const state = music(env, SALON);
  assert.equal(state.title, 'Track 02 Guitars Spanish Dances Excerpts');
  assert.equal(state.artist, 'Various Artists');
  assert.equal(state.album, 'Philharmonic Audio 2023 Demo CD');
  assert.equal(state.duration, 89);
  assert.equal(state.position, 5);
  assert.equal(state.artwork, '');
  assert.equal(state.shuffle, 0);
  assert.equal(state.repeat, REPEAT.OFF);

  // A web radio: titles from getMetaInfo only, no length, so no position.
  players[SALON].set(WIIM.getPlayerStatusEx);
  players[SALON].answers.getMetaInfo = WIIM['getMetaInfo-radio'];
  await poll(env, SALON);
  assert.equal(music(env, SALON).title, 'RAI Radio 2');
  assert.equal(music(env, SALON).artist, '');
  assert.equal(music(env, SALON).album, '');
  assert.equal(music(env, SALON).duration, 0);
  assert.equal(music(env, SALON).position, 0);
});

test('stopped: IDLE, and the texts the player empties are emptied', async () => {
  const env = await setup();
  // ArtSound, real answer: stopped, nothing loaded.
  const zone = music(env, ZONE);
  assert.equal(zone.playback, MUSIC_PLAYBACK_STATE.IDLE);
  assert.equal(zone.title, '');
  assert.equal(zone.artwork, '');
  // Qobuz Connect reports "none" (mjcumming/wiim#222): IDLE, titles kept.
  env.players[SALON].set(WIIM['getPlayerStatusEx-qobuz']);
  await poll(env, SALON);
  assert.equal(music(env, SALON).playback, MUSIC_PLAYBACK_STATE.IDLE);
  assert.equal(music(env, SALON).title, 'Were You Saying Something?');
  // Loading is BUFFERING.
  env.players[SALON].set({ status: 'load' });
  await poll(env, SALON);
  assert.equal(music(env, SALON).playback, MUSIC_PLAYBACK_STATE.BUFFERING);
});

test('the artwork: a key, the bytes served small enough, LAN hosts in self-signed HTTPS', async () => {
  // A Plex cover asked at 1000 px: too big for the core, made smaller here.
  const big = jpeg.encode(
    {
      width: 1000,
      height: 1000,
      data: Buffer.from(Array.from({ length: 4_000_000 }, (_, i) => (i * 7919) % 251)),
    },
    95,
  ).data;
  assert.ok(big.length > 300 * 1024);
  const plexUrl = WIIM['getMetaInfo-plex'].metaData.albumArtURI;
  const airplayUrl = 'https://192.0.2.10/data/AirplayArtWorkData.jpeg';
  const network = artworkNetwork({
    [plexUrl]: { status: 200, body: big },
    [airplayUrl]: { status: 200, body: COVER },
  });
  const players = defaultPlayers();
  players[SALON].set(WIIM['getPlayerStatusEx-usb']);
  players[SALON].answers.getMetaInfo = WIIM['getMetaInfo-plex'];
  const env = await setup({ players, artworkGet: network.get });
  const key = music(env, SALON).artwork;
  assert.match(key, /^art-[0-9a-f]{12}$/);
  assert.equal(key, env.gladys.artworkKey(plexUrl));
  const ack = await env.gladys.fake.musicGetArtwork(key);
  assert.equal(ack.success, true, ack.error);
  const image = Buffer.from(ack.data.image, 'base64');
  assert.ok(image.length <= 300 * 1024, `${image.length} bytes`);
  const { width } = jpeg.decode(image, { useTArray: true });
  assert.ok(width <= 400);
  // Served from the cache the second time.
  await env.gladys.fake.musicGetArtwork(key);
  assert.equal(network.asked.length, 1);
  // 192.0.2.40 stands for the LAN address of the real issue (192.168.1.107):
  // not a private range, not a player, so its certificate is checked here.
  assert.equal(network.asked[0].insecure, false);

  // AirPlay: the cover is on the player itself, self-signed HTTPS (home-assistant/core#187893).
  players[SALON].answers.getMetaInfo = WIIM['getMetaInfo-airplay'];
  players[SALON].set({ mode: '1', Title: '', Artist: '', Album: '' });
  await poll(env, SALON);
  assert.equal(music(env, SALON).title, 'So What');
  const airplay = await env.gladys.fake.musicGetArtwork(music(env, SALON).artwork);
  assert.equal(airplay.success, true, airplay.error);
  assert.deepEqual(Buffer.from(airplay.data.image, 'base64'), COVER);
  assert.equal(network.asked.at(-1).insecure, true, 'the player itself: self-signed accepted');

  // Unknown key, or a cover that is not there: an error, not a crash.
  assert.equal((await env.gladys.fake.musicGetArtwork('art-000000000000')).success, false);
});

test('artwork downloads: redirects followed, Internet certificates checked', async () => {
  assert.equal(isLanHost('192.168.1.107'), true);
  assert.equal(isLanHost('172.20.0.3'), true);
  assert.equal(isLanHost('wiim.local'), true);
  assert.equal(isLanHost('i.scdn.co'), false);
  assert.equal(isLanHost('172.32.0.1'), false);
  const network = artworkNetwork({
    'https://cdn.example/a.jpg': { status: 302, location: '/b.jpg', body: Buffer.alloc(0) },
    'https://cdn.example/b.jpg': { status: 200, body: COVER },
  });
  assert.deepEqual(await downloadArtwork('https://cdn.example/a.jpg', { get: network.get }), COVER);
  assert.deepEqual(
    network.asked.map((a) => a.insecure),
    [false, false],
  );
  await assert.rejects(
    downloadArtwork('https://cdn.example/none.jpg', { get: network.get }),
    /404/,
  );
  await assert.rejects(downloadArtwork('ftp://cdn.example/a.jpg', { get: network.get }), /http/);
});

test('playback_state, position, mute: written, then confirmed by the player', async () => {
  const players = defaultPlayers();
  players[SALON].set(WIIM['getPlayerStatusEx-usb']);
  const env = await setup({ players });
  const salon = players[SALON];
  for (const [value, order, status] of [
    [0, 'setPlayerCmd:pause', 'pause'],
    [1, 'setPlayerCmd:resume', 'play'],
    [2, 'setPlayerCmd:stop', 'stop'],
  ]) {
    const ack = await command(env, SALON, 'playback-state', value);
    assert.deepEqual(ack, { success: true });
    assert.equal(salon.orders.at(-1), order);
    assert.equal(salon.player.status, status);
  }
  assert.equal((await command(env, SALON, 'playback-state', 3)).success, false);

  salon.set({ status: 'play' });
  await poll(env, SALON);
  assert.deepEqual(await command(env, SALON, 'position', 60), { success: true });
  assert.equal(salon.orders.at(-1), 'setPlayerCmd:seek:60');
  // Beyond the end: the last second of the track.
  await command(env, SALON, 'position', 5000);
  assert.equal(salon.orders.at(-1), 'setPlayerCmd:seek:89');
  await poll(env, SALON);
  assert.equal(music(env, SALON).position, 89);

  await command(env, SALON, 'mute', 1);
  await poll(env, SALON);
  assert.equal(music(env, SALON).mute, 1);

  // A live stream has no position to move to.
  salon.set({ totlen: '0' });
  await poll(env, SALON);
  const live = await command(env, SALON, 'position', 10);
  assert.match(live.error, /n'a pas de position/);
  assert.equal(salon.orders.at(-1), 'setPlayerCmd:mute:1');
});

test('shuffle and repeat: the loop table each firmware writes, checked by reading back', async () => {
  // The values every firmware reports.
  assert.deepEqual(decodeLoop('0'), { shuffle: false, repeat: REPEAT.ALL });
  assert.deepEqual(decodeLoop('1'), { shuffle: false, repeat: REPEAT.ONE });
  assert.deepEqual(decodeLoop('2'), { shuffle: true, repeat: REPEAT.ALL });
  assert.deepEqual(decodeLoop('3'), { shuffle: true, repeat: REPEAT.OFF });
  assert.deepEqual(decodeLoop('4'), { shuffle: false, repeat: REPEAT.OFF });
  assert.deepEqual(decodeLoop('5'), { shuffle: true, repeat: REPEAT.ONE });
  assert.deepEqual(decodeLoop('5', { wiim: true, source: 'spotify' }), {
    shuffle: false,
    repeat: REPEAT.ONE,
  });
  assert.deepEqual(decodeLoop('-1'), { shuffle: false, repeat: REPEAT.OFF });
  assert.equal(decodeLoop(''), null);
  assert.equal(decodeLoop('9'), null);
  assert.deepEqual(loopModesFor(false, REPEAT.ALL), [0, -1]);
  assert.deepEqual(loopModesFor(true, REPEAT.OFF), [3]);

  const players = {
    ...defaultPlayers(),
    [SALON]: new FakePlayer('wiim-pro', { loopTable: 'legacy' }),
  };
  const env = await setup({ players });
  // A firmware that writes what it reports (Arylic, WiiM Ultra): one order.
  const bureau = players[BUREAU];
  bureau.set(ARYLIC['getPlayerStatusEx-spotify']);
  await poll(env, BUREAU);
  assert.deepEqual(await command(env, BUREAU, 'repeat', REPEAT.ALL), { success: true });
  assert.deepEqual(bureau.orders.slice(-1), ['setPlayerCmd:loopmode:2']);
  assert.deepEqual(await command(env, BUREAU, 'shuffle', 0), { success: true });
  assert.equal(bureau.orders.at(-1), 'setPlayerCmd:loopmode:0');
  await poll(env, BUREAU);
  assert.equal(music(env, BUREAU).shuffle, 0);
  assert.equal(music(env, BUREAU).repeat, REPEAT.ALL);

  // A firmware on the older WiiM table: the second value works, and is kept.
  const salon = players[SALON];
  assert.deepEqual(await command(env, SALON, 'repeat', REPEAT.ALL), { success: true });
  assert.deepEqual(salon.orders.slice(-2), ['setPlayerCmd:loopmode:0', 'setPlayerCmd:loopmode:-1']);
  assert.equal(salon.player.loop, '0');
  await command(env, SALON, 'repeat', REPEAT.OFF);
  await command(env, SALON, 'repeat', REPEAT.ALL);
  assert.equal(salon.orders.at(-1), 'setPlayerCmd:loopmode:-1', 'the value that worked first');

  // A source that keeps its own modes: an error, the player's state stays.
  const cuisine = new FakePlayer('wiim-amp', { loopTable: 'source' });
  const other = await setup({ players: { ...defaultPlayers(), [CUISINE]: cuisine } });
  const refused = await command(other, CUISINE, 'shuffle', 1);
  assert.match(refused.error, /source en cours/);
  assert.equal(refused.success, false);
});

test('the presets are the catalog: named ones on a WiiM, numbered elsewhere', async () => {
  const env = await setup();
  const salon = await env.gladys.fake.musicBrowse(env.deviceOf(SALON));
  assert.equal(salon.success, true, salon.error);
  const { items, total } = salon.data;
  assert.equal(total, 3);
  assert.deepEqual(validateMediaItems(items), []);
  assert.deepEqual(
    items.map((item) => [item.id, item.type, item.title, item.playable, item.browsable]),
    [
      ['preset:1', 'radio', 'FIP', true, false],
      ['preset:2', 'radio', 'Radio Paradise', true, false],
      ['preset:3', 'playlist', 'Discover Weekly', true, false],
    ],
  );
  assert.equal(items[0].artwork_key, env.gladys.artworkKey('https://example.invalid/fip.png'));
  const bureau = await env.gladys.fake.musicBrowse(env.deviceOf(BUREAU));
  assert.equal(bureau.data.total, 10, 'preset_key of its getStatusEx');
  assert.equal(bureau.data.items[0].title, 'Préréglage 1');
  assert.deepEqual(
    (await env.gladys.fake.musicBrowse(env.deviceOf(SALON), { parentId: 'preset:1' })).data,
    { items: [], total: 0 },
  );
  // Playing one: the preset key.
  const play = await env.gladys.fake.musicPlay(env.deviceOf(SALON), items[1]);
  assert.equal(play.success, true, play.error);
  assert.equal(env.players[SALON].orders.at(-1), 'MCUKeyShortClick:2');
  const wrong = await env.gladys.fake.musicPlay(env.deviceOf(SALON), {
    id: 'spotify:track:1',
    type: 'track',
    title: 'x',
  });
  assert.equal(wrong.success, false);
});

test('a 1.0 player: "Update" turns its texts and mute into music features, same ids', async () => {
  const env = await setup();
  const probe = buildDevice(
    env.gladys,
    env.hub.players.get(env.players[SALON].statusEx.uuid).info,
    {
      language: 'fr',
    },
  );
  const ids = probe.features.map((f) => f.external_id);
  for (const key of [FEATURES.TITLE, FEATURES.ARTIST, FEATURES.ALBUM, FEATURES.MUTE]) {
    // Same id as 1.0: the core updates the category and type in place.
    assert.ok(ids.includes(env.idOf(SALON, key)), key);
  }
  // A 1.0 device (without the new features): published anyway, ignored by
  // Gladys until the update, then everything again.
  const old = {
    ...env.deviceOf(SALON),
    features: env
      .deviceOf(SALON)
      .features.filter((f) => !/:(artwork|position)$/.test(f.external_id)),
  };
  await env.gladys.fake.deviceUpdated(old);
  assert.equal(music(env, SALON).title, 'Clair de lune');
});
