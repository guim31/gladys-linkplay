# LinkPlay (WiiM, Arylic…)

Control your streamers and speakers built on the LinkPlay platform — **WiiM**,
**Arylic**, **Audio Pro**, iEAST, ArtSound and others — from Gladys, **100 %
local**: playback, volume, sources, presets, multiroom groups, announcements.

> This integration is not affiliated with LinkPlay, WiiM, Arylic or Audio Pro.
> **Developed without the hardware: feedback welcome.** It follows the HTTP API
> these players share, and the answers of real players published by the Home
> Assistant project; please report what works and what does not on your model.

## Overview

The integration talks to each player through its local HTTP API
(`/httpapi.asp`), the same on every LinkPlay firmware. It needs no account and
no cloud.

Known players: WiiM Mini, Pro, Pro Plus, Amp, Amp Pro, Amp Ultra, Ultra;
Arylic Up2Stream (Amp, Pro, Mini, Plate Amp), S10+, S50+, S50 Pro, A30, A50,
A50+; Audio Pro C3, C10, A10 (first generation); iEAST AudioCast M5; ArtSound
Smart Zone 4, Smart Hyde; GGMM E2; Medion, August, Triangle and Muzo models.
Other LinkPlay players usually work too, under a generic name.

**LinkPlay or DLNA?** The DLNA integration plays media on any UPnP renderer,
LinkPlay players included. LinkPlay is the complete control of these players:
inputs (TV, optical, Bluetooth...), presets, multiroom groups, WiiM equalizer,
announcements over the music. Pick one of the two for a given player, to avoid
having it twice in Gladys.

## Requirements

- Gladys 5.2.0 or later.
- The players on the network of Gladys, already set up with their app (WiiM
  Home, 4STREAM, Audio Pro...).
- For the automatic discovery, Gladys and the players on the same network
  (mDNS and SSDP do not cross routers). Otherwise, give their addresses.

## Configuration

### Finding the players

Open the **Discover** tab of the integration: the players found by Gladys
(mDNS `_linkplay._tcp` and SSDP) appear there; add the ones you want. A player
that follows a multiroom group is found through its group leader.

### Configuration fields

| Field                          | Use                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Player addresses               | Optional. IP addresses or host names, separated by commas, for players the discovery does not see (another network, VLAN). `http://` or a port can be given when a player needs it. |
| Language of names and messages | Names of the features of the players added from now on (Gladys keeps them once a player is added), names of the sources, messages of commands and scenes. French by default.        |

### Actions

- **Search for players**: searches now, updates the Discover tab, and lists
  what answered, the configured addresses that did not, and the ignored
  entries.
- **Test an address**: asks one address and shows the model, the firmware,
  how it answers (HTTPS or HTTP) and its sources.

## What each player does

Each player is one Gladys device, named as in its app.

### Playback and volume

| Feature        | Type                   | What it does                                                  |
| -------------- | ---------------------- | ------------------------------------------------------------- |
| Play           | music / play           | Resumes the playback                                          |
| Pause          | music / pause          | Pauses                                                        |
| Stop           | television / stop      | Stops (a button in the room card)                             |
| Previous, Next | music / previous, next | Previous or next track                                        |
| Volume         | music / volume (0-100) | Reads and sets the volume                                     |
| Mute           | music / mute           | Mutes or unmutes (a toggle before "Update", see below)        |
| Playback state | music / playback_state | 1 playing, 0 paused, 2 stopped, 3 loading; writable (0, 1, 2) |

The Music widget of the Gladys dashboard uses these features.

### Source and equalizer

- **Source** (a list): the inputs this player has — network (Wi-Fi),
  Bluetooth, line in, optical, coaxial, HDMI / ARC, phono, USB... Choosing one
  switches the player to it. While a player follows a group, it has no source
  of its own.
- **Equalizer** (WiiM only): the equalizer presets of the WiiM (Flat, Rock,
  Jazz...) or "Off". The WiiM API tells whether the equalizer is on, not which
  preset: one chosen in the WiiM Home app shows as unknown until you choose it
  in Gladys.

### Titles and group

- **Title**, **Artist**, **Album**: what plays; empty when the source gives
  nothing (an input, a player following a group).
- **Multiroom group**: "Not grouped", "Leads: Kitchen, Bedroom" or
  "Follows: Living room".

### Talk on a speaker

The **Talk on a speaker** action of the Gladys scenes speaks on the player. On
a WiiM, the announcement plays over the music, which resumes after it. On a
firmware without that command, the announcement replaces the music: if an
input (TV, line in...) was playing, the player switches back to it afterwards;
a network stream (Spotify, a web radio) is not restarted — start it again with
a preset in the next action of the scene. Gladys does not pass the volume of
the action to the integration.

## Gladys 5.3 music player

