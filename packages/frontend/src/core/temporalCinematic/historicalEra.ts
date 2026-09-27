/**
 * TEMPORAL CINEMATIC ENGINE — ERA PROFILE.
 *
 * HONESTY NOTE (non-negotiable): nothing in this repository holds real
 * historical urban records (no per-city archive, no period photograph
 * dataset, no zoning history). This table is a coarse, openly-labeled
 * PROCEDURAL heuristic — "cities built taller over the industrial and
 * post-war 20th century" — used only to vary `StructuralDetailSpec.maxFloors`
 * (generation/geometry/structuralDetailSpec.ts) across years for the SAME
 * place. It is not a claim that any generated building matches a real
 * structure that stood at that place and year. Every entity produced through
 * this path is grounded `'PROCEDURAL_APPROXIMATION'` (see
 * renderReadiness.ts) — never `'GROUNDED_EXACT'`/`'MODEL_ESTIMATE'`, which
 * would misrepresent it as historical fact or a real model output.
 */
export interface EraProfile {
  readonly label: string;
  readonly maxFloors: number;
}

const ERA_BANDS: readonly { readonly beforeYear: number; readonly profile: EraProfile }[] = [
  { beforeYear: 1850, profile: { label: 'pre-industrial', maxFloors: 2 } },
  { beforeYear: 1900, profile: { label: 'industrial-era', maxFloors: 4 } },
  { beforeYear: 1920, profile: { label: 'turn-of-century', maxFloors: 5 } },
  { beforeYear: 1945, profile: { label: 'interwar', maxFloors: 6 } },
  { beforeYear: 1980, profile: { label: 'postwar-modern', maxFloors: 10 } },
  { beforeYear: 2010, profile: { label: 'late-20th-century', maxFloors: 14 } },
];
const CONTEMPORARY_PROFILE: EraProfile = { label: 'contemporary', maxFloors: 20 };

/** Deterministic, pure function of `year` alone — the same year always resolves to the same profile. */
export function resolveEraProfile(year: number): EraProfile {
  for (const band of ERA_BANDS) {
    if (year < band.beforeYear) return band.profile;
  }
  return CONTEMPORARY_PROFILE;
}
