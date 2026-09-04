/**
 * Genesis OS — backend: uwierzytelnianie (Milestone 1: Backend Persistence).
 *
 * Czyste funkcje kryptograficzne, testowalne bez serwera i bazy. Świadome
 * decyzje bezpieczeństwa:
 *  - hasła haszowane przez scrypt (node:crypto, wbudowany, bez zależności) z
 *    losową solą per użytkownik; format `scrypt$<sól>$<hash>` jest samoopisowy
 *    i pozwala w przyszłości podnieść parametry bez migracji schematu;
 *  - porównanie hashy w czasie stałym (timingSafeEqual) — zero wycieku przez
 *    czas odpowiedzi;
 *  - tokeny sesji to 256 bitów z CSPRNG (randomBytes) — nie do odgadnięcia;
 *  - walidacja poświadczeń oddzielona od kryptografii, by dało się ją
 *    przetestować i użyć po stronie API bez liczenia hashy.
 *
 * To fundament pod role i uprawnienia (RBAC) w store.mjs — projektowany tak,
 * by później obsłużyć instytucje naukowe, uczelnie i duże zespoły, ale tu
 * implementujemy wyłącznie to, co realnie działa i jest przetestowane.
 */

import { scryptSync, randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16_384; // N=2^14 — rozsądny koszt dla logowania interaktywnego

/** Hasło → `scrypt$<sól>$<hash>` (sól losowa, chyba że podana w testach). */
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST }).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

/** Weryfikacja w czasie stałym. Zwraca false dla uszkodzonego/nieznanego formatu. */
export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  if (!salt || !hash) return false;
  let derived;
  try {
    derived = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST }).toString('hex');
  } catch {
    return false;
  }
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(derived, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 256-bitowy token sesji (hex). */
export function generateToken() {
  return randomBytes(32).toString('hex');
}

/** Nowy identyfikator zasobu (UUID v4). */
export function newId() {
  return randomUUID();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Walidacja poświadczeń rejestracji. Zwraca { ok, error?, value? } — jawne
 * komunikaty (po polsku), które API może oddać klientowi bez ujawniania
 * szczegółów implementacji. Nazwa wyświetlana jest opcjonalna (domyślnie z
 * części adresu przed @).
 */
export function validateRegistration({ email, password, displayName } = {}) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 254) {
    return { ok: false, error: 'Podaj poprawny adres e-mail.' };
  }
  const p = String(password ?? '');
  if (p.length < 8) return { ok: false, error: 'Hasło musi mieć co najmniej 8 znaków.' };
  if (p.length > 200) return { ok: false, error: 'Hasło jest zbyt długie (max 200 znaków).' };
  const name = String(displayName ?? '').trim().slice(0, 80) || e.split('@')[0];
  return { ok: true, value: { email: e, password: p, displayName: name } };
}
