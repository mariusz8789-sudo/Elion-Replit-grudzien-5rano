/**
 * Wspólny runner 1D tunelowania kwantowego.
 *
 * Jedyny numeryczny rdzeń dla Canvasu, lokalnego Fabric i backendowego bundle’u.
 * Rozwiązuje równanie Schrödingera metodą split-step Fourier w jednostkach
 * naturalnych ħ=m=1. Nie zależy od DOM, Canvasu, Three.js ani Reacta.
 */

export const TUNNELING_GRID_SIZE = 512;
export const TUNNELING_DOMAIN_LENGTH = 100;
export const TUNNELING_DX = TUNNELING_DOMAIN_LENGTH / TUNNELING_GRID_SIZE;

export interface TunnelingScenarioInput {
  energy?: number;
  barrier?: number;
  width?: number;
  frames?: number;
}

export interface TunnelingScenarioResult {
  energy: number;
  barrier: number;
  width: number;
  frames: number;
  transmission: number;
  reflection: number;
  remainingProbability: number;
}

/** FFT radix-2 (in-place, iteracyjna). */
export function fft(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 1 : -1) * 2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1;
      let cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi;
        const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = nwr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/**
 * Stan i integrator tunelowania. Pola chronione istnieją wyłącznie po to,
 * aby Canvas mógł odczytać obliczone pole falowe do wizualizacji, nigdy aby je
 * modyfikować. Backend wywołuje wyłącznie `runScenario()`.
 */
export class TunnelingSolver {
  protected readonly re = new Float64Array(TUNNELING_GRID_SIZE);
  protected readonly im = new Float64Array(TUNNELING_GRID_SIZE);
  protected readonly potential = new Float64Array(TUNNELING_GRID_SIZE);
  protected readonly waveNumbers = new Float64Array(TUNNELING_GRID_SIZE);
  protected readonly edgeMask = new Float64Array(TUNNELING_GRID_SIZE);
  protected lastEnergy = 0;
  protected lastBarrier = 0;
  protected lastWidth = 0;
  protected transmission = 0;
  protected reflection = 0;

  constructor() {
    for (let i = 0; i < TUNNELING_GRID_SIZE; i++) {
      this.waveNumbers[i] = (i < TUNNELING_GRID_SIZE / 2 ? i : i - TUNNELING_GRID_SIZE) * ((2 * Math.PI) / TUNNELING_DOMAIN_LENGTH);
      const x = i * TUNNELING_DX;
      const edge = Math.min(x, TUNNELING_DOMAIN_LENGTH - x);
      this.edgeMask[i] = edge < 8 ? Math.exp(-(((8 - edge) / 4) ** 2) * 0.15) : 1;
    }
  }

  initialize() {
    if (this.lastEnergy === 0) this.launch(0.55, 1, 3);
  }

  reset() {
    this.launch(this.lastEnergy, this.lastBarrier, this.lastWidth);
  }

  /** Advances the same integrator used by Canvas after updating its real input state. */
  advance({ energy, barrier, width, steps }: { energy: number; barrier: number; width: number; steps: number }) {
    if (energy !== this.lastEnergy || barrier !== this.lastBarrier || width !== this.lastWidth) {
      this.launch(energy, barrier, width);
    }
    for (let step = 0; step < steps; step++) this.step(0.02);
    this.measure();
  }

  /** Bounded, deterministic run used by Fabric and the backend API. */
  runScenario({ energy = 0.55, barrier = 1, width = 3, frames = 1200 }: TunnelingScenarioInput = {}): TunnelingScenarioResult {
    if (!Number.isFinite(energy) || energy < 0.2 || energy > 1.6) throw new Error('energy musi mieścić się w zakresie 0.2–1.6.');
    if (!Number.isFinite(barrier) || barrier < 0.4 || barrier > 2.5) throw new Error('barrier musi mieścić się w zakresie 0.4–2.5.');
    if (!Number.isFinite(width) || width < 1 || width > 8) throw new Error('width musi mieścić się w zakresie 1–8.');
    if (!Number.isInteger(frames) || frames < 1 || frames > 2400) throw new Error('frames musi być liczbą całkowitą z zakresu 1–2400.');
    this.launch(energy, barrier, width);
    for (let frame = 0; frame < frames; frame++) this.step(0.02);
    this.measure();
    return {
      energy,
      barrier,
      width,
      frames,
      transmission: this.transmission,
      reflection: this.reflection,
      remainingProbability: Math.max(0, 1 - this.transmission - this.reflection),
    };
  }

