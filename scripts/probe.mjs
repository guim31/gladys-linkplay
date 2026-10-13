#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Read-only probe of real LinkPlay players, with the integration's own client.
//
//   node scripts/probe.mjs 192.168.1.30 [192.168.1.31 ...] [--raw]
//
// For each address: how the player answers (HTTPS or HTTP), what the
// integration reads (model, inputs, presets, playback, group, equalizer), and
// which optional commands the firmware knows. Only status commands are sent:
// nothing plays, nothing changes on the player.
//
// Nothing sensitive is printed: MAC addresses, Wi-Fi names, uuids and LAN
// addresses of the answers are masked. `--raw` adds the answers themselves,
// masked the same way, ready to become test fixtures.
// -----------------------------------------------------------------------------

import { LinkPlayClient, parseAddress } from '../src/linkplay/client.js';
import {
  parseDeviceStatus,
  parseEqualizerList,
  parseFollowers,
  parseMetaInfo,
  parsePlayerStatus,
  parsePresetInfo,
} from '../src/linkplay/status.js';
import { displayModel } from '../src/linkplay/models.js';

const READ_ONLY = [
  'getStatusEx',
  'getPlayerStatusEx',
  'getPlayerStatus',
  'getMetaInfo',
  'multiroom:getSlaveList',
  'getPresetInfo',
  'EQGetList',
  'EQGetStat',
];

const SENSITIVE_KEY =
  /mac|ssid|bssid|uuid|^eth\d|^apcli|^ra0$|^ip$|essid|^wlan|^auth$|^encry$|^date$|^time$|token|password|psk/i;

/** Mask the identifiers of the network and of the device, keep the rest. */
function mask(value, key = '') {
  if (Array.isArray(value)) {
    return value.map((item) => mask(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mask(v, k)]));
  }
  if (typeof value === 'string' && SENSITIVE_KEY.test(key) && value !== '' && value !== '0') {
    return '<masked>';
  }
  return value;
}

async function probe(input, raw) {
  console.log(`\n=== ${input}`);
  let client;
  try {
    client = new LinkPlayClient(parseAddress(input), { timeoutMs: 5000 });
  } catch (err) {
    console.log(`  invalid address: ${err.message}`);
    return;
  }
  const answers = {};
  const support = {};
  for (const command of READ_ONLY) {
    try {
      const text = await client.command(command);
      try {
        answers[command] = JSON.parse(text);
        support[command] = 'json';
      } catch {
        support[command] = `text: ${text.slice(0, 40)}`;
      }
    } catch (err) {
      support[command] = err.code ?? err.message;
    }
  }
  if (!answers.getStatusEx) {
    console.log(`  no LinkPlay answer (${support.getStatusEx})`);
    return;
  }
  console.log(`  answers on: ${client.origin.replace(client.hostname, '<address>')}`);
  try {
    const info = parseDeviceStatus(answers.getStatusEx);
    console.log(
      `  model: ${displayModel(info)} (project ${info.project}), firmware ${info.firmware}`,
    );
    console.log(`  name: ${info.name}`);
    console.log(`  inputs: ${info.inputs.join(', ')}; presets: ${info.presetCount}`);
  } catch (err) {
    console.log(`  getStatusEx not understood: ${err.message}`);
  }
  const player = answers.getPlayerStatusEx ?? answers.getPlayerStatus;
  if (player) {
    try {
      const status = parsePlayerStatus(player);
      console.log(
        `  playback: ${status.playback}, source ${status.source} (input ${status.input}), volume ${status.volume}, muted ${status.muted}`,
      );
      console.log(`  titles: "${status.title}" / "${status.artist}" / "${status.album}"`);
    } catch (err) {
      console.log(`  player status not understood: ${err.message}`);
    }
  }
  if (answers.getMetaInfo) {
    console.log(`  getMetaInfo: ${JSON.stringify(parseMetaInfo(answers.getMetaInfo))}`);
  }
  if (answers['multiroom:getSlaveList']) {
    const followers = parseFollowers(answers['multiroom:getSlaveList']);
    console.log(`  followers: ${followers.map((f) => f.name).join(', ') || 'none'}`);
  }
  if (answers.getPresetInfo) {
    const names = [...parsePresetInfo(answers.getPresetInfo)];
    console.log(
      `  preset names: ${names.map(([n, name]) => `${n}. ${name}`).join(', ') || 'none'}`,
    );
  }
  if (answers.EQGetList) {
    console.log(`  equalizers: ${parseEqualizerList(answers.EQGetList).join(', ')}`);
  }
  console.log('  commands:');
  for (const [command, result] of Object.entries(support)) {
    console.log(`    ${command}: ${result}`);
  }
  if (raw) {
    console.log('  raw answers (masked):');
    console.log(JSON.stringify(mask(answers), null, 2).replace(/^/gm, '    '));
  }
}

const args = process.argv.slice(2);
const raw = args.includes('--raw');
const addresses = args.filter((arg) => arg !== '--raw');
if (addresses.length === 0) {
  console.log('usage: node scripts/probe.mjs <address> [<address> ...] [--raw]');
  process.exit(2);
}
for (const address of addresses) {
  await probe(address, raw);
}
