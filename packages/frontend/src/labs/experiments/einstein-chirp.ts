import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import {
  binarySeparationMeters,
  chirpFrequency,
  chirpMassSolar,
  iscoFrequency,
  timeToMerger,
} from '../../core/physics';

/**
 * Chirp fali grawitacyjnej — dokładnie ta metoda (formuła kwadrupolowa
 * wiodącego rzędu), którą LIGO użyło do potwierdzenia pierwszej detekcji
 * GW150914 (14 września 2015, ogłoszone 11 lutego 2016; Abbott i in. 2016,
 * PRL 116, 061102; Nagroda Nobla z fizyki 2017 dla Rainera Weissa, Kipa
 * Thorne'a i Barry'ego Barisha). Model jest ważny TYLKO we wczesnym
 * inspiralu — kończy się na promieniu ISCO, nie próbuje pokazać samego
 * połączenia ani "ringdown" (do tego potrzebna jest pełna relatywistyka
 * numeryczna). Częstotliwości fal grawitacyjnych z łączących się czarnych
 * dziur gwiazdowej masy (dziesiątki-setki Hz) leżą w PRAWDZIWYM ludzkim
 * zakresie słyszalności — dlatego ten eksperyment ma opcjonalny dźwięk,
 * syntezowany z rzeczywistej, żywo liczonej częstotliwości fali.
 */

const F_START = 20; // Hz — dolna granica pasma czułości LIGO, punkt startowy symulacji
const AUDIO_GAIN_MAX = 0.12; // ciche, bezpieczne dla uszu

class GravWaveChirpSim implements Sim {
  private lastM1 = -1;
  private lastM2 = -1;
  private chirpMass = 1;
  private totalMass = 1;
  private tauTotal = 1;
  private elapsed = 0;
  private phase = 0;
  private orbitPhase = 0;
  private mergerFlash = 0;
  private waveform: number[] = [];
  private currentFreq = F_START;
  private currentAmp = 0;

  private audioCtx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private audioOn = false;

  init() {}

  reset = () => {
    this.elapsed = 0;
    this.phase = 0;
    this.orbitPhase = 0;
    this.mergerFlash = 0;
    this.waveform = [];
  };

  private setup(m1: number, m2: number) {
    this.lastM1 = m1;
    this.lastM2 = m2;
    this.chirpMass = chirpMassSolar(m1, m2);
    this.totalMass = m1 + m2;
    this.tauTotal = timeToMerger(this.chirpMass, F_START);
    this.reset();
  }

  private ensureAudio() {
    if (this.audioCtx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new Ctx();
    this.osc = this.audioCtx.createOscillator();
    this.gainNode = this.audioCtx.createGain();
    this.osc.type = 'sine';
    this.gainNode.gain.value = 0;
    this.osc.connect(this.gainNode).connect(this.audioCtx.destination);
    this.osc.start();
  }

  private stopAudio() {
    this.osc?.stop();
    this.osc?.disconnect();
    this.gainNode?.disconnect();
    this.audioCtx?.close();
    this.audioCtx = null;
    this.osc = null;
    this.gainNode = null;
  }

  update(dt: number, p: SimParams) {
    const m1 = Number(p.m1 ?? 36);
    const m2 = Number(p.m2 ?? 29);
    if (m1 !== this.lastM1 || m2 !== this.lastM2) this.setup(m1, m2);
    const slowdown = Number(p.slowdown ?? 8);
    const fIsco = iscoFrequency(this.totalMass);

    if (this.mergerFlash > 0) {
      this.mergerFlash = Math.max(0, this.mergerFlash - dt * 0.6);
      if (this.mergerFlash === 0) this.reset();
    } else {
      const physicalDt = dt / slowdown;
      this.elapsed += physicalDt;
      if (this.elapsed >= this.tauTotal) {
        this.elapsed = this.tauTotal;
        this.mergerFlash = 1;
      }
      const tauRemaining = Math.max(this.tauTotal - this.elapsed, 1e-4);
      const freq = Math.min(chirpFrequency(this.chirpMass, tauRemaining), fIsco);
      this.currentFreq = freq;
      this.currentAmp = Math.min(1, Math.pow(freq / fIsco, 2 / 3));
      this.phase += 2 * Math.PI * freq * physicalDt;
      this.orbitPhase += Math.PI * freq * physicalDt; // ω_orb = π·f_GW (f_GW=2·f_orb)
      this.waveform.push(this.currentAmp * Math.sin(this.phase));
      if (this.waveform.length > 1400) this.waveform.shift();
    }

    const audioWanted = Boolean(p.audioEnabled);
    if (audioWanted && !this.audioOn) {
      this.ensureAudio();
      this.audioOn = true;
    } else if (!audioWanted && this.audioOn) {
      this.stopAudio();
      this.audioOn = false;
    }
    if (this.audioOn && this.osc && this.gainNode && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.osc.frequency.setValueAtTime(this.currentFreq, now);
      this.gainNode.gain.setValueAtTime(this.mergerFlash > 0 ? 0 : this.currentAmp * AUDIO_GAIN_MAX, now);
    }
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, w, h);

    // mały wizualizator: para orbitujących mas, separacja z rzeczywistej fizyki
    const cx = w / 2;
    const cy = h * 0.28;
    const sepMeters = binarySeparationMeters(this.totalMass, Math.max(this.currentFreq, F_START));
    const sepStartMeters = binarySeparationMeters(this.totalMass, F_START);
    const pxPerMeter = (Math.min(w, h) * 0.16) / sepStartMeters;
    const sepPx = Math.max(sepMeters * pxPerMeter, 4);
    const q1 = this.lastM2 / this.totalMass;
    const q2 = this.lastM1 / this.totalMass;
    const x1 = cx + Math.cos(this.orbitPhase) * sepPx * q1;
    const y1 = cy + Math.sin(this.orbitPhase) * sepPx * q1 * 0.5;
    const x2 = cx - Math.cos(this.orbitPhase) * sepPx * q2;
    const y2 = cy - Math.sin(this.orbitPhase) * sepPx * q2 * 0.5;
    if (this.mergerFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.mergerFlash})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 40 * (1 - this.mergerFlash) + 8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      for (const [x, y, color] of [[x1, y1, '#5cd6e8'], [x2, y2, '#f0b35c']] as const) {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }

