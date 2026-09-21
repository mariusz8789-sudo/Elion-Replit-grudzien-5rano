import type { CampaignLaboratory } from '../agent/discoveryCampaign';
import type { ObservationGapFeasibility } from '../agent/observationGap';
import type { ModelPoint } from '../agent/modelSpace';
import { pointsForGrid } from './qe4DatasetLaboratory';
import {
  NSSDC_PLANETARY_FACTSHEET_RAW_SHA256,
  NSSDC_PLANETARY_FACTSHEET_SOURCE_URL,
  parseNssdcPlanetaryFactSheet,
  type NssdcPlanetKey,
} from './nssdcPlanetaryFactSheet';
import nssdcHtml from './nssdc-planetary-factsheet.html?raw';

/**
 * TWO LABORATORY ADAPTERS for the one generic engine in
 * `core/agent/discoveryCampaign.ts`, over two unrelated pinned datasets in two
 * unrelated sciences. Their existence is the argument that the engine is not a
 * QE4 loop wearing a general name: neither adapter contains a hypothesis, a
 * model form, a stopping rule or a next-experiment rule. Each says only what
 * can be observed and how to observe it; everything scientific happens in the
 * engine, identically for both.
 */

/** Half of the last published decimal place — the precision the SOURCE itself declares by how it wrote the number. */
function publishedQuantizationHalfWidth(value: number): number {
  const text = String(value);
  const dot = text.indexOf('.');
  const decimals = dot === -1 ? 0 : text.length - dot - 1;
  return 0.5 * Math.pow(10, -decimals);
}

/*
 * FEASIBILITY, DECLARED HONESTLY. Both of these laboratories read PINNED
 * ARCHIVAL data: neither this system nor this repository can perform a new
 * measurement, so `available` is false and every cost field is null with a
 * `basis` that says why. The point of a gap request is to tell a human what is
 * missing; telling them an invented price for it would defeat that.
 */
function qe4Feasibility(): ObservationGapFeasibility {
  return {
    available: false,
    costEstimate: null,
    costUnit: null,
    timeEstimate: null,
    legalBoundary:
      'None beyond the dataset licence. The request is for a physics measurement on a trapped-ion apparatus; this system cannot operate one and must not imply otherwise.',
    basis:
      'This laboratory serves the pinned Brydges et al. 2019 dataset (Zenodo 10.5281/zenodo.2527010). A new time point would require running the trapped-ion experiment again, which is outside this repository entirely, so no cost or lead time is estimated here.',
  };
}

function keplerFeasibility(): ObservationGapFeasibility {
  return {
    available: false,
    costEstimate: null,
    costUnit: null,
    timeEstimate: null,
    legalBoundary: 'None. NASA NSSDC planetary fact sheet data is public-domain US Government work.',
    basis:
      'This laboratory serves the pinned NASA NSSDC planetary fact sheet. A body at a distance the sheet does not list would have to come from another published ephemeris; this system does not fetch one, so availability is reported as false rather than assumed.',
  };
}

// --- Laboratory A: QE4 entanglement growth (quantum, Brydges et al. 2019) ----

/**
 * S2 (second Rényi entropy) against time, at one fixed partition size, over
 * the pinned disorder dataset. Sourced through the P0.1 `DatasetLaboratory`
 * seam (`pointsForGrid`), so this adapter performs no computation of its own —
 * every number traces to the already-verified `runQe4BrydgesAnalysis()`
 * bootstrap and carries that run's real per-point sigma.
 */
