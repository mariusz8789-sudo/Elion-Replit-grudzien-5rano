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
import { normalizeAccountProfile, DEFAULT_ACCOUNT_PROFILE } from './accountProfiles.mjs';

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

/** Normalizacja adresu e-mail — jedno miejsce prawdy (rejestracja, logowanie, reset hasła). */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function isEmailShaped(email) {
  const e = normalizeEmail(email);
  return EMAIL_RE.test(e) && e.length <= 254;
}

/** Polityka haseł — JEDNO miejsce prawdy. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

/**
 * Jedyna polityka haseł w systemie. Rejestracja, zmiana hasła i ustawienie
 * nowego hasła po resecie wołają DOKŁADNIE tę funkcję, więc nie da się
 * obejść progu żadną z trzech dróg. Komunikaty po polsku — API oddaje je
 * klientowi bez ujawniania szczegółów implementacji.
 */
export function validatePassword(password) {
  const p = String(password ?? '');
  if (p.length < PASSWORD_MIN_LENGTH) return { ok: false, error: `Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków.` };
  if (p.length > PASSWORD_MAX_LENGTH) return { ok: false, error: `Hasło jest zbyt długie (max ${PASSWORD_MAX_LENGTH} znaków).` };
  return { ok: true, value: p };
}

/**
 * Walidacja poświadczeń rejestracji. Zwraca { ok, error?, value? } — jawne
 * komunikaty (po polsku), które API może oddać klientowi bez ujawniania
 * szczegółów implementacji. Nazwa wyświetlana jest opcjonalna (domyślnie z
 * części adresu przed @). Profil konta (accountProfiles.mjs) musi być jednym
 * ze znanych kodów; brak pola → DEFAULT_ACCOUNT_PROFILE (zgodność ze starszymi
 * klientami API), nieznana wartość → błąd.
 */
export function validateRegistration({ email, password, displayName, accountProfile } = {}) {
  const e = normalizeEmail(email);
  if (!isEmailShaped(e)) {
    return { ok: false, error: 'Podaj poprawny adres e-mail.' };
  }
  const policy = validatePassword(password);
  if (!policy.ok) return { ok: false, error: policy.error };
  const p = policy.value;
  const name = String(displayName ?? '').trim().slice(0, 80) || e.split('@')[0];
  const profile = accountProfile === undefined || accountProfile === null || accountProfile === ''
    ? DEFAULT_ACCOUNT_PROFILE
    : normalizeAccountProfile(accountProfile);
  if (!profile) return { ok: false, error: 'Wybierz jeden z profili konta: Uczeń, Student, Nauczyciel, Badacz albo Instytucja.' };
  return { ok: true, value: { email: e, password: p, displayName: name, accountProfile: profile } };
}
