import type { OrganSystemId } from '../scientificWorlds/humanLab/types';

/**
 * WHERE A DOCKING TARGET SITS IN THE BODY — the one link between the drug bench
 * (a protein structure the engine docked against) and the human twin (an
 * anatomical model). It is a curated reference table keyed by the backend's
 * own `targetId` (packages/backend/src/compute/targets/<id>/SOURCE.json), and
 * it says only where the protein is expressed or clinically relevant, with the
 * public record that says so. It never claims the drug acts there: no tissue
 * simulation exists, and the caption on every surface repeats that.
 *
 * A target that is not in this table gets no location — the UI says so
 * instead of guessing an organ.
 */
export interface TargetAnatomy {
  /** The backend's target id, exactly as the run's RECEPTOR_PREPARED event carries it. */
  readonly targetId: string;
  /** Short protein name for a caption (the full name is in the run's own target record). */
  readonly protein: string;
  /** The body system the twin focuses on (the same FOCUS_ANATOMY command the systems rail sends). */
  readonly system: OrganSystemId;
  /** Other systems the location spans, for the caption. */
  readonly alsoSystems: readonly OrganSystemId[];
  /** Where the target sits, in plain Polish, for the caption. */
  readonly sitePl: string;
  /** The public record the location is read from. */
  readonly basis: string;
}

const TARGET_ANATOMY: Readonly<Record<string, TargetAnatomy>> = {
  ABL1_1IEP: {
    targetId: 'ABL1_1IEP',
    protein: 'ABL1 (kinaza tyrozynowa; fuzja BCR-ABL)',
    system: 'CARDIOVASCULAR',
    alsoSystems: ['SKELETAL', 'IMMUNE'],
    sitePl: 'komórki krwiotwórcze — szpik kostny i krew (ABL1 sama występuje w większości tkanek; fuzja BCR-ABL, cel imatynibu, jest ograniczona do komórek krwiotwórczych w przewlekłej białaczce szpikowej)',
    basis: 'UniProt P00519 (ABL1, tkankowość: powszechna); Nagar B. i in. (2002) Cancer Research 62:4236 — struktura 1IEP; wskazanie kliniczne imatynibu: przewlekła białaczka szpikowa BCR-ABL+',
  },
  OPRM1_5C1M: {
    targetId: 'OPRM1_5C1M',
    protein: 'OPRM1 (receptor μ-opioidowy)',
    system: 'NERVOUS',
    alsoSystems: ['DIGESTIVE'],
    sitePl: 'ośrodkowy układ nerwowy (mózg, rdzeń kręgowy) oraz neurony jelitowe',
    basis: 'UniProt P35372 (OPRM1, tkankowość: OUN, neurony jelitowe); Huang W. i in. (2015) Nature 524:315 — struktura 5C1M',
  },
};

/** The caption every surface shows next to a location, so nobody reads it as a simulation of drug action. */
export const TARGET_ANATOMY_CAVEAT_PL = 'MIEJSCE WYSTĘPOWANIA CELU · atlas referencyjny, nie symulacja działania leku w tkance';

/** Curated location for a docked target, or null when none is recorded (the UI must say so, never guess). */
export function targetAnatomy(targetId: string | null | undefined): TargetAnatomy | null {
  if (!targetId) return null;
  return TARGET_ANATOMY[targetId] ?? null;
}

/** The route that opens the human twin focused on this target's system (`#/human-biology-lab?target=<id>`). */
export function targetAnatomyRoute(targetId: string): string {
  const query = new URLSearchParams({ target: targetId });
  return `#/human-biology-lab?${query.toString()}`;
}

export function listTargetAnatomy(): readonly TargetAnatomy[] {
  return Object.values(TARGET_ANATOMY);
}
