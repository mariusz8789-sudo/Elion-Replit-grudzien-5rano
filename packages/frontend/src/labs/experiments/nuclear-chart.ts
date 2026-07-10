import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import { registerDataSource, getDataSource } from '../../core/dataSource';
import { semfBindingPerNucleon, semfStabilityGradient } from '../../core/physics';
import { KNOWN_NUCLIDES, findKnownNuclide, type KnownNuclide } from '../../data/nuclides';

/**
 * Mapa nuklidów (Segrè chart) — Z (protony, oś pionowa) vs N (neutrony,
 * oś pozioma). Tło to CIĄGŁY model: energia wiązania na nukleon z wzoru
 * SEMF (core/physics.ts), dokładnie taki jak w knowledge/nuclear.md —
 * to on rysuje "dolinę stabilności" i tłumaczy, czemu rozszczepienie
 * (A>~56) i fuzja (A<~56) uwalniają energię. Na tym tle: ~55 realnych,
 * zmierzonych izotopów (NNDC, data/nuclides.ts) jako punkty do kliknięcia —
 * model i dane zmierzone są wizualnie i tekstowo odróżnione, zgodnie z
 * zasadą uczciwości naukowej Genesis OS.
 */

const ZMAX = 100;
const NMAX = 160;
const MAGIC = [2, 8, 20, 28, 50, 82, 126];

registerDataSource<KnownNuclide[]>({
  id: 'nuclear.known-nuclides',
  label: 'Zmierzone okresy półtrwania i tryby rozpadu (~55 kluczowych izotopów)',
  citation: {
    label: 'NNDC / IAEA Live Chart of Nuclides',
    url: 'https://www-nds.iaea.org/relnsd/vcharthtml/VChartHTML.html',
    confirmation: 'confirmed',
  },
  isSynthetic: false,
  load: () => KNOWN_NUCLIDES,
});

interface Layout { ox: number; oy: number; cw: number; ch: number }

class NuclideChartSim implements Sim {
  private w = 0;
  private h = 0;
  // Offscreen canvas: tworzony leniwie w pierwszym render() (nie w konstruktorze/
  // init), bo createSim()/update() muszą działać też w testach node:test/vitest
  // bez DOM (patrz sims.test.ts) — render() tam nigdy nie jest wywoływane.
  private bg: HTMLCanvasElement | null = null;
  private bgReady = false;
  private layout: Layout = { ox: 0, oy: 0, cw: 1, ch: 1 };
  private selected: { z: number; n: number } | null = null;
  private showMagic = true;

  init(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.computeLayout();
  }

  reset = () => {
    this.selected = null;
  };

  private computeLayout() {
    const ox = this.w * 0.09;
    const oy = this.h * 0.04;
    const cw = this.w * 0.89;
    const ch = this.h * 0.8;
    this.layout = { ox, oy, cw, ch };
  }

  /** Tło liczone raz: dla każdego (Z,N) energia wiązania/nukleon z SEMF. */
  private computeBackground() {
    const N = 220; // rozdzielczość mapy bitowej (niezależna od rozmiaru ekranu)
    const M = Math.round((N * ZMAX) / NMAX);
    const bg = document.createElement('canvas');
    bg.width = N;
    bg.height = M;
    this.bg = bg;
    const bctx = bg.getContext('2d')!;
    const img = bctx.createImageData(N, M);
    for (let iy = 0; iy < M; iy++) {
      const z = Math.round(((M - 1 - iy) / (M - 1)) * ZMAX);
      for (let ix = 0; ix < N; ix++) {
        const n = Math.round((ix / (N - 1)) * NMAX);
        const idx = (iy * N + ix) * 4;
        if (z < 1 || n < 0 || z + n < 1) {
          img.data[idx + 3] = 0;
          continue;
        }
        const bpa = semfBindingPerNucleon(z, n);
        // B/A realnie mieści się w ok. 0..8,8 MeV/nukleon
        const v = Math.max(0, Math.min(1, bpa / 8.8));
        img.data[idx] = 20 + v * 60;
        img.data[idx + 1] = 25 + v * 190;
        img.data[idx + 2] = 45 + v * 150;
        img.data[idx + 3] = v > 0.02 ? 235 : 0;
      }
    }
    bctx.putImageData(img, 0, 0);
    this.bgReady = true;
  }

