/** Types for accountProfiles.mjs — the frontend imports that file directly (one table, two sides). */
export type AccountProfile = 'UCZEN' | 'STUDENT' | 'NAUCZYCIEL' | 'BADACZ' | 'INSTYTUCJA';
export type Capability =
  | 'learning'
  | 'human_explorer'
  | 'read_results'
  | 'teaching'
  | 'compute_run'
  | 'drug_discovery'
  | 'restricted_sources';

export interface ProfileRow {
  readonly label: string;
  readonly description: string;
  readonly capabilities: readonly Capability[];
}

export declare const CAPABILITIES: {
  readonly LEARNING: 'learning';
  readonly HUMAN_EXPLORER: 'human_explorer';
  readonly READ_RESULTS: 'read_results';
  readonly TEACHING: 'teaching';
  readonly COMPUTE_RUN: 'compute_run';
  readonly DRUG_DISCOVERY: 'drug_discovery';
  readonly RESTRICTED_SOURCES: 'restricted_sources';
};
export declare const CAPABILITY_LABELS: Readonly<Record<Capability, string>>;
export declare const PROFILE_TABLE: Readonly<Record<AccountProfile, ProfileRow>>;
export declare const ACCOUNT_PROFILES: readonly AccountProfile[];
export declare const DEFAULT_ACCOUNT_PROFILE: 'BADACZ';
export declare function normalizeAccountProfile(value: unknown): AccountProfile | null;
export declare function capabilitiesForProfile(profile: unknown): Capability[];
export declare function canUseCapability(profile: unknown, capability: Capability): boolean;
export declare function profilesWithCapability(capability: Capability): AccountProfile[];
export declare function capabilityDecision(
  profile: unknown,
  capability: Capability,
): { allowed: true; reason: null } | { allowed: false; reason: string };
