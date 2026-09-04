import { readJSON, writeJSON } from '../storage';
import { candidateSignature, rejectionReasons, type CandidatePassport } from './passport';

/**
 * Biblioteka Porażek (Founder Directive, Milestone 3). Odrzuceni kandydaci NIE
 * są wyrzucani — są zapisywani z powodem odrzucenia, żeby ten sam ślepy zaułek
 * nie był badany dwa razy. To realna wartość naukowa: negatywny wynik z jawnym
 * „dlaczego nie" jest częścią wiedzy, nie odpadem.
 *
 * Local-first (localStorage), jak trials/discoveryLog. Deduplikacja po
 * deterministycznym podpisie wektora parametrów — `wasTried` pozwala CDE od razu
 * powiedzieć „to już próbowaliśmy i oto czemu odpadło".
 */

export interface FailureRecord {
  signature: string;
  adapterId: string;
  label: string;
  params: Record<string, number>;
  reasons: string[];
  recordedAt: number;
}

const MAX_PER_ADAPTER = 500;

function keyFor(adapterId: string): string {
  return `cde/failures/${adapterId}`;
}

export function listFailures(adapterId: string): FailureRecord[] {
  const raw = readJSON<FailureRecord[]>(keyFor(adapterId), []);
  return Array.isArray(raw) ? raw : [];
}

/** Czy dokładnie ten wektor parametrów już odpadł? Zwraca zapis albo null. */
export function wasTried(adapterId: string, params: Record<string, number>): FailureRecord | null {
  const sig = candidateSignature(params);
  return listFailures(adapterId).find((f) => f.signature === sig) ?? null;
}

/**
 * Zapisuje odrzucony paszport do biblioteki. Idempotentne po podpisie: powtórka
 * tego samego wektora aktualizuje wpis, nie mnoży rekordów. Zaakceptowanych
 * paszportów tu nie zapisujemy (to nie porażki).
 */
export function recordFailure(passport: CandidatePassport): FailureRecord | null {
  if (passport.accepted) return null;
  const sig = candidateSignature(passport.params);
  const record: FailureRecord = {
    signature: sig,
    adapterId: passport.adapterId,
    label: passport.label,
    params: { ...passport.params },
    reasons: rejectionReasons(passport),
    recordedAt: Date.now(),
  };
  const existing = listFailures(passport.adapterId).filter((f) => f.signature !== sig);
  writeJSON(keyFor(passport.adapterId), [...existing, record].slice(-MAX_PER_ADAPTER));
  return record;
}

/** Zapisuje wszystkie odrzucone paszporty z partii. Zwraca liczbę nowych/zaktualizowanych wpisów. */
export function recordFailures(passports: CandidatePassport[]): number {
  let n = 0;
  for (const p of passports) if (recordFailure(p)) n += 1;
  return n;
}

export function clearFailures(adapterId: string): void {
  writeJSON(keyFor(adapterId), []);
}
