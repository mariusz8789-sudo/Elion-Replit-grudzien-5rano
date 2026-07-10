import { useMemo, useState } from 'react';
import type { LabDefinition, Sim, SimParams } from '../core/types';
import { useSimLoop } from '../core/useSimLoop';
import { NarratorPanel } from '../components/NarratorPanel';
import { HonestyBadge } from '../components/HonestyBadge';
import { ELEMENTS, type ElementInfo } from '../data/elements';
import { PERIODIC_TRENDS, type PeriodicTrendPoint } from '../data/periodicTrends';

/**
 * Orbitale atomu wodoru — dokładne |ψ|² z rozwiązań analitycznych równania
 * Schrödingera (przekrój w płaszczyźnie x–z, φ=0; jednostki: promień Bohra).
 */
const ORBITALS: Record<string, { label: string; extent: number; R: (r: number) => number; Y: (ct: number, st: number) => number }> = {
  '1s': { label: '1s', extent: 6, R: (r) => 2 * Math.exp(-r), Y: () => 1 },
  '2s': { label: '2s', extent: 16, R: (r) => (2 - r) * Math.exp(-r / 2), Y: () => 1 },
  '2pz': { label: '2p', extent: 16, R: (r) => r * Math.exp(-r / 2), Y: (ct) => ct },
  '3s': { label: '3s', extent: 30, R: (r) => (27 - 18 * r + 2 * r * r) * Math.exp(-r / 3), Y: () => 1 },
  '3pz': { label: '3p', extent: 30, R: (r) => r * (6 - r) * Math.exp(-r / 3), Y: (ct) => ct },
  '3dz2': { label: '3d z²', extent: 34, R: (r) => r * r * Math.exp(-r / 3), Y: (ct) => 3 * ct * ct - 1 },
  '3dxz': { label: '3d xz', extent: 34, R: (r) => r * r * Math.exp(-r / 3), Y: (ct, st) => ct * st * 2 },
};

type TrendProp = 'radiusPm' | 'ionizationKJ';

const TREND_LABELS: Record<TrendProp, { label: string; unit: string }> = {
  radiusPm: { label: 'Promień atomowy', unit: 'pm' },
  ionizationKJ: { label: 'Pierwsza energia jonizacji', unit: 'kJ/mol' },
};

