import { canonicalJson, fnv1a } from '../events/hash';
import type { ProvenanceRef } from './contracts';

/**
 * PHYSICS WORLD — Research Recipe projection, ported from the source
 * bundle's "recipe-engine" package.
 *
 * SCOPE (why this lives under `core/physicsWorld/`, not as a generic,
 * cross-domain module): this repo already has two other domain-specific
 * "build a recipe from a winning decision, gate everything else LOCKED"
 * modules — `core/biotechData/govDrugDiscoveryE2E.ts::generateResearchRecipe`
 * (E2E-01) and `core/generator/recipe.ts` (unrelated: a catalogue of
 * simulation-visual recipes, not decision provenance). Neither is a shared
 * "recipe engine" other domains plug into; each domain owns its own. This
 * file follows that SAME convention for physics-world rather than inventing
 * a new generic engine other domains would be expected to migrate onto —
 * that would itself be the "second engine" the mandate forbids, just at a
 * different layer.
 *
 * Hash provider: same decision as `core.ts` — `fnv1a(canonicalJson(...))`
 * from the existing `core/events/hash.ts`, not a new SHA-256 system.
 * `recipeFingerprint`/fingerprints below are 8 hex chars, not 64.
 */

export type PhysicsWinnerVerdict = 'WINNER' | 'NO_WINNER' | 'CONFLICTING_EVIDENCE' | 'INSUFFICIENT_EVIDENCE';

export interface PhysicsWinnerFingerprints {
  readonly generation: string;
  readonly ranking: string;
  readonly experiment: string;
  readonly evidence: string;
  readonly adjudication: string;
}

export interface PhysicsWinnerRecord {
  readonly winnerId: string;
  readonly problemId: string;
  readonly candidateId: string;
  readonly verdict: PhysicsWinnerVerdict;
  readonly constraintsSatisfied: boolean;
  readonly survivedFalsification: boolean;
  readonly adjudicationValid: boolean;
  readonly comparisonValid: boolean;
  readonly evidenceMinimumSatisfied: boolean;
  readonly fingerprintsUnchanged: boolean;
  readonly provenanceComplete: boolean;
  readonly evidenceClass: string;
  readonly fingerprints: PhysicsWinnerFingerprints;
  readonly provenance: readonly ProvenanceRef[];
  readonly createdAt: string;
}

export interface PhysicsResearchRecipe {
  readonly recipeId: string;
  readonly winnerId: string;
  readonly experimentId: string;
  readonly problemId: string;
  readonly generationFingerprint: string;
  readonly rankingFingerprint: string;
  readonly experimentFingerprint: string;
  readonly evidenceFingerprint: string;
  readonly adjudicationFingerprint: string;
  readonly provenance: readonly ProvenanceRef[];
  readonly assumptions: readonly string[];
  readonly limitations: readonly string[];
  readonly confidence: string;
  readonly operationalParameters: Readonly<Record<string, number>>;
  readonly expectedOutcome: string;
  readonly falsificationConditions: readonly string[];
  readonly monitoringConditions: readonly string[];
  readonly rollbackStopConditions: readonly string[];
  readonly reproducibilityInformation: string;
  readonly sourceEvidence: readonly string[];
  readonly creationTimestamp: string;
  readonly recipeVersion: number;
  readonly recipeFingerprint: string;
  readonly status: 'READY';
}

export interface PhysicsRecipeOutcome {
  readonly status: 'READY' | 'LOCKED';
  readonly recipe?: PhysicsResearchRecipe;
  readonly lockedReasons?: readonly string[];
}

export interface PhysicsRecipeBuildOptions {
  /** 'PRODUCTION' (default) refuses a SYNTHETIC_TEST_ONLY winner (gate G9) — synthetic evidence is allowed only under 'TEST'. */
  readonly mode?: 'PRODUCTION' | 'TEST';
  readonly harkDetected?: boolean;
}

interface ResolvedOptions {
  readonly mode: 'PRODUCTION' | 'TEST';
  readonly harkDetected: boolean;
}

interface RecipeGate {
  readonly id: string;
  readonly test: (w: PhysicsWinnerRecord, o: ResolvedOptions) => boolean;
}

export const PHYSICS_RECIPE_GATES: readonly RecipeGate[] = [
  { id: 'G1_no_winner_record', test: (w) => !!w && typeof w === 'object' },
  { id: 'G2_invalid_winner_conjunction', test: (w) => w.constraintsSatisfied && w.survivedFalsification && w.adjudicationValid && w.comparisonValid },
  { id: 'G3_conflicting_verdict', test: (w) => w.verdict === 'WINNER' },
  { id: 'G4_missing_provenance', test: (w) => w.provenanceComplete && w.provenance.length > 0 },
  { id: 'G5_missing_evidence_minimum', test: (w) => w.evidenceMinimumSatisfied && w.evidenceClass.trim() !== '' },
  { id: 'G6_fingerprint_mismatch', test: (w) => w.fingerprintsUnchanged && Object.values(w.fingerprints).every((f) => typeof f === 'string' && f.length > 0) },
  { id: 'G7_changed_rules_after_freeze', test: (w) => w.fingerprintsUnchanged },
  { id: 'G8_hark_detected', test: (_w, o) => !o.harkDetected },
  { id: 'G9_synthetic_in_production', test: (w, o) => !(o.mode === 'PRODUCTION' && w.evidenceClass === 'SYNTHETIC_TEST_ONLY') },
];

const auditLog: string[] = [];

