import type { EpistemicLabel } from './epistemic';
import type { EvidenceSink } from './contracts';
import type { Specimen } from './types';
import { stableHash } from './hash';

export class SpecimenRegistry {
  private readonly specimens = new Map<string, Specimen>();
  constructor(private readonly evidenceSink?: EvidenceSink) {}

  create(args: Omit<Specimen, 'specimenId' | 'chainOfCustody'> & { epistemic?: EpistemicLabel }): Specimen {
    const specimenId = `SPM-${stableHash(args)}`;
    const specimen: Specimen = {
      ...args,
      specimenId,
      epistemic: args.epistemic ?? 'MODEL',
      chainOfCustody: [`CREATED:${specimenId}`],
    };
    this.specimens.set(specimenId, specimen);
    this.evidenceSink?.addRecord({
      sourceUrl: 'genesis://specimen-registry',
      sourceTimestamp: new Date().toISOString(),
      claim: `Specimen ${specimenId} created.`,
      claimType: 'SPECIMEN_EVENT',
      confidence: 1,
      provenance: { specimenId: specimen.specimenId, tissueType: specimen.tissueType, label: specimen.label, epistemic: specimen.epistemic },
    });
    return specimen;
  }

  get(specimenId: string): Specimen {
    const specimen = this.specimens.get(specimenId);
    if (!specimen) throw new Error(`SPECIMEN_NOT_FOUND:${specimenId}`);
    return specimen;
  }

  move(specimenId: string, event: string): Specimen {
    const specimen = this.get(specimenId);
    const updated = { ...specimen, chainOfCustody: [...specimen.chainOfCustody, event] };
    this.specimens.set(specimenId, updated);
    return updated;
  }

  list(): readonly Specimen[] { return [...this.specimens.values()]; }
}