export function makeQe4CampaignLab(k: 5 | 10 = 5): CampaignLaboratory {
  const points = pointsForGrid('disorder', k);
  const byX = new Map(points.map((p) => [p.t, { x: p.t, y: p.s2, sigma: p.sigma }]));
  const xs = points.map((p) => p.t);
  return {
    labId: `qe4-brydges-disorder-k${k}`,
    problem: `How does the second Rényi entropy S2 of a ${k}-ion partition grow with time in the disordered 10-ion chain?`,
    candidateX: xs,
    observe: (x) => byX.get(x) ?? null,
    xRange: { min: Math.min(...xs), max: Math.max(...xs) },
    xLabel: 'T[ms]',
    yLabel: 'S2',
    declareObservable: () => ({
      quantity: `second Rényi entropy S2 of a ${k}-ion partition at a time this dataset does not cover`,
      unit: 'dimensionless (S2)',
      instrumentClass: 'trapped-ion quantum simulator with randomized-measurement readout',
    }),
    declareFeasibility: () => qe4Feasibility(),
    gapRecipient: 'LABORATORY',
  };
}

// --- Laboratory B: planetary orbits (astronomy, NASA NSSDC fact sheet) -------

/**
 * The Moon is excluded deliberately: NASA's own table marks its distance and
 * period with an asterisk because they are measured about the EARTH, not the
 * Sun, so it does not belong to the population this question is about.
 */
const SUN_ORBITING: readonly NssdcPlanetKey[] = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

/**
 * Orbital period against distance from the Sun, in LOG–LOG space, over the
 * pinned NASA NSSDC planetary fact sheet.
 *
 * Why log–log: a power law `T = C·a^p` is exactly a straight line
 * `ln T = p·ln a + ln C` there, so the engine can discover the EXPONENT as an
 * ordinary fitted coefficient of a `CONSTANT + LINEAR` model rather than
 * needing that exponent to have been pre-enumerated in the grammar's POWER
 * grid. Nothing about the law is supplied — the engine is handed nine
 * published pairs of numbers and must find the shape itself.
 *
 * Sigma: NASA publishes no uncertainties, so a sigma is derived from the
 * PRECISION OF THE PUBLISHED NUMBER ITSELF (half of its last printed decimal),
 * propagated into log space as `halfWidth / value`. That is a real property of
 * the source; inventing a measurement error NASA did not state would not be.
 */
export function makeKeplerCampaignLab(): CampaignLaboratory {
  const parsed = parseNssdcPlanetaryFactSheet(nssdcHtml);
  const rows: ModelPoint[] = [];
  for (const key of SUN_ORBITING) {
    const el = parsed[key];
    if (el === undefined) continue;
    const a = el.distanceFromSunMillionKm;
    const t = el.orbitalPeriodDays;
    if (!(a > 0) || !(t > 0)) continue;
    rows.push({
      x: Math.log(a),
      y: Math.log(t),
      sigma: Math.max(publishedQuantizationHalfWidth(t) / t, 1e-9),
    });
  }
  rows.sort((p, q) => p.x - q.x);
  const byX = new Map(rows.map((p) => [p.x, p]));
  const xs = rows.map((p) => p.x);
  return {
    labId: 'nasa-nssdc-planetary-orbits',
    problem: 'How does a body\'s orbital period depend on its distance from the Sun, across the nine Sun-orbiting bodies NASA publishes?',
    candidateX: xs,
    observe: (x) => byX.get(x) ?? null,
    xRange: { min: Math.min(...xs), max: Math.max(...xs) },
    xLabel: 'ln(distance[10^6 km])',
    yLabel: 'ln(period[days])',
    declareObservable: () => ({
      quantity: 'orbital period of a Sun-orbiting body at a distance this fact sheet does not list',
      unit: 'days (entering the campaign as ln days)',
      instrumentClass: 'astronomical ephemeris / published planetary fact sheet',
    }),
    declareFeasibility: () => keplerFeasibility(),
    gapRecipient: 'EXTERNAL_DATASET',
  };
}

/** Provenance of laboratory B's pinned payload, for the campaign record. */
export const KEPLER_LAB_PROVENANCE = {
  sourceUrl: NSSDC_PLANETARY_FACTSHEET_SOURCE_URL,
  rawSha256: NSSDC_PLANETARY_FACTSHEET_RAW_SHA256,
} as const;
