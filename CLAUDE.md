# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration**: a Node.js service (Node 22+, ESM,
no build step) that runs in its own sandboxed Docker container and talks to
Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It started from the official JavaScript template.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/commands.test.js         # one file
node --test --test-name-pattern "preset"  # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
node scripts/probe.mjs 192.168.1.30 --raw  # read-only check of a real player
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                          SDK wiring only: handlers registered before connect()
src/app.js                        registers every handler on the SDK client, returns the hub
src/hub.js                        players, internal polling, states, orders, trigger, announcements
src/player.js                     one player: status reads and LinkPlay orders (no Gladys)
src/discovery.js                  mediated mDNS + SSDP, configured and known addresses, followers
src/devices.js                    the Gladys device of a player (feature keys, frozen)
src/linkplay/                     protocol: http.js (bounded GET, self-signed HTTPS),
                                  client.js (addresses, HTTPS then HTTP, encoding),
                                  status.js (answers, sources, inputs), models.js (makes)
src/actions.js, scenes.js, widgets.js  manifest actions, scene actions, the "player" widget
src/i18n.js                       every text in en, fr, de, es
src/config.js                     DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/issues.js                     a repeated failure logged once
scripts/probe.mjs                 read-only probe of real players (for whoever has the hardware)
gladys-assistant-integration.json manifest: name, config_schema, actions, image...
docs/{en,fr,de,es}.md             user documentation, same sections (re-hosted by Gladys)
test/                             node --test, SDK fake Gladys + fake players (helpers/)
test/fixtures/players/            real (Home Assistant) and reconstructed LinkPlay answers
.github/scripts/release.mjs       release helpers (manifest bump, changelog), tested in test/
```

## Rules

- **External ids are forever.** Build them with
  `gladys.externalIds(type, platformId)`, `platformId` being the unique id the
  platform gives the device (serial, cloud id, MAC), never a label. Gladys keys
  devices, their history, scenes and dashboards on them: changing one creates a
  new device and orphans the old one. The same goes for every key users store:
  manifest `config_schema`, `actions`, widget and scene keys, feature keys.
- **The container rootfs is read-only.** Write only under `/data`, the one
  writable volume. Never log tokens, passwords or API keys.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand — except on the README's hand-pushed tag path, which bumps all three
  together before tagging. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section, and it
  becomes the notes of the GitHub Release.
- **Manifest.** Texts are multi-language objects `{ "en": ..., "fr": ... }`:
  `label`, `description` and `placeholder` alike, never a plain string. The
  catalog `description` holds 10 to 100 characters per language. A field the
  older cores do not know needs a higher `gladys_version` minimum
  (`categories`: 4.86.0; `widgets`, `scene_triggers`, `scene_actions`,
  `type: "provider"`: 5.1.0; a widget button opening a form: 5.2.0). `test/manifest.test.js` ties the manifest to the
  code (defaults, action, scene and widget handlers): change both sides
  together.
- **User-facing text** exists in English, French, German and Spanish (the
  languages of Gladys): manifest texts, action messages, widget contents,
  errors, feature and source names (`src/i18n.js`), and `docs/en.md`,
  `fr.md`, `de.md`, `es.md` with the same sections. German says "du", Spanish
  "usted"; `test/i18n.test.js` fails on a missing language, an empty or too
  long text, the wrong form, or docs whose outlines differ.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

---

# Notes du mainteneur (guim31)

Ce qui suit complète les règles du template ci-dessus. Ce sont des faits vérifiés dans le code du
cœur Gladys ou payés sur les intégrations déjà publiées par guim31. Ils ne se lisent pas dans le
code de ce dépôt. Compléter ce fichier quand un nouveau piège est découvert.

## Travailler sur ce dépôt

- Mêmes étapes que la CI, dans le même ordre : `npm ci`, `npm run format:check`, `npm run lint`,
  `npm test`. Prettier contrôle **aussi le Markdown** : lancer `npm run format` après avoir
  modifié ce fichier, le README ou la documentation, sinon la CI tombe.
- Une session de code n'a **ni instance Gladys ni appareil réel**. La suite de tests, le lint et
  le validateur du store sont les seules vérifications possibles : le test réel se fait ailleurs.
  Le dire, plutôt que de conclure que « ça marche ».
- **Tout le code de démonstration du template disparaît** : station météo, prise, lampe, caméra,
  capteur de mouvement, `src/weather.js`, leurs tests, leurs entrées du manifeste et de la
  documentation. Il ne reste que ce que l'intégration fait vraiment.
- **Publier n'est jamais le travail d'une session de code** : ni Release, ni tag, ni topic, ni
  version modifiée à la main. L'orchestrateur s'en charge une fois la PR fusionnée. Les workflows
  sont ceux du template : ne pas les modifier.
- Le dépôt est **public** : aucun secret, aucune adresse ni détail d'infrastructure privée, ni
  ici, ni dans les tests, ni dans les captures.

## Pièges du cœur Gladys

**Appareils et fonctionnalités**

- **Polling** : le planificateur n'interroge un appareil que si `should_poll: true` **et**
  `poll_frequency` vaut une valeur de la liste fixe, **en millisecondes** (1000, 2000, 10000,
  15000, 30000, 60000). Le template publie `poll_frequency: 300` sans `should_poll` : c'est faux,
  le cœur répond 400 à la découverte. Pour une cadence hors liste, publier `should_poll: false` et
  pousser les états depuis le conteneur, en gardant un `onPoll` de repli.
  **Piège du 5.2.0** (GladysAssistant/Gladys#3198, correctif #3199, relevé sur gladys-ping-wol) :
  un appareil **créé sans `should_poll`** n'est jamais sondé, même après correction du cœur (valeur
  stockée à la création), et la 5.2.1 du 13/10/2026 ne le corrige pas. **Le conteneur sonde donc
  lui-même** par un minuteur, qui saute un appareil sondé il y a moins d'une demi-période, en gardant
  `onPoll` comme repli ; seuls les appareils ajoutés (`gladys.devices`) sont lus. Un test le prouve
  sans appeler `onPoll`.
- **`min` et `max` sont NOT NULL** dans `t_device_feature`, y compris pour `text/text` : sans eux,
  « Ajouter à Gladys » échoue en HTTP 422. Mettre 0/0, comme Zigbee2MQTT.
- Un état publié sur une fonctionnalité **pas encore ajoutée** dans Gladys reçoit un 200 puis est
  jeté (simple ligne de log) : republier les états dans `onDeviceCreated`.
- `level-sensor/decimal` n'existe pas côté serveur. `light-sensor/binary` n'a pas de libellé dans
  le front (pastille vide) : préférer `input/binary`. Un `text/text` reçoit `{ text }`, jamais
  vide, sinon l'état est ignoré.
- **Détecteur d'ouverture (`opening-sensor`) : 0 = ouvert, 1 = fermé** (`OPENING_SENSOR_STATE`), à
  l'inverse de l'intuition et des autres détecteurs (mouvement, fuite, fumée : 1 = détecté). Une
  porte ouverte publiée à 1 s'affiche « Fermé » et fausse scènes et historique. Le figer par un test.
- **Un `external_id` de fonctionnalité ne change jamais d'appareil** d'une version à l'autre. UniFi
  1.5.2 avait sorti les ports PoE dans un appareil dédié, la 1.6.0 les a remis dans la passerelle avec
  les mêmes identifiants : ceux qui avaient ajouté l'appareil dédié ne peuvent plus « Mettre à jour » la
  passerelle (409 `external_id must be unique`). Pour regrouper, garder l'appareil existant
  (`gladys.getDevices()`) ou changer d'identifiant.
- Les **noms de fonctionnalités sont figés à la création**. Et quand une fonctionnalité est seule
  de son type sur l'appareil, le tableau de bord affiche le libellé générique du type à la place
  du nom publié.
- **Aucune commande d'appareil ne permet un choix multiple** : un `text/select` n'a qu'un choix
  actif.
- Un changement de structure fait proposer « Mettre à jour » dans l'onglet Découverte
  (`structure_changed`). Un changement des seules `supported_options` ne le déclenche pas.
- **Jauge** : l'aiguille se place par `(value - min) / (max - min)` des bornes de la
  fonctionnalité. `gauge_min`/`gauge_max` ne pilotent que les couleurs, et le cœur n'applique
  jamais `min`/`max` en écriture : ce sont des bornes d'affichage. Une valeur signée exige des
  bornes symétriques.
- Le cœur plafonne à **300 états par minute** et réévalue les scènes à chaque état : ne publier
  que les changements.
- Une intégration `device` ne reçoit pas la langue de l'utilisateur, une action de scène non
  plus (un widget, si) : prévoir un champ de config `language` si des textes partent du
  conteneur. Le superviseur injecte `TZ`, le fuseau de Gladys. La sandbox est limitée à 256 Mo.

**Formulaires de configuration et actions**

- Les champs `number` sont rendus **sans `step`** : le navigateur n'accepte alors que `min + k`.
  Min et défaut **entiers** seulement ; une valeur décimale passe par un `select` ou par un
  `string` parsé (virgule acceptée).
- Un champ `secret` dans les `fields` d'une **action** est impossible à remplir, et une action
  n'applique **aucun `default`** tout en exigeant les champs `required` (422). Issues
  GladysAssistant/Gladys#3154 et #3155.

**SDK 0.15 et journaux**

- SDK `@gladysassistant/integration-sdk` **^0.15.0** (12/10/2026) : `DEVICE_POLL_FREQUENCIES`, faux
  Gladys de test (`@gladysassistant/integration-sdk/testing`, à préférer à un faux maison),
  déduplication des états, `parseMdnsTxt`. Lire son README et son CHANGELOG.
- **Journaux calmes** (demande de Guilhem, 13/10/2026) : rien au niveau info pour un cycle normal de
  lecture, un état publié ou un message reçu. L'info ne garde que le cycle de vie : démarrage,
  connexion, perte et retour d'un appareil ou d'un service, erreurs utiles, une ligne par action de
  l'utilisateur. Le reste passe en debug (`LOG_LEVEL=debug`). Une erreur qui se répète écrit une ligne
  au premier échec et une au rétablissement, pas une par tentative. Jamais de secret ni d'adresse
  avec identifiants. Un test vérifie qu'un cycle normal n'écrit rien en info.
- **Heartbeat** : republier au moins toutes les 12 h une valeur qui ne change pas, sinon le front
  affiche « Pas de valeur récente » au-delà de 48 h.

**Widgets, déclencheurs, actions de scène (SDK ≥ 0.14, Gladys ≥ 5.1)**

- **Cibler la dernière version publiée du cœur, pas `master`** : la spec de `master` décrit des
  fonctions non publiées. Les boutons de widget qui ouvrent un formulaire (#3168, commit 3feb2cf8)
  sont absents de la 5.1.4 mais **livrés dans la 5.2.0** (sortie le 12/10/2026) : `gladys_version`
  `>=5.2.0` si on s'en sert, ou un bouton direct en repli. Vérifier par `git tag --contains`.

- Un réglage de widget ne propose en liste que les **appareils** de l'intégration
  (`source: "devices"`, seule source dynamique).
- Budget du cœur : **8 composants par widget, dont 2 textes au plus**, appliqué **avant** la
  résolution des références ; un contenu amputé reste en cache jusqu'au TTL. Appeler
  `requestWidgetRefresh` à la création d'un appareil. `validateWidgetContent` est exporté pour les
  tests, mais ne vérifie pas que les `external_id` liés existent : les croiser avec `buildDevice`.
- Une ligne de `status` exige un `value` (nombre ou texte ≤ 40).
- Le cœur **jette un bouton dont la clé d'action est déjà prise** : clés numérotées.
- Le vocabulaire des widgets n'a ni liste ni curseur, **par choix** du cœur. Seul un bouton
  `device_feature` numérique a un état actif natif.
- **En mode sombre, le style `primary` d'un bouton de widget ne se voit pas** (#3153) : signaler
  un choix courant par l'icône (`check-circle`), jamais par le style.
- Dans une grille `card-list`, la `date` s'affiche **à la place** du sous-titre.
- `onWidgetAction` fait recharger le widget dès la résolution, alors que `requestWidgetRefresh`
  est plafonné à un appel toutes les 10 s. Un toast d'action est tronqué à 200 caractères.
- Le cœur met le contenu d'un widget en cache par (réglages, langue, unités) : pré-localiser
  d'après `language` est correct.
- Les filtres de scène ne font qu'égalité et appartenance : un seuil reste le travail d'un capteur.
- **Les clés de widgets, de déclencheurs et d'actions sont figées une fois publiées.**
- `gladys_version` `>=5.1.0` dès qu'il y a widgets, déclencheurs ou actions de scène.

## Store

- Validateur officiel, depuis la racine : `npx -y github:GladysAssistant/integration-store .`
  (schéma, `description` **100 caractères au plus par langue**, documentation de 300 caractères
  au moins, image Docker, cover de **150 Ko au plus**). Il demande Node ≥ 24 mais tourne sous
  Node 22 avec un avertissement.
- L'indexeur lit le manifeste de la **dernière release**, pas celui de `main` : une correction du
  manifeste (catégorie, description…) n'atteint le store qu'avec une release.
- L'indexeur rejette **en silence** : la raison n'apparaît que dans `rejected.json`, à côté de
  `https://integration-store-storage.gladysassistant.com/index.json`.
