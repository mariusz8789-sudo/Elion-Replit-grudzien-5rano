import type { EpistemicStatus } from '../generator/recipe';
import type { DataProvenance } from '../dataProvenance';
import type { ExplorerEvidenceMode } from '../scientificWorlds/humanExplorer';
import type { EpistemicLabel } from '../scientificWorlds/humanLab/epistemic';
import type { FlagshipEpistemicStatus } from '../../../../core/src/flagship/epistemicGuard.js';

/**
 * U0-b — WHAT IS ON SCREEN: measurement, theory, reconstruction, claim or fiction.
 *
 * This is not a new truth system. Genesis already has one canonical
 * reliability scale (`EpistemicStatus`, see epistemicReliability.ts) that
 * answers "how well supported is this model?". A scene needs a second,
 * different answer: "what KIND of thing am I looking at?". A perfectly
 * established theory can be drawn with invented colours; a real measurement
 * can sit inside an illustrative detector. So every scene manifest carries
 * both: `basis` (this file) and `reliability` (the existing scale).
 *
 * The five bases are the labels Mariusz asked for (30 Sep 2026):
 *   MEASURED_DATA             real measured values, published by others, are what the scene shows.
 *                             Genesis only displays them; a measurement Genesis made itself
 *                             (a lab run with Evidence/Replay) would need its own basis.
 *   COMPUTED_MODEL            computed from equations of a theory or model
 *   HISTORICAL_RECONSTRUCTION a documented past event rebuilt from sources
 *   ALLEGED_CLAIM             what a claim or testimony says happened, not verified
 *   FICTION                   invented for the story or the navigation
 *
 * Limits are split on purpose, never merged:
 *   simulationLimits  where THIS Genesis simulation stops being valid
 *                     (grid size, a cut-off radius, a skipped effect)
 *   theoryLimits      where the underlying physics is itself untested or
 *                     expected to fail. A black-hole horizon is a causal
 *                     boundary, not a limit of known physics: nothing
 *                     locally special happens there to an infalling observer.
 */
export type SceneBasis = 'MEASURED_DATA' | 'COMPUTED_MODEL' | 'HISTORICAL_RECONSTRUCTION' | 'ALLEGED_CLAIM' | 'FICTION';

export const SCENE_BASES: readonly SceneBasis[] = ['MEASURED_DATA', 'COMPUTED_MODEL', 'HISTORICAL_RECONSTRUCTION', 'ALLEGED_CLAIM', 'FICTION'];

export const SCENE_BASIS_LABELS_PL: Readonly<Record<SceneBasis, string>> = {
  MEASURED_DATA: 'Opublikowane dane pomiarowe',
  COMPUTED_MODEL: 'Obliczenie z teorii',
  HISTORICAL_RECONSTRUCTION: 'Rekonstrukcja historyczna',
  ALLEGED_CLAIM: 'Relacja, niepotwierdzona',
  FICTION: 'Fikcja',
};

export const SCENE_BASIS_EXPLANATIONS_PL: Readonly<Record<SceneBasis, string>> = {
  MEASURED_DATA: 'Scena pokazuje wartości zmierzone i opublikowane przez innych badaczy (źródła poniżej). Genesis sam tych pomiarów nie wykonał, tylko je pokazuje.',
  COMPUTED_MODEL: 'Scena jest wyliczona z równań teorii lub modelu. Nie jest zapisem pomiaru.',
  HISTORICAL_RECONSTRUCTION: 'Scena odtwarza udokumentowane wydarzenie na podstawie źródeł. Szczegóły bez źródła są dopowiedziane.',
  ALLEGED_CLAIM: 'Scena pokazuje, jak według relacji miało to wyglądać. Nie pokazuje, jak było.',
  FICTION: 'Scena jest wymyślona. Nie twierdzi niczego o świecie.',
};

export interface SceneManifest {
  /** `lab:<labId>:<experimentId>` for lab experiments (the base experiment uses the lab id). */
  readonly sceneId: string;
  readonly basis: SceneBasis;
  /** Position on the existing canonical reliability scale (generator/recipe.ts). */
  readonly reliability: EpistemicStatus;
  /** Real measured values the scene uses, each with its source. */
  readonly measuredDataRefs: readonly string[];
  /** Equations, models or papers the computation follows. */
  readonly modelRefs: readonly string[];
  /** Historical documents a reconstruction rests on. */
  readonly sourceRefs?: readonly string[];
  readonly assumptions: readonly string[];
  /** Parts that are hypothesis or speculation, even inside an established scene. */
  readonly speculativeElements: readonly string[];
  /** Parts that exist only to be seen: colours, glow, camera flights, scale changes. */
  readonly visualizationOnlyElements: readonly string[];
  readonly simulationLimits: readonly string[];
  readonly theoryLimits: readonly string[];
}

export type ManifestProblem = { readonly sceneId: string; readonly problem: string };

// A horizon is a causal boundary; the model or simulation may stop there, physics does not.
// Checked per clause, words in any order ("physics breaks down at the horizon" too).
const HORIZON = /horyzon|horizon/i;
const ENDS = /koniec|kończy|końcu|kończą|\bends?\b|breaks? down|załamuje|\bfails?\b/i;
const PHYSICS = /fizyk|physics/i;
function presentsHorizonAsEndOfPhysics(text: string): boolean {
  return text.split(/[.;]/).some((clause) => HORIZON.test(clause) && ENDS.test(clause) && PHYSICS.test(clause));
}

