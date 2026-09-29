/**
 * Profile kont i bramka zdolności — strona klienta.
 *
 * Tabela uprawnień NIE jest tu kopiowana: importujemy ten sam plik, którego
 * backend używa do egzekwowania (packages/backend/src/accountProfiles.mjs).
 * Jedna tabela, dwie strony — UI pokazuje „zablokowane" dokładnie tam, gdzie
 * serwer i tak odmówi (403 profile_capability_denied).
 */
import {
  ACCOUNT_PROFILES,
  CAPABILITIES,
  CAPABILITY_LABELS,
  DEFAULT_ACCOUNT_PROFILE,
  PROFILE_TABLE,
  canUseCapability,
  capabilitiesForProfile,
  capabilityDecision,
  normalizeAccountProfile,
  profilesWithCapability,
  type AccountProfile,
  type Capability,
} from '../../../backend/src/accountProfiles.mjs';

export {
  ACCOUNT_PROFILES,
  CAPABILITIES,
  CAPABILITY_LABELS,
  DEFAULT_ACCOUNT_PROFILE,
  PROFILE_TABLE,
  canUseCapability,
  capabilitiesForProfile,
  capabilityDecision,
  normalizeAccountProfile,
  profilesWithCapability,
};
export type { AccountProfile, Capability };

/**
 * Profil zalogowanego użytkownika. Sesja zapisana przed wprowadzeniem profili
 * nie ma pola — backend nadał takim kontom BADACZ w migracji, więc przyjmujemy
 * to samo do czasu odświeżenia przez /auth/me.
 */
export function profileOfUser(user: { accountProfile?: unknown } | null | undefined): AccountProfile | null {
  if (!user) return null;
  return normalizeAccountProfile(user.accountProfile) ?? DEFAULT_ACCOUNT_PROFILE;
}

export function profileLabel(profile: AccountProfile | null): string {
  return profile ? PROFILE_TABLE[profile].label : 'Gość';
}

/** Wszystkie obszary z decyzją dla profilu — do listy „co masz, czego nie masz" na ekranie konta. */
export function capabilityOverview(profile: AccountProfile): { capability: Capability; label: string; allowed: boolean }[] {
  return (Object.values(CAPABILITIES) as Capability[]).map((capability) => ({
    capability,
    label: CAPABILITY_LABELS[capability],
    allowed: canUseCapability(profile, capability),
  }));
}