  update(_dt: number, p: SimParams) {
    this.showMagic = Boolean(p.magic);
  }

  private cellAt(px: number, py: number): { z: number; n: number } | null {
    const { ox, oy, cw, ch } = this.layout;
    if (px < ox || px > ox + cw || py < oy || py > oy + ch) return null;
    const n = Math.round(((px - ox) / cw) * NMAX);
    const z = Math.round(ZMAX - ((py - oy) / ch) * ZMAX);
    if (z < 1 || n < 0 || z > ZMAX || n > NMAX) return null;
    return { z, n };
  }

  pointer(x: number, y: number, type: 'down' | 'move' | 'up') {
    if (type !== 'down') return;
    const cell = this.cellAt(x, y);
    if (cell) this.selected = cell;
  }

  private toXY(z: number, n: number): { x: number; y: number } {
    const { ox, oy, cw, ch } = this.layout;
    return { x: ox + (n / NMAX) * cw, y: oy + ch - (z / ZMAX) * ch };
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.computeLayout();
    }
    const bgGrad = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.max(w, h) * 0.8);
    bgGrad.addColorStop(0, '#080e0f');
    bgGrad.addColorStop(1, '#02030a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
    const { ox, oy, cw, ch } = this.layout;

    if (!this.bgReady) this.computeBackground();
    if (this.bg) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.bg, ox, oy, cw, ch);
    }

    // liczby magiczne
    if (this.showMagic) {
      ctx.strokeStyle = 'rgba(230,234,245,0.22)';
      ctx.setLineDash([2, 4]);
      for (const m of MAGIC) {
        if (m <= NMAX) {
          const x = ox + (m / NMAX) * cw;
          ctx.beginPath();
          ctx.moveTo(x, oy);
          ctx.lineTo(x, oy + ch);
          ctx.stroke();
        }
        if (m <= ZMAX) {
          const y = oy + ch - (m / ZMAX) * ch;
          ctx.beginPath();
          ctx.moveTo(ox, y);
          ctx.lineTo(ox + cw, y);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }

    // realne, zmierzone izotopy — przez rejestr DataSource (nie bezpośredni import),
    // tak jak particle-invmass.ts: jedno spójne miejsce deklarujące pochodzenie danych.
    const known = getDataSource<KnownNuclide[]>('nuclear.known-nuclides')?.load() ?? KNOWN_NUCLIDES;
    for (const k of known) {
      const { x, y } = this.toXY(k.z, k.n);
      ctx.fillStyle = colorForMode(k.decayMode);
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // zaznaczenie
    if (this.selected) {
      const { x, y } = this.toXY(this.selected.z, this.selected.n);
      ctx.strokeStyle = '#f0b35c';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = '#f0b35c';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
    }

    ctx.strokeStyle = 'rgba(141,151,180,0.5)';
    ctx.strokeRect(ox, oy, cw, ch);
    ctx.fillStyle = 'rgba(230,234,245,0.65)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('N (neutrony) →', ox + cw - 90, oy + ch + 16);
    ctx.save();
    ctx.translate(ox - 22, oy + 14);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Z (protony) →', 0, 0);
    ctx.restore();
    ctx.fillText('jaśniej = mocniej związane (SEMF) · kropki = zmierzone izotopy', ox, oy - 6);
  }

  getStats() {
    const sel = this.selected;
    if (!sel) return { selZ: -1, selN: -1, selA: -1, selBpa: 0, selGrad: 0, selKnown: 0 };
    const known = findKnownNuclide(sel.z, sel.n);
    return {
      selZ: sel.z,
      selN: sel.n,
      selA: sel.z + sel.n,
      selBpa: Math.round(semfBindingPerNucleon(sel.z, sel.n) * 100) / 100,
      selGrad: Math.round(semfStabilityGradient(sel.z, sel.n) * 1000) / 1000,
      selKnown: known ? 1 : 0,
    };
  }
}

function colorForMode(mode: KnownNuclide['decayMode']): string {
  switch (mode) {
    case 'stabilny': return '#e6eaf5';
    case 'β⁻': return '#5cd6e8';
    case 'β⁺/EC': return '#f0b35c';
    case 'α': return '#f47c7c';
    case 'α+SF': return '#c76bff';
    case 'IT': return '#6ee7a0';
    default: return '#8d97b4';
  }
}

export const nuclearChart: ExperimentDef = {
  id: 'chart',
  name: 'Mapa nuklidów',
  honesty: 'simplified',
  honestyNote:
    'Tło to półempiryczny wzór na masę (SEMF/Weizsäcker) — dokładny wzór, ale MODEL (pomija efekty powłokowe, dlatego prawdziwe maksimum energii wiązania leży przy Ni-62/Fe-58, nie dokładnie tam, gdzie przewiduje SEMF). Kropki na mapie to ~55 realnych, zmierzonych izotopów (NNDC) — model i dane zmierzone są tu celowo odróżnione. Dotknij dowolnego punktu (Z,N), by zobaczyć przewidywanie SEMF; jeśli trafisz w kropkę, dostaniesz prawdziwe dane.',
  params: [
    { key: 'magic', label: 'Pokaż liczby magiczne (2,8,20,28,50,82,126)', type: 'toggle', default: true },
  ],
  createSim: () => new NuclideChartSim(),
  narrate(_p, stats) {
    const z = Number(stats.selZ ?? -1);
    const n = Number(stats.selN ?? -1);
    if (z < 1) {
      return [
        {
          title: 'Dolina stabilności',
          body: 'Jaśniejszy pas na mapie to jądra najmocniej związane na nukleon — dolina stabilności. Poza nią jądra są coraz luźniej związane, aż znikają linie kroplenia (drip lines), gdzie dodatkowy nukleon w ogóle się nie wiąże. Dotknij dowolnego punktu, żeby zobaczyć liczby.',
        },
        {
          title: 'Skąd biorą się liczby magiczne',
          body: 'Linie siatki (2, 8, 20, 28, 50, 82, 126) to liczby magiczne — jądra o takiej liczbie protonów LUB neutronów są wyjątkowo stabilne, analogicznie do zamkniętych powłok elektronowych gazów szlachetnych. Model powłokowy jądra (Maria Goeppert-Mayer, Nobel 1963) tłumaczy je zamkniętymi powłokami nukleonowymi — SEMF w tle ich NIE przewiduje, co jest jego znaną granicą.',
        },
      ];
    }
    const known = findKnownNuclide(z, n);
    const a = z + n;
    const bpa = Number(stats.selBpa ?? 0);
    const grad = Number(stats.selGrad ?? 0);
    const dir = grad > 0.05 ? 'β⁻ (n→p) obniżyłby masę' : grad < -0.05 ? 'β⁺/EC (p→n) obniżyłby masę' : 'blisko minimum masy przy tym A — okolice stabilności';
    const blocks = [
      {
        title: known ? `${known.symbol}: dane zmierzone` : `Z=${z}, N=${n} (A=${a}): przewidywanie SEMF`,
        body: known
          ? `${known.decayMode === 'stabilny' ? 'Stabilny.' : `Rozpad: ${known.decayMode}, T½ = ${known.halfLifeLabel}.`} ${known.note ?? ''}`
          : `Ten punkt siatki nie jest jednym z ~55 skatalogowanych izotopów w tej wersji — pokazujemy tylko przewidywanie modelu SEMF, nie zmierzoną wartość. Energia wiązania/nukleon ≈ ${bpa.toFixed(2)} MeV.`,
        citation: known
          ? { source: 'NNDC / IAEA Live Chart of Nuclides', confirmation: 'confirmed' as const, note: 'Zmierzony okres półtrwania i tryb rozpadu' }
          : { source: 'Model SEMF (Weizsäcker)', confirmation: 'partial' as const, note: 'Przewidywanie, nie pomiar — SEMF pomija efekty powłokowe' },
      },
      {
        title: `Kierunek rozpadu beta przy A=${a}`,
        body: `SEMF porównuje energię wiązania sąsiednich izobarów: ${dir}. Tak właśnie działa rozpad beta — jądro "spada" w dół paraboli mas przy stałym A, aż trafi w izobar o najniższej masie (najczęściej jeden stabilny, czasem dwa przy parzystym A dzięki członowi parzystości).`,
      },
    ];
    return blocks;
  },
};
