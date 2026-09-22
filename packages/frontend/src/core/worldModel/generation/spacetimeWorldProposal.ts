import { canonicalJson, fnv1a } from '../../events/hash';
import { createScientificWorld, type CreateScientificWorldResult } from '../orchestration/createScientificWorld';
import type { SpecifiedWorld } from '../specification/compiler';
import type { WorldSpecification, WorldTemplateId } from '../specification/worldSpecification';

export interface ResolvedSpacetimeWorld {
  readonly prompt: string;
  readonly primaryTemplate: WorldTemplateId;
  readonly specification: WorldSpecification;
  readonly world: SpecifiedWorld;
  readonly runtime: CreateScientificWorldResult;
  readonly deterministicFingerprint: string;
}

export const SPACETIME_PRODUCT_TEMPLATES = [
  'EINSTEIN_ROSEN_BRIDGE',
  'MULTIVERSE_BRANCH',
  'TIME_DILATION_LAB',
  'QUANTUM',
  'COSMOLOGY_SPACETIME',
  'HISTORICAL_RECONSTRUCTION',
  'DESERT_ALIEN',
  'MARS_RESEARCH',
  'UNDERWATER_RESEARCH_CITY',
] as const satisfies readonly WorldTemplateId[];

export type SpacetimeProductTemplate = (typeof SPACETIME_PRODUCT_TEMPLATES)[number];

/** Deterministic product-command classifier. It refuses unmatched text rather than inventing a world. */
export function inferSpacetimeWorldTemplate(prompt: string): SpacetimeProductTemplate {
  const text = prompt.toLocaleLowerCase('en-US');
  if (/einstein[- ]rosen|wormhole|most einsteina|tunel czasoprzestrzenny/.test(text)) return 'EINSTEIN_ROSEN_BRIDGE';
  if (/alternative timeline|timeline worlds|multiverse|alternatywn.*lini/.test(text)) return 'MULTIVERSE_BRANCH';
  if (/quantum|superposition|tunnell?ing|kwant|tunelowanie/.test(text)) return 'QUANTUM';
  if (/cosmolog|gravity well|dark matter|grawitac|ciemna materia/.test(text)) return 'COSMOLOGY_SPACETIME';
  if (/time dilation|dylatacj.*czasu|relativistic clock/.test(text)) return 'TIME_DILATION_LAB';
  if (/historical|reconstruction|battle|historycz|rekonstrukcj|bitw/.test(text)) return 'HISTORICAL_RECONSTRUCTION';
  if (/alien|two suns|desert planet|obc.*planet|dwa słońca|pustynn/.test(text)) return 'DESERT_ALIEN';
  if (/mars|martian/.test(text)) return 'MARS_RESEARCH';
  if (/underwater|undersea|subsea|ocean city|podwodn|glebinow/.test(text)) return 'UNDERWATER_RESEARCH_CITY';
  throw new Error('WORLD_PROMPT_UNSUPPORTED: request a supported spacetime, quantum, historical, alien, or Mars world');
}

function seedFromPrompt(prompt: string): number {
  return Number.parseInt(fnv1a(prompt.trim().toLocaleLowerCase('en-US')), 16) >>> 0;
}

function branchCountFromPrompt(prompt: string): number {
  const parsed = Number.parseInt(prompt.match(/\b(\d{1,2})\b/)?.[1] ?? '5', 10);
  return Math.max(1, Math.min(12, parsed));
}

export function createSpacetimeWorldSpecification(prompt: string): { readonly primaryTemplate: SpacetimeProductTemplate; readonly specification: WorldSpecification } {
  const primaryTemplate = inferSpacetimeWorldTemplate(prompt);
  const seed = seedFromPrompt(prompt);
  const idSuffix = fnv1a(`${primaryTemplate}:${prompt}`).slice(0, 8);
  const base: WorldSpecification = {
    worldId: `directed-${primaryTemplate.toLocaleLowerCase('en-US').replaceAll('_', '-')}-${idSuffix}`,
    seed,
    worldType: [primaryTemplate],
    groundingExpectations: 'PERMISSIVE',
    levelOfDetail: 'HIGH',
    provenanceNote: `Prompt-derived product world; original request retained by the World Director: ${prompt}`,
  };

  switch (primaryTemplate) {
    case 'EINSTEIN_ROSEN_BRIDGE':
      return { primaryTemplate, specification: { ...base, scale: 'PLANET', spacetime: { throatRadius: 12 } } };
    case 'MULTIVERSE_BRANCH':
      return { primaryTemplate, specification: { ...base, scale: 'REGION', spacetime: { branchCount: branchCountFromPrompt(prompt) } } };
    case 'TIME_DILATION_LAB':
      return { primaryTemplate, specification: { ...base, scale: 'BUILDING' } };
    case 'QUANTUM':
      return { primaryTemplate, specification: { ...base, scale: 'MICRO_MOLECULAR' } };
    case 'COSMOLOGY_SPACETIME':
      return { primaryTemplate, specification: { ...base, scale: 'PLANET', spacetime: { primaryMassScale: 8 } } };
    case 'HISTORICAL_RECONSTRUCTION':
      return {
        primaryTemplate,
        specification: {
          ...base,
          scale: 'MACRO_CITY',
          worldType: ['CITY', primaryTemplate],
          spacetime: { historicalYear: /boston|battle|bitw/i.test(prompt) ? 1775 : 1896 },
          structuralDetail: { citySizeM: 520, districtCount: 3, parcelsPerDistrict: 4, maxFloors: 4, generateNavigation: true },
        },
      };
    case 'DESERT_ALIEN':
      return { primaryTemplate, specification: { ...base, scale: 'PLANET' } };
    case 'MARS_RESEARCH':
      return { primaryTemplate, specification: { ...base, scale: 'PLANET', worldType: [primaryTemplate, 'LABORATORY'], scientificDomains: [{ domain: 'chemistry', required: false }] } };
    case 'UNDERWATER_RESEARCH_CITY':
      return { primaryTemplate, specification: { ...base, scale: 'REGION', worldType: [primaryTemplate, 'LABORATORY'], scientificDomains: [{ domain: 'chemistry', required: false }] } };
  }
}

/** Executes the one canonical Specification → Blueprint → WorldGenerator → WorldGraph path. */
export function resolveSpacetimeWorldPrompt(prompt: string): ResolvedSpacetimeWorld {
  const { primaryTemplate, specification } = createSpacetimeWorldSpecification(prompt);
  const runtime = createScientificWorld({ kind: 'specification', specification });
  const world = runtime.specified;
  const deterministicFingerprint = fnv1a(canonicalJson({
    specification,
    entities: world.graph.listEntities().map((entity) => ({ id: entity.id, statusLabel: entity.statusLabel, domainState: entity.domainState })),
  }));
  return { prompt, primaryTemplate, specification, world, runtime, deterministicFingerprint };
}