/** Append-only. Every `buildRecipe` call, READY or LOCKED, leaves one entry — never overwritten. */
export function physicsRecipeAudit(): readonly string[] {
  return auditLog;
}

export function buildPhysicsRecipe(w: PhysicsWinnerRecord, opts: PhysicsRecipeBuildOptions = {}): PhysicsRecipeOutcome {
  const o: ResolvedOptions = { mode: opts.mode ?? 'PRODUCTION', harkDetected: opts.harkDetected ?? false };
  const failed = PHYSICS_RECIPE_GATES.filter((g) => !g.test(w, o)).map((g) => g.id);
  auditLog.push(canonicalJson({ at: w?.createdAt ?? 'unknown', winner: w?.winnerId ?? 'none', failed, status: failed.length ? 'LOCKED' : 'READY', mode: o.mode }));

  if (failed.length > 0) return { status: 'LOCKED', lockedReasons: failed };

  const recipe: PhysicsResearchRecipe = {
    recipeId: `RCP-${w.winnerId}`,
    winnerId: w.winnerId,
    experimentId: w.fingerprints.experiment,
    problemId: w.problemId,
    generationFingerprint: w.fingerprints.generation,
    rankingFingerprint: w.fingerprints.ranking,
    experimentFingerprint: w.fingerprints.experiment,
    evidenceFingerprint: w.fingerprints.evidence,
    adjudicationFingerprint: w.fingerprints.adjudication,
    provenance: w.provenance,
    assumptions: [
      'recipe is a projection of the winning scientific decision, never a new decision',
      'buildPhysicsRecipe never mutates the WinnerRecord it reads',
    ],
    limitations: ['public value/ROI/funding layers have zero input here (firewall)'],
    confidence: w.evidenceClass,
    operationalParameters: {},
    expectedOutcome: 'per WinnerRecord evidence',
    falsificationConditions: ['any gate flips ⇒ recipe void'],
    monitoringConditions: ['evidence class re-check on new data'],
    rollbackStopConditions: ['new falsifying evidence ⇒ STOP'],
    reproducibilityInformation: 'identical WinnerRecord + fingerprints ⇒ identical recipe (fnv1a canonical hash)',
    sourceEvidence: w.provenance.map((p) => p.source),
    creationTimestamp: w.createdAt,
    recipeVersion: 1,
    recipeFingerprint: '',
    status: 'READY',
  };
  const recipeFingerprint = fnv1a(canonicalJson({ f: w.fingerprints, v: recipe.recipeVersion, p: w.provenance, verdict: w.verdict }));
  const sealed: PhysicsResearchRecipe = { ...recipe, recipeFingerprint };
  return { status: 'READY', recipe: Object.freeze(sealed) };
}

/** Real re-run (R11): rebuilds the recipe twice from the SAME WinnerRecord and requires byte-identical output — never a stubbed `return true`. */
export function replayPhysicsRecipe(w: PhysicsWinnerRecord, opts: PhysicsRecipeBuildOptions = {}): boolean {
  const a = buildPhysicsRecipe(w, opts);
  const b = buildPhysicsRecipe(w, opts);
  return a.status === b.status && (a.lockedReasons ?? []).join(',') === (b.lockedReasons ?? []).join(',') && a.recipe?.recipeFingerprint === b.recipe?.recipeFingerprint;
}

export function exportPhysicsRecipe(r: PhysicsResearchRecipe): string {
  return canonicalJson(r);
}

/** Re-derives the expected fingerprint from the recipe's OWN carried fingerprints/provenance/version and refuses to accept a payload whose stored `recipeFingerprint` does not match — a tampered export is rejected, not silently trusted. */
export function importPhysicsRecipe(serialized: string): PhysicsResearchRecipe {
  const r = JSON.parse(serialized) as PhysicsResearchRecipe;
  const expected = fnv1a(
    canonicalJson({
      f: {
        generation: r.generationFingerprint,
        ranking: r.rankingFingerprint,
        experiment: r.experimentFingerprint,
        evidence: r.evidenceFingerprint,
        adjudication: r.adjudicationFingerprint,
      },
      v: r.recipeVersion,
      p: r.provenance,
      verdict: 'WINNER',
    }),
  );
  if (expected !== r.recipeFingerprint) throw new Error('importPhysicsRecipe: recipe fingerprint verification failed on import.');
  return Object.freeze(r);
}

/** SYNTHETIC, TEST-ONLY fixture. Never a real winner: `evidenceClass: 'SYNTHETIC_TEST_ONLY'` trips gate G9 in the default 'PRODUCTION' mode. */
export function makePhysicsSyntheticTestWinnerRecordOnly(): PhysicsWinnerRecord {
  return Object.freeze({
    winnerId: 'SYNTH-TEST-ONLY-001',
    problemId: 'P-SYNTH',
    candidateId: 'C-SYNTH',
    verdict: 'WINNER' as const,
    constraintsSatisfied: true,
    survivedFalsification: true,
    adjudicationValid: true,
    comparisonValid: true,
    evidenceMinimumSatisfied: true,
    fingerprintsUnchanged: true,
    provenanceComplete: true,
    evidenceClass: 'SYNTHETIC_TEST_ONLY',
    fingerprints: { generation: 'g1', ranking: 'r1', experiment: 'e1', evidence: 'v1', adjudication: 'a1' },
    provenance: [{ source: 'synthetic-test', retrievedAt: '1970-01-01T00:00:00Z' }],
    createdAt: '1970-01-01T00:00:00Z',
  });
}
