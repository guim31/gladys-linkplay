// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake
// Gladys) and returns the hub, so index.js stays a few lines and the tests
// drive the very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { ACTIONS } from './actions.js';
import { uuidOf } from './devices.js';
import { LinkPlayHub, WIDGET_KEY } from './hub.js';
import { SCENE_ACTIONS } from './scenes.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'linkplay-app' });

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: get (HTTP transport), timers, timings, now
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new LinkPlayHub({
    gladys,
    get: options.get,
    timers: options.timers ?? true,
    timings: options.timings,
    now: options.now,
  });

  gladys.on('connected', async () => {
    hub.setConfig(gladys.config);
    await hub.start();
  });

  gladys.onConfigUpdated(async (config) => {
    const before = JSON.stringify(hub.config);
    hub.setConfig(config);
    if (JSON.stringify(hub.config) !== before) {
      logger.info('Configuration changed: searching the players again');
      await hub.discover();
      await hub.pollDue({ force: true });
    }
  });

  gladys.onScanRequest(async () => {
    await hub.discover();
  });

  // The devices are published without should_poll (src/devices.js): the
  // container polls them itself. A core that polls anyway gets the fallback.
  gladys.onPoll((device) => hub.pollFromCore(device));

  gladys.onSetValue((device, feature, value) => hub.setValue(device, feature, value));

  // A player just added: Gladys dropped the states sent before it existed,
  // and the SDK forgot them. Everything is sent again now.
  const added = async (device) => {
    hub.syncCreated([device]);
    const player = hub.players.get(uuidOf(gladys, device.external_id));
    if (player) {
      await hub.pollPlayer(player);
    }
    try {
      gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (err) {
      logger.debug(`Widget refresh not requested (${err.message})`);
    }
  };
  gladys.onDeviceCreated(added);
  gladys.onDeviceUpdated(added);

  for (const [key, run] of Object.entries(ACTIONS)) {
    gladys.onAction(key, (fields) => run(hub, fields ?? {}));
  }
  for (const [key, run] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => run(hub, fields ?? {}));
  }
  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(hub, request));
    gladys.onWidgetAction(key, (actionKey, params, context) =>
      widget.action(hub, actionKey, params, context ?? {}),
    );
  }

  return hub;
}
