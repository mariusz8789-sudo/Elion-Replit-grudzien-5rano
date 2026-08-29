import { buildPinnedChEMBLAdenosineDiscovery } from './adenosine';
import { buildPinnedChEMBLCaffeineDiscovery } from './chembl';
import { buildPinnedChEMBLTheophyllineDiscovery } from './theophylline';
import type { CandidateDiscoveryReport } from '../biotechDiscoveryContract';

export interface NaturalFunctionalReplacementInput {
  referenceCompound?: string;
  target?: string;
  mechanism?: string;
  structure?: string;
}

export interface NaturalFunctionalReplacementResult {
  status: 'RESOLVED' | 'BLOCKED';
  reason: string;
  reports: readonly CandidateDiscoveryReport[];
  matchedReference?: string;
  target?: string;
}

const normalize = (value: string | undefined): string => (value ?? '').trim().toLowerCase();

export function resolveNaturalFunctionalReplacement(input: NaturalFunctionalReplacementInput): NaturalFunctionalReplacementResult {
  const reference = normalize(input.referenceCompound);
  const target = normalize(input.target);
  const knownReference = reference.includes('caffeine') || reference.includes('kofein') || reference.includes('adenosine') || reference.includes('adenozyn') || reference.includes('theophylline') || reference.includes('teofilin');
  const knownTarget = !target || target === 'a1' || target.includes('adenosine receptor a1') || target.includes('chembl318');
  if (!knownReference || !knownTarget) {
    return {
      status: 'BLOCKED',
      reason: 'Brak kompatybilnego pinned reference profile w dostępnych źródłach; nie wykonano wyszukiwania ani predykcji.',
      reports: [],
      ...(input.referenceCompound?.trim() ? { matchedReference: input.referenceCompound.trim() } : {}),
      ...(input.target?.trim() ? { target: input.target.trim() } : {}),
    };
  }
  const reports = [
    buildPinnedChEMBLCaffeineDiscovery().report,
    buildPinnedChEMBLAdenosineDiscovery().report,
    buildPinnedChEMBLTheophyllineDiscovery().report,
  ];
  return {
    status: 'RESOLVED',
    reason: 'Dopasowano do istniejącego pinned A1 reference profile; wynik jest research-priority comparison, nie funkcjonalnym zamiennikiem ani dowodem skuteczności.',
    reports,
    matchedReference: input.referenceCompound?.trim() || 'A1 pinned profile',
    target: input.target?.trim() || 'A1',
  };
}
