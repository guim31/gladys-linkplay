# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.1.1] - 2026-10-26

### Fixed

- The container no longer crashes at startup: the JPEG encoder used to resize
  large covers (`jpeg-js`) is now installed in the image (it was only a
  development dependency in 1.1.0).

## [1.1.0] - 2026-10-26

### Added

- Gladys 5.3 music player: the Music box of the dashboard shows the artwork
  (WiiM and firmwares that answer `getMetaInfo`; a large cover is made 400 px
  wide in plain JavaScript, a cover on the player or a LAN server in
  self-signed HTTPS is read), the duration and a position you can drag to
  seek, shuffle and repeat (off, all, one), mute and volume. Shuffle and
  repeat are checked by reading the player back: the value that works on its
  firmware is kept.
- The presets of each player in the music panel (named on a WiiM, numbered
  elsewhere), playable from it and from the "Play music on a speaker" scene
  action.

### Changed

- Requires Gladys 5.3.0 and SDK 0.16.0.
- Players added with 1.0 keep working; click **Update** on them in the
  Discover tab to get the new features. Title, artist and album (text) and
  mute (a television button) become their music features under the same ids:
  scenes and dashboards keep working, mute takes 0/1 instead of toggling.
- **Playback state** is now writable (0 pause, 1 play, 2 stop), is **2** when
  the player is stopped (was 0) and 3 while it loads, and is no longer kept in
  the history. A scene on "playback state = 0" no longer fires on a stop.
- Titles are empty (no longer "—") when the source gives none.

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

[Unreleased]: https://github.com/guim31/gladys-linkplay/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/guim31/gladys-linkplay/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/guim31/gladys-linkplay/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/guim31/gladys-linkplay/releases/tag/v1.0.1
