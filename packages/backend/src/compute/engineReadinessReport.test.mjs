import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { listToolchain, TOOL_STATUS } from '../campaign/toolchain.mjs';
import {
  buildEngineReadinessReport,
  READINESS_STATUS,
  TOOLCHAIN_TOOL_IDS,
  _redact,
} from './engineReadinessReport.mjs';

const REQUIRED_ENGINE_FIELDS = [
  'toolId', 'engineName', 'version', 'capability', 'domain', 'adapterModule',
  'runtimeRequirement', 'libraryRequirement', 'executableRequirement', 'gpuRequirement', 'modelCheckpointRequirement',
  'availability', 'readiness', 'sourceStatus', 'referenceCaseStatus', 'blocker', 'limitations',
  'evidenceClass', 'license', 'evidence', 'provenance', 'fingerprint', 'durationMs',
];

const ABSOLUTE_PATH_PREFIXES = ['/home/', '/root/', '/usr/', '/tmp/', '/opt/', '/var/', 'C:\\'];

// Built once and reused: each build runs every registered engine's real reference case
// (RDKit/PySCF/OpenMM/Vina/Biopython/ADMET), so calling it per-assertion would re-run heavy
// engines (ADMET's ~9s model load in particular) far more than credit-conservation allows.
// Only the dedicated determinism test below builds a second report, deliberately.
const REPORT = buildEngineReadinessReport();

describe('engineReadinessReport — registry id parity (no drift from the real toolchain)', () => {
  test('TOOLCHAIN_TOOL_IDS is exactly listToolchain().map(t => t.toolId), same order', () => {
    // REPORT already warmed campaign/toolchain.mjs's internal validation cache, so this
    // reads the cache instead of re-running every engine a second time.
    const real = listToolchain().map((t) => t.toolId);
    assert.deepEqual([...TOOLCHAIN_TOOL_IDS], real, 'the static id enumeration in engineReadinessReport.mjs has drifted from campaign/toolchain.mjs — update TOOLCHAIN_TOOL_IDS (and REQUIREMENTS/ADAPTER_MODULE for any new id)');
  });
});

describe('engineReadinessReport — shape and honesty', () => {
  test('one entry per registered engine, every required field present', () => {
    const report = REPORT;
    assert.equal(report.engines.length, TOOLCHAIN_TOOL_IDS.length);
    for (const engine of report.engines) {
      for (const field of REQUIRED_ENGINE_FIELDS) assert.ok(field in engine, `${engine.toolId} is missing field "${field}"`);
      assert.ok(TOOLCHAIN_TOOL_IDS.includes(engine.toolId));
      assert.ok(Object.values(READINESS_STATUS).includes(engine.readiness), `${engine.toolId} has an unknown readiness value: ${engine.readiness}`);
      assert.equal(typeof engine.durationMs, 'number');
      assert.ok(engine.durationMs >= 0);
    }
  });

  test('READY is reported only when the toolchain registry itself already validated a passing reference case', () => {
    const report = REPORT;
    for (const engine of report.engines) {
      if (engine.readiness === READINESS_STATUS.READY) {
        assert.equal(engine.sourceStatus, TOOL_STATUS.AVAILABLE, `${engine.toolId} is READY but the registry status is ${engine.sourceStatus}`);
        assert.equal(engine.availability, true);
        assert.equal(engine.blocker, null);
        assert.equal(engine.referenceCaseStatus, 'PASSED');
        assert.ok(Array.isArray(engine.evidence) && engine.evidence.length >= 1, `${engine.toolId} is READY but carries no reference-case evidence`);
      } else {
        assert.notEqual(engine.sourceStatus, TOOL_STATUS.AVAILABLE, `${engine.toolId} is registry-AVAILABLE but not mapped to READY`);
        assert.ok(engine.blocker === null || typeof engine.blocker === 'string');
      }
    }
  });

  test('FAILED_REFERENCE_CASE vs FAILED_ENGINE are distinguished by whether reference-case evidence exists', () => {
    const report = REPORT;
    for (const engine of report.engines) {
      if (engine.readiness === READINESS_STATUS.FAILED_REFERENCE_CASE) assert.ok(Array.isArray(engine.evidence) && engine.evidence.length >= 1);
      if (engine.readiness === READINESS_STATUS.FAILED_ENGINE) assert.ok(engine.evidence === null || engine.evidence.length === 0);
    }
  });

  test('report is deterministic aside from generatedAt/durationMs (one deliberate second full build)', () => {
    const a = REPORT;
    const b = buildEngineReadinessReport();
    assert.equal(a.engines.length, b.engines.length);
    a.engines.forEach((engine, i) => {
      assert.equal(engine.fingerprint, b.engines[i].fingerprint, `${engine.toolId} fingerprint changed between two builds of the same environment`);
      assert.equal(engine.readiness, b.engines[i].readiness);
      assert.equal(engine.toolId, b.engines[i].toolId);
    });
    assert.equal(a.runtimeEnvironmentHash, b.runtimeEnvironmentHash);
  });

  test('known backend registry gaps (SEIR, the CERN toy-MC collision engine) are reported honestly, never fabricated as registered', () => {
    const report = REPORT;
    const names = report.knownGaps.map((g) => g.name);
    assert.ok(names.some((n) => /SEIR/i.test(n)));
    assert.ok(names.some((n) => /CERN/i.test(n)));
    for (const gap of report.knownGaps) assert.ok(gap.reason && gap.reason.length > 0);
  });

  test('the capability-manifest inconsistency found by the audit is resolved', () => {
    const report = REPORT;
    assert.ok(!report.registryBugsDiscovered.some((b) => b.location.includes('capabilities.mjs')));
  });

  test('additionalProbedLibraries never duplicates a toolId already covered by the validated toolchain', () => {
    const report = REPORT;
    for (const lib of report.additionalProbedLibraries) {
      assert.ok(!['rdkit', 'pyscf', 'openmm', 'pymeep', 'biopython'].includes(lib.probeKey));
      assert.notEqual(lib.probeKey, 'vina_py');
      assert.notEqual(lib.probeKey, 'meeko');
      assert.notEqual(lib.probeKey, 'admet_ai');
    }
  });

  test('no absolute local filesystem path leaks anywhere in the serialized report', () => {
    const report = REPORT;
    const json = JSON.stringify(report);
    for (const prefix of ABSOLUTE_PATH_PREFIXES) {
      assert.ok(!json.includes(prefix), `report leaks an absolute path starting with "${prefix}"`);
    }
  });
});

describe('_redact — absolute-path scrubbing, never over-eager', () => {
  test('strips a real absolute unix path embedded in a longer message', () => {
    const input = 'python/rdkit niedostępne w runtime: File "/home/user/.venv/lib/python3.11/site-packages/rdkit/__init__.py", line 3';
    const out = _redact(input);
    assert.ok(!out.includes('/home/user'));
    assert.ok(out.includes('<path-redacted>'));
  });

  test('strips a short two-segment absolute path', () => {
    assert.equal(_redact('binary at /opt/rocm'), 'binary at <path-redacted>');
  });

  test('does not touch a license string with a single slash and no directory depth', () => {
    assert.equal(_redact('MIT/LGPL'), 'MIT/LGPL');
    assert.equal(_redact('Apache-2.0 / LGPL'), 'Apache-2.0 / LGPL');
  });

  test('passes through non-string values unchanged', () => {
    assert.equal(_redact(null), null);
    assert.equal(_redact(42), 42);
    assert.equal(_redact(undefined), undefined);
  });
});
