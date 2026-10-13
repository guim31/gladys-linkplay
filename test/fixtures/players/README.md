# LinkPlay answers used by the tests

One folder per player, one file per HTTP API command
(`/httpapi.asp?command=<command>`, `:` written `-` in the file name).

| Folder                    | Origin                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `artsound-smart-zone-4`   | **Real answers** of an ArtSound Smart Zone 4 AMP (Rakoit board), from the tests of the Home Assistant `linkplay` integration (`tests/components/linkplay/fixtures`, Apache-2.0). Anonymized: uuid, MAC addresses and LAN address replaced. |
| `wiim-pro`, `wiim-amp`    | Reconstructed from the public formats (python-linkplay and `wiim` libraries, MIT; WiiM HTTP API): a WiiM Pro leading a group, playing a web radio whose titles only `getMetaInfo` gives, and a WiiM Amp following it.                      |
| `arylic-up2stream-amp-v4` | Reconstructed: an older firmware without `getPlayerStatusEx`, hex-encoded titles, playing its line input, muted.                                                                                                                           |

Addresses are in 192.0.2.0/24 (documentation range), MAC addresses in the
locally administered 02:00:5E range, uuids invented.
