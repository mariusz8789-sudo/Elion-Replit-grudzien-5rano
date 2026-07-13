/**
 * Domena Drug Discovery (P6) — logika paszportu kandydata i rankingu.
 *
 * Zbudowana na Backend Compute Engine (realna cheminformatyka) i Manifeście
 * Zdolności (uczciwe luki). ŻELAZNE zasady:
 *  - liczymy tylko to, co realnie umiemy (masa molowa, DoU, heurystyka masy Lipińskiego),
 *  - brakujące zdolności (dokowanie, ADMET, toksyczność, logP…) są WIDOCZNE jako
 *    luki, NIGDY nie dostają zmyślonej wartości neutralnej,
 *  - ranking to jawna dekompozycja po realnie dostępnych składnikach — nie udaje
 *    rankingu skuteczności ani bezpieczeństwa,
 *  - język: „kandydat obliczeniowy", „spełnia kryteria zaimplementowanych modeli",
 *    „wymaga walidacji laboratoryjnej". NIGDY „odkryto lek"/„skuteczny"/„bezpieczny".
 */

import { runModel } from './engine.mjs';
import { capabilityGap } from './capabilities.mjs';

/** Zdolności istotne dla oceny kandydata leku (kolejność = priorytet pomiaru). */
const RELEVANT_CAPABILITIES = ['docking', 'admet', 'toxicity', 'logp', 'quantum-chemistry', 'protein-structure'];

const LIPINSKI_MW_MAX = 500; // reguła 5 Lipińskiego — kryterium masy (jedyne policzalne bez logP/HBD/HBA)

/**
 * Buduje paszport kandydata. Uruchamia realne modele obliczeniowe, zbiera
 * składniki oceny (z etykietami rodzaju), wypisuje luki zdolności, rekomendacje
 * pomiarowe i wymaganą walidację laboratoryjną. Zwraca też runId modelu masy.
 */
export function buildCandidatePassport(candidate, target = null) {
  const runIds = [];
  const modelsExecuted = [];
  const calculated = {};
  const warnings = [];
  let modelDomainStatus = 'ok';

  // Realna chemia: masa molowa + DoU ze wzoru sumarycznego.
  if (candidate.formula) {
    const run = runModel('chem-molecular-weight', { formula: candidate.formula });
    runIds.push(run.runId);
    if (run.status === 'ok') {
      modelsExecuted.push({ modelId: run.modelId, version: run.modelVersion, status: 'ok' });
      calculated.molarMassGmol = run.outputs.molarMassGmol;
      calculated.atomCount = run.outputs.atomCount;
      calculated.degreeOfUnsaturation = run.outputs.degreeOfUnsaturation;
    } else {
      modelDomainStatus = 'out_of_domain';
      warnings.push(`Nie udało się policzyć masy molowej: ${run.message}`);
      modelsExecuted.push({ modelId: 'chem-molecular-weight', version: run.modelVersion ?? null, status: run.status });
    }
  } else {
    warnings.push('Brak wzoru sumarycznego — nie policzono właściwości chemicznych.');
  }

  // Składniki oceny — jawnie oznaczone: 'calculated' (realne) vs 'heuristic'.
  const scoreComponents = [];
  if (calculated.molarMassGmol !== undefined) {
    scoreComponents.push({ id: 'molar-mass', label: 'Masa molowa', kind: 'calculated', value: calculated.molarMassGmol, unit: 'g/mol' });
    scoreComponents.push({
      id: 'lipinski-mw', label: 'Kryterium masy Lipińskiego (≤ 500 g/mol)', kind: 'heuristic',
      value: calculated.molarMassGmol <= LIPINSKI_MW_MAX ? 1 : 0,
      note: 'Reguła 5 Lipińskiego, TYLKO człon masy (logP/HBD/HBA niepoliczalne bez modelu). Heurystyka „drug-likeness", NIE skuteczność ani bezpieczeństwo.',
    });
    scoreComponents.push({ id: 'degree-unsaturation', label: 'Stopień nienasycenia', kind: 'calculated', value: calculated.degreeOfUnsaturation });
  }

  // Luki zdolności — widoczne, nie zasłonięte wartościami neutralnymi.
  const capabilityGaps = RELEVANT_CAPABILITIES.map(capabilityGap).filter(Boolean);

  // Rynek Pomiarów (domenowy): najwartościowsze brakujące pomiary/obliczenia.
  const measurementRecommendations = capabilityGaps.map((g) => ({
    capability: g.id, label: g.label, status: g.status, requires: g.requires,
  }));

  // MCRE: konflikt modeli pojawia się, gdy ≥2 modele liczą tę samą wielkość.
  const conflicts = []; // brak — obecnie jeden model na endpoint

  const requiredLaboratoryValidation = [
    'Synteza i potwierdzenie struktury (NMR / MS).',
    'Oznaczenie powinowactwa do celu (assay in vitro).',
    'Profil ADMET in vitro.',
    'Ocena toksyczności.',
  ];

  return {
    candidateId: candidate.id,
    targetId: target?.id ?? candidate.targetId ?? null,
    label: candidate.label,
    representation: { formula: candidate.formula || null, smiles: candidate.smiles || null, charge: candidate.charge ?? 0 },
    calculatedProperties: calculated,
    modelsExecuted,
    scoreComponents,
    uncertainty: 'Wysoka: brak zaimplementowanych modeli skuteczności i bezpieczeństwa (patrz luki zdolności).',
    modelDomainStatus,
    conflicts,
    capabilityGaps,
    warnings,
    provenance: { engine: 'genesis-compute', method: 'deterministic cheminformatics + capability manifest' },
    requiredLaboratoryValidation,
    measurementRecommendations,
    runIds,
    verdict: 'Kandydat OBLICZENIOWY — spełnia kryteria zaimplementowanych modeli w podanym zakresie. Wymaga walidacji laboratoryjnej. To NIE jest lek ani deklaracja skuteczności/bezpieczeństwa.',
  };
}