  getStats() {
    return {
      trans: Math.round(this.transmission * 1000) / 10,
      refl: Math.round(this.reflection * 1000) / 10,
    };
  }

  private launch(energy: number, barrier: number, width: number) {
    this.lastEnergy = energy;
    this.lastBarrier = barrier;
    this.lastWidth = width;
    const k0 = Math.sqrt(2 * barrier * energy);
    const x0 = TUNNELING_DOMAIN_LENGTH * 0.28;
    const sigma = 4;
    let norm = 0;
    for (let i = 0; i < TUNNELING_GRID_SIZE; i++) {
      const x = i * TUNNELING_DX;
      const gaussian = Math.exp(-((x - x0) ** 2) / (4 * sigma * sigma));
      this.re[i] = gaussian * Math.cos(k0 * x);
      this.im[i] = gaussian * Math.sin(k0 * x);
      norm += gaussian * gaussian * TUNNELING_DX;
    }
    const scale = 1 / Math.sqrt(norm);
    for (let i = 0; i < TUNNELING_GRID_SIZE; i++) {
      this.re[i] *= scale;
      this.im[i] *= scale;
    }
    for (let i = 0; i < TUNNELING_GRID_SIZE; i++) {
      const x = i * TUNNELING_DX;
      this.potential[i] = Math.abs(x - TUNNELING_DOMAIN_LENGTH / 2) < width / 2 ? barrier : 0;
    }
  }

  private measure() {
    let transmitted = 0;
    let reflected = 0;
    const barrierEnd = Math.floor(((TUNNELING_DOMAIN_LENGTH / 2 + this.lastWidth / 2) / TUNNELING_DOMAIN_LENGTH) * TUNNELING_GRID_SIZE);
    const barrierStart = Math.floor(((TUNNELING_DOMAIN_LENGTH / 2 - this.lastWidth / 2) / TUNNELING_DOMAIN_LENGTH) * TUNNELING_GRID_SIZE);
    for (let i = 0; i < TUNNELING_GRID_SIZE; i++) {
      const density = (this.re[i] ** 2 + this.im[i] ** 2) * TUNNELING_DX;
      if (i > barrierEnd) transmitted += density;
      else if (i < barrierStart) reflected += density;
    }
    this.transmission = transmitted;
    this.reflection = reflected;
  }

  private step(dt: number) {
    const { re, im, potential, waveNumbers, edgeMask } = this;
    for (let i = 0; i < TUNNELING_GRID_SIZE; i++) {
      const angle = -potential[i] * dt * 0.5;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const real = re[i] * cos - im[i] * sin;
      im[i] = re[i] * sin + im[i] * cos;
      re[i] = real;
    }
    fft(re, im, false);
    for (let i = 0; i < TUNNELING_GRID_SIZE; i++) {
      const angle = -0.5 * waveNumbers[i] * waveNumbers[i] * dt;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const real = re[i] * cos - im[i] * sin;
      im[i] = re[i] * sin + im[i] * cos;
      re[i] = real;
    }
    fft(re, im, true);
    for (let i = 0; i < TUNNELING_GRID_SIZE; i++) {
      const angle = -potential[i] * dt * 0.5;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const real = re[i] * cos - im[i] * sin;
      im[i] = (re[i] * sin + im[i] * cos) * edgeMask[i];
      re[i] = real * edgeMask[i];
    }
  }
}

/** Executes exactly the same deterministic runner used by the Canvas. */
export function runTunnelingScenario(input: TunnelingScenarioInput = {}): TunnelingScenarioResult {
  return new TunnelingSolver().runScenario(input);
}
