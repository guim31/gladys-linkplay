// -----------------------------------------------------------------------------
// The orders of Gladys on the features (onSetValue), the announcement of the
// core's "Talk on a speaker", and the "source changed" scene trigger.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIMINGS } from '../src/hub.js';
import { BUREAU, SALON, ZONE, captureLogs, setup } from './helpers/setup.js';

async function command(env, ip, key, value) {
  return env.gladys.fake.setValue(
    env.deviceOf(ip),
    env.deviceOf(ip).features.find((feature) => feature.external_id === env.idOf(ip, key)),
    value,
  );
}

test('every control feature sends its LinkPlay command', async () => {
  const env = await setup();
  const salon = env.players[SALON];
  const cases = [
    ['play', 1, 'setPlayerCmd:resume'],
    ['pause', 1, 'setPlayerCmd:pause'],
    ['stop', 1, 'setPlayerCmd:stop'],
    ['previous', 1, 'setPlayerCmd:prev'],
    ['next', 1, 'setPlayerCmd:next'],
    ['volume', 42, 'setPlayerCmd:vol:42'],
    ['mute', 1, 'setPlayerCmd:mute:1'],
    ['source', 'optical', 'setPlayerCmd:switchmode:optical'],
    ['equalizer', 'R&B', 'EQLoad:R&B'],
    ['equalizer', 'off', 'EQOff'],
  ];
  for (const [key, value, expected] of cases) {
    const ack = await command(env, SALON, key, value);
    assert.deepEqual(ack, { success: true }, `${key}: ${ack.error}`);
    assert.equal(salon.orders.at(-1), expected, key);
  }
  // Mute toggles: muted now, so the next press unmutes.
  await env.hub.pollPlayer(env.hub.players.get(salon.statusEx.uuid));
  await command(env, SALON, 'mute', 1);
  assert.equal(salon.orders.at(-1), 'setPlayerCmd:mute:0');
});

test('the effect of an order shows quickly, then the pace slows down again', async () => {
  const env = await setup();
  const player = env.hub.players.get(env.players[ZONE].statusEx.uuid);
  await command(env, ZONE, 'volume', 20);
  assert.equal(player.nextPollAt - env.clock.now, TIMINGS.soon);
  env.clock.now += TIMINGS.soon;
  await env.hub.pollDue();
  assert.equal(env.gladys.fake.lastState(env.idOf(ZONE, 'volume')), 20);
  assert.equal(player.nextPollAt - env.clock.now, TIMINGS.followUp);
  env.clock.now += TIMINGS.followUp;
  await env.hub.pollDue();
  assert.equal(player.nextPollAt - env.clock.now, TIMINGS.idle);
});

test('wrong values are refused with a message in the configured language', async () => {
  const env = await setup();
  const volume = await command(env, SALON, 'volume', 150);
  assert.equal(volume.success, false);
  assert.match(volume.error, /Le volume va de 0 à 100/);
  const source = await command(env, BUREAU, 'source', 'hdmi');
  assert.match(source.error, /Bureau n'a pas cette source/);
  const notification = await command(env, SALON, 'notification', 'ftp://nope');
  assert.match(notification.error, /http/);
  env.players[SALON].online = false;
  const down = await command(env, SALON, 'pause', 1);
  assert.match(down.error, /Salon ne répond pas/);
  assert.equal(
    env.players[BUREAU].orders.length,
    0,
    'nothing sent to the player for a refused value',
  );
});

test('an announcement plays over the music with playPromptUrl (WiiM)', async (t) => {
  const env = await setup();
  const lines = captureLogs(t);
  const url = 'https://tts.example/v1/tts?token=SECRET-TOKEN&text=Bonjour';
  const ack = await command(env, SALON, 'notification', url);
  assert.equal(ack.success, true);
  assert.equal(env.players[SALON].orders.at(-1), `playPromptUrl:${url}`);
  assert.equal(env.hub.players.get(env.players[SALON].statusEx.uuid).pendingRestore, undefined);
  // The token of the text-to-speech URL never reaches the logs.
  assert.ok(lines.length > 0);
  assert.ok(!lines.some((line) => line.includes('SECRET-TOKEN')), lines.join('\n'));
  assert.ok(lines.some((line) => line.includes('announcement https://tts.example/v1/tts')));
});

test('without playPromptUrl, the URL plays and the line input comes back after it', async () => {
  const env = await setup();
  const bureau = env.players[BUREAU];
  const player = env.hub.players.get(bureau.statusEx.uuid);
  const url = 'https://tts.example/announce.mp3';
  const ack = await command(env, BUREAU, 'notification', url);
  assert.equal(ack.success, true);
  assert.deepEqual(bureau.orders.slice(-2), [`playPromptUrl:${url}`, `setPlayerCmd:play:${url}`]);
  assert.equal(player.pendingRestore.input, 'line-in');

  // The announcement plays, then ends.
  env.clock.now += TIMINGS.soon;
  await env.hub.pollDue();
  assert.equal(player.pendingRestore.started, true);
  bureau.set({ status: 'stop' });
  env.clock.now += TIMINGS.restore;
  await env.hub.pollDue();
  assert.equal(bureau.orders.at(-1), 'setPlayerCmd:switchmode:line-in');
  assert.equal(player.pendingRestore, null);
  // playPromptUrl is not asked again on this firmware.
  await command(env, BUREAU, 'notification', url);
  assert.equal(bureau.orders.filter((order) => order.startsWith('playPromptUrl')).length, 1);
  // No scene trigger for the detour through the network.
  assert.deepEqual(env.gladys.fake.sceneEvents, []);
});

test('a source chosen elsewhere fires "source changed"; one chosen in Gladys does not', async () => {
  const env = await setup();
  const zone = env.players[ZONE];
  zone.set({ mode: '43', status: 'play' });
  env.clock.now += TIMINGS.idle;
  await env.hub.pollDue();
  assert.deepEqual(env.gladys.fake.sceneEvents, [
    {
      key: 'source_changed',
      data: {
        device: env.idOf(ZONE),
        player: 'Smart Zone 1_54B9',
        source: 'optical',
        source_name: 'Optique',
        previous_source: 'wifi',
      },
    },
  ]);
  // Ordered through Gladys (no loop through a scene): no event.
  await command(env, ZONE, 'source', 'line-in');
  env.clock.now += TIMINGS.soon;
  await env.hub.pollDue();
  assert.equal(env.gladys.fake.lastState(env.idOf(ZONE, 'source')), 'line-in');
  assert.equal(env.gladys.fake.sceneEvents.length, 1);
});