    // przebieg fali h(t): rosnąca częstotliwość i amplituda — klasyczny "chirp"
    const wfTop = h * 0.46;
    const wfH = h * 0.24;
    ctx.strokeStyle = '#c68cff';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < this.waveform.length; i++) {
      const x = (i / 1400) * w;
      const y = wfTop + wfH / 2 - this.waveform[i] * wfH * 0.48;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230,234,245,0.15)';
    ctx.beginPath();
    ctx.moveTo(0, wfTop + wfH / 2);
    ctx.lineTo(w, wfTop + wfH / 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(230,234,245,0.75)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`f = ${this.currentFreq.toFixed(1)} Hz`, 10, h - 42);
    ctx.fillText(`ℳ = ${this.chirpMass.toFixed(1)} M☉ · M_całk = ${this.totalMass.toFixed(0)} M☉`, 10, h - 28);
    ctx.fillText(
      this.mergerFlash > 0
        ? 'POŁĄCZENIE (model kończy się tutaj — brak ringdown)'
        : `do połączenia: ${((this.tauTotal - this.elapsed) * 1000).toFixed(0)} ms (realny czas fizyczny)`,
      10,
      h - 14,
    );
  }

  getStats() {
    return {
      freqHz: Math.round(this.currentFreq * 10) / 10,
      chirpMassSolar: Math.round(this.chirpMass * 10) / 10,
      totalMassSolar: Math.round(this.totalMass),
      timeToMergerMs: Math.round((this.tauTotal - this.elapsed) * 1000),
      merged: this.mergerFlash > 0 ? 1 : 0,
    };
  }

  dispose() {
    this.stopAudio();
  }
}

