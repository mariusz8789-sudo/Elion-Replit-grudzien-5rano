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