Since Gladys 5.3, the **Music** box of the dashboard is a real player. For
each LinkPlay player it shows:

- the **artwork** (WiiM and recent firmwares that give it; a large one, from
  AirPlay or a Plex server, is made 400 pixels wide by the integration), the
  title, the artist and the album;
- a **progress bar** you drag to move within the track (not on a radio or an
  input, which have no length);
- play, pause, stop, previous, next, **shuffle**, **repeat** (off, all, one
  track), **mute** and volume;
- the browse button opens the **presets** of the player (named on a WiiM,
  numbered elsewhere): a tap plays one. The **Play music on a speaker** scene
  action offers them too.

Shuffle and repeat follow the source in use: Spotify Connect, AirPlay or Tidal
Connect may keep their own settings, and Gladys then says so. Firmwares do not
all write these modes with the same values: the integration checks the
player's answer and keeps the one that works.

**A player added before version 1.1.0** keeps working as before: open the
**Discover** tab of the integration and click **Update** on the player.
Artwork, duration, position, shuffle and repeat are added; Title, Artist,
Album and Mute become music features under the same ids (scenes and
dashboards kept). **Playback state** changes: it is 2 (no longer 0) when the
player is stopped, and it is no longer kept in the history (Gladys keeps no
history of music features).

## Widget

The **LinkPlay** widget (dashboard → add a box → LinkPlay, then choose the
player) shows the title, the artist and album, the live volume, the source,
the state and the group, and four buttons: **Previous**, **Play / Pause**,
**Next** and **Presets**, which opens the list of presets (with their names on
a WiiM) and plays the chosen one.

## Scene trigger

**LinkPlay source changed**: a player switched to another input. Filters: the
player (empty: any) and the new sources (empty: any). Variables: player,
new source (its name, and its key), previous source (key).

It does not fire for a source chosen from Gladys (a scene could loop on it),
nor during an announcement.

## Scene actions

| Action                      | Fields                                     | Result             |
| --------------------------- | ------------------------------------------ | ------------------ |
| Play a LinkPlay preset      | Player, preset number, volume (optional)   | Preset name (WiiM) |
| Play an address on LinkPlay | Player, http(s) address, volume (optional) | —                  |
| Group LinkPlay players      | Player that joins, group leader            | —                  |
| Ungroup a LinkPlay player   | Player                                     | —                  |

The presets are the ones saved in the app of the player (6 to 12 depending on
the model). Ungrouping a group leader dissolves its whole group.

## Scene examples

- **Movie night**: trigger "LinkPlay source changed", player "Living room",
  source "HDMI ARC" → dim the living room lights.
- **Wake up**: every weekday at 7:00 → "Play a LinkPlay preset" on "Kitchen",
  preset 1, volume 20, then "Group LinkPlay players": "Bathroom" joins
  "Kitchen".
- **Doorbell**: the doorbell rings → "Talk on a speaker" on "Living room":
  "Someone is at the door".
- **Leaving home**: the house is empty → "Ungroup" then stop every player.

## Refresh and network traffic

The integration polls the players added to Gladys by itself: every 5 seconds
while a player plays, every 30 seconds otherwise, every minute while it does
not answer, and right after an order. A poll is one or two requests on the
local network; the group and the equalizer are read every 30 seconds, the
player details every 10 minutes. The players have no quota; nothing leaves
your network.

Only the values that change are sent to Gladys (and every 6 hours anyway, so
that Gladys never shows them as old). The network is searched at start-up, on
**Search for players**, and every 5 minutes while an added player is missing
(a new address after a router restart is found again by itself).

## Troubleshooting

- **A player is not found**: it is on another network, or mDNS / SSDP do not
  reach Gladys. Use **Test an address**, then add its address in the
  configuration.
- **"does not answer"**: check that the player is on and on the network. The
  integration tries HTTPS (port 443, the self-signed certificate of the player
  is accepted), then HTTP (port 80).
- **A source is missing from the list**: the player does not declare it; tell
  us its model.
- **Titles are empty**: the source gives no titles (an input, some services).
- **More details**: set the `LOG_LEVEL` variable to `debug` on the
  integration; the logs never show the address of an announcement whole.

## Limits

- Developed without the hardware: the commands come from the shared LinkPlay
  API and from public answers of real players, not from a test on each model.
- The recent Audio Pro players that only answer on port 4443 with a client
  certificate are not supported yet.
- Preset names come from WiiM players only; elsewhere the presets are numbered.
- No search, queue or music library (the LinkPlay API has none): the DLNA
  integration does that. No artwork on firmwares without `getMetaInfo` (WiiM
  and some recent ones have it).
- A player following a group shows no titles; the volume of a whole group is
  not handled (each player keeps its own).
- The equalizer state is unknown when changed from the WiiM Home app.
