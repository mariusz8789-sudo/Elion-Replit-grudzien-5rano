import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import {
  ISING_TC,
  isingEnergyPerSite,
  isingExactMagnetization,
  isingMagnetization,
  isingMetropolisStep,
  isingRandomLattice,
} from '../../core/isingModel';

/**
 * Model Isinga 2D — przejście fazowe porządek/nieporządek (magnetyzm).
 * Algorytm Metropolisa (Metropolis i in. 1953) na siatce kwadratowej
 * z periodycznymi warunkami brzegowymi, J=1, bez pola zewnętrznego —
 * dokładnie ten model, dla którego Onsager (1944) podał ścisłe
 * rozwiązanie analityczne (temperatura krytyczna, spontaniczna
 * magnetyzacja). Fizyka w `core/isingModel.ts`, pokryta 14 testami
 * statystycznymi (RNG z ziarnem, powtarzalnymi).
 */

const N = 42;
// Dynamika Metropolisa z pojedynczym spinem naprawdę jest wolna głęboko
// poniżej T_c (dyfuzja ścian domen — zjawisko "critical slowing down",
// realny efekt, nie błąd) — stąd wysokie tempo prób/s (tanie, O(1) na
// próbę) i dodatkowy "wybuch" relaksacji przy skokowej zmianie temperatury
// (jak hartowanie/wyżarzanie próbki w laboratorium), żeby demo było
// czytelne w czasie rzeczywistym.
const CELL_STEPS_PER_SECOND = N * N * 40;
const QUENCH_BURST_STEPS = N * N * 25;

class IsingSim implements Sim {
  private lattice: Int8Array = isingRandomLattice(N);
  private temperature = 2.0;
  private lastTemperature = 2.0;
  private avgMag = 0;
  private avgEnergy = -1;
  private acc = 0;

  init() {
    this.avgMag = isingMagnetization(this.lattice);
    this.avgEnergy = isingEnergyPerSite(this.lattice, N);
  }

  reset = () => {
    this.lattice = isingRandomLattice(N);
    for (let i = 0; i < QUENCH_BURST_STEPS; i++) {
      isingMetropolisStep(this.lattice, N, this.temperature, Math.random);
    }
    this.avgMag = isingMagnetization(this.lattice);
    this.avgEnergy = isingEnergyPerSite(this.lattice, N);
  };

  update(dt: number, p: SimParams) {
    this.temperature = Number(p.temperature);
    if (Math.abs(this.temperature - this.lastTemperature) > 0.03) {
      this.lastTemperature = this.temperature;
      for (let i = 0; i < QUENCH_BURST_STEPS; i++) {
        isingMetropolisStep(this.lattice, N, this.temperature, Math.random);
      }
    }
    this.acc += dt * CELL_STEPS_PER_SECOND;
    const steps = Math.floor(this.acc);
    this.acc -= steps;
    for (let i = 0; i < steps; i++) {
      isingMetropolisStep(this.lattice, N, this.temperature, Math.random);
    }
    const m = isingMagnetization(this.lattice);
    const e = isingEnergyPerSite(this.lattice, N);
    this.avgMag = this.avgMag * 0.9 + m * 0.1;
    this.avgEnergy = this.avgEnergy * 0.9 + e * 0.1;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    const size = Math.min(w, h - 26);
    const cell = size / N;
    const ox = (w - size) / 2;
    const oy = 6;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const s = this.lattice[i * N + j];
        ctx.fillStyle = s > 0 ? 'rgba(240,179,92,0.92)' : 'rgba(92,153,214,0.92)';
        ctx.fillRect(ox + j * cell, oy + i * cell, cell + 0.5, cell + 0.5);
      }
    }
    ctx.fillStyle = 'rgba(230,234,245,0.75)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(
      `T=${this.temperature.toFixed(2)} (T_c=${ISING_TC.toFixed(3)}) · |M|≈${this.avgMag.toFixed(2)} · E≈${this.avgEnergy.toFixed(2)}/spin`,
      ox,
      oy + size + 16,
    );
  }

  getStats() {
    return {
      magnetization: Math.round(this.avgMag * 1000) / 1000,
      energy: Math.round(this.avgEnergy * 1000) / 1000,
      temperature: Math.round(this.temperature * 1000) / 1000,
    };
  }
}

