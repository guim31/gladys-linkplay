// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of Gladys. German
// says "du", Spanish "usted" (test/i18n.test.js checks it). Brand names
// (AirPlay, Spotify, HDMI...) are not translated.
//
// Two ways out: a multi-language object `{ en, fr, de, es }` when the front
// picks the user's language (action and widget toasts), the configured
// language otherwise (feature names, errors, scene variables) — a device
// integration never receives the user's language.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

/** Feature names, frozen by Gladys once a device is added. */
export const NAMES = {
  en: {
    play: 'Play',
    pause: 'Pause',
    stop: 'Stop',
    previous: 'Previous',
    next: 'Next',
    volume: 'Volume',
    mute: 'Mute',
    'playback-state': 'Playback state',
    title: 'Title',
    artist: 'Artist',
    album: 'Album',
    source: 'Source',
    equalizer: 'Equalizer',
    group: 'Multiroom group',
    notification: 'Notification',
  },
  fr: {
    play: 'Lecture',
    pause: 'Pause',
    stop: 'Stop',
    previous: 'Précédent',
    next: 'Suivant',
    volume: 'Volume',
    mute: 'Sourdine',
    'playback-state': 'État de lecture',
    title: 'Titre',
    artist: 'Artiste',
    album: 'Album',
    source: 'Source',
    equalizer: 'Égaliseur',
    group: 'Groupe multiroom',
    notification: 'Notification',
  },
  de: {
    play: 'Wiedergabe',
    pause: 'Pause',
    stop: 'Stopp',
    previous: 'Vorheriger Titel',
    next: 'Nächster Titel',
    volume: 'Lautstärke',
    mute: 'Stumm',
    'playback-state': 'Wiedergabestatus',
    title: 'Titel',
    artist: 'Interpret',
    album: 'Album',
    source: 'Quelle',
    equalizer: 'Equalizer',
    group: 'Multiroom-Gruppe',
    notification: 'Benachrichtigung',
  },
  es: {
    play: 'Reproducir',
    pause: 'Pausa',
    stop: 'Detener',
    previous: 'Anterior',
    next: 'Siguiente',
    volume: 'Volumen',
    mute: 'Silenciar',
    'playback-state': 'Estado de reproducción',
    title: 'Título',
    artist: 'Artista',
    album: 'Álbum',
    source: 'Fuente',
    equalizer: 'Ecualizador',
    group: 'Grupo multiroom',
    notification: 'Notificación',
  },
};

// What plays (src/linkplay/status.js MODES), and the inputs of the source
// feature. Brands stay as they are.
const BRANDS = {
  airplay: 'AirPlay',
  dlna: 'DLNA',
  qplay: 'QPlay',
  spotify: 'Spotify',
  tidal: 'Tidal',
  qobuz: 'Qobuz',
  hdmi: 'HDMI',
  arc: 'HDMI ARC',
  rca: 'RCA',
  xlr: 'XLR',
  fm: 'FM',
  dab: 'DAB',
  cd: 'CD',
  bluetooth: 'Bluetooth',
};

export const SOURCE_LABELS = {
  en: {
    ...BRANDS,
    wifi: 'Network (Wi-Fi)',
    network: 'Network',
    idle: 'Network (idle)',
    alarm: 'Alarm',
    talk: 'Voice assistant',
    follower: 'Multiroom group',
    'line-in': 'Line in',
    'line-in-2': 'Line in 2',
    optical: 'Optical',
    'optical-2': 'Optical 2',
    coaxial: 'Coaxial',
    'coaxial-2': 'Coaxial 2',
    phono: 'Phono',
    usb: 'USB',
    'usb-dac': 'USB DAC',
    'sd-card': 'SD card',
    'external-bluetooth': 'External Bluetooth',
  },
  fr: {
    ...BRANDS,
    wifi: 'Réseau (Wi-Fi)',
    network: 'Réseau',
    idle: 'Réseau (inactif)',
    alarm: 'Réveil',
    talk: 'Assistant vocal',
    follower: 'Groupe multiroom',
    'line-in': 'Entrée ligne',
    'line-in-2': 'Entrée ligne 2',
    optical: 'Optique',
    'optical-2': 'Optique 2',
    coaxial: 'Coaxial',
    'coaxial-2': 'Coaxial 2',
    phono: 'Phono',
    usb: 'USB',
    'usb-dac': 'DAC USB',
    'sd-card': 'Carte SD',
    'external-bluetooth': 'Bluetooth externe',
  },
  de: {
    ...BRANDS,
    wifi: 'Netzwerk (WLAN)',
    network: 'Netzwerk',
    idle: 'Netzwerk (inaktiv)',
    alarm: 'Wecker',
    talk: 'Sprachassistent',
    follower: 'Multiroom-Gruppe',
    'line-in': 'Line-Eingang',
    'line-in-2': 'Line-Eingang 2',
    optical: 'Optisch',
    'optical-2': 'Optisch 2',
    coaxial: 'Koaxial',
    'coaxial-2': 'Koaxial 2',
    phono: 'Phono',
    usb: 'USB',
    'usb-dac': 'USB-DAC',
    'sd-card': 'SD-Karte',
    'external-bluetooth': 'Externes Bluetooth',
  },
  es: {
    ...BRANDS,
    wifi: 'Red (Wi-Fi)',
    network: 'Red',
    idle: 'Red (inactiva)',
    alarm: 'Alarma',
    talk: 'Asistente de voz',
    follower: 'Grupo multiroom',
    'line-in': 'Entrada de línea',
    'line-in-2': 'Entrada de línea 2',
    optical: 'Óptica',
    'optical-2': 'Óptica 2',
    coaxial: 'Coaxial',
    'coaxial-2': 'Coaxial 2',
    phono: 'Phono',
    usb: 'USB',
    'usb-dac': 'DAC USB',
    'sd-card': 'Tarjeta SD',
    'external-bluetooth': 'Bluetooth externo',
  },
};

