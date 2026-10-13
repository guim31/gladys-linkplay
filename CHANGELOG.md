# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-13

### Added

- LinkPlay players in Gladys — WiiM, Arylic, Audio Pro, iEAST, ArtSound and
  other LinkPlay streamers and speakers — controlled 100 % locally through
  their HTTP API (HTTPS or HTTP), without account.
- Automatic discovery through Gladys (mDNS `_linkplay._tcp` and SSDP), the
  followers of a multiroom group through their leader, and player addresses
  in the configuration for another network.
- One device per player: play, pause, stop, previous, next, volume, mute,
  playback state, title, artist and album, source (the inputs of the player),
  WiiM equalizer, multiroom group, and "Talk on a speaker" announcements
  (over the music on a WiiM).
- Scene actions: play a preset, play an address (web radio), group players,
  ungroup a player.
- Scene trigger "LinkPlay source changed" (TV, optical, Bluetooth...).
- The "LinkPlay" dashboard widget: title, source, state, live volume, and
  previous, play / pause, next and presets buttons (Gladys 5.2.0).
- Configuration actions: search for players, test an address.
- Feature names, sources and messages in English, French, German and
  Spanish; documentation in the four languages.

[Unreleased]: https://github.com/guim31/gladys-linkplay/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-linkplay/releases/tag/v1.0.1
