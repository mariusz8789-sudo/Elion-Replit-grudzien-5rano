/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from './EvidenceLedger.js';
import { METABOLIC_NETWORK, atpBookkeeping, commitMechanismReport, dnaRepair, dnaReplication, electronTransportChain, metabolicFlux, molecularMechanism, proteinFoldingAbstraction, rnaProcessing } from './molecularBiology.js';
import { kernelRegistry, molecularBiologyProvider } from '../mythos/KernelProviderRegistry.js';

const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };

describe('molecular biology 2.0 — labelled textbook models on the one engine (D-130)', () => {
  it('replication: semiconservative, fidelity ladder ≈ 10⁻⁹ per base, deterministic hash', () => {
    const r = dnaReplication({ templateBp: 1_000_000 });
    expect(r.outputs.daughterDuplexes).toBe(2); expect(r.outputs.basesSynthesized).toBe(2_000_000);
    expect(r.outputs.expectedErrorsRaw).toBeCloseTo(20, 6); expect(r.outputs.expectedErrorsAfterMismatchRepair).toBeCloseTo(0.002, 9);
    expect(r.outputs.effectiveErrorRate).toBeCloseTo(1e-9, 12); expect(r.label).toBe('TEXTBOOK_ESTIMATE');
    expect(dnaReplication({ templateBp: 1_000_000 }).contentHash).toBe(r.contentHash);
  });
  it('repair: damage classes map to textbook pathways; a double-strand break without a sister chromatid is error-prone NHEJ', () => {
    const withSister = dnaRepair({ lesions: { DOUBLE_STRAND_BREAK: 2, UV_PYRIMIDINE_DIMER: 5 } });
    expect(withSister.outputs.assignments.find((a) => a.damage === 'DOUBLE_STRAND_BREAK')?.pathways).toEqual(['HOMOLOGOUS_RECOMBINATION']);
    expect(withSister.outputs.assignments.find((a) => a.damage === 'UV_PYRIMIDINE_DIMER')?.pathways).toContain('NUCLEOTIDE_EXCISION_REPAIR');
    const noSister = dnaRepair({ lesions: { DOUBLE_STRAND_BREAK: 1 }, sisterChromatidAvailable: false });
    expect(noSister.outputs.assignments[0]).toMatchObject({ pathways: ['NON_HOMOLOGOUS_END_JOINING'], errorProne: true });
    expect(noSister.outputs.totalLesions).toBe(1);
  });
  it('RNA processing: bookkeeping of cap, splicing, poly-A; isoform bound; intron count must fit', () => {
    const r = rnaProcessing({ exonLengths: [100, 50, 80, 120], intronLengths: [1000, 500, 300], polyATail: 200 });
    expect(r.outputs).toMatchObject({ preMrnaLength: 2150, matureMrnaLength: 100 + 50 + 80 + 120 + 200 + 1, splicedIntrons: 3, exonJunctions: 3, possibleExonSkippingIsoforms: 4 });
    expect(() => rnaProcessing({ exonLengths: [100, 100], intronLengths: [] })).toThrow(/INTRON_COUNT/);
  });
  it('folding abstraction: more hydrophobic burial folds, denaturant unfolds, fraction stays in [0,1]', () => {
    const stable = proteinFoldingAbstraction({ chainLengthAa: 150, hydrophobicFraction: 0.45 });
    const denatured = proteinFoldingAbstraction({ chainLengthAa: 150, hydrophobicFraction: 0.45, denaturantM: 6 });
    expect(stable.outputs.foldedFraction).toBeGreaterThan(denatured.outputs.foldedFraction);
    expect(stable.outputs.regime).toBe('FOLDED'); expect(denatured.outputs.foldedFraction).toBeGreaterThanOrEqual(0);
    expect(stable.notes.join(' ')).toMatch(/toy coefficients/);
  });
  it('ETC → gradient → synthase: 10 H⁺/NADH, 6/FADH₂, ≈3.67 H⁺/ATP; leak lowers ATP; P/O in the textbook band', () => {
    const r = electronTransportChain({ nadh: 10, fadh2: 2 });
    expect(r.outputs.protonsPumped).toBe(112); expect(r.outputs.poRatioNadh).toBeCloseTo(2.727, 3); expect(r.outputs.poRatioFadh2).toBeCloseTo(1.636, 3);
    expect(r.outputs.atpFromSynthase).toBeCloseTo(112 / (8 / 3 + 1), 3);
    expect(electronTransportChain({ nadh: 10, fadh2: 2, protonLeakFraction: 0.2 }).outputs.atpFromSynthase).toBeLessThan(r.outputs.atpFromSynthase);
  });
  it('ATP bookkeeping: Atkinson energy charge and regime bands', () => {
    expect(atpBookkeeping({ atp: 9, adp: 1, amp: 0.2 }).outputs.energyCharge).toBeCloseTo((9 + 0.5) / 10.2, 4);
    expect(atpBookkeeping({ atp: 9, adp: 1, amp: 0.2 }).outputs.regime).toBe('TYPICAL');
    expect(atpBookkeeping({ atp: 1, adp: 1, amp: 8 }).outputs.regime).toBe('DEPLETED');
    expect(atpBookkeeping({ atp: 0, adp: 0, amp: 0 }).outputs.energyCharge).toBe(0);
  });
  it('metabolic network + flux: anaerobic 2 ATP/glucose with lactate; aerobic ≈ 30–32 ATP/glucose, 6 O₂, 6 CO₂', () => {
    expect(METABOLIC_NETWORK.map((r) => r.id)).toEqual(['GLYCOLYSIS', 'LACTATE_FERMENTATION', 'PYRUVATE_OXIDATION', 'CITRIC_ACID_CYCLE', 'OXIDATIVE_PHOSPHORYLATION']);
    const an = metabolicFlux({ glucoseFlux: 3, oxygenAvailable: false });
    expect(an.outputs).toMatchObject({ atpFlux: 6, lactateFlux: 6, atpPerGlucose: 2, regime: 'ANAEROBIC' });
    const ae = metabolicFlux({ glucoseFlux: 1, oxygenAvailable: true });
    expect(ae.outputs.atpPerGlucose).toBeGreaterThan(30); expect(ae.outputs.atpPerGlucose).toBeLessThan(36);
    expect(ae.outputs).toMatchObject({ co2Flux: 6, oxygenFlux: 6, substrateLevelAtp: 4, regime: 'AEROBIC' });
  });
  it('the kernel provider serves both request shapes on the one ledger; dispatcher covers every kind', () => {
    const ledger = new EvidenceLedger(clock);
    const p = molecularBiologyProvider(ledger);
    expect(p.capabilities).toEqual(['central-dogma-model', 'molecular-mechanism-model']);
    const ctx = { kernelId: 'test', providers: kernelRegistry } as unknown as Parameters<typeof p.analyze>[0];
    const mech = p.analyze(ctx, { kind: 'ATP_BOOKKEEPING', input: { atp: 5, adp: 1, amp: 0.5 }, worldId: 'w' }) as { report: { kind: string }; ledgerContentHash: string };
    expect(mech.report.kind).toBe('ATP_BOOKKEEPING'); expect(mech.ledgerContentHash).toMatch(/^[0-9a-f]{64}$/);
    const dogma = p.analyze(ctx, { worldId: 'w', dna: 'ATGGCCTAA' }) as { report: { label: string } };
    expect(dogma.report.label).toBe('MODEL');
    expect(ledger.getActive().length).toBe(2);
    for (const kind of ['DNA_REPLICATION', 'DNA_REPAIR', 'RNA_PROCESSING', 'PROTEIN_FOLDING_ABSTRACTION', 'ELECTRON_TRANSPORT_CHAIN', 'ATP_BOOKKEEPING', 'METABOLIC_FLUX'] as const) {
      const input = kind === 'DNA_REPLICATION' ? { templateBp: 10 } : kind === 'DNA_REPAIR' ? { lesions: { BASE_MISMATCH: 1 } } : kind === 'RNA_PROCESSING' ? { exonLengths: [10, 10], intronLengths: [5] } : kind === 'PROTEIN_FOLDING_ABSTRACTION' ? { chainLengthAa: 50, hydrophobicFraction: 0.4 } : kind === 'ELECTRON_TRANSPORT_CHAIN' ? { nadh: 1, fadh2: 0 } : kind === 'ATP_BOOKKEEPING' ? { atp: 1, adp: 1, amp: 1 } : { glucoseFlux: 1, oxygenAvailable: true };
      const rep = molecularMechanism({ kind, input } as never);
      expect(rep.kind).toBe(kind); expect(commitMechanismReport(ledger, rep, 'w')).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
