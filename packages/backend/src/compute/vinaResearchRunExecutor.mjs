import { readFileSync } from 'node:fs';
import { createEngineExecutionPort } from './engineExecutionContract.mjs';
import { createLocalCanonicalScientificExecutor } from './localCanonicalScientificExecutor.mjs';
import { DEFAULT_DOCKING_TARGET, prepareDockingTarget } from './dockingTargets.mjs';

export const VINA_CANONICAL_CASE = Object.freeze({
  caseId: 'vina:abl1-1iep-imatinib-seed42',
  targetId: DEFAULT_DOCKING_TARGET,
  ligandSmiles: 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1',
  center: Object.freeze([15.19, 53.903, 16.917]),
  boxSize: Object.freeze([20, 20, 20]),
  exhaustiveness: 8,
  nPoses: 3,
  seed: 42,
});

export function createVinaResearchRunExecutor({
  executor = createLocalCanonicalScientificExecutor(),
  prepareTarget = prepareDockingTarget,
  readText = (path) => readFileSync(path, 'utf8'),
  admit,
  now,
} = {}) {
  const port = createEngineExecutionPort({ executor, admit, now });
  return Object.freeze({
    async runCanonicalDocking({ researchRunId, experimentId = VINA_CANONICAL_CASE.caseId, executionId, signal = null }) {
      const target = prepareTarget(VINA_CANONICAL_CASE.targetId);
      if (!target?.ok) {
        return {
          ok: false,
          status: target?.error === 'BLOCKED_BY_RUNTIME' ? 'BLOCKED_BY_RUNTIME' : 'BLOCKED_BY_DATA',
          failureCode: target?.error ?? 'TARGET_PREPARATION_FAILED',
          reason: target?.reason ?? null,
          record: null,
          targetId: VINA_CANONICAL_CASE.targetId,
        };
      }
      const receptorPdbqt = readText(target.receptorPdbqtPath);
      const execution = await port.execute({
        researchRunId,
        experimentId,
        executionId,
        capabilityId: 'molecular-docking',
        input: {
          ligandSmiles: VINA_CANONICAL_CASE.ligandSmiles,
          receptorPdbqt,
          center: VINA_CANONICAL_CASE.center,
          boxSize: VINA_CANONICAL_CASE.boxSize,
          exhaustiveness: VINA_CANONICAL_CASE.exhaustiveness,
          nPoses: VINA_CANONICAL_CASE.nPoses,
          seed: VINA_CANONICAL_CASE.seed,
        },
        replayCapability: 'DETERMINISTIC_WITH_FIXED_SEED_TARGET_AND_ENGINE',
      }, { signal });
      return {
        ...execution,
        target: {
          targetId: target.targetId,
          pdbId: target.pdbId,
          chain: target.chain,
          sourceSha256: target.sourceSha256,
          receptorPdbqtSha256: target.receptorPdbqtSha256,
          center: target.center,
          boxSize: target.boxSize,
        },
      };
    },
  });
}
