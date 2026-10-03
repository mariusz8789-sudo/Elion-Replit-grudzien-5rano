/**
 * Genesis — profile kont i bramka zdolności (capability gate).
 *
 * JEDNA tabela (`PROFILE_TABLE`) mówi, który profil konta (Uczeń, Student,
 * Nauczyciel, Badacz, Instytucja) ma dostęp do którego obszaru aplikacji.
 * Ten sam plik czyta:
 *  - backend (api.mjs) — wymusza bramkę na trasach, które uruchamiają ciężkie
 *    obliczenia, kampanie odkrywania leków i źródła RESTRICTED;
 *  - frontend (packages/frontend/src/core/accountProfiles.ts importuje go
 *    wprost) — pokazuje stan „zablokowane" z prostym powodem po polsku.
 * Żeby zmienić, kto co może, wystarczy edytować `PROFILE_TABLE` poniżej.
 *
 * Profil to deklaracja użytkownika przy rejestracji, NIE zweryfikowana
 * tożsamość: bramka dopasowuje produkt do odbiorcy (uczeń nie trafia do
 * ciężkich silników), ale nie zastępuje weryfikacji instytucji.
 *
 * Czyste funkcje, zero I/O — testowane w accountProfiles.test.mjs.
 */

/** Obszary zdolności, które bramka rozróżnia. */
export const CAPABILITIES = Object.freeze({
  LEARNING: 'learning',
  HUMAN_EXPLORER: 'human_explorer',
  READ_RESULTS: 'read_results',
  TEACHING: 'teaching',
  COMPUTE_RUN: 'compute_run',
  DRUG_DISCOVERY: 'drug_discovery',
  RESTRICTED_SOURCES: 'restricted_sources',
});

/** Krótka nazwa każdego obszaru — do komunikatów „zablokowane". */
export const CAPABILITY_LABELS = Object.freeze({
  learning: 'Nauka i laboratoria edukacyjne',
  human_explorer: 'Human Explorer',
  read_results: 'Czytanie wyników i dowodów',
  teaching: 'Widoki dla klasy i nauczania',
  compute_run: 'Uruchamianie silników obliczeniowych',
  drug_discovery: 'Kampanie odkrywania leków',
  restricted_sources: 'Źródła instytucjonalne (RESTRICTED)',
});

const L = CAPABILITIES;
const BASE_LEARNER = [L.LEARNING, L.HUMAN_EXPLORER, L.READ_RESULTS];

/**
 * TABELA UPRAWNIEŃ — jedyne miejsce, w którym profil → obszary.
 * Kolejność wierszy = kolejność kart przy rejestracji.
 */
export const PROFILE_TABLE = Object.freeze({
  UCZEN: {
    label: 'Uczeń / szkoła',
    description: 'Uczę się w szkole: laboratoria, Human Explorer i gotowe wyniki.',
    capabilities: [...BASE_LEARNER],
  },
  STUDENT: {
    label: 'Student',
    description: 'Studiuję: nauka, Human Explorer i przegląd wyników badań.',
    capabilities: [...BASE_LEARNER],
  },
  NAUCZYCIEL: {
    label: 'Nauczyciel',
    description: 'Uczę innych: wszystko co student oraz widoki dla klasy.',
    capabilities: [...BASE_LEARNER, L.TEACHING],
  },
  BADACZ: {
    label: 'Badacz / naukowiec',
    description: 'Prowadzę badania: silniki obliczeniowe i kampanie odkrywania leków.',
    capabilities: [...BASE_LEARNER, L.TEACHING, L.COMPUTE_RUN, L.DRUG_DISCOVERY],
  },
  INSTYTUCJA: {
    label: 'Firma / instytucja',
    description: 'Reprezentuję organizację: pełny dostęp, także źródła instytucjonalne.',
    capabilities: [...BASE_LEARNER, L.TEACHING, L.COMPUTE_RUN, L.DRUG_DISCOVERY, L.RESTRICTED_SOURCES],
  },
});

export const ACCOUNT_PROFILES = Object.freeze(Object.keys(PROFILE_TABLE));

/** Profil nadawany kontom sprzed wprowadzenia profili (migracja) i rejestracji bez wyboru przez API. */
export const DEFAULT_ACCOUNT_PROFILE = 'BADACZ';

/** Zwraca kanoniczny kod profilu albo null, gdy wartość nie jest znanym profilem. */
export function normalizeAccountProfile(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(PROFILE_TABLE, code) ? code : null;
}

/** Obszary dozwolone dla profilu (pusta lista dla nieznanego profilu — fail closed). */
export function capabilitiesForProfile(profile) {
  const code = normalizeAccountProfile(profile);
  return code ? [...PROFILE_TABLE[code].capabilities] : [];
}

export function canUseCapability(profile, capability) {
  return capabilitiesForProfile(profile).includes(capability);
}

/** Profile, które MAJĄ dany obszar — do komunikatu „dostępne dla: …". */
export function profilesWithCapability(capability) {
  return ACCOUNT_PROFILES.filter((code) => PROFILE_TABLE[code].capabilities.includes(capability));
}

/**
 * Pełna decyzja bramki. `{ allowed: true }` albo `{ allowed: false, reason }`,
 * gdzie `reason` to jedno-dwa proste zdania po polsku, gotowe do pokazania.
 */
export function capabilityDecision(profile, capability) {
  if (canUseCapability(profile, capability)) return { allowed: true, reason: null };
  const code = normalizeAccountProfile(profile);
  const area = CAPABILITY_LABELS[capability] ?? capability;
  const who = profilesWithCapability(capability).map((c) => PROFILE_TABLE[c].label).join(', ');
  const mine = code ? `Twój profil to „${PROFILE_TABLE[code].label}”.` : 'Twoje konto nie ma rozpoznanego profilu.';
  return {
    allowed: false,
    reason: `${mine} Obszar „${area}” jest dostępny tylko dla profili: ${who || 'żadnego'}.`,
  };
}
