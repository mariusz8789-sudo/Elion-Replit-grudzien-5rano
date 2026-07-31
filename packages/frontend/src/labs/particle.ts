import type { ExperimentDef, LabDefinition, NarrationBlock, Sim, SimParams } from '../core/types';
import { particleInvMass } from './experiments/particle-invmass';
import { particleDetector3D } from './experiments/particle-detector-3d';
import { particleRelativisticEnergy } from './experiments/particle-relativistic-energy';

/**
 * Particle Lab — flagowy eksperyment to teraz prawdziwy detektor 3D
 * (helisy w polu solenoidalnym, patrz particle-detector-3d.ts) — promowany
 * z zakładki pobocznej, żeby pierwszym widokiem NIE był płaski 2D rozbłysk
 * łuków. Dawny bazowy eksperyment (płaska wersja 2D) NIE został usunięty
 * — jest teraz pierwszą pozycją w `experiments` jako „Detektor 2D".
 * Poglądowa (edukacyjna) rekonstrukcja zdarzeń w stylu detektorów CERN:
 * naładowane cząstki zakrzywiają tory w polu magnetycznym (r = p/qB — ta
 * zależność jest fizycznie poprawna), fotony lecą prosto. NIE odtwarzamy
 * rzeczywistych przekrojów czynnych ani kinematyki zderzeń.
 */

interface Track {
  charge: -1 | 0 | 1;
  pt: number;
  phi: number;
  color: string;
  label: string;
  progress: number;
}

const SPECIES = [
  { label: 'e±', color: '#5cd6e8', charged: true },
  { label: 'μ±', color: '#a78bfa', charged: true },
  { label: 'π±', color: '#f0b35c', charged: true },
  { label: 'p', color: '#f47c7c', charged: true },
  { label: 'γ', color: '#e6eaf5', charged: false },
];

class CollisionSim implements Sim {
  private tracks: Track[] = [];
  private timer = 0;
  private events = 0;
  private wantEvent = true;

  init() {}

  reset = () => {
    this.tracks = [];
    this.events = 0;
    this.wantEvent = true;
  };

  pointer(_x: number, _y: number, type: 'down' | 'move' | 'up') {
    if (type === 'down') this.wantEvent = true;
  }

  private fire(p: SimParams) {
    const energy = Number(p.energy);
    const n = 5 + Math.floor(Math.random() * (6 + energy / 8));
    this.tracks = [];
    for (let i = 0; i < n; i++) {
      const s = SPECIES[Math.floor(Math.random() * SPECIES.length)];
      this.tracks.push({
        charge: s.charged ? (Math.random() < 0.5 ? -1 : 1) : 0,
        pt: 0.15 + Math.random() * 0.85,
        phi: Math.random() * Math.PI * 2,
        color: s.color,
        label: s.label,
        progress: 0,
      });
    }
    this.events++;
  }

