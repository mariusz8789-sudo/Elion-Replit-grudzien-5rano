import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { capabilityAvailable } from './campaign/toolchain.mjs';
import { PYSCF_CANONICAL_H2, createPyScfResearchRunExecutor } from './compute/pyscfResearchRunExecutor.mjs';
import { validateEngineExecutionRequest } from './compute/engineExecutionContract.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

describe('PySCF ResearchRun admission', () => {
  it('freezes the canonical H2 RHF/STO-3G case into the generic execution request', () => {
    const request = validateEngineExecutionRequest({
      researchRunId: 'rr-pyscf-1', experimentId: PYSCF_CANONICAL_H2.caseId, executionId: 'pyscf-h2-001',
      capabilityId: PYSCF_CANONICAL_H2.capabilityId, input: PYSCF_CANONICAL_H2.input,
    });
    assert.equal(request.ok, true);
    assert.equal(request.value.engineId, 'pyscf');
    assert.match(request.value.inputHash, /^[a-f0-9]{64}$/);
  });

  it('pins the commercial worker to the reviewed real PySCF runtime', () => {
    const constraints = readFileSync(`${ROOT}/packages/backend/workers/chem-light/constraints.txt`, 'utf8');
    const dockerfile = readFileSync(`${ROOT}/packages/backend/workers/chem-light/Dockerfile`, 'utf8');
    assert.match(constraints, /^pyscf==2\.14\.0$/m);
    assert.match(dockerfile, /--only-binary=:all:/);
    assert.match(dockerfile, /import pyscf, Bio/);
  });

  it('executes real PySCF when admitted, otherwise records honest BLOCKED_BY_RUNTIME', async () => {
    const runner = createPyScfResearchRunExecutor();
    const out = await runner.runCanonicalH2({ researchRunId: 'rr-pyscf-1', experimentId: PYSCF_CANONICAL_H2.caseId, executionId: 'pyscf-h2-runtime-001' });
    if (!capabilityAvailable('quantum-chemistry')) {
      assert.equal(out.ok, false);
      assert.equal(out.record.status, 'BLOCKED_BY_RUNTIME');
      assert.equal(out.record.outputHash, null);
      return;
    }
    assert.equal(out.ok, true);
    assert.equal(out.record.status, 'SUCCESS');
    assert.equal(out.record.engineId, 'pyscf');
    assert.match(out.record.engineVersion, /^\d+\.\d+/);
    assert.match(out.record.environmentIdentity, /^[a-f0-9]{64}$/);
    assert.ok(Math.abs(out.result.data.energyHartree - PYSCF_CANONICAL_H2.expectedEnergyHartree) <= PYSCF_CANONICAL_H2.toleranceHartree);
  });
});
