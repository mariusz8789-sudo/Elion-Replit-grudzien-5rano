import { useMemo, useState } from 'react';
import type { LabDefinition, Sim } from '../core/types';
import { HONESTY_LABELS } from '../core/types';
import { useSimLoop } from '../core/useSimLoop';
import { NarratorPanel } from '../components/NarratorPanel';
import { ELEMENTS, type ElementInfo } from '../data/elements';

/**
 * Atom Lab — układ okresowy (118 pierwiastków) + model powłokowy atomu.
 * Wizualizacja powłok w konwencji Bohra: poglądowa. Rzeczywiste elektrony
 * opisują orbitale — chmury prawdopodobieństwa (planowane w Etapie 1).
 */

class BohrSim implements Sim {
  element: ElementInfo = ELEMENTS[5];
  private t = 0;

  init() {}

  update(dt: number) {
    this.t += dt;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const el = this.element;
    const neutrons = Math.round(el.mass) - el.z;

    // Jądro
    const nucR = Math.min(10 + Math.log2(el.z) * 2.2, 26);
    const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, nucR);
    grad.addColorStop(0, '#f8d9a0');
    grad.addColorStop(1, '#c76b3f');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, nucR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(230,234,245,0.9)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${el.z}p ${neutrons}n`, cx, cy + 3);

    // Powłoki elektronowe
    const maxR = Math.min(w, h) * 0.44;
    const shellCount = el.shells.length;
    el.shells.forEach((count, i) => {
      const r = nucR + 14 + ((maxR - nucR - 14) * (i + 1)) / shellCount;
      ctx.strokeStyle = 'rgba(92,214,232,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      const speed = 0.9 / (i + 1);
      const shown = Math.min(count, 18); // czytelność na małym ekranie
      for (let e = 0; e < shown; e++) {
        const ang = this.t * speed + (e / shown) * Math.PI * 2 + i;
        ctx.fillStyle = '#5cd6e8';
        ctx.beginPath();
        ctx.arc(cx + r * Math.cos(ang), cy + r * Math.sin(ang), 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (count > shown) {
        ctx.fillStyle = 'rgba(92,214,232,0.8)';
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillText(`×${count}`, cx + r + 2, cy - 4);
      }
    });
    ctx.textAlign = 'left';
  }
}

function AtomView({ lab }: { lab: LabDefinition }) {
  const [z, setZ] = useState(6);
  const sim = useMemo(() => new BohrSim(), []);
  const el = ELEMENTS[z - 1];
  sim.element = el;
  const canvasRef = useSimLoop(sim, {}, true);
  const neutrons = Math.round(el.mass) - el.z;

  return (
    <div className="lab-view" style={{ ['--accent' as string]: lab.accent }}>
      <div className="sim-stage" style={{ height: '36vh', minHeight: 240 }}>
        <canvas ref={canvasRef} />
      </div>

      <div className="honesty-row">
        <span className={`honesty ${lab.honesty}`}>{HONESTY_LABELS[lab.honesty]}</span>
        <span className="honesty-note">{lab.honestyNote}</span>
      </div>

      <div className="el-info">
        <div className="stat"><span className="k">Pierwiastek</span><span className="v">{el.name} ({el.symbol})</span></div>
        <div className="stat"><span className="k">Z</span><span className="v">{el.z}</span></div>
        <div className="stat"><span className="k">Masa</span><span className="v">{el.mass.toLocaleString('pl-PL')} u</span></div>
        <div className="stat"><span className="k">Powłoki</span><span className="v">{el.shells.join('·')}</span></div>
      </div>

      <div className="ptable-wrap" aria-label="Układ okresowy pierwiastków">
        <div className="ptable">
          {ELEMENTS.map((e) => (
            <button
              key={e.z}
              className="pt-el"
              style={{ gridColumn: e.col, gridRow: e.row }}
              aria-pressed={e.z === z}
              title={e.name}
              onClick={() => setZ(e.z)}
            >
              <span className="z">{e.z}</span>
              {e.symbol}
            </button>
          ))}
        </div>
      </div>

      <NarratorPanel
        blocks={[
          {
            title: `${el.name}: ${el.z} protonów definiuje wszystko`,
            body: `Liczba atomowa Z = ${el.z} decyduje, że to ${el.name.toLowerCase()} — dodaj lub odejmij proton, a otrzymasz inny pierwiastek. Jądro zawiera ~${neutrons} neutronów (najczęstszy izotop), a ${el.z} elektronów wypełnia powłoki: ${el.shells.join(', ')}.`,
          },
          {
            title: 'Skala, której nie widać na rysunku',
            body: 'Gdyby jądro miało rozmiar piłki na środku stadionu, najbliższe elektrony krążyłyby poza trybunami. Atom to w ~99,9999999999996% pusta przestrzeń — rysunek celowo łamie skalę, inaczej jądro byłoby niewidzialne.',
          },
          {
            title: 'Od modelu Bohra do orbitali',
            body: 'Elektrony nie krążą po orbitach jak planety — zajmują orbitale: chmury prawdopodobieństwa o kształtach s, p, d, f. Model powłokowy poprawnie oddaje liczbę elektronów na powłokach (reguła Aufbau; kilka pierwiastków, np. chrom i miedź, ma drobne odstępstwa). Wizualizacja orbitali 3D — Etap 1.',
          },
        ]}
      />
    </div>
  );
}

export const atomLab: LabDefinition = {
  id: 'atom',
  name: 'Atom Lab',
  tagline: '118 pierwiastków, powłoki elektronowe, budowa atomu',
  icon: '🧪',
  accent: '#6ee7a0',
  honesty: 'educational',
  honestyNote:
    'Model powłokowy w konwencji Bohra: liczby elektronów na powłokach wg reguły Aufbau (kilka pierwiastków ma odstępstwa). Rzeczywiste elektrony opisują orbitale kwantowe. Skala jądro/powłoki celowo złamana dla czytelności.',
  params: [],
  narrate: () => [],
  CustomView: AtomView,
  roadmap: [
    'Orbitale s/p/d/f jako chmury prawdopodobieństwa 3D (Etap 1)',
    'Izotopy i mapa nuklidów (Etap 1)',
    'Widma emisyjne pierwiastków (Etap 2)',
  ],
};
