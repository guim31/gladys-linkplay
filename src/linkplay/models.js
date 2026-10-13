// -----------------------------------------------------------------------------
// Make and model from the `project` field of `getStatusEx`.
//
// The table comes from python-linkplay (MIT, Velleman Group nv) and the inputs
// of the WiiM models from the `wiim` library (MIT, Linkplay): the WiiM
// firmwares do not always declare their inputs in `plm_support`.
// -----------------------------------------------------------------------------

const PROJECTS = {
  SMART_ZONE4_AMP: ['ArtSound', 'Smart Zone 4 AMP'],
  SMART_HYDE: ['ArtSound', 'Smart Hyde'],
  ARYLIC_S50: ['Arylic', 'S50+'],
  RP0016_S50PRO_S: ['Arylic', 'S50 Pro'],
  RP0011_WB60_S: ['Arylic', 'A30'],
  'X-50': ['Arylic', 'A50'],
  ARYLIC_A50S: ['Arylic', 'A50+'],
  RP0011_WB60: ['Arylic', 'Up2Stream Amp 2.0'],
  UP2STREAM_AMP_V3: ['Arylic', 'Up2Stream Amp v3'],
  UP2STREAM_AMP_V4: ['Arylic', 'Up2Stream Amp v4'],
  UP2STREAM_PRO_V3: ['Arylic', 'Up2Stream Pro v3'],
  UP2STREAM_PRO_V4: ['Arylic', 'Up2Stream Pro v4'],
  S10P_WIFI: ['Arylic', 'S10+'],
  ARYLIC_V20: ['Arylic', 'Up2Stream Plate Amp'],
  UP2STREAM_MINI_V3: ['Arylic', 'Up2Stream Mini'],
  UP2STREAM_AMP_2P1: ['Arylic', 'Up2Stream Amp 2.1'],
  'iEAST-02': ['iEAST', 'AudioCast M5'],
  WiiM_Amp_4layer: ['WiiM', 'WiiM Amp'],
  WiiM_Pro_with_gc4a: ['WiiM', 'WiiM Pro'],
  WiiM_Pro_Plus: ['WiiM', 'WiiM Pro Plus'],
  WiiM_AMP: ['WiiM', 'WiiM Amp'],
  WiiM_Amp_Pro: ['WiiM', 'WiiM Amp Pro'],
  WiiM_Ultra: ['WiiM', 'WiiM Ultra'],
  WiiM_Amp_Ultra: ['WiiM', 'WiiM Amp Ultra'],
  WiiM_CI_MOD_S: ['WiiM', 'WiiM CI MOD S'],
  WiiM_CI_MOD_A80: ['WiiM', 'WiiM CI MOD A80'],
  Muzo_Mini: ['WiiM', 'WiiM Mini'],
  GGMM_E2A: ['GGMM', 'E2'],
  A16: ['Medion', 'Life P66970 (MD 43970)'],
  Lanzi_4566: ['August', 'WR320'],
  WS350: ['August', 'WS350'],
  a31imuzobox: ['Muzo', 'Cobblestone'],
  AudioPro_C3: ['Audio Pro', 'C3'],
  AudioPro_C10: ['Audio Pro', 'C10'],
  AudioPro_A10: ['Audio Pro', 'A10'],
  'U-AIO3v2': ['Triangle', 'AIO 3'],
};

// Generic Arylic boards python-linkplay knows without a model name.
const ARYLIC_PROJECTS = /^(RP00|ARYLIC_)/;

/**
 * @param {string} project
 * @returns {{ manufacturer: string, model: string, wiim: boolean }}
 */
export function lookupModel(project) {
  const known = PROJECTS[project];
  if (known) {
    return { manufacturer: known[0], model: known[1], wiim: known[0] === 'WiiM' };
  }
  if (/^wiim/i.test(project)) {
    return { manufacturer: 'WiiM', model: project.replace(/_/g, ' '), wiim: true };
  }
  if (ARYLIC_PROJECTS.test(project)) {
    return { manufacturer: 'Arylic', model: project, wiim: false };
  }
  return { manufacturer: 'LinkPlay', model: project || 'LinkPlay', wiim: false };
}

const WIIM_INPUTS = {
  'WiiM Pro': ['wifi', 'bluetooth', 'line-in', 'optical'],
  'WiiM Pro Plus': ['wifi', 'bluetooth', 'line-in', 'optical'],
  'WiiM Ultra': ['wifi', 'bluetooth', 'line-in', 'optical', 'hdmi', 'phono'],
  'WiiM Amp': ['wifi', 'bluetooth', 'line-in', 'optical', 'hdmi'],
  'WiiM Amp Pro': ['wifi', 'bluetooth', 'line-in', 'optical', 'hdmi'],
  'WiiM Amp Ultra': ['wifi', 'bluetooth', 'line-in', 'optical', 'hdmi'],
  'WiiM CI MOD A80': ['wifi', 'bluetooth', 'line-in', 'optical', 'hdmi'],
  'WiiM CI MOD S': ['wifi', 'bluetooth', 'line-in', 'optical'],
};

/** The inputs of a WiiM model, [] for any other player. */
export function wiimModelInputs(model) {
  return WIIM_INPUTS[model] ?? [];
}

/** "WiiM Pro", "Arylic Up2Stream Amp v4": the make once. */
export function displayModel({ manufacturer, model }) {
  return model.toLowerCase().startsWith(manufacturer.toLowerCase())
    ? model
    : `${manufacturer} ${model}`;
}
