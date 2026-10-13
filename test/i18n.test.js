// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the message tables of the
// code and the user documentation. German says "du", never the polite "Sie";
// Spanish says "usted".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REPORT_TEXT, searchMessage } from '../src/actions.js';
import { LANGUAGES } from '../src/config.js';
import { EQUALIZER_OFF_LABEL } from '../src/devices.js';
import {
  ERRORS,
  GROUP_TEXT,
  NAMES,
  SOURCE_LABELS,
  WIDGET_TEXT,
  inAllLanguages,
} from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;
// The familiar Spanish pronouns, where "usted" is the rule (a verb form cannot
// be told from the third person: "comprueba" is both).
const FAMILIAR_SPANISH = /(?<!\p{L})(tú|tu|tus|contigo)(?!\p{L})/iu;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  short: 24,
  featureName: 40,
  status: 40,
  report: 600,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  if (lang === 'es' && FAMILIAR_SPANISH.test(text)) {
    found.push(`${path} uses the familiar form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      // The store schema caps the catalog and widget descriptions, and widget labels.
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

// Tables written one language at a time: same keys everywhere, no empty text.
// A function is rendered with sample arguments.
function tableProblems(table, name, max) {
  const render = (value) =>
    typeof value === 'function' ? value('Salon', 'WiiM Pro', '4.8', 'https://192.0.2.10') : value;
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      found.push(...textProblems(render(value), `${name}.${lang}.${key}`, lang, max));
    }
  }
  return found;
}

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  assert.deepEqual(Object.keys(NAMES), LANGS);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 60, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the name is the same in every language, the catalog description long enough', () => {
  assert.equal(typeof manifest.name, 'string');
  for (const lang of LANGS) {
    assert.ok(manifest.description[lang].length >= 10, `description.${lang} is too short`);
  }
});

test('the feature names, sources and equalizer exist in every language', () => {
  assert.deepEqual(tableProblems(NAMES, 'NAMES', MAX.featureName), []);
  assert.deepEqual(tableProblems(SOURCE_LABELS, 'SOURCE_LABELS', MAX.status), []);
  assert.deepEqual(problems(EQUALIZER_OFF_LABEL, 'EQUALIZER_OFF_LABEL', MAX.short), []);
});

test('the messages of the code exist in every language', () => {
  const longWidgetTexts = new Set(['pick', 'unknown']);
  const widget = Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      Object.fromEntries(
        Object.entries(WIDGET_TEXT[lang]).filter(([key]) => !longWidgetTexts.has(key)),
      ),
    ]),
  );
  assert.deepEqual(tableProblems(widget, 'WIDGET_TEXT', MAX.short), []);
  assert.deepEqual(tableProblems(WIDGET_TEXT, 'WIDGET_TEXT', MAX.message), []);
  assert.deepEqual(tableProblems(GROUP_TEXT, 'GROUP_TEXT', MAX.message), []);
  assert.deepEqual(tableProblems(ERRORS, 'ERRORS', MAX.message), []);
  assert.deepEqual(tableProblems(REPORT_TEXT, 'REPORT_TEXT', MAX.message), []);
});

test('the search report reads well in every language', () => {
  const report = searchMessage({
    players: [
      { name: 'Salon', model: 'WiiM Pro', address: '192.0.2.10', created: true },
      { name: 'Bureau', model: 'Arylic Up2Stream Amp v4', address: '192.0.2.12', created: false },
    ],
    scanUnavailable: true,
    noAnswer: ['192.0.2.99'],
    ignored: ['bad/address'],
  });
  assert.deepEqual(problems(report, 'searchMessage', MAX.report), []);
  assert.match(report.de, /2 LinkPlay-Player: Salon .* Füge die neuen/);
  assert.match(report.es, /introduzca las direcciones/);
});

test('the guard catches a missing language, an empty text and the wrong forms', () => {
  assert.equal(problems({ en: 'Play', fr: 'Lecture', de: 'Wiedergabe' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: '', es: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Player', 'Ihre IP', 'mit Ihrem', 'Ihren', 'Ihres']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  for (const familiar of ['Elija tu reproductor', 'tus reproductores', 'Tú eliges']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: familiar }, 'x', 60).length, 1);
  }
  // Words that only contain the letters stay allowed.
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  assert.deepEqual(
    inAllLanguages((lang) => lang.toUpperCase()),
    {
      en: 'EN',
      fr: 'FR',
      de: 'DE',
      es: 'ES',
    },
  );
  // A manifest text forgotten in German is found.
  const forgotten = structuredClone(manifest);
  delete forgotten.scene_actions[1].fields[1].placeholder.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.scene_actions[1].fields[1].placeholder has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});

// --- User documentation -------------------------------------------------------

const docs = Object.fromEntries(
  await Promise.all(
    LANGS.map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

/** The outline of a document: the level of each heading, in order. */
const outline = (text) =>
  text
    .split('\n')
    .filter((line) => /^#{1,4} /.test(line))
    .map((line) => line.match(/^#+/)[0].length);

test('the four documentations have the same sections', () => {
  const reference = outline(docs.en);
  assert.ok(reference.filter((level) => level === 2).length >= 8, 'en: too few sections');
  for (const lang of LANGS) {
    assert.deepEqual(outline(docs[lang]), reference, `docs/${lang}.md has another outline`);
    assert.ok(docs[lang].length >= 300, `docs/${lang}.md is too short for the store`);
  }
});

test('the documentation says it was made without the hardware, and who it is not', () => {
  assert.match(docs.en, /Developed without the hardware: feedback welcome/);
  assert.match(docs.fr, /Développée sans le matériel/);
  assert.match(docs.de, /Ohne die Hardware entwickelt/);
  assert.match(docs.es, /Desarrollada sin el hardware/);
  for (const lang of LANGS) {
    assert.match(docs[lang], /LinkPlay, WiiM, Arylic.*Audio Pro/, `docs/${lang}.md`);
  }
  assert.ok(!POLITE_GERMAN.test(docs.de), 'docs/de.md says "du"');
  assert.ok(!FAMILIAR_SPANISH.test(docs.es), 'docs/es.md says "usted"');
});
