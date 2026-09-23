import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRailwayWorkerReadiness,
  DEPLOYMENT_CLASS,
  READINESS_STATUS,
} from './railwayWorkerReadiness.mjs';

// Built once and reused: every engine's reference case is expensive (ADMET's
// model load alone takes several seconds), exactly like
// engineReadinessReport.test.mjs's pattern.
const REPORT = buildRailwayWorkerReadiness();

describe('railway worker readiness matrix — shape and vocabulary', () => {
  test('covers every canonical engine plus the two stdlib data adapters, and nothing else', () => {
    const ids = REPORT.engines.map((e) => e.toolId).sort();
    assert.deepEqual(ids, [
      'admet', 'biopython', 'cms-open-data-zmumu', 'depmap-24q2', 'openmm',
      'pymeep', 'pyscf', 'rdkit', 'toxicity', 'vina',
    ]);
  });

  test('every entry uses only the task-required deployment/readiness vocabulary', () => {
    const deploymentValues = new Set(Object.values(DEPLOYMENT_CLASS));
    const readinessValues = new Set(Object.values(READINESS_STATUS));
    for (const e of REPORT.engines) {
      assert.ok(deploymentValues.has(e.deploymentClass), `${e.toolId} has unknown deploymentClass ${e.deploymentClass}`);
      assert.ok(readinessValues.has(e.readinessStatus), `${e.toolId} has unknown readinessStatus ${e.readinessStatus}`);
    }
  });

  test('a LOCAL_REFERENCE_PASS_PENDING_RAILWAY engine never claims Railway itself proved anything', () => {
    // The vocabulary itself must not contain a bare "READY"/"AVAILABLE" term —
    // nothing here has run on Railway, so nothing may claim to.
    for (const status of Object.values(READINESS_STATUS)) {
      assert.ok(!/^READY$/.test(status));
      assert.ok(!/PROVEN/.test(status));
    }
  });

  test('counts.total matches the engine array length and sub-counts do not overcount', () => {
    assert.equal(REPORT.counts.total, REPORT.engines.length);
    const sum = REPORT.counts.localReferencePassPendingRailway
      + REPORT.counts.blockedRuntime
      + REPORT.counts.blockedData
      + REPORT.counts.blockedLicense
      + REPORT.counts.failedReferenceCase;
    assert.ok(sum <= REPORT.counts.total);
  });
});

describe('railway worker readiness matrix — worker grouping', () => {
  test('chem-light groups exactly pyscf and biopython', () => {
    assert.deepEqual([...REPORT.workerGroups['chem-light']].sort(), ['biopython', 'pyscf']);
  });
  test('structural groups exactly openmm and vina', () => {
    assert.deepEqual([...REPORT.workerGroups.structural].sort(), ['openmm', 'vina']);
  });
  test('admet groups exactly admet and toxicity, isolated from the other workers', () => {
    assert.deepEqual([...REPORT.workerGroups.admet].sort(), ['admet', 'toxicity']);
  });
  test('rdkit and pymeep are never assigned to any Railway worker group', () => {
    const grouped = new Set(Object.values(REPORT.workerGroups).flat());
    assert.ok(!grouped.has('rdkit'), 'rdkit stays embedded in the main service');
    assert.ok(!grouped.has('pymeep'), 'pymeep has no working worker (genuine external blocker)');
  });
});

describe('railway worker readiness matrix — honest classifications', () => {
  test('rdkit is classified embedded in the main service, matching the shipped Dockerfile', () => {
    const rdkit = REPORT.engines.find((e) => e.toolId === 'rdkit');
    assert.equal(rdkit.deploymentClass, DEPLOYMENT_CLASS.EMBEDDED_MAIN_SERVICE);
  });

  test('pymeep is a genuine external blocker with a documented, specific reason', () => {
    const pymeep = REPORT.engines.find((e) => e.toolId === 'pymeep');
    assert.equal(pymeep.deploymentClass, DEPLOYMENT_CLASS.GENUINE_EXTERNAL_BLOCKER);
    assert.equal(pymeep.readinessStatus, READINESS_STATUS.BLOCKED_RUNTIME);
    assert.ok(pymeep.reason && pymeep.reason.includes('conda-forge'), 'reason must explain the real conda-forge dependency');
  });

  test('cms-open-data-zmumu needs no pinned package or worker (stdlib-only, data committed in-repo)', () => {
    const cms = REPORT.engines.find((e) => e.toolId === 'cms-open-data-zmumu');
    assert.equal(cms.package, null);
    assert.equal(cms.deploymentClass, DEPLOYMENT_CLASS.EMBEDDED_MAIN_SERVICE);
    // The checksum-verified CSV is committed in this repo (see D-051 / cmsOpenDataAdapter.mjs);
    // this must be a real, reproducible pass, not an environment-dependent guess.
    assert.equal(cms.readinessStatus, READINESS_STATUS.LOCAL_REFERENCE_PASS_PENDING_RAILWAY);
  });

  test('depmap-24q2 honestly reflects whatever the real environment reports (no fabricated pass)', () => {
    const depmap = REPORT.engines.find((e) => e.toolId === 'depmap-24q2');
    assert.equal(depmap.package, null);
    // Only two honest outcomes are possible: the hash-verified dataset is
    // actually present (pass) or it is not (blocked) — never a fake pass.
    assert.ok(
      [READINESS_STATUS.LOCAL_REFERENCE_PASS_PENDING_RAILWAY, READINESS_STATUS.BLOCKED_DATA].includes(depmap.readinessStatus),
    );
    if (depmap.readinessStatus === READINESS_STATUS.BLOCKED_DATA) {
      assert.ok(depmap.reason);
    }
  });

  test('every LOCAL_REFERENCE_PASS_PENDING_RAILWAY toolchain engine carries real validation evidence', () => {
    for (const e of REPORT.engines) {
      if (e.readinessStatus === READINESS_STATUS.LOCAL_REFERENCE_PASS_PENDING_RAILWAY && e.package !== null) {
        assert.ok(Array.isArray(e.validation) && e.validation.length >= 1, `${e.toolId} claims a local pass without evidence`);
      }
    }
  });

  test('admet and toxicity report the same underlying engine, split only by capability', () => {
    const admet = REPORT.engines.find((e) => e.toolId === 'admet');
    const toxicity = REPORT.engines.find((e) => e.toolId === 'toxicity');
    assert.equal(admet.version, toxicity.version);
    assert.equal(admet.workerGroup, toxicity.workerGroup);
  });
});

describe('railway worker readiness matrix — no secret/path leakage', () => {
  test('the full serialized report never contains this process\'s real working directory', () => {
    const json = JSON.stringify(REPORT);
    assert.ok(!json.includes(process.cwd()));
  });
});