function trendRange(prop: TrendProp): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of Object.values(PERIODIC_TRENDS)) {
    const v = p[prop];
    if (v == null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/** Kolor komórki heatmapy: niski→chłodny cyjan, wysoki→ciepły bursztyn (te same akcenty co reszta Genesis OS). */
function trendCellColor(value: number | null, min: number, max: number): string {
  if (value == null) return 'rgba(230,234,245,0.06)';
  const t = max > min ? (value - min) / (max - min) : 0;
  const hue = 190 - t * 155; // 190 (cyjan) → 35 (bursztyn)
  const alpha = 0.22 + t * 0.5;
  return `hsla(${hue}, 75%, 60%, ${alpha})`;
}

class OrbitalSim implements Sim {
  private img: ImageData | null = null;
  private key = '';
  private off = document.createElement('canvas');

  init() {}

  private compute(key: string) {
    const orb = ORBITALS[key];
    const N = 240;
    this.off.width = N;
    this.off.height = N;
    const octx = this.off.getContext('2d')!;
    const img = octx.createImageData(N, N);
    let max = 0;
    const dens = new Float64Array(N * N);
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const x = ((ix / N) * 2 - 1) * orb.extent;
        const z = ((iy / N) * 2 - 1) * orb.extent;
        const r = Math.hypot(x, z);
        const ct = r === 0 ? 0 : z / r;
        const st = r === 0 ? 0 : x / r;
        const psi = orb.R(r) * orb.Y(ct, st);
        const d = psi * psi;
        dens[iy * N + ix] = d;
        if (d > max) max = d;
      }
    }
    for (let i = 0; i < N * N; i++) {
      const v = Math.pow(dens[i] / max, 0.35); // kompresja dynamiki dla widoczności węzłów
      img.data[i * 4] = 40 + v * 60;
      img.data[i * 4 + 1] = 60 + v * 155;
      img.data[i * 4 + 2] = 90 + v * 165;
      img.data[i * 4 + 3] = v * 255;
    }
    octx.putImageData(img, 0, 0);
    this.img = img;
    this.key = key;
  }

  update(_dt: number, p: SimParams) {
    const key = String(p.orbital);
    if (key !== this.key && ORBITALS[key]) this.compute(key);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    if (!this.img) return;
    const size = Math.min(w, h) * 0.92;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.off, (w - size) / 2, (h - size) / 2, size, size);
    // jądro
    ctx.fillStyle = '#f0b35c';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 2, 0, Math.PI * 2);
    ctx.fill();
    const orb = ORBITALS[this.key];
    ctx.fillStyle = 'rgba(230,234,245,0.7)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`|ψ|² orbitalu ${orb?.label ?? ''} · pole: ±${orb?.extent ?? 0} promieni Bohra`, 10, h - 10);
  }
}

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
    const cx = w / 2;
    const cy = h / 2;
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
    bgGrad.addColorStop(0, '#080a16');
    bgGrad.addColorStop(1, '#02030a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
    const el = this.element;
    const neutrons = Math.round(el.mass) - el.z;

    // Jądro — poświata skalowana prawdziwym Z (więcej protonów → więcej
    // ładunku → jaśniejsze jądro), nie stała ozdoba.
    const nucR = Math.min(10 + Math.log2(el.z) * 2.2, 26);
    ctx.shadowColor = 'rgba(248,217,160,0.75)';
    ctx.shadowBlur = 6 + Math.log2(el.z) * 2;
    const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, nucR);
    grad.addColorStop(0, '#f8d9a0');
    grad.addColorStop(1, '#c76b3f');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, nucR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
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
      ctx.fillStyle = '#5cd6e8';
      ctx.shadowColor = '#5cd6e8';
      ctx.shadowBlur = 6;
      for (let e = 0; e < shown; e++) {
        const ang = this.t * speed + (e / shown) * Math.PI * 2 + i;
        ctx.beginPath();
        ctx.arc(cx + r * Math.cos(ang), cy + r * Math.sin(ang), 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
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
  const [mode, setMode] = useState<'shells' | 'orbitals' | 'trends'>('shells');
  const [orbital, setOrbital] = useState('2pz');
  const [trendProp, setTrendProp] = useState<TrendProp>('radiusPm');
  const bohrSim = useMemo(() => new BohrSim(), []);
  const orbSim = useMemo(() => new OrbitalSim(), []);
  const el = ELEMENTS[z - 1];
  bohrSim.element = el;
  const sim = mode === 'orbitals' ? orbSim : bohrSim;
  const canvasRef = useSimLoop(sim, { orbital }, true);
  const neutrons = Math.round(el.mass) - el.z;

  const orbitalHonestyNote =
    'Gęstość |ψ|² liczona z dokładnych rozwiązań analitycznych równania Schrödingera dla atomu wodoru (przekrój w płaszczyźnie, jednostki: promień Bohra). Jasność skompresowana, by uwidocznić węzły.';
  const trendsHonestyNote =
    'Wartości tabelaryczne (CRC Handbook of Chemistry and Physics; NIST Atomic Spectra Database; promień atomowy — Slater 1964). Ograniczone do okresów 1–4 (Z=1–36) — te wartości są dobrze ugruntowane; gazy szlachetne nie mają dobrze zdefiniowanego promienia empirycznego (nie tworzą wiązań), pominięte zamiast zmyślać liczbę.';

  const trendPoint: PeriodicTrendPoint | undefined = PERIODIC_TRENDS[z];
  const trendRangeVal = useMemo(() => trendRange(trendProp), [trendProp]);

  return (
    <div className="lab-view" style={{ ['--accent' as string]: lab.accent }}>
      <div className="exp-tabs" role="tablist" aria-label="Widoki">
        <button role="tab" aria-selected={mode === 'shells'} onClick={() => setMode('shells')}>
          Powłoki (118 pierwiastków)
        </button>
        <button role="tab" aria-selected={mode === 'orbitals'} onClick={() => setMode('orbitals')}>
          Orbitale |ψ|²
        </button>
        <button role="tab" aria-selected={mode === 'trends'} onClick={() => setMode('trends')}>
          Trendy okresowe
        </button>
      </div>

      {mode !== 'trends' && (
        <div className="sim-stage" style={{ height: '36vh', minHeight: 240 }}>
          <canvas
            ref={canvasRef}
            key={mode}
            role="img"
            aria-label={
              mode === 'shells'
                ? `Model powłokowy atomu: ${el.name}. Dane liczbowe w panelu poniżej.`
                : `Gęstość prawdopodobieństwa orbitalu ${ORBITALS[orbital].label} atomu wodoru.`
            }
          />
        </div>
      )}

      <HonestyBadge
        level={mode === 'orbitals' ? 'exact' : mode === 'trends' ? 'exact' : lab.honesty}
        note={mode === 'orbitals' ? orbitalHonestyNote : mode === 'trends' ? trendsHonestyNote : lab.honestyNote}
      />

      {mode === 'trends' && (
        <>
          <div className="controls">
            <div className="control">
              <label>Właściwość</label>
              <div className="seg" role="group" aria-label="Trend okresowy">
                {(Object.keys(TREND_LABELS) as TrendProp[]).map((key) => (
                  <button key={key} aria-pressed={trendProp === key} onClick={() => setTrendProp(key)}>
                    {TREND_LABELS[key].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ptable-wrap" aria-label="Trendy okresowe — mapa cieplna">
            <div className="ptable">
              {ELEMENTS.map((e) => {
                const point = PERIODIC_TRENDS[e.z];
                const val = point ? point[trendProp] : null;
                return (
                  <button
                    key={e.z}
                    className="pt-el"
                    style={{ gridColumn: e.col, gridRow: e.row, background: trendCellColor(val, trendRangeVal.min, trendRangeVal.max) }}
                    aria-pressed={e.z === z}
                    title={e.name}
                    onClick={() => setZ(e.z)}
                  >
                    <span className="z">{e.z}</span>
                    {e.symbol}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="el-info">
            <div className="stat"><span className="k">Pierwiastek</span><span className="v">{el.name} ({el.symbol}, Z={el.z})</span></div>
            <div className="stat">
              <span className="k">{TREND_LABELS[trendProp].label}</span>
              <span className="v">
                {trendPoint && trendPoint[trendProp] != null ? `${trendPoint[trendProp]} ${TREND_LABELS[trendProp].unit}` : 'brak ustalonej wartości'}
              </span>
            </div>
          </div>

          <NarratorPanel
            blocks={[
              trendProp === 'radiusPm'
                ? {
                    title: 'Promień atomowy: dwie przeciwstawne tendencje',
                    body:
                      'WZDŁUŻ OKRESU (w prawo) promień MALEJE — kolejne elektrony trafiają na tę samą powłokę, ale ładunek jądra rośnie o cały proton, więc silniej ściąga elektrony. W DÓŁ GRUPY promień ROŚNIE — pojawia się cała nowa powłoka, dalej od jądra niż wszystkie poprzednie. Efekt tych dwóch reguł widać na mapie: najmniejsze atomy (bursztyn) w prawym górnym rogu, największe (cyjan) w lewym dolnym.',
                    citation: { source: 'Slater (1964), Journal of Chemical Physics 41, 3199', confirmation: 'confirmed' as const, note: 'Empiryczne promienie atomowe' },
                  }
                : {
                    title: 'Energia jonizacji: odwrotność promienia',
                    body:
                      'Im ciaśniej elektron jest związany (mały promień, duży efektywny ładunek jądra), tym więcej energii trzeba, by go usunąć. Dlatego mapa energii jonizacji jest niemal LUSTRZANYM ODBICIEM mapy promienia: gazy szlachetne (pełna powłoka, bardzo trudne do zjonizowania) świecą najjaśniej, metale alkaliczne (Li, Na, K — jeden słabo związany elektron na zewnętrznej powłoce) najciemniej.',
                    citation: { source: 'NIST Atomic Spectra Database', confirmation: 'confirmed' as const, note: 'Pierwsze energie jonizacji' },
                  },
              {
                title: `${el.name}: ${trendPoint && trendPoint[trendProp] != null ? 'w kontekście trendu' : 'brak danych w tym zakresie'}`,
                body:
                  trendPoint && trendPoint[trendProp] != null
                    ? `Z=${el.z}, okres ${el.row}, kolumna ${el.col}. Porównaj z sąsiadami w tym samym okresie (ta sama powłoka walencyjna) i tej samej grupie (ta sama liczba elektronów walencyjnych) — dotknij innej komórki mapy.`
                    : 'Ten pierwiastek jest poza zakresem danych w tej wersji (okresy 1–4, Z=1–36) albo jest gazem szlachetnym bez dobrze zdefiniowanego promienia empirycznego. Dotknij innej komórki, by zobaczyć realną wartość.',
              },
            ]}
          />
        </>
      )}

      {mode === 'orbitals' && (
        <div className="controls">
          <div className="control">
            <label>Orbital atomu wodoru</label>
            <div className="seg" role="group" aria-label="Orbital">
              {Object.entries(ORBITALS).map(([key, o]) => (
                <button key={key} aria-pressed={orbital === key} onClick={() => setOrbital(key)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {mode === 'orbitals' && (
        <NarratorPanel
          blocks={[
            {
              title: `Orbital ${ORBITALS[orbital].label}: chmura prawdopodobieństwa, nie orbita`,
              body:
                orbital === '1s'
                  ? 'Stan podstawowy wodoru: kula bez węzłów, największa gęstość tuż przy jądrze. To najniższa możliwa energia (−13,6 eV) — elektron nie może „spaść niżej", bo zasada nieoznaczoności karze lokalizację ogromnym pędem. Dlatego atomy w ogóle są stabilne.'
                  : orbital === '2s' || orbital === '3s'
                    ? 'Orbital sferyczny z węzłami radialnymi — ciemne pierścienie to miejsca, gdzie prawdopodobieństwo znalezienia elektronu spada DOKŁADNIE do zera. Elektron „jest" po obu stronach węzła, nigdy w nim — czysto falowa własność bez klasycznego odpowiednika.'
                    : 'Orbital kierunkowy: gęstość skupia się w płatach rozdzielonych płaszczyznami węzłowymi. Z takich kształtów (p, d) bierze się cała geometria wiązań chemicznych — kąty w cząsteczce wody czy czterościenność węgla to bezpośredni ślad tych płatów.',
            },
            {
              title: 'Skąd to wiemy',
              body: 'To nie ilustracja: każdy piksel liczy |ψ|² z analitycznego rozwiązania równania Schrödingera dla wodoru — jedynego atomu rozwiązanego dokładnie. Kształty potwierdzono eksperymentalnie, m.in. mikroskopią fotojonizacyjną (2013), która sfotografowała węzły orbitali wodoru.',
            },
          ]}
        />
      )}

      {mode === 'shells' && (
        <>

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
            body: 'Elektrony nie krążą po orbitach jak planety — zajmują orbitale: chmury prawdopodobieństwa o kształtach s, p, d, f. Model powłokowy poprawnie oddaje liczbę elektronów na powłokach (reguła Aufbau; kilka pierwiastków, np. chrom i miedź, ma drobne odstępstwa). Przełącz na widok „Orbitale |ψ|²", by zobaczyć prawdziwe kształty.',
          },
        ]}
      />
        </>
      )}
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
};
