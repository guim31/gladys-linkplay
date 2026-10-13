// -----------------------------------------------------------------------------
// Configuration actions (manifest `actions`): search the network, test one
// address. Their result is shown under the button, in the user's language
// (a multi-language object: the front picks).
// -----------------------------------------------------------------------------

import { inAllLanguages, sourceLabel } from './i18n.js';
import { parseAddress } from './linkplay/client.js';
import { displayModel } from './linkplay/models.js';

export const REPORT_TEXT = {
  en: {
    none: 'No LinkPlay player found.',
    found: (count) => `${count} LinkPlay player(s):`,
    addThem: 'Add the new ones from the Discover tab.',
    noScan:
      'Automatic discovery through Gladys is unavailable: enter the addresses in the configuration.',
    noAnswer: (list) => `No answer from: ${list}.`,
    ignored: (list) => `Ignored addresses: ${list}.`,
    tested: (name, model, firmware, origin) =>
      `${name}: ${model}, firmware ${firmware}, answers on ${origin}.`,
    sources: (list) => `Sources: ${list}.`,
    failed: (address, reason) => `${address}: no LinkPlay player answers (${reason}).`,
    invalid: (address) => `"${address}" is not an address: give an IP address or a host name.`,
  },
  fr: {
    none: 'Aucun lecteur LinkPlay trouvé.',
    found: (count) => `${count} lecteur(s) LinkPlay :`,
    addThem: "Ajoutez les nouveaux depuis l'onglet Découverte.",
    noScan:
      'La découverte automatique par Gladys est indisponible : saisissez les adresses dans la configuration.',
    noAnswer: (list) => `Pas de réponse de : ${list}.`,
    ignored: (list) => `Adresses ignorées : ${list}.`,
    tested: (name, model, firmware, origin) =>
      `${name} : ${model}, micrologiciel ${firmware}, répond sur ${origin}.`,
    sources: (list) => `Sources : ${list}.`,
    failed: (address, reason) => `${address} : aucun lecteur LinkPlay ne répond (${reason}).`,
    invalid: (address) =>
      `« ${address} » n'est pas une adresse : donnez une adresse IP ou un nom d'hôte.`,
  },
  de: {
    none: 'Kein LinkPlay-Player gefunden.',
    found: (count) => `${count} LinkPlay-Player:`,
    addThem: 'Füge die neuen im Tab Entdecken hinzu.',
    noScan:
      'Die automatische Erkennung über Gladys ist nicht verfügbar: Gib die Adressen in der Konfiguration ein.',
    noAnswer: (list) => `Keine Antwort von: ${list}.`,
    ignored: (list) => `Ignorierte Adressen: ${list}.`,
    tested: (name, model, firmware, origin) =>
      `${name}: ${model}, Firmware ${firmware}, antwortet über ${origin}.`,
    sources: (list) => `Quellen: ${list}.`,
    failed: (address, reason) => `${address}: Kein LinkPlay-Player antwortet (${reason}).`,
    invalid: (address) =>
      `„${address}“ ist keine Adresse: Gib eine IP-Adresse oder einen Hostnamen an.`,
  },
  es: {
    none: 'No se ha encontrado ningún reproductor LinkPlay.',
    found: (count) => `${count} reproductor(es) LinkPlay:`,
    addThem: 'Añada los nuevos desde la pestaña Descubrir.',
    noScan:
      'El descubrimiento automático a través de Gladys no está disponible: introduzca las direcciones en la configuración.',
    noAnswer: (list) => `Sin respuesta de: ${list}.`,
    ignored: (list) => `Direcciones ignoradas: ${list}.`,
    tested: (name, model, firmware, origin) =>
      `${name}: ${model}, firmware ${firmware}, responde en ${origin}.`,
    sources: (list) => `Fuentes: ${list}.`,
    failed: (address, reason) => `${address}: ningún reproductor LinkPlay responde (${reason}).`,
    invalid: (address) =>
      `«${address}» no es una dirección: indique una dirección IP o un nombre de host.`,
  },
};

/**
 * The report of a search, in every language.
 * @param {object} report
 * @param {{ name: string, model: string, address: string, created: boolean }[]} report.players
 * @param {boolean} report.scanUnavailable
 * @param {string[]} report.noAnswer configured addresses that did not answer
 * @param {string[]} report.ignored configured entries that are not addresses
 */
export function searchMessage({ players, scanUnavailable, noAnswer, ignored }) {
  return inAllLanguages((lang) => {
    const texts = REPORT_TEXT[lang];
    const lines = [];
    if (players.length === 0) {
      lines.push(texts.none);
    } else {
      lines.push(texts.found(players.length));
      lines.push(players.map((p) => `${p.name} (${p.model}, ${p.address})`).join(', ') + '.');
      if (players.some((p) => !p.created)) {
        lines.push(texts.addThem);
      }
    }
    if (scanUnavailable) {
      lines.push(texts.noScan);
    }
    if (noAnswer.length > 0) {
      lines.push(texts.noAnswer(noAnswer.join(', ')));
    }
    if (ignored.length > 0) {
      lines.push(texts.ignored(ignored.join(', ')));
    }
    return lines.join(' ');
  });
}

export const ACTIONS = {
  /** Search the network now, publish the Discovery list, say what answered. */
  search: async (hub) => {
    const result = await hub.discover();
    const created = hub.createdDevices();
    const players = [...hub.players.values()]
      .filter((player) => player.info)
      .map((player) => ({
        name: player.info.name,
        model: displayModel(player.info),
        address: player.address,
        created: created.has(player.uuid),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const noAnswer = [...result.failed]
      .filter(([, { origin }]) => origin === 'config')
      .map(([address]) => address)
      .filter((address) => hub.config.hosts.some((host) => host.key === address));
    return searchMessage({
      players,
      scanUnavailable: result.mdns === 'unavailable' && result.ssdp === 'unavailable',
      noAnswer,
      ignored: hub.config.invalidHosts,
    });
  },

  /** Ask one address, say what answers there. */
  test_address: async (hub, { address }) => {
    const text = String(address ?? '').trim();
    let parsed;
    try {
      parsed = parseAddress(text);
    } catch {
      return inAllLanguages((lang) => REPORT_TEXT[lang].invalid(text));
    }
    try {
      const { client, info } = await hub.discovery.probe(parsed);
      return inAllLanguages((lang) => {
        const texts = REPORT_TEXT[lang];
        const sources = info.inputs.map((input) => sourceLabel(input, lang)).join(', ');
        return `${texts.tested(info.name, displayModel(info), info.firmware || '?', client.origin)} ${texts.sources(sources)}`;
      });
    } catch (err) {
      return inAllLanguages((lang) => REPORT_TEXT[lang].failed(parsed.key, err.message));
    }
  },
};
