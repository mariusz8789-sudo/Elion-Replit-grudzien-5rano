import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import {
  G_ASTRO,
  circularVelocity,
  exponentialDiskMass,
  isothermalHaloMass,
  mondAcceleration,
  MOND_A0_ASTRO,
} from '../../core/physics';

/**
 * Krzywa rotacji galaktyki — najsilniejszy pojedynczy dowód obserwacyjny
 * na ciemną materię (Rubin, Ford & Thonnard 1978, 1980, ApJ). Bez dodatkowej,
 * niewidocznej masy prędkość gwiazd powinna maleć jak 1/√r poza dyskiem
 * (Keplerowsko) — realne spiralne galaktyki mają krzywe PŁASKIE aż po
 * najdalej zmierzone punkty. Ten eksperyment pokazuje obie strony sporu:
 * (1) domyślnie — dodanie halo ciemnej materii (model pseudo-izotermiczny,
 * Begeman 1989) spłaszcza krzywą; (2) przełącznik MOND (Milgrom 1983) —
 * ta sama płaska krzywa BEZ dodawania żadnej nowej masy, tylko modyfikując
 * prawo grawitacji przy małych przyspieszeniach.
 */

const DISK_MASS = 5e10; // M_słońca — typowa masa gwiazdowa dysku spiralnej galaktyki
const SCALE_LENGTH = 3; // kpc — typowa długość skali dysku wykładniczego
const CORE_RADIUS = 3; // kpc — promień rdzenia halo (porównywalny z rd)
const R_MAX = 25; // kpc
const MARKER_R = 20; // kpc — promień testowej gwiazdy pokazanej na krzywej

function haloRho0(vInf: number): number {
  if (vInf <= 0) return 0;
  return (vInf * vInf) / (4 * Math.PI * G_ASTRO * CORE_RADIUS * CORE_RADIUS);
}

function vDiskAt(r: number): number {
  return circularVelocity(exponentialDiskMass(r, DISK_MASS, SCALE_LENGTH), r);
}

function vCdmAt(r: number, vInf: number): number {
  const mDisk = exponentialDiskMass(r, DISK_MASS, SCALE_LENGTH);
  const mHalo = isothermalHaloMass(r, haloRho0(vInf), CORE_RADIUS);
  return circularVelocity(mDisk + mHalo, r);
}

function vMondAt(r: number): number {
  if (r <= 0) return 0;
  const mDisk = exponentialDiskMass(r, DISK_MASS, SCALE_LENGTH);
  const gN = (G_ASTRO * mDisk) / (r * r);
  const g = mondAcceleration(gN, MOND_A0_ASTRO);
  return Math.sqrt(g * r);
}

/** Asymptotyczna prędkość MOND: v∞=(G·M·a0)^¼ (relacja Tully'ego–Fishera). */
function mondFlatVelocity(massTotal: number): number {
  return Math.pow(G_ASTRO * massTotal * MOND_A0_ASTRO, 0.25);
}

export interface RotationCurveScenarioResult {
  haloVInf: number;
  altGravity: boolean;
  markerRadiusKpc: number;
  visibleDiskVelocityKmS: number;
  modeledVelocityKmS: number;
  gapPercent: number;
  mondAsymptoticVelocityKmS: number;
}

/**
 * Deterministyczny adapter obliczeniowy istniejącej krzywej rotacji. Oblicza
 * dokładnie te same obserwowalne przy MARKER_R, których używa Canvas, a nie
 * dopasowuje danych konkretnej galaktyki ani nie rozstrzyga CDM kontra MOND.
 */
export function runRotationCurveScenario({
  haloVInf = 150,
  altGravity = false,
}: {
  haloVInf?: number;
  altGravity?: boolean;
} = {}): RotationCurveScenarioResult {
  if (!Number.isFinite(haloVInf) || haloVInf < 0 || haloVInf > 220) {
    throw new Error('haloVInf musi być skończoną liczbą z zakresu 0–220 km/s.');
  }
  const visibleDiskVelocityKmS = vDiskAt(MARKER_R);
  const modeledVelocityKmS = altGravity ? vMondAt(MARKER_R) : vCdmAt(MARKER_R, haloVInf);
  return {
    haloVInf,
    altGravity,
    markerRadiusKpc: MARKER_R,
    visibleDiskVelocityKmS,
    modeledVelocityKmS,
    gapPercent: visibleDiskVelocityKmS > 0 ? ((modeledVelocityKmS - visibleDiskVelocityKmS) / visibleDiskVelocityKmS) * 100 : 0,
    mondAsymptoticVelocityKmS: mondFlatVelocity(DISK_MASS),
  };
}

