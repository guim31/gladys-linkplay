// -----------------------------------------------------------------------------
// Configuration: DEFAULT_CONFIG mirrors the `default` of the manifest
// `config_schema` (test/manifest.test.js keeps both in sync).
// -----------------------------------------------------------------------------

import { parseAddress } from './linkplay/client.js';

/** The languages of Gladys, for feature names and messages. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const DEFAULT_CONFIG = {
  hosts: '',
  language: 'fr',
};

/**
 * @param {object} [raw] the values stored by Gladys
 * @returns {{ hosts: object[], invalidHosts: string[], language: string }}
 */
export function normalizeConfig(raw = {}) {
  const hosts = [];
  const invalidHosts = [];
  const seen = new Set();
  for (const entry of String(raw.hosts ?? DEFAULT_CONFIG.hosts).split(/[,;\s]+/)) {
    if (entry === '') {
      continue;
    }
    try {
      const address = parseAddress(entry);
      if (!seen.has(address.key)) {
        seen.add(address.key);
        hosts.push(address);
      }
    } catch {
      invalidHosts.push(entry);
    }
  }
  const language = LANGUAGES.includes(raw.language) ? raw.language : DEFAULT_CONFIG.language;
  return { hosts, invalidHosts, language };
}