/** Structural rules every manifest must satisfy. Returns [] when the manifest is sound. */
export function validateSceneManifest(m: SceneManifest): ManifestProblem[] {
  const out: ManifestProblem[] = [];
  const bad = (problem: string) => out.push({ sceneId: m.sceneId, problem });
  if (!SCENE_BASES.includes(m.basis)) bad(`unknown basis ${m.basis}`);
  if (m.basis === 'MEASURED_DATA' && m.measuredDataRefs.length === 0) bad('MEASURED_DATA needs at least one measured data source');
  if (m.basis === 'COMPUTED_MODEL' && m.modelRefs.length === 0) bad('COMPUTED_MODEL needs at least one model or equation');
  if ((m.basis === 'HISTORICAL_RECONSTRUCTION' || m.basis === 'ALLEGED_CLAIM') && (m.sourceRefs ?? []).length === 0) bad(`${m.basis} needs at least one historical source`);
  if (m.basis === 'FICTION' && m.reliability !== 'UNSUPPORTED_CLAIM') bad('FICTION cannot carry a scientific reliability above UNSUPPORTED_CLAIM');
  if (m.basis === 'ALLEGED_CLAIM' && (m.reliability === 'ESTABLISHED_SCIENCE' || m.reliability === 'WELL_SUPPORTED_MODEL')) bad('an unverified claim cannot be ranked as established or well supported');
  if (m.simulationLimits.length === 0) bad('every scene must say where the simulation stops being valid');
  const text = [...m.simulationLimits, ...m.theoryLimits, ...m.assumptions, ...m.speculativeElements, ...m.visualizationOnlyElements];
  for (const t of text) if (presentsHorizonAsEndOfPhysics(t)) bad(`presents the event horizon as the end of physics: "${t}"`);
  for (const [field, list] of Object.entries({ measuredDataRefs: m.measuredDataRefs, modelRefs: m.modelRefs, simulationLimits: m.simulationLimits, theoryLimits: m.theoryLimits })) {
    if (list.some((s) => s.trim().length === 0)) bad(`${field} has an empty entry`);
  }
  return out;
}

/* ------------------------------------------------------------------------
 * Read-time map from the vocabularies Genesis already uses for "what kind
 * of thing is this" onto SceneBasis. Nothing is renamed or written back.
 * `undefined` means the value is a process or evidence state, not a kind
 * of content, and must not be forced onto a basis (same rule as
 * biotechToCanonicalReliability('BLOCKED')).
 * ---------------------------------------------------------------------- */

/** Scientific Worlds / Human Lab / spacetime world descriptors. */
export function basisFromEpistemicLabel(label: EpistemicLabel): SceneBasis | undefined {
  switch (label) {
    case 'REAL_OBSERVATION': return 'MEASURED_DATA';
    case 'VERIFIED_SOURCE': return 'MEASURED_DATA';
    case 'MODEL': return 'COMPUTED_MODEL';
    case 'SIMULATION': return 'COMPUTED_MODEL';
    case 'HYPOTHESIS': return 'COMPUTED_MODEL';
    case 'SPECULATIVE': return 'COMPUTED_MODEL';
    case 'RECONSTRUCTION': return 'HISTORICAL_RECONSTRUCTION';
    case 'FICTION_INSPIRED': return 'FICTION';
    case 'NOT_MODELED': return undefined;
    case 'INSUFFICIENT_EVIDENCE': return undefined;
  }
}

/** Flagship engines (time machine, portal, spacetime photon). */
export function basisFromFlagshipStatus(status: FlagshipEpistemicStatus): SceneBasis | undefined {
  switch (status) {
    case 'REAL_OBSERVATION': return 'MEASURED_DATA';
    case 'VERIFIED_SOURCE': return 'MEASURED_DATA';
    case 'MODEL': return 'COMPUTED_MODEL';
    case 'SIMULATION': return 'COMPUTED_MODEL';
    case 'HYPOTHESIS': return 'COMPUTED_MODEL';
    case 'SPECULATIVE': return 'COMPUTED_MODEL';
    case 'FICTIONAL': return 'FICTION';
    case 'INSUFFICIENT_EVIDENCE': return undefined;
    case 'FALSIFIED': return undefined;
  }
}

/** Origin of a single number (Experiment Fabric → Evidence → Memory). */
export function basisFromDataProvenance(p: DataProvenance): SceneBasis {
  switch (p) {
    case 'REAL_EXPERIMENTAL': return 'MEASURED_DATA';
    case 'REFERENCE': return 'MEASURED_DATA';
    case 'SIMULATED': return 'COMPUTED_MODEL';
  }
}

/** Human Explorer evidence modes per organ view. */
export function basisFromExplorerEvidenceMode(mode: ExplorerEvidenceMode): SceneBasis {
  switch (mode) {
    case 'REAL_IMAGE': return 'MEASURED_DATA';
    case 'REAL_DATASET': return 'MEASURED_DATA';
    case 'RECONSTRUCTED': return 'COMPUTED_MODEL';
    case 'SIMULATED': return 'COMPUTED_MODEL';
    case 'ILLUSTRATIVE': return 'FICTION';
  }
}