- **Image de base** : `FROM public.ecr.aws/docker/library/node:…` (miroir officiel ECR Public, même
  empreinte) et non `node:…` de Docker Hub, qui refuse en 429 les pulls anonymes des runners GitHub
  dès qu'il y a plusieurs builds à la fois. Un échec 429 dans le job « Docker build » n'est pas un bug
  du code. Même parade dans `.github/workflows/build.yml` (posée par l'orchestrateur, ne pas la
  retirer) : QEMU et BuildKit tirés de `mirror.gcr.io`.
- La règle `data/` du `.gitignore` du template (pour le volume `/data`) exclut aussi `src/data/` :
  l'ancrer en `/data/`, dans `.prettierignore` aussi.

### Langues (depuis le 11/10/2026)

Tout texte montré à l'utilisateur existe en **`en`, `fr`, `de` et `es`** : manifeste, contenu des widgets, messages,
noms de fonctionnalités. L'allemand **tutoie** (« du »), l'espagnol **vouvoie** (« usted ») : décision de Guilhem,
appliquée à ses 21 intégrations. `test/i18n.test.js` doit échouer sur une langue manquante, un texte vide ou trop
long, et sur un « Sie »/« Ihr… » de politesse en allemand. Le store exige `docs/en.md` et `docs/fr.md`
(`DOCS_LANGUAGES`) et publie aussi `docs/de.md` et `docs/es.md` quand ils existent
(`DOCS_OPTIONAL_LANGUAGES` d'integration-store) : écrire les quatre, avec les mêmes sections.

## Choix par défaut de Guilhem (12/10/2026)

- Langue par défaut des noms de fonctionnalités et des textes produits par le conteneur : **`fr`**.
- Fichier `LICENSE` Apache-2.0 (texte complet) à la racine.
- `transports` : `local` seul quand le cloud n'est qu'une option annexe.
- Docs `en`, `fr`, `de`, `es` avec les mêmes sections.
- Chauffe, ouverture, sécurité : ne rien rendre pilotable « comme un thermostat » ou par un assistant
  vocal quand une erreur serait dangereuse (leçon d'OctoPrint).

## LinkPlay (cette intégration)

Développée **sans le matériel** : ce qui suit vient de python-linkplay (MIT), de la bibliothèque `wiim`
(MIT, Linkplay), des fixtures du `linkplay` de Home Assistant (vraies réponses d'un ArtSound) et de la doc
WiiM/Arylic lue de mémoire (injoignables depuis la session). `scripts/probe.mjs` vérifie un vrai lecteur
en lecture seule ; les points marqués **(hypothèse)** attendent ce test.

**API** : `GET /httpapi.asp?command=<commande>`, HTTPS 443 d'abord (certificat auto-signé, firmwares
récents, WiiM), puis HTTP 80 ; le point qui répond est retenu, oublié à la première panne. Réponses :
JSON pour les lectures, `OK` (ou `{"status":"OK"}`) pour les ordres, `unknown command` pour une commande
inconnue du firmware (alors plus redemandée : `Player.unsupported`), `Failed` quand il n'y a rien à dire
(`getMetaInfo` à l'arrêt : redemandée plus tard).

- **Identité** : `uuid` de `getStatusEx` (32 hexadécimaux, majuscules), seul `platformId`. L'adresse vit
  dans le param `IP_ADDRESS` (republié à chaque découverte : le cœur l'actualise sans « Mettre à jour »).
  Un lecteur ajouté qui ne répond plus relance la découverte toutes les 5 min et est retrouvé par son uuid.
- **Lecture** : `getPlayerStatusEx`, repli sur `getPlayerStatus` (vieux firmwares). Titres en hexadécimal
  UTF-8 la plupart du temps : décodés seulement si le résultat est de l'UTF-8 sans caractère de contrôle
  (« ABBA », « CAFE » restent tels quels). `mode` donne la source (table `MODES` de `status.js`, 99 =
  suiveur d'un groupe, sans source propre) ; `plm_support` les entrées (bits de python-linkplay), complété
  pour les WiiM par la table des modèles (leur `plm_support` est incomplet). Un WiiM qui lit une radio ne
  donne ses titres que par `getMetaInfo`.
- **Ordres** : `setPlayerCmd:resume|pause|stop|prev|next|vol:N|mute:0/1|switchmode:<nom>|play:<url>`,
  `MCUKeyShortClick:N` (préréglage N, `preset_key` en donne le nombre). Les noms `switchmode` sont
  sensibles à la casse (`INPUTS`). L'URL d'un `play:` est passée telle quelle après les deux-points ; seuls
  `&`, `#`, `+`, `%`, espaces et non-ASCII sont encodés (`encodeCommand`) **(hypothèse : le firmware
  décode le paramètre)**.
- **WiiM** : `EQGetList` (noms), `EQLoad:<nom>`, `EQOff`, `EQGetStat` (`On`/`Off` seulement : l'API ne dit
  jamais quel préréglage est chargé, d'où un état inconnu après un choix dans l'app). `getPresetInfo` pour
  les noms des préréglages **(hypothèse)**.
- **Annonce** (`music/play_notification`, l'URL MP3 du TTS de Gladys Plus, avec un jeton : jamais
  journalisée entière, `loggableUrl`) : `playPromptUrl:<url>` joue par-dessus la musique et la reprend
  **(hypothèse, doc WiiM)** ; sans elle, `play:<url>` puis retour à l'entrée physique qui jouait (suivi
  par le sondage, 2 min au plus). Un flux réseau ne peut pas être repris : l'API ne donne pas son URL.
- **Groupes** : `multiroom:getSlaveList` sur le maître (`slaves` nombre ou chaîne), rejoindre :
  `ConnectMasterAp:JoinGroupMaster:eth<IP du maître>:wifi0.0.0.0` sur le suiveur, quitter :
  `multiroom:SlaveKickout:<IP>` sur le maître (ou `multiroom:LeaveGroup` si le maître est inconnu),
  dissoudre : `multiroom:Ungroup`. Les suiveurs sont trouvés par la liste de leur maître (certains
  firmwares ne répondent plus en SSDP une fois groupés).
- **Audio Pro récents (port 4443)** : exigent un certificat client (mTLS). python-linkplay embarque celui
  de LinkPlay, clé privée comprise : **non recopié** dans ce dépôt public. Non pris en charge.

**Lecteur Musique 5.3 (1.1.0, SDK 0.16)** : `publishNowPlaying` (ids 1.0 gardés par `featureExternalIds`,
`MUSIC_KEYS`), position et durée = `curpos`/`totlen` en ms (0 = flux en direct, pas de seek). `loop` se lit
pareil partout de 0 à 4 (0 tout, 1 un, 2 aléatoire + tout, 3 aléatoire, 4 rien ; 5 = aléatoire + un, ou « un »
pour Spotify sur WiiM ; -1 = rien) mais **s'écrit différemment selon le firmware** (`loopmode` = valeur lue sur
Ultra/Arylic/Audio Pro, ancienne table WiiM -1/0/1/2 ailleurs ; pywiim#23, Wiim-Dashboard) : chaque valeur est
vérifiée par relecture et celle qui marche est retenue. Pochette : `getMetaInfo` `albumArtURI` seulement (WiiM,
quelques autres firmwares ; sinon UPnP `GetInfoEx`, non lu), souvent sur le lecteur lui-même en HTTPS
auto-signé (AirPlay) ou sur un Plex du LAN à 1000 px : réduite par `artwork-resize.js`. Placeholder `unknow`.
Qobuz Connect rapporte `status: none` en jouant (publié IDLE, titres gardés).

**Découverte** : mDNS `_linkplay._tcp` puis SSDP `MediaRenderer:1` (une seule entrée `ssdp` : le cœur ne
scanne que la première ; un scan à la fois). Le SSDP ramène aussi téléviseurs et amplis : chacun reçoit un
`getStatusEx` (2,5 s), et un non-LinkPlay n'est plus redemandé pendant 30 min. Les adresses configurées et
celles des lecteurs ajoutés sont toujours redemandées.

**Sondage** (#3198) : `should_poll: false`, minuteur interne (`hub.js`) : 5 s en lecture, 30 s sinon,
1 min injoignable (dit perdu après 2 échecs : une ligne info, une au retour), 0,7 s puis 2 s ×2 après un
ordre ; groupe et égaliseur toutes les 30 s, `getStatusEx` toutes les 10 min. `onPoll` en repli.
Heartbeat 6 h par `publishChangedStates`. Seuls les lecteurs ajoutés sont sondés.

**Pièges vus en écrivant l'intégration**

- Le déclencheur d'état d'appareil du front (`DeviceFeatureState.jsx`, 5.2.1) ne sait rien faire d'un
  `text/select` : un changement de source passe donc par le déclencheur d'intégration `source_changed`,
  qui n'est pas émis pour une source commandée depuis Gladys (pas de boucle) ni pendant une annonce.
- Le front nomme une ligne de fonctionnalité par le nom de l'appareil quand **son type** est unique sur
  l'appareil (`shouldDisplayDeviceName` compare le seul `type`, pas la catégorie). Titre/Artiste/Album/
  Groupe (4 `text`) et Source/Égaliseur (2 `select`, WiiM) gardent leur nom ; la Source seule d'un
  non-WiiM s'affiche sous le nom du lecteur.
- Onglets d'une intégration externe : « Discover » / « Découverte » / « Entdecken » / « Descubrir ».
- Faux Gladys du SDK : l'ack d'une action est `{ data: { message } }`, d'une action de scène
  `{ data: { outputs } }`, d'un bouton de widget `{ data: { message } }`.
- Formulaire d'un bouton de widget (5.2.0) : `label` des champs et des options en objets multilingues
  (`en` exigé), 40 caractères au plus.
