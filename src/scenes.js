// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+). Keys are frozen once
// published. The fields arrive resolved and validated by the core; a thrown
// error fails the action only, its message goes to the Gladys logs.
// -----------------------------------------------------------------------------

/** Set the volume first when the scene gives one. */
async function withVolume(hub, player, volume) {
  if (volume !== undefined && volume !== null && volume !== '') {
    await hub.setVolume(player, volume);
  }
}

export const SCENE_ACTIONS = {
  /** Play a preset of the player (the presets of its app). */
  play_preset: async (hub, { device, preset, volume }) => {
    const player = hub.playerOf(device);
    await withVolume(hub, player, volume);
    const number = await hub.playPreset(player, preset);
    return { preset_name: hub.presetsOf(player)[number - 1]?.name ?? '' };
  },

  /** Play an address: a web radio, a sound file. */
  play_url: async (hub, { device, url, volume }) => {
    const player = hub.playerOf(device);
    await withVolume(hub, player, volume);
    await hub.playUrl(player, url);
  },

  /** A player joins the multiroom group of another one. */
  join_group: async (hub, { device, leader }) => {
    await hub.joinGroup(hub.playerOf(device), hub.playerOf(leader));
  },

  /** A player leaves its group (a leader dissolves it). */
  leave_group: async (hub, { device }) => {
    await hub.leaveGroup(hub.playerOf(device));
  },
};
