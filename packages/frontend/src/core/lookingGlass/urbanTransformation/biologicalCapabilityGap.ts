/**
 * BIOLOGICAL_CELL domain — honest CAPABILITY_GAP, not a fake scene.
 *
 * Genesis already has a REAL, complete cell/organ/tissue visualization
 * product — the Human Biology Lab (`core/scientificWorlds/humanLab/`, route
 * `#/human-biology-lab`, `HumanExplorerPanel.tsx`: body-systems rail, organ
 * card, magnification ladder, microscope panel from sealed
 * `ExperimentSession`s). What does NOT exist is a natural-language bridge
 * from THIS generic scene pipeline into that product's own
 * WorldCommand/AgentController flow — Human Biology Lab is driven by its own
 * command grammar (`biologyCommandResolver.ts`), not by
 * `sceneDomainResolver.ts`'s prompt text. Wiring that bridge is real,
 * scoped work of its own (mapping "show me a human cell" onto a real
 * `biologyCommandResolver` invocation and a real station) and is
 * deliberately not attempted here as a rushed, undertested addition to an
 * already-large change. This module exists so the orchestrator reports that
 * honestly instead of silently returning nothing for BIOLOGICAL_CELL prompts.
 */
import { fnv1a, canonicalJson } from '../../events/hash';

export interface BiologicalCapabilityGapResult {
  readonly status: 'CAPABILITY_GAP';
  readonly existingCapability: string;
  readonly missingAdapter: string;
  readonly fingerprint: string;
}

export function biologicalCellCapabilityGap(): BiologicalCapabilityGapResult {
  const existingCapability = 'Human Biology Lab (#/human-biology-lab) — real cell/organ/tissue visualization over sealed ExperimentSessions';
  const missingAdapter = 'no NL bridge from sceneDomainResolver.ts prompts into biologyCommandResolver.ts / the Human Biology Lab WorldCommand grammar';
  return {
    status: 'CAPABILITY_GAP', existingCapability, missingAdapter,
    fingerprint: fnv1a(canonicalJson({ domain: 'BIOLOGICAL_CELL', status: 'CAPABILITY_GAP', existingCapability, missingAdapter })),
  };
}
