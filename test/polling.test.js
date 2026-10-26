// -----------------------------------------------------------------------------
// Discovery, the container's own polling (GladysAssistant/Gladys#3198: the
// core does not poll reliably), the states published, and quiet logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIMINGS } from '../src/hub.js';
import { hex } from './helpers/fakePlayers.js';
import {
  BUREAU,
  CUISINE,
  SALON,
  TV,
  UUIDS,
  ZONE,
  captureLogs,
  defaultPlayers,
  setup,
  until,
} from './helpers/setup.js';

test('players are found by mDNS, SSDP, the configuration and their group leader', async () => {
  const players = defaultPlayers();
  // The follower does not answer SSDP: its leader lists it.
  const scanResults = {
    mdns: [{ name: 'x', host: 'x', addresses: [SALON], port: 1, txt: [] }],
    ssdp: [{ source_ip: TV, source_port: 1, headers: '' }],
  };
  const { gladys, hub, network } = await setup({ players, scanResults, create: [] });
  const names = gladys.fake.discoveredDevices.map((device) => device.name).sort();
  assert.deepEqual(names, ['Bureau', 'Cuisine', 'Salon']);
  assert.deepEqual(
    gladys.fake.scans.map((scan) => scan.type),
    ['mdns', 'ssdp'],
  );
  // The TV was asked once; a second search does not ask it again.
  const asked = () => network.requests.filter((url) => url.includes(TV)).length;
  const first = asked();
  assert.ok(first > 0);
  await hub.discover();
  assert.equal(asked(), first);
  // Nothing added to Gladys: nothing polled, nothing published.
  assert.equal(gladys.fake.states.length, 0);
});

test('without mediated discovery, the configured addresses are still asked', async (t) => {
  const lines = captureLogs(t);
  const { gladys, hub } = await setup({
    create: [],
    prepare: (client) =>
      t.mock.method(client, 'scanNetwork', async () => {
        throw new Error('403');
      }),
  });
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['Bureau'],
  );
  await hub.discover();
  const warnings = lines.filter((line) => line.includes('[WARN]'));
  assert.equal(warnings.length, 1, 'said once, not at every search');
  assert.match(warnings[0], /discovery through Gladys is unavailable/);
});

test('the states of the added players are published, titles decoded', async () => {
  const { gladys, idOf } = await setup();
  const last = (ip, key) => gladys.fake.lastState(idOf(ip, key));
  // WiiM Pro: a web radio whose titles only getMetaInfo gives, leading a group.
  assert.equal(last(SALON, 'playback-state'), 1);
  assert.equal(last(SALON, 'volume'), 35);
  assert.equal(last(SALON, 'title'), 'Clair de lune');
  assert.equal(last(SALON, 'artist'), 'Claude Debussy');
  assert.equal(last(SALON, 'album'), 'FIP');
  assert.equal(last(SALON, 'source'), 'wifi');
  assert.equal(last(SALON, 'equalizer'), 'off');
  assert.equal(last(SALON, 'group'), 'Maître de : Cuisine');
  // WiiM Amp following it: no source, titles explicitly empty (music/title).
  assert.equal(last(CUISINE, 'group'), 'Suit : Salon');
  assert.equal(last(CUISINE, 'source'), undefined);
  assert.equal(last(CUISINE, 'title'), '');
  // Arylic on an older firmware: getPlayerStatus, hex titles, line in.
  assert.equal(last(BUREAU, 'title'), 'Line In');
  assert.equal(last(BUREAU, 'source'), 'line-in');
  assert.equal(last(BUREAU, 'group'), 'Non groupé');
  // ArtSound (real answers): stopped (IDLE since 1.1.0, 0 is a pause), volume 80.
  assert.equal(last(ZONE, 'playback-state'), 2);
  assert.equal(last(ZONE, 'volume'), 80);
  // No equalizer feature on a non-WiiM player: no state either.
  assert.equal(last(BUREAU, 'equalizer'), undefined);
});

test('the container refreshes the states by itself, without onPoll', async (t) => {
  const timings = { tick: 5, playing: 20, idle: 40, followUp: 10, soon: 5 };
  const { gladys, hub, players, idOf } = await setup({ timers: true, timings, realTime: true });
  t.after(() => hub.stop());
  const onPoll = t.mock.method(hub, 'pollFromCore');
  players[BUREAU].set({ Title: hex('So What'), mode: '10' });
  await until(() => gladys.fake.lastState(idOf(BUREAU, 'title')) === 'So What');
  assert.equal(gladys.fake.lastState(idOf(BUREAU, 'source')), 'wifi');
  assert.equal(onPoll.mock.callCount(), 0);
});

