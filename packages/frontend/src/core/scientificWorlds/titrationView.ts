import { runTitrationScenario } from '../../labs/experiments/chemistry-titration';

export interface TitrationCurvePoint { readonly vb: number; readonly ph: number }

/** Secondary analysis derived from the exact same bounded model as the sealed lab run. */
export function titrationCurve(acid: string, samples = 60): readonly TitrationCurvePoint[] {
  const count = Math.max(2, Math.min(120, Math.round(samples)));
  return Array.from({ length: count + 1 }, (_, index) => {
    const vb = (index / count) * 60;
    const result = runTitrationScenario({ acid, vb });
    return { vb: result.vb, ph: result.ph };
  });
}

export function titrationRegion(vb: number, veq: number): 'START' | 'BUFFER' | 'EQUIVALENCE' | 'EXCESS' {
  if (vb < 0.5) return 'START';
  if (vb < veq * 0.95) return 'BUFFER';
  if (vb <= veq * 1.05) return 'EQUIVALENCE';
  return 'EXCESS';
}

export function titrationPolyline(acid: string): string {
  return titrationCurve(acid).map(({ vb, ph }) => `${(vb / 60) * 300},${100 - (ph / 14) * 100}`).join(' ');
}
