import { fnv1a, canonicalJson } from '../../events/hash';
import { resolveSceneDomain, type SceneDomain } from './sceneDomainResolver';
import { generateTemporalCinematicScene } from './urbanTransformationOrchestrator';
import { buildMoleculeScene, type MoleculeSceneResult } from './moleculeSceneBuilder';
import { buildEngineeringScene, type EngineeringSceneResult } from './engineeringSceneBuilder';
import { buildEnvironmentalScene, type EnvironmentalSceneResult } from './environmentalSceneBuilder';
import { biologicalCellCapabilityGap, type BiologicalCapabilityGapResult } from './biologicalCapabilityGap';
import type { TemporalCinematicResult } from './contracts';
import { makeProgressReporter, type SceneProgressCallback } from './sceneProgress';
import type { FrameRenderer } from './temporalRenderController';
import type { VideoEncoder } from './videoRenderPipeline';

/**
 * GENESIS SCENE ORCHESTRATOR — "Tell Genesis what you want to see, and it
 * determines the appropriate scientific/world representation, builds it
 * using the existing engines, and reports what it could and could not do."
 *
 * A THIN dispatcher, not a sixth engine: `sceneDomainResolver.ts` reads the
 * prompt's domain, and every domain below calls exactly one EXISTING Genesis
 * engine (chemistry's `parseSmiles`/`describeLigand`, the real hydraulics
 * engineering model, the real SEIR World Model domain, or the historical
 * urban orchestrator already built for SW-URBAN). No domain here computes
 * science of its own. `BIOLOGICAL_CELL` is an honest `CAPABILITY_GAP`
 * (see `biologicalCapabilityGap.ts`) rather than a fabricated scene — Human
 * Biology Lab is real, but this generic prompt pipeline does not yet route
 * into its own command grammar.
 */
export type GenesisSceneResult =
  | ({ readonly domain: 'HISTORICAL_URBAN' } & TemporalCinematicResult)
  | ({ readonly domain: 'MOLECULE' } & MoleculeSceneResult)
  | ({ readonly domain: 'ENGINEERING' } & EngineeringSceneResult)
  | ({ readonly domain: 'ENVIRONMENTAL' } & EnvironmentalSceneResult)
  | ({ readonly domain: 'BIOLOGICAL_CELL' } & BiologicalCapabilityGapResult)
  | { readonly domain: null; readonly status: 'BLOCKED'; readonly unresolved: readonly string[]; readonly fingerprint: string };

export function resolveGenesisDomain(prompt: string): SceneDomain | null {
  return resolveSceneDomain(prompt);
}

export function generateScene(
  prompt: string,
  ports: { readonly renderer?: FrameRenderer; readonly encoder?: VideoEncoder; readonly onProgress?: SceneProgressCallback } = {},
): GenesisSceneResult {
  const report = makeProgressReporter(['RESOLVE_DOMAIN', 'DONE'], ports.onProgress);
  const domain = resolveSceneDomain(prompt);
  report('RESOLVE_DOMAIN');

  if (domain === null) {
    const result: GenesisSceneResult = {
      domain: null, status: 'BLOCKED',
      unresolved: ['no scene domain could be resolved from the prompt (historical/urban, molecule, biological, engineering, environmental)'],
      fingerprint: fnv1a(canonicalJson({ prompt, domain: null })),
    };
    report('DONE');
    return result;
  }

  if (domain === 'HISTORICAL_URBAN') {
    // Delegates its own, more granular stage-by-stage progress straight through
    // (parse/resolve-years/resolve-states/consistency/camera/render/encode) —
    // rewriting it against this dispatcher's 2-stage list would misreport the
    // percentage, since the inner pipeline has far more real stages than this
    // thin dispatcher does.
    const inner = generateTemporalCinematicScene(prompt, { renderer: ports.renderer, encoder: ports.encoder, onProgress: ports.onProgress });
    return { domain, ...inner };
  }
  if (domain === 'MOLECULE') { const inner = buildMoleculeScene(prompt); report('DONE'); return { domain, ...inner }; }
  if (domain === 'ENGINEERING') { const inner = buildEngineeringScene(prompt); report('DONE'); return { domain, ...inner }; }
  if (domain === 'ENVIRONMENTAL') { const inner = buildEnvironmentalScene(prompt); report('DONE'); return { domain, ...inner }; }
  const inner = biologicalCellCapabilityGap();
  report('DONE');
  return { domain, ...inner };
}