export const chemistryIsing: ExperimentDef = {
  id: 'ising',
  name: 'Model Isinga — przejście fazowe',
  honesty: 'simplified',
  honestyNote:
    'Model Isinga 2D to matematycznie ścisła, rozwiązywalna analitycznie IDEALIZACJA prawdziwego magnetyka: tylko oddziaływanie z najbliższymi sąsiadami, klasyczne spiny ±1, bez defektów sieci ani anizotropii — realne ferromagnetyki (żelazo, nikiel) są bardziej złożone. Algorytm Metropolisa (użyty tutaj) jest standardowym, nieobciążonym sposobem próbkowania rozkładu Boltzmanna tego modelu — zbiega dokładnie do rozwiązania Onsagera (1944) w granicy dużej siatki i długiego czasu symulacji; skończona siatka 42×42 rozmywa ostrą osobliwość krytyczną, dokładnie jak w każdej realnej, skończonej próbce eksperymentalnej.',
  params: [
    {
      key: 'temperature', label: 'Temperatura T (jednostki J/k_B)', type: 'slider',
      min: 0.5, max: 5, step: 0.05, default: 2.0,
      format: (v) => v.toFixed(2),
    },
  ],
  createSim: () => new IsingSim(),
  narrate(p, stats) {
    const T = Number(p.temperature);
    const m = Number(stats.magnetization ?? 0);
    const exact = isingExactMagnetization(T);
    const phase = T < ISING_TC ? 'ferromagnetyczna (uporządkowana)' : 'paramagnetyczna (nieuporządkowana)';
    return [
      {
        title: `T=${T.toFixed(2)} vs T_c=${ISING_TC.toFixed(3)} — faza ${phase}`,
        body:
          T < ISING_TC
            ? Math.abs(m - exact) < 0.15
              ? `Poniżej temperatury krytycznej większość spinów "zgadza się" ze swoimi sąsiadami — powstają duże, kolorowe domeny. Symulowana magnetyzacja |M|≈${m.toFixed(2)} jest już bliska dokładnej wartości Onsagera dla tej temperatury: ${exact.toFixed(3)}. To NIE dopasowanie — to twierdzenie matematyczne (Onsager 1944), do którego symulacja Monte Carlo dąży z każdym kolejnym zamachem po siatce.`
              : `Poniżej temperatury krytycznej dokładna wartość Onsagera to |M|=${exact.toFixed(3)}, ale symulacja pokazuje na razie tylko |M|≈${m.toFixed(2)} — widzisz duże domeny wciąż rosnące i zderzające się, jeszcze nie w pełni jeden kolor. To realny efekt zwany "critical slowing down": im głębiej poniżej T_c, tym wolniej ściany domen dyfundują i zanikają przy pojedynczych przerzutach spinów — dokładnie dlatego prawdziwe magnesy trzeba powoli WYŻARZAĆ (chłodzić stopniowo), żeby uzyskać jedną domenę, a nie gwałtownie "zamrażać".`
            : `Powyżej temperatury krytycznej fluktuacje termiczne wygrywają z uporządkowaniem — spiny są losowe, magnetyzacja |M|≈${m.toFixed(2)} oscyluje blisko zera (dokładna wartość Onsagera powyżej T_c to dokładnie 0). Zmniejsz temperaturę poniżej ${ISING_TC.toFixed(2)}, żeby zobaczyć, jak nagle, przy tej JEDNEJ konkretnej temperaturze, siatka zaczyna się porządkować.`,
        citation: {
          source: 'Onsager 1944, Phys. Rev. 65, 117; Yang 1952, Phys. Rev. 85, 808 (wzór na magnetyzację)',
          confirmation: 'confirmed',
          note: 'Jedyny nietrywialny model przejścia fazowego z pełnym rozwiązaniem analitycznym w 2D — kamień milowy fizyki statystycznej',
        },
      },
      {
        title: 'Dlaczego to ciągłe przejście fazowe, nie skok',
        body: 'W nieskończonej siatce magnetyzacja rośnie od zera w sposób ciągły, ale jej pochodne (np. pojemność cieplna) rozbiegają się przy T_c — to definicja przejścia fazowego drugiego rodzaju. Skończona siatka 42×42 w tej symulacji rozmywa tę ostrość (widać płynne przejście zamiast idealnie ostrego progu) — dokładnie ten sam efekt "zaokrąglenia skończonego rozmiaru", który fizycy widzą w prawdziwych próbkach laboratoryjnych.',
      },
    ];
  },
};
