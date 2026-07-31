/**
 * secrets (Stage 8, PART 3) — hashing sekretów uwierzytelniających w spoczynku.
 *
 * Tokeny sesji i klucze API to silne, losowe wartości (256/192 bity z CSPRNG),
 * ale przechowywane w bazie w postaci jawnej dają się użyć bezpośrednio po wycieku
 * kopii/pliku bazy. Przechowujemy więc WYŁĄCZNIE ich SHA-256 (jak hasło), a przy
 * każdym żądaniu haszujemy przedstawiony sekret i porównujemy hash z hashem.
 *
 * SHA-256 (nie scrypt) jest tu właściwe: sekrety mają wysoką entropię (nie da się
 * ich zgadnąć słownikowo), więc kosztowne KDF nie jest potrzebne, a szybki hash
 * pozwala walidować każde żądanie bez narzutu. Czyste funkcje — testowalne.
 */
import { createHash } from 'node:crypto';

/** SHA-256 sekretu (hex). Pusty/nie-string → null (żeby nie „zahaszować" braku). */
export function hashSecret(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Nietajna wskazówka wyświetlana zamiast pełnego klucza (klucz pokazujemy w
 * całości tylko RAZ, przy utworzeniu). Np. `gk_AbCd…WxYz`.
 */
export function keyHint(rawKey) {
  if (typeof rawKey !== 'string' || rawKey.length < 8) return '••••';
  return `${rawKey.slice(0, 7)}…${rawKey.slice(-4)}`;
}

/** Czy dana wartość wygląda już jak hash SHA-256 (64 znaki hex) — do migracji idempotentnej. */
export function looksHashed(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}
