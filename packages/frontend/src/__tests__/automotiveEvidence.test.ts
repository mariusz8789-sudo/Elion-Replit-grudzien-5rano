import { describe, expect, it } from 'vitest';
import { buildAutomotiveAuditResult } from '../core/automotive/auditResult';
import { buildDemoAutomotiveAssessment } from '../core/automotive/demoFixture';
import { buildAutomotiveEvidenceChain, buildAutomotiveEvidencePack, buildAutomotiveExperimentRun } from '../core/automotive/evidence';
import { exportEvidencePackRoCrate, verifyEvidencePackRoCrateRoundTrip } from '../core/experimentFabric/evidencePackRoCrate';

/**
 * EVIDENCE BRIDGE — test matrix items J (Evidence Pack creation), K
 * (provenance), L (RO-Crate round trip). Every function called here
 * (`createScientificEvidencePack`, `exportEvidencePackRoCrate`,
 * `verifyEvidencePackRoCrateRoundTrip`) is the EXISTING, unmodified Genesis
 * machinery — these tests prove reuse, not a new evidence system.
 */

const result = buildAutomotiveAuditResult(buildDemoAutomotiveAssessment());

describe('K — provenance', () => {
  it('ExperimentRun niesie realną, deterministyczną prowieniencję', () => {
    const run = buildAutomotiveExperimentRun(result);
    expect(run.provenance.resultOrigin).toBe('real-engine');
    expect(run.provenance.domainId).toBe('automotive-claims');
    expect(run.provenance.deterministic).toBe(true);
    expect(run.runId).toBe(buildAutomotiveExperimentRun(result).runId);
  });

  it('założenia jawnie mówią, że żaden prawdziwy dostawca wizji/VIN/cen nie jest podłączony', () => {
    const run = buildAutomotiveExperimentRun(result);
    expect(run.result.assumptions.join(' ')).toMatch(/No real vision, VIN, OEM\/aftermarket, pricing, or labor-rate provider/);
  });
});

describe('J — tworzenie Evidence Pack przez ISTNIEJĄCY kontrakt', () => {
  it('buduje realny ScientificEvidenceChain z jednym ramieniem baseline', () => {
    const chain = buildAutomotiveEvidenceChain(result);
    expect(chain.createdFromRealRunsOnly).toBe(true);
    expect(chain.arms).toHaveLength(1);
    expect(chain.arms[0]!.kind).toBe('baseline');
    expect(chain.design.hypothesis.falsification.metric).toBe('materialGapCount');
  });

  it('paczka dowodowa odzwierciedla realną ocenę (gapy z demo fixture -> FALSIFIED_WITHIN_PROTOCOL)', () => {
    const pack = buildAutomotiveEvidencePack(result);
    expect(pack.contractVersion).toBeDefined();
    expect(pack.hypothesisAssessment.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(pack.runCount).toBe(1);
    expect(pack.disclaimer).toMatch(/nie stanowi odkrycia|does not constitute/i);
  });

  it('brak materialnych gapów daje SUPPORTED_WITHIN_PROTOCOL', () => {
    const cleanResult = { ...result, gaps: [] };
    const pack = buildAutomotiveEvidencePack(cleanResult);
    expect(pack.hypothesisAssessment.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
  });
});

describe('L — RO-Crate round trip przez ISTNIEJĄCY eksporter', () => {
  it('eksport i odtworzenie są identyczne (MATCH)', () => {
    const pack = buildAutomotiveEvidencePack(result);
    const roundTrip = verifyEvidencePackRoCrateRoundTrip(pack);

    expect(roundTrip.status).toBe('MATCH');
    expect(roundTrip.missing).toEqual([]);
  });

  it('RO-Crate niesie prawdziwy odcisk protokołu i hipotezy', () => {
    const pack = buildAutomotiveEvidencePack(result);
    const crate = exportEvidencePackRoCrate(pack);
    const protocolNode = crate['@graph'].find((n) => (n['@id'] as string).startsWith('#protocol/'))!;
    expect(protocolNode['genesis:hypothesis']).toEqual(pack.protocol.hypothesis);
  });
});
