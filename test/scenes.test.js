// -----------------------------------------------------------------------------
// Scene actions: presets, addresses, multiroom groups.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUREAU, CUISINE, SALON, ZONE, setup } from './helpers/setup.js';

test('play a preset, with a volume first, and say its name (WiiM)', async () => {
  const env = await setup();
  const ack = await env.gladys.fake.sceneAction('play_preset', {
    device: env.idOf(SALON),
    preset: 2,
    volume: 25,
  });
  assert.deepEqual(ack, { success: true, data: { outputs: { preset_name: 'Radio Paradise' } } });
  assert.deepEqual(env.players[SALON].orders.slice(-2), [
    'setPlayerCmd:vol:25',
    'MCUKeyShortClick:2',
  ]);
  // No name outside the WiiM API; no volume order without a volume.
  const arylic = await env.gladys.fake.sceneAction('play_preset', {
    device: env.idOf(BUREAU),
    preset: 10,
  });
  assert.deepEqual(arylic, { success: true, data: { outputs: { preset_name: '' } } });
  assert.deepEqual(env.players[BUREAU].orders, ['MCUKeyShortClick:10']);
});

test('a preset beyond what the player has is refused', async () => {
  const env = await setup();
  const ack = await env.gladys.fake.sceneAction('play_preset', {
    device: env.idOf(BUREAU),
    preset: 11,
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /entre 1 et 10/);
  assert.deepEqual(env.players[BUREAU].orders, []);
});

test('play an address: a web radio', async () => {
  const env = await setup();
  const url = 'https://icecast.radiofrance.fr/fip-hifi.aac?id=1&t=2';
  const ack = await env.gladys.fake.sceneAction('play_url', { device: env.idOf(ZONE), url });
  assert.equal(ack.success, true);
  assert.equal(env.players[ZONE].orders.at(-1), `setPlayerCmd:play:${url}`);
  const bad = await env.gladys.fake.sceneAction('play_url', {
    device: env.idOf(ZONE),
    url: 'javascript:alert(1)',
  });
  assert.match(bad.error, /http/);
});

test('an unknown player is a clear error', async () => {
  const env = await setup();
  const ack = await env.gladys.fake.sceneAction('play_url', {
    device: 'ext:test-integration:player:0000000000',
    url: 'https://radio.example/live',
  });
  assert.match(ack.error, /lecteur LinkPlay est inconnu/);
});

test('join a group: the follower is told the IP of the leader', async () => {
  const env = await setup();
  const ack = await env.gladys.fake.sceneAction('join_group', {
    device: env.idOf(ZONE),
    leader: env.idOf(BUREAU),
  });
  assert.equal(ack.success, true);
  assert.equal(
    env.players[ZONE].orders.at(-1),
    'ConnectMasterAp:JoinGroupMaster:eth192.0.2.12:wifi0.0.0.0',
  );
  const self = await env.gladys.fake.sceneAction('join_group', {
    device: env.idOf(ZONE),
    leader: env.idOf(ZONE),
  });
  assert.match(self.error, /propre groupe/);
});

test('leave a group: the leader lets the follower go, or dissolves its group', async () => {
  const env = await setup();
  const follower = await env.gladys.fake.sceneAction('leave_group', {
    device: env.idOf(CUISINE),
  });
  assert.equal(follower.success, true);
  assert.equal(env.players[SALON].orders.at(-1), 'multiroom:SlaveKickout:192.0.2.11');

  const leader = await env.gladys.fake.sceneAction('leave_group', { device: env.idOf(SALON) });
  assert.equal(leader.success, true);
  assert.equal(env.players[SALON].orders.at(-1), 'multiroom:Ungroup');

  // A follower whose leader Gladys does not know leaves by itself.
  env.players[ZONE].set({ mode: '99' });
  await env.hub.pollPlayer(env.hub.players.get(env.players[ZONE].statusEx.uuid));
  await env.gladys.fake.sceneAction('leave_group', { device: env.idOf(ZONE) });
  assert.equal(env.players[ZONE].orders.at(-1), 'multiroom:LeaveGroup');
});
