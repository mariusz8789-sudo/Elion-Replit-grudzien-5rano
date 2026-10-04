/**
 * Genesis OS — backend: reset zapomnianego hasła (D-166).
 *
 * Czyste funkcje, testowalne bez serwera i bazy. Świadome decyzje:
 *
 *  - TOKEN to 256 bitów z CSPRNG (`generateToken`, ten sam generator co tokeny
 *    sesji). W bazie leży WYŁĄCZNIE jego SHA-256 (`hashSecret` z secrets.mjs —
 *    ta sama droga, którą repo już haszuje tokeny sesji i klucze API), więc
 *    kopia pliku bazy nie zawiera użytecznego poświadczenia. Wartości jawnej nie
 *    da się z bazy odtworzyć.
 *
 *  - KRÓTKA WAŻNOŚĆ (30 minut). Token resetu to poświadczenie, które przychodzi
 *    kanałem poza naszą kontrolą, więc okno musi być liczone w minutach, nie w
 *    dniach jak sesja.
 *
 *  - JEDNORAZOWOŚĆ jest własnością stanu, nie obietnicą kodu wołającego:
 *    `classifyPasswordReset` zwraca USED dla rekordu z `usedAt`, a store
 *    oznacza rekord jako zużyty w tej samej transakcji, w której zmienia hasło.
 *
 *  - USZKODZONY TOKEN nie jest wyjątkiem. `parsePasswordResetToken` sprawdza
 *    kształt (64 znaki hex) i zwraca kod, zanim cokolwiek dotknie bazy, więc
 *    żądanie ze śmieciem nigdy nie wchodzi w ścieżkę, która mogłaby rzucić i
 *    oddać klientowi ślad stosu.
 *
 *  - DOSTARCZENIE: Genesis nie ma skonfigurowanego dostawcy poczty. Ten moduł
 *    NIE udaje wysyłki — `deliveryStatus()` zwraca `EXTERNAL_BLOCKED` razem z
 *    powodem, a API oddaje ten status klientowi. To jedyna uczciwa odpowiedź,
 *    dopóki dostawca nie zostanie podjęty jako osobna decyzja.
 */

import { generateToken } from './auth.mjs';
import { hashSecret } from './secrets.mjs';

/** Okno ważności tokenu resetu. Minuty, nie dni — patrz nagłówek pliku. */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Kształt tokenu: 64 znaki hex (256 bitów z `generateToken`). */
const RESET_TOKEN_RE = /^[0-9a-f]{64}$/;

/** Kody stanu tokenu — jedna, zamknięta lista; API mapuje je na statusy HTTP. */
export const RESET_TOKEN_STATE = Object.freeze({
  VALID: 'VALID',
  MALFORMED: 'MALFORMED',
  UNKNOWN: 'UNKNOWN',
  USED: 'USED',
  EXPIRED: 'EXPIRED',
});

/** Status dostarczenia wiadomości z linkiem — patrz nagłówek pliku. */
export const RESET_DELIVERY_STATUS = Object.freeze({
  EXTERNAL_BLOCKED: 'EXTERNAL_BLOCKED',
});

/**
 * Jedno zdanie prawdy o dostarczeniu. Zwracane ZAWSZE — także wtedy, gdy konta
 * o podanym adresie nie ma — więc nie da się z niego wyczytać, czy konto istnieje.
 */
export function deliveryStatus() {
  return {
    status: RESET_DELIVERY_STATUS.EXTERNAL_BLOCKED,
    reason: 'Genesis nie ma skonfigurowanego dostawcy poczty, więc nie wysłał i nie wyśle wiadomości. Link do zmiany hasła musi dziś przekazać administrator instancji.',
  };
}

/** Nowy token resetu: wartość jawna (jeden raz, do przekazania) + hash do bazy. */
export function newPasswordResetToken(now = Date.now(), ttlMs = RESET_TOKEN_TTL_MS) {
  const token = generateToken();
  return { token, tokenHash: hashSecret(token), createdAt: now, expiresAt: now + ttlMs };
}

/** Hash prezentowanego tokenu — null, gdy token nie ma właściwego kształtu. */
export function parsePasswordResetToken(raw) {
  if (typeof raw !== 'string' || !RESET_TOKEN_RE.test(raw)) return null;
  return hashSecret(raw);
}

/**
 * Stan rekordu resetu wobec zegara. Czysta funkcja — ta sama decyzja w teście i
 * w API, bez duplikatu warunków w handlerze.
 */
export function classifyPasswordReset(record, now = Date.now()) {
  if (!record) return RESET_TOKEN_STATE.UNKNOWN;
  if (record.usedAt !== null && record.usedAt !== undefined) return RESET_TOKEN_STATE.USED;
  if (!Number.isFinite(record.expiresAt) || now > record.expiresAt) return RESET_TOKEN_STATE.EXPIRED;
  return RESET_TOKEN_STATE.VALID;
}

/**
 * Jeden komunikat dla KAŻDEJ odmowy tokenu. Celowo nie rozróżnia „nie ma
 * takiego tokenu", „zużyty" i „wygasły": klient, który dostaje link cudzym
 * kanałem, nie ma powodu wiedzieć, który z tych stanów zachodzi, a różne
 * zdania byłyby wyciekiem. Kod stanu zostaje w logu audytowym, nie w treści.
 */
export const RESET_REFUSAL_MESSAGE = 'Ten link do zmiany hasła jest nieważny. Poproś o nowy.';
