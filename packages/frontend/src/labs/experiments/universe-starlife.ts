import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import { sci } from '../../core/useSimLoop';

/**
 * Życie gwiazdy — od obłoku do białego karła / gwiazdy neutronowej /
 * czarnej dziury. Skalowania z astrofizyki gwiazdowej:
 * L ∝ M^3.5, t_MS ≈ 10·M^−2.5 mld lat, los wg masy (progi ~8 i ~20–25 M☉).
 * Etapy i czasy są rzetelne co do rzędów wielkości; grafika symboliczna.
 */

interface Stage {
  name: string;
  frac: number; // udział w osi czasu wizualizacji
  color: string;
  size: number;
}

export type StellarFinalFate = 'white-dwarf' | 'neutron-star' | 'black-hole';

export interface StarLifeScenarioResult {
  massSolar: number;
  relativeLuminositySolar: number;
  mainSequenceLifetimeGyr: number;
  finalFate: StellarFinalFate;
  finalFateLabel: string;
  finalFateDescription: string;
}

/**
 * Deterministyczny, edukacyjny model skalujący, którego używa istniejący Universe Lab.
 * Nie integruje wnętrza gwiazdy ani ewolucji jądrowej; zwraca tylko jawne relacje
 * L ∝ M³·⁵ i t_MS ≈ 10·M⁻²·⁵ oraz istniejące progi losu końcowego UI.
 */
export function runStarLifeScenario({ massSolar = 1 }: { massSolar?: number } = {}): StarLifeScenarioResult {
  if (!Number.isFinite(massSolar) || massSolar < 0.2 || massSolar > 40) {
    throw new Error('massSolar musi być skończoną liczbą z zakresu 0.2–40 M☉.');
  }
  const finalFate: StellarFinalFate = massSolar < 8 ? 'white-dwarf' : massSolar < 22 ? 'neutron-star' : 'black-hole';
  const fate = finalFate === 'white-dwarf'
    ? {
        label: 'biały karzeł',
        description: 'spokojnie odrzuci otoczkę jako mgławicę planetarną, a węglowo-tlenowe jądro zastygnie w białego karła podtrzymywanego ciśnieniem zdegenerowanych elektronów (limit Chandrasekhara: 1,4 M☉)',
      }
    : finalFate === 'neutron-star'
      ? {
          label: 'gwiazda neutronowa',
          description: 'zakończy życie supernową typu II; jądro zapadnie się do kuli neutronów o promieniu ~12 km i gęstości jądra atomowego',
        }
      : {
          label: 'czarna dziura',
          description: 'po supernowej (lub bezpośrednim kolapsie) jądro przekroczy granicę stabilności materii neutronowej (~2–2,5 M☉) i zapadnie się w czarną dziurę',
        };
  return {
    massSolar,
    relativeLuminositySolar: Math.pow(massSolar, 3.5),
    mainSequenceLifetimeGyr: 10 * Math.pow(massSolar, -2.5),
    finalFate,
    finalFateLabel: fate.label,
    finalFateDescription: fate.description,
  };
}

function stagesFor(m: number): Stage[] {
  const msColor = m < 0.5 ? '#f47c7c' : m < 1.2 ? '#f0b35c' : m < 4 ? '#fdf3d0' : '#bcd6ff';
  const msSize = 0.35 + Math.log10(m + 0.12) * 0.25;
  const base: Stage[] = [
    { name: 'obłok molekularny', frac: 0.08, color: 'rgba(110,231,160,0.5)', size: 1.1 },
    { name: 'protogwiazda', frac: 0.07, color: '#f47c7c', size: 0.5 },
    { name: 'ciąg główny', frac: 0.5, color: msColor, size: msSize },
  ];
  if (m < 8) {
    base.push(
      { name: 'czerwony olbrzym', frac: 0.18, color: '#f47c7c', size: 0.95 },
      { name: 'mgławica planetarna', frac: 0.09, color: 'rgba(92,214,232,0.6)', size: 1.25 },
      { name: 'biały karzeł', frac: 0.08, color: '#cfe5ff', size: 0.1 },
    );
  } else {
    base.push(
      { name: 'nadolbrzym', frac: 0.17, color: '#f47c7c', size: 1.15 },
      { name: 'SUPERNOWA', frac: 0.06, color: '#ffffff', size: 1.5 },
      runStarLifeScenario({ massSolar: m }).finalFate === 'neutron-star'
        ? { name: 'gwiazda neutronowa', frac: 0.09, color: '#a78bfa', size: 0.06 }
        : { name: 'czarna dziura', frac: 0.09, color: '#000000', size: 0.12 },
    );
  }
  return base;
}

class StarLifeSim implements Sim {
  private progress = 0; // 0..1 osi życia
  private lastM = 1;

  init() {}

  reset = () => {
    this.progress = 0;
  };

  update(dt: number, p: SimParams) {
    const m = Number(p.mass);
    if (m !== this.lastM) {
      this.lastM = m;
      this.progress = Math.min(this.progress, 0.99);
    }
    this.progress = (this.progress + dt * 0.045 * Number(p.speed)) % 1;
  }

