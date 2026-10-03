import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { capabilityAvailable } from './campaign/toolchain.mjs';
import { getDockingTarget } from './compute/dockingTargets.mjs';
import { createVinaResearchRunExecutor, VINA_CANONICAL_CASE } from './compute/vinaResearchRunExecutor.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

describe('Vina/Meeko ResearchRun admission', () => {
  it('preserves byte-exact vetted target hashes on this checkout', () => {
    const target = getDockingTarget(VINA_CANONICAL_CASE.targetId);
    assert.equal(target.ok, true);
    assert.equal(target.pdbId, '1IEP');
    assert.equal(target.files['1iep_receptorH.pdb'].sha256, '5f6aee6029f9a2a2c2be32d4eb948ae70808690573e1b69a0850cdffd7048ca7');
    assert.equal(target.files['1iep_ligand.sdf'].sha256, '051b8742c32adc05c07fb486a4e7c9327f84e131cee33ac4e6a568d07553eb38');
  });

  it('pins the structural worker to reviewed Vina and Meeko versions', () => {
    const constraints = readFileSync(`${ROOT}/packages/backend/workers/structural/constraints.txt`, 'utf8');
    const dockerfile = readFileSync(`${ROOT}/packages/backend/workers/structural/Dockerfile`, 'utf8');
    assert.match(constraints, /^vina==1\.2\.7$/m);
    assert.match(constraints, /^meeko==0\.8\.0$/m);
    assert.match(dockerfile, /--only-binary=:all:/);
  });

  it('runs the fixed target/ligand/box/seed through real engines or blocks before inventing a pose', async () => {
    const runner = createVinaResearchRunExecutor();
    const out = await runner.runCanonicalDocking({ researchRunId: 'rr-vina-1', executionId: 'vina-1iep-runtime-001' });
    if (!capabilityAvailable('molecular-docking')) {
      assert.equal(out.ok, false);
      assert.equal(out.status, 'BLOCKED_BY_RUNTIME');
      assert.equal(out.record, null);
      return;
    }
    assert.equal(out.ok, true);
    assert.equal(out.record.status, 'SUCCESS');
    assert.equal(out.record.engineId, 'vina');
    assert.match(out.record.engineVersion, /^1\.2\./);
    assert.equal(out.result.seed, 42);
    assert.equal(out.result.exhaustiveness, 8);
    assert.ok(out.result.nPoses > 0);
    assert.ok(out.result.artifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256)));
    assert.equal(out.target.pdbId, '1IEP');
  });
});
