import type { DomainAdapter, DomainAdapterRegistry } from '../agent/domainAdapter';
import { makeKeplerCampaignLab, makeQe4CampaignLab, KEPLER_LAB_PROVENANCE } from './campaignLabs';
import { QE4_DATASET_LABORATORY, pointsForGrid } from './qe4DatasetLaboratory';
import { NSSDC_PLANETARY_FACTSHEET_SOURCE_URL } from './nssdcPlanetaryFactSheet';

/**
 * E4 demonstrator registry: the two real `DomainAdapter`s this Phase E build
 * uses to prove cross-domain execution — QE4 (trapped-ion quantum
 * simulator, disordered 10-ion chain, k=5 partition) and Kepler (NASA NSSDC
 * planetary orbits). Both wrap an EXISTING, unmodified `CampaignLaboratory`
 * (`campaignLabs.ts`) — this file adds no science, only the declared
 * capabilities/provenance/limitations `domainAdapter.ts` requires.
 *
 * A DEMONSTRATOR choice, not a hardcoded requirement: `domainAdapter.ts`'s
 * `meetsProductionContract` only counts `registry.adapters.length >= 2` and
 * names neither domain.
 */

function qe4Provenance(): { readonly sourceUrl: string; readonly sourceVersion: string; readonly license: string | null; readonly retrievedAt: string | null } {
  const points = pointsForGrid('disorder', 5);
  const probe = points[0];
  if (probe === undefined) {
    return { sourceUrl: 'unknown', sourceVersion: 'unknown', license: null, retrievedAt: null };
  }
  const result = QE4_DATASET_LABORATORY.run({ pointId: `disorder:T=${probe.t}:k=5` });
  return {
    sourceUrl: result.provenance.sourceUrl,
    sourceVersion: result.provenance.sourceVersion,
    license: result.provenance.license,
    retrievedAt: result.provenance.retrievedAt,
  };
}

export function makeQe4DomainAdapter(): DomainAdapter {
  const laboratory = makeQe4CampaignLab(5);
  return {
    capabilities: {
      domainId: laboratory.labId,
      description: laboratory.problem,
      xLabel: laboratory.xLabel,
      yLabel: laboratory.yLabel,
    },
    availableData: () => laboratory.candidateX,
    laboratory,
    provenance: qe4Provenance(),
    limitations: [
      'Pinned to the k=5 partition of the disordered 10-ion chain only; the clean chain and other partition sizes are not exposed through this adapter.',
      'No live measurement: every observation comes from the already-pinned Zenodo archive (see provenance.sourceUrl), never a runtime call to hardware.',
    ],
  };
}

export function makeKeplerDomainAdapter(): DomainAdapter {
  const laboratory = makeKeplerCampaignLab();
  return {
    capabilities: {
      domainId: laboratory.labId,
      description: laboratory.problem,
      xLabel: laboratory.xLabel,
      yLabel: laboratory.yLabel,
    },
    availableData: () => laboratory.candidateX,
    laboratory,
    provenance: {
      sourceUrl: NSSDC_PLANETARY_FACTSHEET_SOURCE_URL,
      sourceVersion: KEPLER_LAB_PROVENANCE.rawSha256,
      license: null,
      retrievedAt: null,
    },
    limitations: [
      'Nine Sun-orbiting bodies only (Moon excluded — NASA\'s own table marks it as measured about the Earth, not the Sun).',
      'A published fact sheet snapshot, not a live ephemeris service.',
    ],
  };
}

export function makeDemonstratorDomainAdapterRegistry(): DomainAdapterRegistry {
  return { adapters: [makeQe4DomainAdapter(), makeKeplerDomainAdapter()] };
}
