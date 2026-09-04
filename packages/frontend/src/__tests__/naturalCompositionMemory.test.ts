import { describe, expect, it, beforeEach } from 'vitest';
import { replaySavedBiotechDiscoveryArtifact, saveBiotechDiscoveryComparisonToMemory } from '../core/scienceMemory';
import { buildPinnedChEMBLCaffeineDiscovery } from '../core/biotechData/chembl';
import { buildPinnedChEMBLAdenosineDiscovery } from '../core/biotechData/adenosine';
import { buildPinnedChEMBLTheophyllineDiscovery } from '../core/biotechData/theophylline';

/**
 * ZAPIS I ODTWORZENIE HIPOTEZ KOMPOZYCJI.
 *
 * Zapisany artefakt trzymał JEDNĄ kompozycję i liczył ją bez żądanych
 * targetów, więc `uncoveredTargetIds` zawsze wychodziło puste, a ranking, który
 * użytkownik realnie zobaczył, nie trafiał do pamięci wcale. Zmiana rankingu
 * nie mogła więc dać DRIFT-u, bo nie było czego porównać.
 */

const reports = () => [
  buildPinnedChEMBLCaffeineDiscovery().report,
  buildPinnedChEMBLAdenosineDiscovery().report,
  buildPinnedChEMBLTheophyllineDiscovery().report,
];

describe('Artefakt pamięci — hipotezy kompozycji', () => {
  beforeEach(() => { try { globalThis.localStorage?.clear(); } catch { /* brak localStorage w tym środowisku */ } });

  it('zapisuje uszeregowane hipotezy, a nie tylko jedną kompozycję', () => {
    const saved = saveBiotechDiscoveryComparisonToMemory(reports(), { requestedTargetIds: ['A1'] });
    const artifact = saved.biotech?.artifact;

    expect(artifact?.compositionHypotheses?.length).toBe(3);
    expect(artifact?.compositionHypotheses?.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    expect(artifact?.combinationHypothesis).toBeDefined();
  });

  it('zachowuje żądane targety, więc pokrycie jest policzone naprawdę', () => {
    const withTarget = saveBiotechDiscoveryComparisonToMemory(reports(), { requestedTargetIds: ['nieistniejacy-target'] });
    const artifact = withTarget.biotech?.artifact;

    expect(artifact?.requestedTargetIds).toEqual(['nieistniejacy-target']);
    // Target, którego żaden kandydat nie pokrywa, MUSI zostać wykazany jako
    // niepokryty — wcześniej ta lista zawsze była pusta z braku argumentu.
    expect(artifact?.combinationHypothesis?.uncoveredTargetIds).toContain('nieistniejacy-target');
    for (const entry of artifact?.compositionHypotheses ?? []) {
      expect(entry.rankingBasis.uncoveredTargetCount).toBeGreaterThan(0);
    }
  });

  it('każda zapisana hipoteza pozostaje HYPOTHESIS z planem walidacji', () => {
    const artifact = saveBiotechDiscoveryComparisonToMemory(reports(), { requestedTargetIds: ['A1'] }).biotech?.artifact;

    for (const entry of artifact?.compositionHypotheses ?? []) {
      expect(entry.status).toBe('HYPOTHESIS');
      expect(entry.validationPlan.length).toBeGreaterThan(0);
      expect(entry.rankingRationale.length).toBe(4);
    }
    expect(artifact?.limitations).toContain('Binding is not efficacy.');
  });

  it('ten sam wsad daje ten sam artifactFingerprint', () => {
    const a = saveBiotechDiscoveryComparisonToMemory(reports(), { requestedTargetIds: ['A1'] }).biotech?.artifact;
    const b = saveBiotechDiscoveryComparisonToMemory(reports(), { requestedTargetIds: ['A1'] }).biotech?.artifact;

    expect(b?.artifactFingerprint).toBe(a?.artifactFingerprint);
  });

  it('zmiana żądanego targetu zmienia fingerprint — ranking wchodzi do odcisku', () => {
    const a = saveBiotechDiscoveryComparisonToMemory(reports(), { requestedTargetIds: ['A1'] }).biotech?.artifact;
    const b = saveBiotechDiscoveryComparisonToMemory(reports(), { requestedTargetIds: ['A2B'] }).biotech?.artifact;

    // Ten sam zestaw raportów, inne kryterium pokrycia → inny ranking → inny
    // odcisk. To jest warunek, żeby replay mógł kiedykolwiek zgłosić DRIFT.
    expect(b?.artifactFingerprint).not.toBe(a?.artifactFingerprint);
  });

  it('porównanie poniżej dwóch raportów jest odrzucane, a nie zapisywane po cichu', () => {
    expect(() => saveBiotechDiscoveryComparisonToMemory([reports()[0]!], { requestedTargetIds: ['A1'] })).toThrow();
  });

  /** Zapisany artefakt; brak artefaktu to błąd zapisu, nie przypadek do obsłużenia w teście. */
  function savedArtifact() {
    const artifact = saveBiotechDiscoveryComparisonToMemory(reports(), { requestedTargetIds: ['A1'] }).biotech?.artifact;
    expect(artifact).toBeDefined();
    return artifact as NonNullable<typeof artifact>;
  }

  it('replay odtwarza zapisany ranking — MATCH, gdy nic się nie zmieniło', () => {
    const saved = saveBiotechDiscoveryComparisonToMemory(reports(), { requestedTargetIds: ['A1'] }).biotech?.artifact;

    expect(replaySavedBiotechDiscoveryArtifact(saved, saved?.reports ?? [], {})).toMatchObject({ status: 'MATCH' });
  });

  it('replay zgłasza DRIFT, gdy zapisany ranking kompozycji zostanie podmieniony', () => {
    const saved = savedArtifact();
    const tampered = {
      ...saved,
      compositionHypotheses: [...(saved.compositionHypotheses ?? [])].reverse(),
    };

    // Odwrócona kolejność TOP 3 to inny wynik pokazany użytkownikowi. Zanim
    // ranking wszedł do artefaktu, taka podmiana przechodziła jako MATCH.
    expect(replaySavedBiotechDiscoveryArtifact(tampered, saved.reports ?? [], {})).toMatchObject({ status: 'DRIFT' });
  });

  it('replay zgłasza DRIFT, gdy podmieniono żądane targety', () => {
    const saved = savedArtifact();

    expect(replaySavedBiotechDiscoveryArtifact({ ...saved, requestedTargetIds: ['A2B'] }, saved.reports ?? [], {}))
      .toMatchObject({ status: 'DRIFT' });
  });

  it('replay bez artefaktu albo poniżej dwóch raportów jest BLOCKED, nigdy MATCH', () => {
    const saved = savedArtifact();

    expect(replaySavedBiotechDiscoveryArtifact(undefined, saved.reports ?? [], {})).toMatchObject({ status: 'BLOCKED' });
    expect(replaySavedBiotechDiscoveryArtifact(saved, [saved.reports[0]!], {})).toMatchObject({ status: 'BLOCKED' });
  });
});