class RotationCurveSim implements Sim {
  private t = 0;
  private lastVInf = 0;
  private lastMond = false;

  init() {
    // brak stanu zależnego od rozmiaru canvasu — krzywa liczona na żywo w render()
  }

  reset = () => {
    this.t = 0;
  };

  update(dt: number, p: SimParams) {
    this.t += dt;
    this.lastVInf = Number(p.haloVInf ?? 0);
    this.lastMond = Boolean(p.altGravity);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, w, h);

    const padL = 42;
    const padR = 14;
    const padT = 18;
    const padB = 34;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const vSecond = this.lastMond ? vMondAt(MARKER_R) : vCdmAt(MARKER_R, this.lastVInf);
    const vFirst = vDiskAt(MARKER_R);
    const maxV = Math.max(vFirst, vSecond, this.lastMond ? mondFlatVelocity(DISK_MASS) : this.lastVInf, 60) * 1.25;

    const toX = (r: number) => padL + (r / R_MAX) * plotW;
    const toY = (v: number) => padT + plotH - (v / maxV) * plotH;

    // siatka
    ctx.strokeStyle = 'rgba(230,234,245,0.08)';
    ctx.lineWidth = 1;
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(230,234,245,0.45)';
    for (let r = 0; r <= R_MAX; r += 5) {
      const x = toX(r);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.fillText(`${r}`, x - 4, padT + plotH + 14);
    }
    const vStep = maxV > 300 ? 100 : 50;
    for (let v = 0; v <= maxV; v += vStep) {
      const y = toY(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillText(`${v}`, 4, y + 3);
    }
    ctx.fillText('r (kpc)', padL + plotW - 30, padT + plotH + 26);
    ctx.save();
    ctx.translate(10, padT + 10);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('v (km/s)', 0, 0);
    ctx.restore();

    // krzywa 1: tylko widoczna masa (Newton)
    ctx.beginPath();
    ctx.strokeStyle = '#f0b35c';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.6;
    for (let i = 0; i <= 120; i++) {
      const r = (i / 120) * R_MAX;
      const v = vDiskAt(r);
      const x = toX(r);
      const y = toY(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // krzywa 2: z ciemną materią LUB MOND
    ctx.beginPath();
    ctx.strokeStyle = '#5cd6e8';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 120; i++) {
      const r = (i / 120) * R_MAX;
      const v = this.lastMond ? vMondAt(r) : vCdmAt(r, this.lastVInf);
      const x = toX(r);
      const y = toY(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // testowa gwiazda pulsująca na krzywej 2, r=MARKER_R
    const mx = toX(MARKER_R);
    const my = toY(vSecond);
    const pulse = 3 + 1.6 * Math.sin(this.t * 3);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#5cd6e8';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(mx, my, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // legenda
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#f0b35c';
    ctx.fillText('— — tylko widoczna masa (Newton)', padL + 4, padT + 12);
    ctx.fillStyle = '#5cd6e8';
    ctx.fillText(this.lastMond ? '── MOND (bez ciemnej materii)' : '── z halo ciemnej materii', padL + 4, padT + 24);
  }

  getStats() {
    const solved = runRotationCurveScenario({ haloVInf: this.lastVInf, altGravity: this.lastMond });
    return {
      vNewtonAt20: Math.round(solved.visibleDiskVelocityKmS),
      vObservedAt20: Math.round(solved.modeledVelocityKmS),
      gapPercent: Math.round(solved.gapPercent),
      mondFlat: Math.round(solved.mondAsymptoticVelocityKmS),
    };
  }
}

export const universeRotationCurve: ExperimentDef = {
  id: 'rotationcurve',
  name: 'Krzywa rotacji galaktyki',
  honesty: 'educational',
  honestyNote:
    'Dysk: przybliżenie masy zamkniętej sferycznie symetrycznie (nie dokładne rozwiązanie cienkiego dysku, które wymaga funkcji Bessela). Halo ciemnej materii: model pseudo-izotermiczny (Begeman 1989). Kształt krzywej i mechanizm są prawdziwą fizyką; konkretne stałe (masa dysku, długość skali) są typowymi wartościami dla spiralnej galaktyki, nie danymi jednej, konkretnej, zmierzonej galaktyki.',
  params: [
    {
      key: 'haloVInf', label: 'Halo ciemnej materii (prędkość graniczna)', type: 'slider',
      min: 0, max: 220, step: 5, default: 150, unit: 'km/s',
    },
    { key: 'altGravity', label: 'Alternatywa: MOND zamiast ciemnej materii', type: 'toggle', default: false },
  ],
  createSim: () => new RotationCurveSim(),
  narrate(p, stats) {
    const mond = Boolean(p.altGravity);
    const vInf = Number(p.haloVInf ?? 0);
    const vNewton = Number(stats.vNewtonAt20 ?? 0);
    const vObs = Number(stats.vObservedAt20 ?? 0);
    const blocks = [
      {
        title: 'Najlepszy pojedynczy dowód na ciemną materię',
        body:
          'Bez dodatkowej, niewidocznej masy prędkość gwiazd na obrzeżach galaktyki powinna maleć jak w Układzie Słonecznym (dalsze planety krążą wolniej). Vera Rubin i Kent Ford zmierzyli w latach 70. dziesiątki spiralnych galaktyk — żadna nie zwalnia, krzywe pozostają PŁASKIE aż po najdalej zmierzone punkty. To odkrycie (wraz z wcześniejszymi przesłankami Fritza Zwicky\'ego z 1933 r. w gromadach galaktyk) jest dziś najczęściej cytowanym argumentem za istnieniem ciemnej materii.',
        citation: { source: 'Rubin, Ford & Thonnard (1978, 1980), Astrophysical Journal', confirmation: 'confirmed' as const, note: 'Płaskość krzywych rotacji — fakt obserwacyjny, nie model' },
      },
      mond
        ? {
            title: 'MOND: płaska krzywa bez ciemnej materii',
            body: `Formuła Milgroma (1983) modyfikuje samo prawo grawitacji przy bardzo małych przyspieszeniach — bez dodania GRAMA nowej masy krzywa i tak spłaszcza się asymptotycznie do v∞≈${Number(stats.mondFlat ?? 0)} km/s. To relacja Tully'ego–Fishera (v⁴∝masa barionowa) — jeden z najmocniejszych argumentów ZA MOND, dobrze potwierdzony empirycznie dla pojedynczych galaktyk. Problem: MOND nie tłumaczy dobrze gromad galaktyk ani widma CMB bez DODATKOWEJ niewidocznej masy — dlatego większość kosmologów wciąż preferuje ciemną materię.`,
            citation: { source: 'Milgrom (1983), Astrophysical Journal 270, 365', confirmation: 'partial' as const, note: 'MOND dobrze dopasowuje pojedyncze galaktyki, zawodzi na gromadach — spór nierozstrzygnięty' },
          }
        : vInf < 30
          ? {
              title: 'Halo praktycznie wyłączone: model nie zgadza się z obserwacją',
              body: `Przy tak niskiej wartości suwaka krzywa spada niemal jak czysta grawitacja Newtona z widocznej masy (${vNewton} km/s przy r=20 kpc) — DOKŁADNIE tak NIE wygląda żadna realnie zmierzona spiralna galaktyka. Podnieś suwak, by zobaczyć, ile "brakującej" masy trzeba dodać, żeby dopasować się do obserwacji.`,
            }
          : {
              title: 'Halo ciemnej materii spłaszcza krzywą',
              body: `Model pseudo-izotermiczny (Begeman 1989 — pierwsze ilościowe dopasowanie halo do NGC 6503) daje przy r=20 kpc prędkość ${vObs} km/s zamiast ${vNewton} km/s przewidywanych z samej widocznej masy — to ${Math.round(((vObs - vNewton) / Math.max(1, vNewton)) * 100)}% więcej. Dokładnie tyle "brakującej" masy potrzeba, by dopasować model do obserwowanych, płaskich krzywych rotacji.`,
            },
      {
        title: 'Spór wciąż otwarty',
        body:
          'Ciemna materia (CDM) to konsensus większości kosmologów — potwierdzają ją niezależnie soczewkowanie grawitacyjne, gromada Pocisk i widmo CMB, ale cząstki nigdy nie zostały wykryte bezpośrednio (eksperymenty LZ, XENON — wyniki wciąż negatywne). MOND dobrze tłumaczy POJEDYNCZE galaktyki bez żadnej nowej materii, ale zawodzi na większych skalach. Przełącz suwak/przełącznik, by zobaczyć obie strony tego samego zjawiska.',
      },
    ];
    return blocks;
  },
};
