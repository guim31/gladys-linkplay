# LinkPlay for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for the
streamers and speakers built on the **LinkPlay** platform — **WiiM** (Mini,
Pro, Pro Plus, Amp, Amp Pro, Ultra...), **Arylic** (Up2Stream, S50, A50...),
**Audio Pro** (C3, C10, A10), iEAST, ArtSound, GGMM, Medion, August, Triangle,
Muzo — controlled **100 % locally** through their HTTP API.

- Playback, volume, mute, titles, playback state; the Music widget of the
  Gladys dashboard works with them.
- Sources: switch the input (network, Bluetooth, line in, optical, HDMI / ARC,
  phono...) and trigger scenes when it changes (TV on → dim the lights).
- Presets (the ones of the player's app), web radios, multiroom groups (group
  and ungroup from scenes), WiiM equalizer.
- "Talk on a speaker" announcements, over the music on a WiiM.
- A dashboard widget with the title, source, volume and four buttons
  (previous, play / pause, next, presets).
- English, French, German and Spanish.

**Developed without the hardware: feedback welcome.** It follows the HTTP API
these players share and real answers published by the Home Assistant project;
it has not been tried on a real player yet. Please report what works on your
model (and what does not) in the issues.

_This project is not affiliated with LinkPlay, WiiM, Arylic or Audio Pro. The
names are the trademarks of their owners._

## Requirements

- Gladys 5.2.0 or later.
- LinkPlay players on the network of Gladys, already set up with their app.
- No account, no cloud, nothing to install on the players.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and give
   `https://github.com/guim31/gladys-linkplay` (or install **LinkPlay** from
   the store once it is listed).
2. Optional: in **Configuration**, choose the language of the feature names
   and messages before adding players (French by default), and give the
   addresses of the players the discovery cannot see.
3. Open the **Discover** tab: the players of the network are listed. Add the
   ones you want.

The user documentation, in four languages, is in [`docs/`](./docs/en.md) and
linked from the Configuration screen of Gladys.

## How it works

- **Discovery**: the container sits on a Docker bridge, so Gladys scans for
  it (mediated discovery): mDNS `_linkplay._tcp` and SSDP `MediaRenderer`.
  Every SSDP responder is asked `getStatusEx`; the LinkPlay players answer it,
  TVs and other renderers do not. Followers of a group are found through
  their leader, and configured addresses are always asked.
- **API**: `GET /httpapi.asp?command=...`, HTTPS on port 443 first
  (self-signed certificate accepted, recent firmwares), then HTTP on port 80.
- **Polling**: the container polls the players added to Gladys itself — every
  5 s while playing, 30 s otherwise, 1 min while unreachable — and publishes
  only what changed (heartbeat every 6 h). The Gladys scheduler is not relied
  upon (GladysAssistant/Gladys#3198).
- **Announcements**: `playPromptUrl` plays over the music and resumes it
  (WiiM). Without it, the URL is played and the physical input that was
  playing comes back afterwards.

## Limitations

- Developed without the hardware (see above).
- Recent Audio Pro players that only answer on port 4443 with a client
  certificate are not supported yet.
- Preset names come from WiiM players only (`getPresetInfo`); elsewhere the
  presets are numbered.
- No seek, shuffle, repeat or library browsing (the DLNA integration does the
  browsing); no volume for a whole group; no titles on a group follower.
- The WiiM API tells whether the equalizer is on, not which preset: a preset
  chosen in the WiiM Home app shows as unknown.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store . --skip-image-check
```

The tests run against the fake Gladys of the SDK and fake players built from
real and reconstructed answers ([`test/fixtures/players/`](./test/fixtures/players/README.md));
they never touch the network. To check a real player, read-only:

```bash
node scripts/probe.mjs 192.168.1.30 --raw
```

It prints what the integration reads and which commands the firmware knows,
with MAC addresses, Wi-Fi names and uuids masked.

## Releasing

Describe the change under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md),
then run **Actions → Release** (`patch`, `minor` or `major`): the workflow
bumps `package.json` and the manifest `version` / `docker_image`, moves the
changelog section, tags, builds the multi-arch image to `ghcr.io` and
publishes the GitHub Release. A hand-pushed `vX.Y.Z` tag builds the same image
but changes no file: bump the three versions in a commit before tagging.

## Credits

- [python-linkplay](https://github.com/Velleman/python-linkplay) (MIT,
  Velleman Group nv), the library of the Home Assistant `linkplay`
  integration: the meaning of the API fields, the playing modes, the input
  flags and the table of models.
- The [Home Assistant](https://github.com/home-assistant/core) `linkplay`
  integration (Apache-2.0): the real answers of a player used as test
  fixtures.
- The [`wiim`](https://pypi.org/project/wiim/) library (MIT, Linkplay): the
  inputs of the WiiM models.
- [Gladys Assistant](https://github.com/GladysAssistant/Gladys) and its
  [integration SDK](https://github.com/GladysAssistant/integration-sdk-js).

## License

[Apache-2.0](./LICENSE)