/** Texts of the multiroom group feature and of the widget. */
export const GROUP_TEXT = {
  en: {
    alone: 'Not grouped',
    leader: (names) => `Leads: ${names}`,
    follower: (name) => `Follows: ${name}`,
    followerUnknown: 'Follows another player',
  },
  fr: {
    alone: 'Non groupé',
    leader: (names) => `Maître de : ${names}`,
    follower: (name) => `Suit : ${name}`,
    followerUnknown: 'Suit un autre lecteur',
  },
  de: {
    alone: 'Nicht gruppiert',
    leader: (names) => `Führt: ${names}`,
    follower: (name) => `Folgt: ${name}`,
    followerUnknown: 'Folgt einem anderen Player',
  },
  es: {
    alone: 'Sin agrupar',
    leader: (names) => `Dirige: ${names}`,
    follower: (name) => `Sigue a: ${name}`,
    followerUnknown: 'Sigue a otro reproductor',
  },
};

/** Short texts of the widget (24 characters at most for labels and buttons). */
export const WIDGET_TEXT = {
  en: {
    nothing: 'Nothing playing',
    unreachable: 'Player unreachable',
    pick: 'Choose a LinkPlay player in the widget settings.',
    unknown: 'This player is not in Gladys any more: choose another one.',
    volume: 'Volume',
    source: 'Source',
    state: 'State',
    group: 'Group',
    playing: 'Playing',
    loading: 'Loading',
    paused: 'Paused',
    stopped: 'Stopped',
    previous: 'Previous',
    play: 'Play',
    pause: 'Pause',
    next: 'Next',
    presets: 'Presets',
    preset: 'Preset',
  },
  fr: {
    nothing: 'Aucune lecture',
    unreachable: 'Lecteur injoignable',
    pick: 'Choisissez un lecteur LinkPlay dans les réglages du widget.',
    unknown: "Ce lecteur n'est plus dans Gladys : choisissez-en un autre.",
    volume: 'Volume',
    source: 'Source',
    state: 'État',
    group: 'Groupe',
    playing: 'En lecture',
    loading: 'Chargement',
    paused: 'En pause',
    stopped: 'Arrêté',
    previous: 'Précédent',
    play: 'Lecture',
    pause: 'Pause',
    next: 'Suivant',
    presets: 'Préréglages',
    preset: 'Préréglage',
  },
  de: {
    nothing: 'Keine Wiedergabe',
    unreachable: 'Player nicht erreichbar',
    pick: 'Wähle einen LinkPlay-Player in den Widget-Einstellungen.',
    unknown: 'Dieser Player ist nicht mehr in Gladys: Wähle einen anderen.',
    volume: 'Lautstärke',
    source: 'Quelle',
    state: 'Status',
    group: 'Gruppe',
    playing: 'Wiedergabe',
    loading: 'Wird geladen',
    paused: 'Pausiert',
    stopped: 'Gestoppt',
    previous: 'Zurück',
    play: 'Abspielen',
    pause: 'Pause',
    next: 'Weiter',
    presets: 'Voreinstellungen',
    preset: 'Voreinstellung',
  },
  es: {
    nothing: 'Nada en reproducción',
    unreachable: 'Reproductor inaccesible',
    pick: 'Elija un reproductor LinkPlay en los ajustes del widget.',
    unknown: 'Este reproductor ya no está en Gladys: elija otro.',
    volume: 'Volumen',
    source: 'Fuente',
    state: 'Estado',
    group: 'Grupo',
    playing: 'Reproduciendo',
    loading: 'Cargando',
    paused: 'En pausa',
    stopped: 'Detenido',
    previous: 'Anterior',
    play: 'Reproducir',
    pause: 'Pausa',
    next: 'Siguiente',
    presets: 'Preajustes',
    preset: 'Preajuste',
  },
};