test('5 s while playing, 30 s otherwise, a minute while unreachable', async () => {
  const { hub, players, clock } = await setup();
  const salon = hub.players.get(UUIDS.salon);
  const zone = hub.players.get(UUIDS.zone);
  assert.equal(salon.nextPollAt - clock.now, TIMINGS.playing);
  assert.equal(TIMINGS.playing, 5000);
  assert.equal(zone.nextPollAt - clock.now, TIMINGS.idle);
  assert.equal(TIMINGS.idle, 30000);

  // Only the due players are asked.
  const before = players[ZONE].received.length;
  clock.now += 5000;
  await hub.pollDue();
  assert.equal(players[ZONE].received.length, before);

  players[ZONE].online = false;
  clock.now += 30000;
  await hub.pollDue();
  clock.now += 30000;
  await hub.pollDue();
  assert.equal(zone.lost, true);
  assert.equal(zone.nextPollAt - clock.now, TIMINGS.lost);
  assert.equal(TIMINGS.lost, 60000);
});

test('only changes are published, with a heartbeat under 12 hours', async (t) => {
  const { gladys, hub, clock } = await setup();
  const publish = t.mock.method(gladys, 'publishChangedStates');
  const count = gladys.fake.states.length;
  clock.now += 60000;
  await hub.pollDue();
  assert.ok(publish.mock.callCount() > 0);
  for (const call of publish.mock.calls) {
    const { heartbeat } = call.arguments[1];
    assert.ok(heartbeat > 0 && heartbeat <= 12 * 60 * 60 * 1000, `heartbeat ${heartbeat}`);
  }
  assert.equal(gladys.fake.states.length, count, 'nothing changed, nothing sent');
});

test('a normal cycle writes nothing at info level', async (t) => {
  const { hub, clock } = await setup();
  const previous = process.env.LOG_LEVEL;
  delete process.env.LOG_LEVEL;
  t.after(() => {
    if (previous !== undefined) process.env.LOG_LEVEL = previous;
  });
  const lines = captureLogs(t);
  for (let i = 0; i < 5; i += 1) {
    clock.now += 30000;
    await hub.pollDue();
  }
  await hub.discover();
  assert.deepEqual(lines, []);
});

test('a lost player is said once, and once when it is back', async (t) => {
  const { hub, players, clock } = await setup();
  const lines = captureLogs(t);
  players[ZONE].online = false;
  for (let i = 0; i < 6; i += 1) {
    clock.now += 60000;
    await hub.pollDue();
  }
  players[ZONE].online = true;
  for (let i = 0; i < 2; i += 1) {
    clock.now += 60000;
    await hub.pollDue();
  }
  const infos = lines.filter((line) => line.includes('[INFO]') || line.includes('[WARN]'));
  assert.equal(infos.length, 2, infos.join('\n'));
  assert.match(infos[0], /Smart Zone 1_54B9: unreachable at 192\.0\.2\.21/);
  assert.match(infos[1], /Smart Zone 1_54B9: reachable again/);
});

test('a player that changed address is found again by its uuid', async (t) => {
  const players = defaultPlayers();
  const { gladys, hub, clock, idOf } = await setup({ players });
  const lines = captureLogs(t);
  // DHCP gave the ArtSound another address, which SSDP now answers.
  const moved = '192.0.2.22';
  players[moved] = players[ZONE];
  players[moved].statusEx.eth2 = moved;
  delete players[ZONE];
  gladys.fake.scanResults.ssdp = [{ source_ip: moved, source_port: 1, headers: '' }];
  for (let i = 0; i < 3; i += 1) {
    clock.now += TIMINGS.rediscover;
    await hub.pollDue();
    await hub.discovering;
  }
  const zone = hub.players.get(UUIDS.zone);
  assert.equal(zone.address, moved);
  assert.ok(lines.some((line) => line.includes(`now at ${moved}`)));
  const device = gladys.fake.discoveredDevices.find(
    (candidate) => candidate.external_id === idOf(moved),
  );
  assert.equal(device.params.find((param) => param.name === 'IP_ADDRESS').value, moved);
});

test('a player added to Gladys gets its states at once, and the widget a refresh', async () => {
  const { gladys, idOf } = await setup({ create: [] });
  assert.equal(gladys.fake.states.length, 0);
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === idOf(SALON));
  await gladys.fake.deviceCreated(device);
  assert.equal(gladys.fake.lastState(idOf(SALON, 'title')), 'Clair de lune');
  assert.ok(gladys.fake.widgetRefreshes.includes('player'));
});

test('the players added before a restart are polled at the address Gladys kept', async () => {
  const first = await setup();
  const devices = first.gladys.devices;
  const { createFakeGladys } = await import('@gladysassistant/integration-sdk/testing');
  const { registerHandlers } = await import('../src/app.js');
  const { fakeNetwork } = await import('./helpers/fakePlayers.js');
  const players = defaultPlayers();
  const network = fakeNetwork(players);
  // No discovery at all this time: only what Gladys kept.
  const gladys = createFakeGladys({ devices, config: {}, scanResults: {} });
  registerHandlers(gladys, { get: network.get, timers: false });
  await gladys.connect();
  const ids = gladys.externalIds('player', UUIDS.cuisine);
  assert.equal(gladys.fake.lastState(ids.feature('volume')), 30);
});
