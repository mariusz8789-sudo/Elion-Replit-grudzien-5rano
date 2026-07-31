import type { NarrationBlock, SimParams } from '../core/types';

/**
 * Klient warstwy LLM (Etap 2). Wysyła do backendu wyłącznie to, co użytkownik
 * i tak widzi na ekranie: parametry, statystyki i narrację bieżącej symulacji.
 * Backend (packages/backend) trzyma klucz API i pilnuje groundingu.
 */

export interface AskContext {
  /** Id laboratorium (np. "quantum") — backend mapuje je na knowledge/*.md do groundingu. */
  labId: string;
  lab: string;
  experiment: string;
  honesty: string;
  honestyNote: string;
  params: SimParams;
  stats: Record<string, number>;
  narration: { title: string; body: string }[];
}

export type AskResult =
  | { ok: true; answer: string }
  | { ok: false; reason: 'offline' | 'no-key' | 'rate-limited' | 'error'; message: string };

export function buildContext(
  lab: { id: string; name: string; honesty: string; honestyNote: string },
  experimentName: string,
  params: SimParams,
  stats: Record<string, number>,
  blocks: NarrationBlock[],
): AskContext {
  return {
    labId: lab.id,
    lab: lab.name,
    experiment: experimentName,
    honesty: lab.honesty,
    honestyNote: lab.honestyNote,
    params,
    stats,
    narration: blocks.map((b) => ({ title: b.title, body: b.body })),
  };
}

export async function askAI(ctx: AskContext, question: string): Promise<AskResult> {
  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...ctx, question }),
    });
    if (res.status === 429) {
      return { ok: false, reason: 'rate-limited', message: 'Limit pytań na minutę — odczekaj chwilę.' };
    }
    if (res.status === 503) {
      // Treść wiadomości pochodzi z backendu (server.mjs handleAsk) — jedno
      // źródło prawdy, celowo bez nazw zmiennych środowiskowych ani innych
      // szczegółów konfiguracji serwera, bo trafia do każdego użytkownika,
      // nie tylko operatora wdrożenia.
      const data = await res.json().catch(() => null) as { message?: string } | null;
      return {
        ok: false,
        reason: 'no-key',
        message: data?.message ?? 'Funkcja „Zapytaj AI" nie jest skonfigurowana w tym wdrożeniu.',
      };
    }
    if (!res.ok) {
      return { ok: false, reason: 'error', message: 'Serwis AI chwilowo niedostępny — spróbuj ponownie.' };
    }
    const data = (await res.json()) as { answer?: string };
    if (!data.answer) return { ok: false, reason: 'error', message: 'Pusta odpowiedź serwisu AI.' };
    return { ok: true, answer: data.answer };
  } catch {
    return {
      ok: false,
      reason: 'offline',
      message:
        'Brak połączenia z backendem AI. Narrator deterministyczny działa dalej w pełni offline; pytania otwarte wymagają uruchomienia backendu (npm run dev:backend).',
    };
  }
}
