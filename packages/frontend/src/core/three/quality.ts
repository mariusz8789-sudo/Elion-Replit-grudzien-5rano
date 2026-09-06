/**
 * Adaptywna jakość renderowania scen 3D — jeden wspólny detektor możliwości
 * urządzenia zamiast osobnego kompromisu w każdej scenie. Cel: gęste dyski
 * akrecyjne / pola gwiazd na desktopie NIE mogą oznaczać klatkarni na
 * telefonie — patrz ARCHITECTURE.md „Sceny 3D".
 *
 * Heurystyka celowo prosta (viewport + wskaźnik dotykowy + liczba rdzeni) —
 * WebGL nie eksponuje wprost "mocy GPU"; te sygnały korelują z nią
 * wystarczająco dobrze do doboru gęstości cząstek/DPR, bez pomiaru
 * rzeczywistego FPS (który wymagałby kosztownego rozruchu próbnego).
 */
export type RenderTier = 'low' | 'medium' | 'high';

export function detectRenderTier(): RenderTier {
  if (typeof window === 'undefined') return 'medium';
  const w = window.innerWidth || 1024;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = (navigator as unknown as { hardwareConcurrency?: number }).hardwareConcurrency ?? 4;
  if (coarsePointer && w < 520) return 'low';
  if (coarsePointer || w < 900 || cores <= 4) return 'medium';
  return 'high';
}

/** Skaluje liczbę cząstek/gwiazd/segmentów wg poziomu jakości. */
export function scaleCount(base: number, tier: RenderTier): number {
  const factor = tier === 'low' ? 0.35 : tier === 'medium' ? 0.65 : 1;
  return Math.max(1, Math.round(base * factor));
}

/** Górny limit devicePixelRatio wg poziomu jakości — najkosztowniejsza dźwignia (koszt ~O(dpr²)). */
export function tierDpr(tier: RenderTier): number {
  const cap = tier === 'low' ? 1 : tier === 'medium' ? 1.5 : 2;
  return Math.min(window.devicePixelRatio || 1, cap);
}

/** Czy warto włączać kosztowny post-processing (bloom itp.) na tym urządzeniu. */
export function tierAllowsBloom(tier: RenderTier): boolean {
  return tier !== 'low';
}

/** Ambient occlusion (GTAO) renderuje dodatkowy przebieg normal/depth per klatkę — kosztowniejszy
 * niż bloom, więc dopuszczony tylko na najwyższym poziomie jakości. */
export function tierAllowsAO(tier: RenderTier): boolean {
  return tier === 'high';
}

const TIER_RANK: Record<RenderTier, number> = { low: 0, medium: 1, high: 2 };

/**
 * Orders render tiers so an effect can express "needs at least tier X" instead of an exact-match
 * check — used by effects (DOF, AO) whose gate a caller may want to loosen after profiling their
 * own scene, without every call site re-deriving a low/medium/high comparison by hand.
 */
export function tierAtLeast(tier: RenderTier, min: RenderTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[min];
}

/**
 * Recommended shadow-map resolution per tier — the single biggest per-shadow-caster GPU/memory
 * cost lever (cost scales with the square of this number). `'low'` returns 0 as a signal to skip
 * shadow-casting entirely at that tier rather than allocate a map too small to look right.
 */
export function recommendedShadowMapSize(tier: RenderTier): number {
  return tier === 'low' ? 0 : tier === 'medium' ? 512 : 1024;
}

/**
 * How many "shadow-caster budget units" a scene should spend at this tier. Expressed in units
 * rather than a light count because a shadow-casting `PointLight` costs roughly 6x a
 * `SpotLight`/`DirectionalLight` at the same map size (it renders a cube map — 6 faces instead of
 * 1) — see graphics/PERFORMANCE.md. A PointLight shadow caster spends 6 of these units; a
 * Spot/DirectionalLight spends 1.
 */
export function maxShadowCasterBudget(tier: RenderTier): number {
  return tier === 'low' ? 0 : tier === 'medium' ? 1 : 2;
}
