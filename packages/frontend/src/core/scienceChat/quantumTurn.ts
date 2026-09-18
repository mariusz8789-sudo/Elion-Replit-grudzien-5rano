import type { ChatAction, EpistemicTag } from './resolveCommand';

/**
 * HYBRID QUANTUM BRIDGE — the chat-side half of `/quantum …`. Pure functions: the backend
 * (`POST /api/quantum/run`) decides WHERE the circuit ran and labels the result; this module only
 * turns that answer into a chat turn and histogram data, and never upgrades a MODEL_ESTIMATE into a
 * measurement. Kept out of `ScienceChat.tsx` so it can be tested without a DOM (this repo's vitest
 * runs in node) — the component wires it, exactly like the `ingestUrls` branch wires its fetch.
 */

export type QuantumAction = Extract<ChatAction, { type: 'quantum' }>;

export interface QuantumRunResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  executedOn?: 'LOCAL_SIMULATOR' | 'CLOUD_QPU';
  label?: 'MODEL_ESTIMATE' | 'HARDWARE_MEASUREMENT';
  providerId?: string;
  counts?: Record<string, number>;
  probabilities?: Record<string, number> | null;
  shots?: number;
  seed?: number;
  qubits?: number;
  qasm?: string;
  fingerprint?: string;
  fallbackReason?: string | null;
  elapsedMs?: number;
}

export interface QuantumHistogramBar {
  readonly bitstring: string;
  readonly count: number;
  /** Sampled share of shots, in percent. */
  readonly sampledPct: number;
  /** Exact model probability in percent — null when the backend did not return probabilities (hardware run, or too many outcomes). */
  readonly modelPct: number | null;
  /** Bar width relative to the most frequent outcome, in percent. */
  readonly widthPct: number;
}

export interface QuantumHistogramData {
  readonly executedOn: 'LOCAL_SIMULATOR' | 'CLOUD_QPU';
  readonly label: 'MODEL_ESTIMATE' | 'HARDWARE_MEASUREMENT';
  readonly providerId: string;
  readonly shots: number;
  readonly seed: number;
  readonly qasm: string;
  readonly fingerprint: string;
  readonly fallbackReason: string | null;
  readonly bars: readonly QuantumHistogramBar[];
}

export const QUANTUM_FALLBACK_LABEL: Record<string, string> = {
  NO_CLOUD_PROVIDER: 'brak skonfigurowanego dostawcy QPU (QPU_API_URL + QPU_API_KEY) — użyto lokalnego symulatora',
  NO_API_KEY: 'brak klucza QPU — użyto lokalnego symulatora',
  CLOUD_UNAVAILABLE: 'chmurowy QPU niedostępny po ponowieniach — użyto lokalnego symulatora',
};

const pct = (v: number): number => Math.round(v * 1000) / 10;
export const formatPct = (v: number): string => v.toFixed(1) + '%';

/** Bars sorted by bitstring (JS objects reorder integer-like keys, so the sort is explicit here). */
export function histogramFromResponse(data: QuantumRunResponse): QuantumHistogramData {
  if (data.ok !== true || !data.counts || !data.executedOn || !data.label) throw new Error(data.error ?? 'quantum_response_incomplete');
  const shots = typeof data.shots === 'number' && data.shots > 0 ? data.shots : Object.values(data.counts).reduce((a, b) => a + b, 0);
  const keys = Object.keys(data.counts).sort();
  const max = Math.max(1, ...keys.map((k) => data.counts?.[k] ?? 0));
  const probs = data.probabilities ?? null;
  const bars = keys.map((bitstring) => {
    const count = data.counts?.[bitstring] ?? 0;
    return { bitstring, count, sampledPct: pct(count / shots), modelPct: probs && typeof probs[bitstring] === 'number' ? pct(probs[bitstring]) : null, widthPct: pct(count / max) };
  });
  return {
    executedOn: data.executedOn, label: data.label, providerId: data.providerId ?? 'unknown', shots, seed: data.seed ?? 0,
    qasm: data.qasm ?? '', fingerprint: data.fingerprint ?? '', fallbackReason: data.fallbackReason ?? null, bars,
  };
}

export function quantumAriaLabel(h: QuantumHistogramData): string {
  const kind = h.label === 'MODEL_ESTIMATE' ? 'model (symulator)' : 'pomiar sprzętowy';
  return `Histogram wyników kwantowych, ${kind}, ${h.shots} strzałów: ` + h.bars.map((b) => `${b.bitstring} = ${b.count} (${formatPct(b.sampledPct)}${b.modelPct !== null ? `, model ${formatPct(b.modelPct)}` : ''})`).join('; ');
}

export function formatQuantumTurnText(h: QuantumHistogramData): string {
  const where = h.executedOn === 'CLOUD_QPU'
    ? `Wykonano na CLOUD_QPU (${h.providerId}) — etykieta HARDWARE_MEASUREMENT: to pomiar realnego urządzenia.`
    : `Wykonano na LOCAL_SIMULATOR (${h.providerId}) — etykieta MODEL_ESTIMATE: to obliczenie idealnego, bezszumowego obwodu (wektor stanu + próbkowanie z ziarna), NIE pomiar żadnego fizycznego urządzenia.`;
  const fallback = h.fallbackReason ? `Powód: ${QUANTUM_FALLBACK_LABEL[h.fallbackReason] ?? h.fallbackReason}.\n` : '';
  const rows = h.bars.map((b) => `${b.bitstring}: ${b.count} (${formatPct(b.sampledPct)}${b.modelPct !== null ? ` · model ${formatPct(b.modelPct)}` : ''})`).join('\n');
  return `${where}\n${fallback}Strzały: ${h.shots} · ziarno: ${h.seed} · odcisk wyniku: #${h.fingerprint.slice(0, 12)}\n`
    + 'Obwód (OpenQASM 3.0):\n```qasm\n' + h.qasm.trimEnd() + '\n```\n'
    + `Wyniki (bit c[0] po prawej):\n${rows}\n`
    + 'Nie zasila Winner Gate; wynik modelu nie jest dowodem eksperymentalnym.';
}

export interface QuantumTurn { readonly text: string; readonly tag: EpistemicTag; readonly quantum?: QuantumHistogramData; }

/** Runs the action against the backend and formats the answer. Errors are reported verbatim, never softened into a result. */
export async function runQuantumAction(action: QuantumAction, fetchImpl: typeof fetch = fetch): Promise<QuantumTurn> {
  const body = { ...(action.qasm !== undefined ? { qasm: action.qasm } : { preset: action.preset, ...(action.qubits !== undefined ? { qubits: action.qubits } : {}) }), shots: action.shots, seed: action.seed };
  try {
    const res = await fetchImpl('/api/quantum/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json()) as QuantumRunResponse;
    if (!res.ok || data.ok !== true) return { text: `Mostek kwantowy odrzucił zadanie: ${data.error ?? res.status}${data.message ? ` — ${data.message}` : ''}.`, tag: 'SYSTEM' };
    const hist = histogramFromResponse(data);
    return { text: formatQuantumTurnText(hist), tag: hist.label === 'HARDWARE_MEASUREMENT' ? 'WYNIK' : 'HIPOTEZA', quantum: hist };
  } catch (e: unknown) {
    return { text: `Mostek kwantowy nie odpowiedział: ${e instanceof Error ? e.message : String(e)}.`, tag: 'SYSTEM' };
  }
}