export const einsteinChirp: ExperimentDef = {
  id: 'chirp',
  name: 'Chirp fali grawitacyjnej',
  honesty: 'educational',
  honestyNote:
    'Formuła kwadrupolowa wiodącego rzędu (ta sama metoda, którą LIGO użyło do potwierdzenia GW150914) — prawdziwa fizyka, ważna TYLKO we wczesnym inspiralu. Model kończy się na promieniu ISCO (r=6GM/c²) — samo połączenie i "ringdown" wymagają pełnej relatywistyki numerycznej, której tu nie ma (pokazany jako błysk, nie symulowany). Dźwięk gra PRAWDZIWE częstotliwości fali (Hz) — bez przesunięcia wysokości — ale ROZCIĄGNIĘTE w czasie suwakiem spowolnienia (prawdziwy inspiral trwa ułamek sekundy, nie kilka sekund jak w tej animacji).',
  params: [
    { key: 'm1', label: 'Masa pierwszej czarnej dziury', type: 'slider', min: 5, max: 80, step: 1, default: 36, unit: 'M☉' },
    { key: 'm2', label: 'Masa drugiej czarnej dziury', type: 'slider', min: 5, max: 80, step: 1, default: 29, unit: 'M☉' },
    { key: 'slowdown', label: 'Spowolnienie odtwarzania', type: 'slider', min: 2, max: 20, step: 1, default: 8, unit: '×' },
    { key: 'audioEnabled', label: '🔊 Dźwięk (prawdziwa częstotliwość fali)', type: 'toggle', default: false },
  ],
  createSim: () => new GravWaveChirpSim(),
  narrate(p, stats) {
    const freq = Number(stats.freqHz ?? 20);
    const chirpMass = Number(stats.chirpMassSolar ?? 0);
    const merged = Number(stats.merged ?? 0);
    const audio = Boolean(p.audioEnabled);

    const firstTitle = merged ? 'Połączenie' : `f = ${freq.toFixed(1)} Hz — częstotliwość i amplituda rosną razem`;
    const firstBodyMerged =
      'Model kończy się tutaj — blisko połączenia separacja zbliża się do promienia Schwarzschilda i formuła kwadrupolowa (poprawna tylko dla słabych pól) przestaje być dokładna. Prawdziwy przebieg fali w momencie połączenia i „ringdown" (czarna dziura „dzwoni" i uspokaja się do stanu Kerra) wymaga symulacji pełnej relatywistyki numerycznej — dokładnie to policzono dla GW150914 na superkomputerach przed porównaniem z danymi LIGO.';
    const firstBodyInspiral = `Im bliżej połączenia, tym szybciej czarne dziury orbitują wokół siebie (wyższa częstotliwość) i tym silniej promieniują energię jako fale grawitacyjne (wyższa amplituda) — stąd nazwa "chirp" (świergot), jak rosnący ton. Dokładnie ten kształt (rosnąca częstotliwość I amplituda naraz) LIGO rozpoznało 14 września 2015 r. jako pierwszą bezpośrednią detekcję fal grawitacyjnych w historii.`;
    const firstBody = merged ? firstBodyMerged : firstBodyInspiral;

    const audioBody =
      'Fale grawitacyjne z łączących się czarnych dziur gwiazdowej masy mają częstotliwości w PRAWDZIWYM ludzkim zakresie słyszalności (dziesiątki-setki Hz) — nie trzeba ich sztucznie podnosić, jak robi się np. z danymi rentgenowskimi. Dźwięk, który słyszysz, gra dokładnie te częstotliwości Hz, tylko rozciągnięte w czasie suwakiem spowolnienia — realny inspiral od 20 Hz do połączenia trwa tu zaledwie ułamek sekundy.';
    const noAudioBody =
      'Włącz dźwięk 🔊 — usłyszysz prawdziwą częstotliwość fali grawitacyjnej rosnącą do połączenia. Spróbuj zmienić masy: cięższe czarne dziury dają NIŻSZĄ częstotliwość i szybsze (krótsze) połączenie.';
    const thirdBlock = audio
      ? { title: 'Prawdziwe częstotliwości, rozciągnięte w czasie', body: audioBody }
      : { title: 'Eksperyment do wykonania', body: noAudioBody };

    const blocks = [
      {
        title: firstTitle,
        body: firstBody,
        citation: { source: 'Abbott i in. (2016), Physical Review Letters 116, 061102', confirmation: 'confirmed' as const, note: 'Pierwsza detekcja fal grawitacyjnych, GW150914' },
      },
      {
        title: `Masa ćwierkowa ℳ = ${chirpMass.toFixed(1)} M☉`,
        body: 'Masa ćwierkowa to JEDYNA kombinacja obu mas, którą można bezpośrednio odczytać z kształtu narastania częstotliwości fali (bez znajomości odległości czy orientacji układu) — to pierwsza wielkość, jaką naukowcy z LIGO wyliczyli z surowego sygnału GW150914, zanim jeszcze dopasowali pełny model do obu mas osobno.',
      },
      thirdBlock,
      {
        title: 'Skąd LIGO w ogóle to wykrył',
        body: 'Detektor mierzy zmianę długości dwóch 4-kilometrowych ramion interferometru o mniej niż 1/10000 średnicy protonu — GW150914 rozciągnęło/ścisnęło ramiona LIGO o zaledwie ~4×10⁻¹⁸ m. To właśnie ta precyzja (i dwa niezależne detektory w Hanford i Livingston, 3000 km od siebie, zarejestrowały ten sam sygnał z opóźnieniem 7 ms) przekonała społeczność naukową, że to prawdziwy sygnał, nie szum.',
      },
    ];
    return blocks;
  },
};