  update(dt: number, p: SimParams) {
    this.timer += dt;
    if (this.wantEvent || (Boolean(p.auto) && this.timer > 2.4)) {
      this.timer = 0;
      this.wantEvent = false;
      this.fire(p);
    }
    for (const t of this.tracks) t.progress = Math.min(1, t.progress + dt * 1.6);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const cx = w / 2;
    const cy = h / 2;
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
    bgGrad.addColorStop(0, '#080a16');
    bgGrad.addColorStop(1, '#02030a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
    const R = Math.min(w, h) * 0.44;

    // Warstwy detektora
    for (const [r, c] of [[0.35, 'rgba(92,214,232,0.15)'], [0.68, 'rgba(240,179,92,0.12)'], [1, 'rgba(141,151,180,0.25)']] as const) {
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.arc(cx, cy, R * r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(141,151,180,0.6)';
    ctx.font = '9px system-ui';
    ctx.fillText('tracker', cx + R * 0.2, cy - 4);
    ctx.fillText('kalorymetr', cx + R * 0.5, cy + 12);

    // Tory: łuki o krzywiźnie ∝ B/pt, znak wg ładunku. Poświata skalowana
    // prawdziwym pt toru (wyższy pęd poprzeczny = bardziej energetyczna
    // cząstka, jaśniejszy tor) — nie ozdoba stała.
    for (const t of this.tracks) {
      const len = R * t.progress;
      const curv = t.charge === 0 ? 0 : (t.charge * 1.4) / (t.pt * 4); // 1/r w jedn. ekranu
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 2 + t.pt * 6;
      if (t.charge === 0) ctx.setLineDash([5, 5]);
      ctx.beginPath();
      let x = cx;
      let y = cy;
      let ang = t.phi;
      ctx.moveTo(x, y);
      const steps = 40;
      for (let s = 0; s < steps; s++) {
        const dl = len / steps;
        x += Math.cos(ang) * dl;
        y += Math.sin(ang) * dl;
        ang += curv * dl * 0.1;
        ctx.lineTo(x, y);
        if (Math.hypot(x - cx, y - cy) > R) break;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      if (t.progress >= 1) {
        ctx.fillStyle = t.color;
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillText(t.label, x + 3, y);
      }
    }

    // Punkt zderzenia
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(230,234,245,0.6)';
    ctx.font = '10px system-ui';
    ctx.fillText('dotknij, aby zderzyć', 10, h - 10);
  }

  getStats() {
    return { events: this.events, tracks: this.tracks.length };
  }
}

/** Dawny bazowy eksperyment (płaska wersja 2D) — teraz zakładka poboczna, nieusunięta. */
const particleCollision2D: ExperimentDef = {
  id: 'detector-2d',
  name: 'Detektor 2D',
  honesty: 'educational',
  honestyNote:
    'Wizualizacja poglądowa inspirowana detektorami CERN. Fizycznie poprawna jest zależność krzywizny toru od pędu i ładunku (r = p/qB). Rodzaje i liczba cząstek są losowane — NIE odtwarzamy rzeczywistych przekrojów czynnych LHC.',
  params: [
    { key: 'energy', label: 'Energia zderzenia', type: 'slider', min: 5, max: 100, step: 5, default: 30, unit: 'j.u.' },
    { key: 'auto', label: 'Zderzaj automatycznie', type: 'toggle', default: true },
  ],
  createSim: () => new CollisionSim(),
  narrate(p, stats): NarrationBlock[] {
    const n = Number(stats.tracks ?? 0);
    return [
      {
        title: `Zdarzenie #${stats.events ?? 0}: ${n} torów`,
        body: 'Kierunek skrętu zdradza ładunek: w polu magnetycznym cząstki dodatnie i ujemne zakręcają w przeciwne strony. Tory mocno zakrzywione = niski pęd; niemal proste = wysoki. Przerywane linie to fotony — bez ładunku lecą prosto i ujawniają się dopiero w kalorymetrze.',
      },
      {
        title: 'Jak odkrywa się cząstki',
        body: `Bozon Higgsa (2012) znaleziono dokładnie tak: miliardy zdarzeń, w nich pary fotonów i czwórki leptonów, a w statystyce — garb przy 125 GeV. Przy energii ${p.energy} j.u. zwiększ suwak i zobacz, jak rośnie krotność cząstek — tak samo działa podnoszenie energii akceleratora.`,
      },
      {
        title: 'Czego ta wizualizacja nie odtwarza',
        kind: 'warning' as const,
        body: 'Kwarki i gluony nie występują swobodnie (uwięzienie koloru) — w prawdziwym detektorze widać tylko ich "dżety", których ten widok nie symuluje; rodzaje i liczba cząstek są tu losowane, nie liczone z rzeczywistej kinematyki zderzenia. Histogram masy niezmienniczej — metoda, którą NAPRAWDĘ odkryto J/ψ i Z⁰ — zobacz w zakładce „Odkryj cząstkę" obok.',
      },
    ];
  },
};

export const particleLab: LabDefinition = {
  id: 'particle',
  name: 'Particle Lab',
  tagline: 'Kwarki, bozony, zderzenia — detektor cząstek',
  icon: '💥',
  accent: '#f47c7c',
  honesty: particleDetector3D.honesty,
  honestyNote: particleDetector3D.honestyNote,
  params: particleDetector3D.params,
  createSim3D: particleDetector3D.createSim3D,
  experiments: [particleCollision2D, particleInvMass, particleRelativisticEnergy],
  narrate: particleDetector3D.narrate,
};
