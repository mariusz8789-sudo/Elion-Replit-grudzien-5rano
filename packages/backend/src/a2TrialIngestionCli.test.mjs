import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * D-110 — end-to-end test of `scripts/ingest-a2-trial-evidence.mjs` against
 * a throwaway SANDBOX COPY of the real A2 pin directory (via
 * GENESIS_A2_DIR/GENESIS_A1_META_PATH env overrides — the script never
 * touches the real repo pins during this test). Proves the two things a
 * unit test of the pure gate alone cannot: that a successful ingestion
 * writes ONLY the supplement files, and that every base pin file's bytes
 * are provably unchanged afterward.
 *
 * TEST_FIXTURE DISCLOSURE: the study JSON used here is synthetic,
 * mechanics-only, and never touches the real repository pins.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'ingest-a2-trial-evidence.mjs');
const REAL_A2_DIR = path.join(REPO_ROOT, 'packages/frontend/src/core/biotechData/a2-ozempic-substitute');
const REAL_A1_META = path.join(REPO_ROOT, 'packages/frontend/src/core/biotechData/a1-glp1/meta.json');

function sha256File(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

function makeSandbox() {
  const dir = mkdtempSync(path.join(tmpdir(), 'a2-ingest-test-'));
  const a2Dir = path.join(dir, 'a2-ozempic-substitute');
  cpSync(REAL_A2_DIR, a2Dir, { recursive: true });
  // Sandbox supplement starts empty regardless of the real repo's current supplement state, so the test is deterministic.
  writeFileSync(path.join(a2Dir, 'external-supplement/trials.supplement.json'), '{}\n', 'utf8');
  writeFileSync(path.join(a2Dir, 'external-supplement/meta.supplement.json'), '{}\n', 'utf8');
  const a1MetaPath = path.join(dir, 'a1-meta.json');
  cpSync(REAL_A1_META, a1MetaPath);
  return { dir, a2Dir, a1MetaPath };
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function validManifest(nctId = 'NCT99999902') {
  const study = {
    protocolSection: {
      identificationModule: { nctId, briefTitle: 'TEST_FIXTURE — synthetic mechanics-only study, not real evidence' },
      conditionsModule: { conditions: ['Type 2 Diabetes'] },
      statusModule: { overallStatus: 'COMPLETED' },
      armsInterventionsModule: { armGroups: [{ label: 'A', type: 'EXPERIMENTAL' }] },
    },
    resultsSection: {
      outcomeMeasuresModule: { outcomeMeasures: [{ title: 'Change from Baseline in HbA1c (TEST_FIXTURE)', type: 'SECONDARY', groups: [{ id: 'G1', title: 'TEST_FIXTURE arm' }], denoms: [], classes: [] }] },
    },
  };
  const rawStudyJsonText = JSON.stringify(study);
  return {
    candidateChemblId: 'CHEMBL4084119',
    nctId,
    sourceUrl: `https://clinicaltrials.gov/api/v2/studies/${nctId}`,
    declaredSha256: sha256(rawStudyJsonText),
    retrievedAt: '2026-09-16T00:00:00Z',
    publicationDoi: null,
    rawStudyJsonText,
  };
}

function runCli(sandbox, manifestPath, extraArgs = []) {
  try {
    const out = execFileSync('node', [SCRIPT, '--manifest', manifestPath, ...extraArgs], {
      env: { ...process.env, GENESIS_A2_DIR: sandbox.a2Dir, GENESIS_A1_META_PATH: sandbox.a1MetaPath },
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status, out: (err.stdout ?? '') + (err.stderr ?? '') };
  }
}

describe('scripts/ingest-a2-trial-evidence.mjs — end-to-end against a sandbox copy', () => {
  it('valid package: accepted, written ONLY to the supplement files, base pin byte-identical', () => {
    const sandbox = makeSandbox();
    try {
      const beforeHashes = Object.fromEntries(
        ['candidates.json', 'candidates-with-trials.json', 'meta.json', 'targets.json', 'trials-CHEMBL4084119.json']
          .map((f) => [f, sha256File(path.join(sandbox.a2Dir, f))]),
      );

      const manifestPath = path.join(sandbox.dir, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify(validManifest()), 'utf8');

      const result = runCli(sandbox, manifestPath);
      assert.equal(result.code, 0, result.out);
      assert.match(result.out, /OUTCOME: ACCEPTED/);
      assert.match(result.out, /base pin integrity : VERIFIED UNCHANGED/);

      for (const [f, hash] of Object.entries(beforeHashes)) {
        assert.equal(sha256File(path.join(sandbox.a2Dir, f)), hash, `base pin file ${f} changed`);
      }

      const supplement = JSON.parse(readFileSync(path.join(sandbox.a2Dir, 'external-supplement/trials.supplement.json'), 'utf8'));
      assert.equal(supplement.CHEMBL4084119.length, 1);
      assert.equal(supplement.CHEMBL4084119[0].nctId, 'NCT99999902');

      const supplementMeta = JSON.parse(readFileSync(path.join(sandbox.a2Dir, 'external-supplement/meta.supplement.json'), 'utf8'));
      assert.ok('CHEMBL4084119/NCT99999902' in supplementMeta);
    } finally {
      rmSync(sandbox.dir, { recursive: true, force: true });
    }
  });

  it('dry-run: validates but writes nothing at all', () => {
    const sandbox = makeSandbox();
    try {
      const manifestPath = path.join(sandbox.dir, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify(validManifest('NCT99999903')), 'utf8');
      const before = readFileSync(path.join(sandbox.a2Dir, 'external-supplement/trials.supplement.json'), 'utf8');

      const result = runCli(sandbox, manifestPath, ['--dry-run']);
      assert.equal(result.code, 0, result.out);
      assert.match(result.out, /DRY RUN — nothing written/);

      const after = readFileSync(path.join(sandbox.a2Dir, 'external-supplement/trials.supplement.json'), 'utf8');
      assert.equal(after, before);
    } finally {
      rmSync(sandbox.dir, { recursive: true, force: true });
    }
  });

  it('A1-pinned NCT id: rejected, nothing written, exit code non-zero', () => {
    const sandbox = makeSandbox();
    try {
      const manifestPath = path.join(sandbox.dir, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify(validManifest('NCT00696657')), 'utf8'); // real A1 NCT id
      const before = readFileSync(path.join(sandbox.a2Dir, 'external-supplement/trials.supplement.json'), 'utf8');

      const result = runCli(sandbox, manifestPath);
      assert.notEqual(result.code, 0);
      assert.match(result.out, /A1_EVIDENCE_REJECTED/);

      const after = readFileSync(path.join(sandbox.a2Dir, 'external-supplement/trials.supplement.json'), 'utf8');
      assert.equal(after, before);
    } finally {
      rmSync(sandbox.dir, { recursive: true, force: true });
    }
  });

  it('second ingestion of the SAME nctId for the SAME candidate: rejected as a duplicate', () => {
    const sandbox = makeSandbox();
    try {
      const manifestPath = path.join(sandbox.dir, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify(validManifest('NCT99999904')), 'utf8');
      const first = runCli(sandbox, manifestPath);
      assert.equal(first.code, 0, first.out);

      const second = runCli(sandbox, manifestPath);
      assert.notEqual(second.code, 0);
      assert.match(second.out, /DUPLICATE_OBSERVATION/);
    } finally {
      rmSync(sandbox.dir, { recursive: true, force: true });
    }
  });
});