/**
 * Ranking kandydatów — JAWNA dekompozycja po realnie dostępnych składnikach.
 * Nie udaje rankingu skuteczności: sortuje po heurystyce drug-likeness (człon
 * masy Lipińskiego) i kompletności obliczeń, a brakujące zdolności pozostają
 * widoczne. Zwraca też liczbę luk zdolności każdego kandydata.
 */
export function rankCandidates(passports) {
  const scored = passports.map((p) => {
    const lipinski = p.scoreComponents.find((c) => c.id === 'lipinski-mw')?.value ?? 0;
    const hasChem = p.calculatedProperties.molarMassGmol !== undefined;
    const mw = p.calculatedProperties.molarMassGmol ?? Infinity;
    return {
      candidateId: p.candidateId,
      label: p.label,
      // Kompozyt jawny: [heurystyka masy, kompletność chemii], tie-break: niższa masa.
      rankBasis: { lipinskiMwPass: lipinski, chemistryComputed: hasChem ? 1 : 0, molarMassGmol: hasChem ? mw : null },
      capabilityGapCount: p.capabilityGaps.length,
      note: 'Ranking odzwierciedla WYŁĄCZNIE zaimplementowane heurystyki chemiczne, nie skuteczność ani bezpieczeństwo.',
    };
  });

  scored.sort((a, b) => {
    if (b.rankBasis.lipinskiMwPass !== a.rankBasis.lipinskiMwPass) return b.rankBasis.lipinskiMwPass - a.rankBasis.lipinskiMwPass;
    if (b.rankBasis.chemistryComputed !== a.rankBasis.chemistryComputed) return b.rankBasis.chemistryComputed - a.rankBasis.chemistryComputed;
    return (a.rankBasis.molarMassGmol ?? Infinity) - (b.rankBasis.molarMassGmol ?? Infinity);
  });

  return scored.map((s, i) => ({ rank: i + 1, ...s }));
}
