import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import { tracePolylineBy } from '../../core/canvasHelpers';

/**
 * Soczewkowanie grawitacyjne — soczewka punktowa.
 * Dokładne wzory: θ± = ½(β ± √(β² + 4θ_E²)); wzmocnienie
 * μ± = ½ ± (u²+2)/(2u√(u²+4)), u = β/θ_E. Przy β→0: pierścień Einsteina.
 * Krzywa blasku mikrosoczewkowania: A(u) = (u²+2)/(u√(u²+4)).
 */

class LensingSim implements Sim {
  private t = 0;
  private history: number[] = [];
  private stars: { x: number; y: number; a: number }[] = [];
  private beta = 0.8;

  init(w: number, h: number) {
    if (this.stars.length === 0) {
      this.stars = Array.from({ length: 70 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        a: 0.1 + Math.random() * 0.4,
      }));
    }
  }

  reset = () => {
    this.history = [];
    this.t = 0;
  };

  update(dt: number, p: SimParams) {
    if (p.animate) {
      this.t += dt;
      this.beta = Math.abs(((this.t * 0.28) % 3.2) - 1.6); // przelot źródła
    } else {
      this.beta = Number(p.beta);
    }
    const u = Math.max(this.beta, 0.001);
    const A = (u * u + 2) / (u * Math.sqrt(u * u + 4));
    this.history.push(Math.min(A, 12));
    if (this.history.length > 320) this.history.shift();
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const cx = w / 2;
    const cy = h * 0.38;
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.8);
    bgGrad.addColorStop(0, '#080c18');
    bgGrad.addColorStop(1, '#02030a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
    for (const s of this.stars) {
      ctx.fillStyle = `rgba(200,215,255,${s.a})`;
      ctx.fillRect(s.x, s.y, 1.2, 1.2);
    }
    const thetaE = Math.min(w, h) * 0.14; // promień Einsteina w px

    const beta = this.beta;
    const u = Math.max(beta, 0.001);

    // pierścień Einsteina (ślad)
    ctx.strokeStyle = 'rgba(92,214,232,0.25)';
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, thetaE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // soczewka (masa) — świecąca, bo to ONA zakrzywia obraz w tle
    ctx.fillStyle = '#f0b35c';
    ctx.shadowColor = 'rgba(240,179,92,0.8)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(240,179,92,0.7)';
    ctx.font = '9px system-ui';
    ctx.fillText('soczewka', cx + 8, cy + 3);

    // prawdziwa pozycja źródła (niewidoczna bez soczewki w tym miejscu)
    const srcX = cx + beta * thetaE;
    ctx.strokeStyle = 'rgba(141,151,180,0.6)';
    ctx.beginPath();
    ctx.arc(srcX, cy, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(141,151,180,0.7)';
    ctx.fillText('źródło (prawdziwe)', srcX + 7, cy - 6);

    if (beta < 0.03) {
      // pierścień Einsteina
      ctx.strokeStyle = '#5cd6e8';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#5cd6e8';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, thetaE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
    } else {
      // dwa obrazy na osi źródło–soczewka
      const thP = 0.5 * (beta + Math.sqrt(beta * beta + 4));
      const thM = 0.5 * (beta - Math.sqrt(beta * beta + 4));
      const muP = Math.abs(0.5 + (u * u + 2) / (2 * u * Math.sqrt(u * u + 4)));
      const muM = Math.abs(0.5 - (u * u + 2) / (2 * u * Math.sqrt(u * u + 4)));
      for (const [th, mu] of [[thP, muP], [thM, muM]] as const) {
        const x = cx + th * thetaE;
        const r = Math.min(3 + mu * 2.2, 12);
        ctx.fillStyle = '#5cd6e8';
        ctx.shadowColor = '#5cd6e8';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(x, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = 'rgba(92,214,232,0.8)';
      ctx.fillText('obraz 1', cx + thP * thetaE + 8, cy + 14);
      ctx.fillText('obraz 2', cx + thM * thetaE - 40, cy + 14);
    }

    // krzywa blasku (mikrosoczewkowanie)
    const gy = h * 0.72;
    const gh = h * 0.2;
    ctx.strokeStyle = 'rgba(141,151,180,0.4)';
    ctx.strokeRect(w * 0.08, gy, w * 0.84, gh);
    ctx.strokeStyle = '#f0b35c';
    ctx.lineWidth = 1.6;
    tracePolylineBy(ctx, this.history.length, (i) => ({
      x: w * 0.08 + (i / 320) * w * 0.84,
      y: gy + gh - Math.min((this.history[i] - 1) / 6, 1) * gh,
    }));
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(230,234,245,0.6)';
    ctx.fillText('jasność łączna (krzywa mikrosoczewkowania)', w * 0.08, gy - 6);
  }

  getStats() {
    const u = Math.max(this.beta, 0.001);
    const A = (u * u + 2) / (u * Math.sqrt(u * u + 4));
    return { beta: Math.round(this.beta * 100) / 100, amp: Math.round(A * 100) / 100 };
  }
}

export const einsteinLensing: ExperimentDef = {
  id: 'lensing',
  name: 'Soczewkowanie',
  honesty: 'exact',
  honestyNote:
    'Pozycje obrazów, wzmocnienia i krzywa blasku liczone z dokładnych wzorów soczewki punktowej. Uproszczenie: źródło punktowe i pojedyncza masa (galaktyki-soczewki wymagają modeli rozciągłych).',
  params: [
    {
      key: 'beta', label: 'Pozycja źródła β / θ_E', type: 'slider',
      min: 0, max: 1.6, step: 0.01, default: 0.8,
      format: (v) => v.toFixed(2),
    },
    { key: 'animate', label: 'Przelot źródła (mikrosoczewkowanie)', type: 'toggle', default: false },
  ],
  createSim: () => new LensingSim(),
  narrate(p, stats) {
    const beta = Number(stats.beta ?? Number(p.beta));
    const A = Number(stats.amp ?? 1);
    return [
      {
        title:
          beta < 0.03
            ? 'Pierścień Einsteina!'
            : `Dwa obrazy jednego źródła · wzmocnienie ${A.toFixed(2)}×`,
        body:
          beta < 0.03
            ? 'Źródło, soczewka i obserwator leżą na jednej osi — światło dociera do Ciebie wszystkimi drogami naraz i widzisz świetlisty okrąg o promieniu Einsteina θ_E. Teleskopy JWST i Hubble regularnie fotografują takie pierścienie z galaktyk soczewkowanych przez gromady.'
            : `Masa zakrzywia bieg promieni tak, że jedno źródło widać w dwóch miejscach naraz (θ± = ½(β ± √(β²+4θ_E²))), z łączną jasnością ${A.toFixed(2)}× większą niż bez soczewki. Grawitacja nie „przyciąga światła" w sensie newtonowskim — zakrzywia czasoprzestrzeń, po której światło biegnie najprościej jak się da.`,
      },
      {
        title: 'Od sprawdzianu teorii do wagi na ciemną materię',
        body: 'Włącz „przelot źródła": pik jasności to sygnatura mikrosoczewkowania — tak odkrywa się planety pozasłoneczne (projekt OGLE warszawskiego obserwatorium jest tu światową czołówką) i waży niewidoczną materię. Mapy soczewkowania gromad to dziś najtwardszy dowód na istnienie ciemnej materii.',
      },
    ];
  },
};