/** Errors (thrown: shown by the widget, written in the scene logs). */
export const ERRORS = {
  en: {
    unknownDevice: 'This LinkPlay player is unknown: add it to Gladys from the Discover tab.',
    unreachable: (name) => `${name} does not answer: check that it is on and on the network.`,
    unsupported: (name) => `${name} does not support this command.`,
    refused: (name) => `${name} refused the command.`,
    invalidUrl: 'Give an http:// or https:// address.',
    invalidPreset: (max) => `Choose a preset between 1 and ${max}.`,
    invalidSource: (name) => `${name} has no such source.`,
    invalidVolume: 'The volume goes from 0 to 100.',
    sameDevice: 'A player cannot join its own group.',
    noLeaderAddress: (name) => `The address of ${name} is unknown.`,
    updateGladys: 'This button needs Gladys 5.2.0 or later.',
  },
  fr: {
    unknownDevice:
      "Ce lecteur LinkPlay est inconnu : ajoutez-le à Gladys depuis l'onglet Découverte.",
    unreachable: (name) => `${name} ne répond pas : vérifiez qu'il est allumé et sur le réseau.`,
    unsupported: (name) => `${name} ne connaît pas cette commande.`,
    refused: (name) => `${name} a refusé la commande.`,
    invalidUrl: 'Donnez une adresse http:// ou https://.',
    invalidPreset: (max) => `Choisissez un préréglage entre 1 et ${max}.`,
    invalidSource: (name) => `${name} n'a pas cette source.`,
    invalidVolume: 'Le volume va de 0 à 100.',
    sameDevice: 'Un lecteur ne peut pas rejoindre son propre groupe.',
    noLeaderAddress: (name) => `L'adresse de ${name} est inconnue.`,
    updateGladys: 'Ce bouton demande Gladys 5.2.0 ou plus récent.',
  },
  de: {
    unknownDevice:
      'Dieser LinkPlay-Player ist unbekannt: Füge ihn im Tab Entdecken zu Gladys hinzu.',
    unreachable: (name) =>
      `${name} antwortet nicht: Prüfe, ob er eingeschaltet und im Netzwerk ist.`,
    unsupported: (name) => `${name} unterstützt diesen Befehl nicht.`,
    refused: (name) => `${name} hat den Befehl abgelehnt.`,
    invalidUrl: 'Gib eine http://- oder https://-Adresse an.',
    invalidPreset: (max) => `Wähle eine Voreinstellung zwischen 1 und ${max}.`,
    invalidSource: (name) => `${name} hat diese Quelle nicht.`,
    invalidVolume: 'Die Lautstärke geht von 0 bis 100.',
    sameDevice: 'Ein Player kann nicht seiner eigenen Gruppe beitreten.',
    noLeaderAddress: (name) => `Die Adresse von ${name} ist unbekannt.`,
    updateGladys: 'Diese Schaltfläche braucht Gladys 5.2.0 oder neuer.',
  },
  es: {
    unknownDevice:
      'Este reproductor LinkPlay es desconocido: añádalo a Gladys desde la pestaña Descubrir.',
    unreachable: (name) =>
      `${name} no responde: compruebe que está encendido y conectado a la red.`,
    unsupported: (name) => `${name} no admite este comando.`,
    refused: (name) => `${name} ha rechazado el comando.`,
    invalidUrl: 'Indique una dirección http:// o https://.',
    invalidPreset: (max) => `Elija un preajuste entre 1 y ${max}.`,
    invalidSource: (name) => `${name} no tiene esta fuente.`,
    invalidVolume: 'El volumen va de 0 a 100.',
    sameDevice: 'Un reproductor no puede unirse a su propio grupo.',
    noLeaderAddress: (name) => `La dirección de ${name} es desconocida.`,
    updateGladys: 'Este botón requiere Gladys 5.2.0 o posterior.',
  },
};

/** The table of a language, English when the language is unknown. */
export function textsOf(table, language) {
  return table[language] ?? table.en;
}

/**
 * A multi-language object from one function per language.
 * @param {(lang: string) => string} render
 */
export function inAllLanguages(render) {
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, render(lang)]));
}

/** The label of a source key (input or what plays). */
export function sourceLabel(key, language) {
  return textsOf(SOURCE_LABELS, language)[key] ?? key;
}
