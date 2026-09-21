/**
 * D-076/077 — the GLP-1R BINDING of the generic activity-dataset engine
 * (docs/DECISIONS.md D-076, D-077; re-factored in D-081).
 *
 * WHAT MOVED AND WHAT DID NOT. Every rule that used to live here — human-only
 * filtering decided per row from `target_organism`, the refusal to trust a
 * remembered target id, strict numeric parsing that rejects censored values,
 * the pActivity conversion, and the fail-closed sha256 custody chain — now
 * lives in `activityDataset.mjs`, unchanged, because the GIPR track needs the
 * same machinery and this repository builds one engine per job, not one per
 * target. THIS file is what is genuinely GLP-1R-specific: the pin paths and
 * the target label used in custody messages. Nothing about the science
 * changed; the D-077 frozen gate and the D-077a pin are untouched.
 *
 * Existing callers (`glp1rEfficacyAdapter.mjs`, `scripts/glp1r-e2e.mjs`,
 * `scripts/glp1r-v2-e2e.mjs`, `scripts/ingest-glp1r-activity.mjs`,
 * `glp1rQsar.test.mjs`) import the same three names with the same signatures
 * and get the same behaviour.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeActivityRows, writeActivityPin, loadActivityPin } from './activityDataset.mjs';

export { HUMAN_ORGANISM, PACTIVITY_MIN, PACTIVITY_MAX, strictNumeric, toPActivity } from './activityDataset.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const PIN_PATH = path.join(HERE, 'glp1rActivity.json');
export const PIN_META_PATH = path.join(HERE, 'glp1rActivity.meta.json');

/** The GLP-1R target label carried into custody failure messages. */
export const TARGET_LABEL = 'GLP-1R';

const INGEST_HINT = 'run scripts/ingest-glp1r-activity.mjs against a human-supplied local artifact';

export function normalizeGlp1rRows(rawRows, options = {}) {
  return normalizeActivityRows(rawRows, options);
}

export function writeGlp1rPin(rows, { jsonPath = PIN_PATH, metaPath = PIN_META_PATH, resolvedTargetIds = [] } = {}) {
  return writeActivityPin(rows, { jsonPath, metaPath, resolvedTargetIds });
}

export function loadGlp1rPin({ jsonPath = PIN_PATH, metaPath = PIN_META_PATH } = {}) {
  return loadActivityPin({ jsonPath, metaPath, targetLabel: TARGET_LABEL, ingestHint: INGEST_HINT });
}
