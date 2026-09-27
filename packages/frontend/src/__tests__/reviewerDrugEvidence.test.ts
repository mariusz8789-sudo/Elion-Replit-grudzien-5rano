import { describe, expect, it } from 'vitest';
import { DOCKING_SOURCE, RETRO_EVIDENCE, verifyDockingInputs } from '../core/reviewer/drugEvidence';

describe('reviewer drug evidence', () => {
  it('the committed 1IEP docking inputs re-hash to the manifest values', async () => {
    const checks = await verifyDockingInputs();
    expect(checks.map((c) => c.file).sort()).toEqual(Object.keys(DOCKING_SOURCE.files).sort());
    for (const c of checks) expect(c.computed).toBe(c.expected);
  });

  it('the committed retrosynthesis record is the solved, replayed imatinib run', () => {
    expect(RETRO_EVIDENCE.status).toBe('OK');
    expect(RETRO_EVIDENCE.replayVerdict).toBe('MATCH');
    expect(RETRO_EVIDENCE.synthesis.evidenceClass).toBe('MODEL_ESTIMATE');
    expect(RETRO_EVIDENCE.synthesis.topRoute.steps).toBe(3);
    expect(RETRO_EVIDENCE.synthesis.topRoute.allStartingMaterialsInStock).toBe(true);
    expect(RETRO_EVIDENCE.handoff.canonicalSmiles).toBe('Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1');
    expect(RETRO_EVIDENCE.reference.pass).toBe(true);
  });
});