  private current(): { stage: Stage; inStage: number; idx: number; stages: Stage[] } {
    const stages = stagesFor(this.lastM);
    let acc = 0;
    for (let i = 0; i < stages.length; i++) {
      if (this.progress < acc + stages[i].frac) {
        return { stage: stages[i], inStage: (this.progress - acc) / stages[i].frac, idx: i, stages };
      }
      acc += stages[i].frac;
    }
    return { stage: stages[stages.length - 1], inStage: 1, idx: stages.length - 1, stages };
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    const { stage, inStage, idx, stages } = this.current();
    const cx = w / 2;
    const cy = h * 0.42;
    const R = Math.min(w, h) * 0.24;

    // gwiazda / obiekt
    const size = stage.size * R;
    if (stage.name === 'SUPERNOWA') {
      const boom = size * (0.4 + inStage * 2.2);
      const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, boom);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, 'rgba(240,179,92,0.8)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, boom, 0, Math.PI * 2);
      ctx.fill();
    } else if (stage.name === 'czarna dziura') {
      ctx.strokeStyle = 'rgba(240,179,92,0.6)';
      ctx.beginPath();
      ctx.arc(cx, cy, size * 1.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,234,245,0.5)';
      ctx.stroke();
    } else if (stage.name === 'mgławica planetarna') {
      const grad = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * (0.6 + inStage * 0.7));
      grad.addColorStop(0, 'rgba(207,229,255,0.9)');
      grad.addColorStop(0.5, 'rgba(92,214,232,0.35)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 1.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, size * 1.6);
      grad.addColorStop(0, stage.color);
      grad.addColorStop(0.55, stage.color.startsWith('rgba') ? stage.color : `${stage.color}88`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = stage.color;
      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // oś życia
    const bx = w * 0.07;
    const bw = w * 0.86;
    const by = h * 0.82;
    let acc = 0;
    for (const [i, s] of stages.entries()) {
      const x = bx + acc * bw;
      const sw = s.frac * bw;
      ctx.fillStyle = i === idx ? 'rgba(240,179,92,0.85)' : 'rgba(141,151,180,0.3)';
      ctx.fillRect(x, by, sw - 2, 7);
      acc += s.frac;
    }
    ctx.fillStyle = '#e6eaf5';
    ctx.font = '600 13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(stage.name, cx, by - 14);
    ctx.textAlign = 'left';
  }

  getStats() {
    const { idx } = this.current();
    return { stageIdx: idx };
  }
}

export const universeStarLife: ExperimentDef = {
  id: 'starlife',
  name: 'Życie gwiazdy',
  honesty: 'educational',
  honestyNote:
    'Etapy, czasy życia (t ∝ M⁻²·⁵), jasności (L ∝ M³·⁵) i losy końcowe (progi ~8 i ~20 M☉) zgodne z astrofizyką co do rzędów wielkości. Grafika symboliczna; oś czasu nieliniowa (ciąg główny trwa >90% życia gwiazdy).',
  params: [
    {
      key: 'mass', label: 'Masa gwiazdy', type: 'slider',
      min: 0.2, max: 40, step: 0.1, default: 1,
      format: (v) => `${v.toFixed(1)} M☉`,
    },
    { key: 'speed', label: 'Tempo czasu', type: 'slider', min: 0.3, max: 3, step: 0.1, default: 1 },
  ],
  createSim: () => new StarLifeSim(),
  narrate(p) {
    const solved = runStarLifeScenario({ massSolar: Number(p.mass) });
    const { massSolar: m, mainSequenceLifetimeGyr: tMS, relativeLuminositySolar: L } = solved;
    return [
      {
        title: `${m.toFixed(1)} M☉ → ciąg główny ${tMS > 100 ? '>100' : tMS < 0.01 ? sci(tMS, 1) : tMS.toFixed(tMS < 1 ? 2 : 1)} mld lat`,
        body: `Paradoks paliwa: większa gwiazda ma go więcej, ale świeci aż ${L < 10 ? L.toFixed(1) : sci(L, 1)}× jaśniej od Słońca (L ∝ M³·⁵) — i dlatego żyje krócej (t ∝ M⁻²·⁵). ${m < 0.5 ? 'Czerwone karły tej masy będą palić wodór dłużej, niż Wszechświat dotąd istnieje — żaden jeszcze nie zszedł z ciągu głównego.' : m > 15 ? 'Tak masywne gwiazdy to błyskawice: kilka milionów lat i koniec — dlatego widzimy je tylko w młodych obszarach gwiazdotwórczych.' : 'Słońce jest w połowie swojego ~10-miliardletniego życia na ciągu głównym.'}`,
      },
      {
        title: `Finał: ${solved.finalFateLabel}`,
        body: `Gwiazda o tej masie ${solved.finalFateDescription}. ${m >= 8 ? 'Supernowa rozsieje w przestrzeń pierwiastki od tlenu po żelazo (i w błysku — cięższe): wapń w Twoich kościach i żelazo we krwi powstały dokładnie tak.' : 'Pierwiastki z odrzuconej otoczki (węgiel, azot) zasilą kolejne pokolenia gwiazd i planet.'}`,
      },
    ];
  },
};
