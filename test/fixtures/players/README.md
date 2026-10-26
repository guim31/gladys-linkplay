# LinkPlay answers used by the tests

One folder per player, one file per HTTP API command
(`/httpapi.asp?command=<command>`, `:` written `-` in the file name).

| Folder                    | Origin                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `artsound-smart-zone-4`   | **Real answers** of an ArtSound Smart Zone 4 AMP (Rakoit board), from the tests of the Home Assistant `linkplay` integration (`tests/components/linkplay/fixtures`, Apache-2.0). Anonymized: uuid, MAC addresses and LAN address replaced. |
| `wiim-pro`, `wiim-amp`    | Reconstructed from the public formats (python-linkplay and `wiim` libraries, MIT; WiiM HTTP API): a WiiM Pro leading a group, playing a web radio whose titles only `getMetaInfo` gives, and a WiiM Amp following it.                      |
| `arylic-up2stream-amp-v4` | Reconstructed: an older firmware without `getPlayerStatusEx`, hex-encoded titles, playing its line input, muted.                                                                                                                           |

Playback answers added for the Gladys 5.3 music player (1.1.0), **real
answers quoted in public issues**, addresses replaced:

| File                                                               | Origin                                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `arylic-up2stream-amp-v4/getPlayerStatusEx-spotify{,-paused}.json` | An Arylic Up2Stream playing Spotify, then paused (debug log of home-assistant/core#145917)                                                  |
| `wiim-pro/getPlayerStatusEx-usb.json`                              | A WiiM Ultra playing from USB (mjcumming/pywiim#21)                                                                                         |
| `wiim-pro/getPlayerStatusEx-qobuz.json`                            | A WiiM on Qobuz Connect, status `none` while it plays (mjcumming/wiim#222)                                                                  |
| `wiim-pro/getMetaInfo-plex.json`                                   | A WiiM fed by Plex over DLNA, cover on the Plex server at 1000 px (illianoaoi/Wiim-Dashboard#4)                                             |
| `wiim-pro/getMetaInfo-radio.json`                                  | A web radio, `unknow` placeholders (velbus/python-linkplay#137)                                                                             |
| `wiim-pro/getMetaInfo-airplay.json`                                | Reconstructed around the real AirPlay cover URL, on the player itself in self-signed HTTPS (home-assistant/core#187893, a Muzo Mini on 4.6) |

Addresses are in 192.0.2.0/24 (documentation range), MAC addresses in the
locally administered 02:00:5E range, uuids invented.
