/**
 * Manifest Zdolności Obliczeniowych (P6.6) — UCZCIWA deklaracja tego, co
 * Genesis Lab realnie potrafi policzyć, a czego NIE.
 *
 * Zasada nadrzędna: dla zdolności o statusie innym niż AVAILABLE system NIGDY
 * nie zwraca zmyślonej liczby. Zwraca „CAPABILITY GAP DETECTED" + status + jak
 * zdolność mogłaby zostać dostarczona (własny model albo zewnętrzny silnik).
 *
 * Statusy:
 *  - AVAILABLE               — zaimplementowane, deterministyczne, przetestowane.
 *  - NOT_IMPLEMENTED         — brak implementacji; brak ścieżki bez zewn. silnika.
 *  - EXTERNAL_ENGINE_REQUIRED — wymaga zewnętrznego silnika naukowego / danych.
 *  - MODEL_NOT_VALID_FOR_DOMAIN — model istnieje, ale nie obowiązuje w tym przypadku.
 */

export const CAPABILITY_STATUS = {
  AVAILABLE: 'AVAILABLE',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  EXTERNAL_ENGINE_REQUIRED: 'EXTERNAL_ENGINE_REQUIRED',
  MODEL_NOT_VALID_FOR_DOMAIN: 'MODEL_NOT_VALID_FOR_DOMAIN',
};

/**
 * Rejestr zdolności. `AVAILABLE` wskazuje realny model w rejestrze obliczeń.
 * Zaawansowane metody są jawnie NIEzaimplementowane — z opisem, czego wymagają
 * i jaki jest interfejs adaptera do przyszłej integracji (bez fałszowania).
 */
export const CAPABILITIES = [
  {
    id: 'molecular-weight', label: 'Masa molowa / skład pierwiastkowy', category: 'cheminformatics',
    status: CAPABILITY_STATUS.AVAILABLE, modelId: 'chem-molecular-weight',
    note: 'Deterministyczna, ścisła (masy atomowe IUPAC). Prosty wzór sumaryczny.',
  },
  {
    id: 'formula-validation', label: 'Walidacja wzoru sumarycznego', category: 'cheminformatics',
    status: CAPABILITY_STATUS.AVAILABLE, modelId: 'chem-molecular-weight',
    note: 'Parser prostych wzorów (bez nawiasów/hydratów/izotopów w v1).',
  },
  {
    id: 'logp', label: 'Lipofilowość (logP)', category: 'physicochemical',
    status: CAPABILITY_STATUS.NOT_IMPLEMENTED,
    requires: 'Model wkładów atomowych (np. Crippen) lub zewnętrzny silnik cheminformatyczny.',
    adapter: 'PhyschemAdapter.logP(structure) → { value, method }',
    note: 'Nie liczymy logP zgadywanką — wymaga zwalidowanego modelu wkładów.',
  },
  {
    id: 'docking', label: 'Dokowanie molekularne', category: 'structural',
    status: CAPABILITY_STATUS.EXTERNAL_ENGINE_REQUIRED,
    requires: 'Struktura 3D białka-celu + silnik dokowania (np. AutoDock Vina) i pole siłowe.',
    adapter: 'DockingAdapter.dock(target3D, ligand3D) → { poses, scoreKcalMol, engine }',
    note: 'Brak zaimplementowanego silnika — wynik dokowania NIE jest zmyślany.',
  },
  {
    id: 'molecular-dynamics', label: 'Dynamika molekularna', category: 'structural',
    status: CAPABILITY_STATUS.EXTERNAL_ENGINE_REQUIRED,
    requires: 'Pole siłowe + integrator MD (np. OpenMM/GROMACS) i zasoby obliczeniowe.',
    adapter: 'MDAdapter.simulate(system, ns) → { trajectoryRef, energies, engine }',
  },
  {
    id: 'quantum-chemistry', label: 'Chemia kwantowa (DFT/ab initio)', category: 'electronic-structure',
    status: CAPABILITY_STATUS.EXTERNAL_ENGINE_REQUIRED,
    requires: 'Silnik struktury elektronowej (np. Psi4/ORCA) i zestaw bazowy.',
    adapter: 'QuantumChemAdapter.singlePoint(geometry, method, basis) → { energyHartree, engine }',
  },
  {
    id: 'admet', label: 'ADMET (wchłanianie/dystrybucja/metabolizm/wydalanie/toksyczność)', category: 'predictive',
    status: CAPABILITY_STATUS.EXTERNAL_ENGINE_REQUIRED,
    requires: 'Zwalidowane modele QSAR/ML wytrenowane na danych eksperymentalnych.',
    adapter: 'ADMETAdapter.predict(structure) → { endpoints, applicabilityDomain, engine }',
    note: 'ADMET NIE jest zgadywane — bez zwalidowanego modelu zwracamy lukę zdolności.',
  },
  {
    id: 'toxicity', label: 'Predykcja toksyczności', category: 'predictive',
    status: CAPABILITY_STATUS.EXTERNAL_ENGINE_REQUIRED,
    requires: 'Zwalidowane modele toksykologiczne + dane referencyjne.',
    adapter: 'ToxAdapter.predict(structure, endpoint) → { value, applicabilityDomain, engine }',
  },
  {
    id: 'protein-structure', label: 'Predykcja struktury białka', category: 'structural',
    status: CAPABILITY_STATUS.EXTERNAL_ENGINE_REQUIRED,
    requires: 'Silnik składania (np. AlphaFold) lub struktura doświadczalna (PDB).',
    adapter: 'StructureAdapter.predict(sequence) → { pdbRef, plddt, engine }',
  },
  {
    id: 'generative-de-novo', label: 'Generatywne projektowanie de novo', category: 'generative',
    status: CAPABILITY_STATUS.NOT_IMPLEMENTED,
    requires: 'Zwalidowany model generatywny + wykonalna synteza + filtry bezpieczeństwa.',
    adapter: 'GenerativeAdapter.propose(target, constraints) → { candidates[], method }',
    note: 'Genesis Lab przyjmuje kandydatów wprost; nie generuje ich modelem generatywnym.',
  },
];

const BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c]));

export function listCapabilities() {
  return CAPABILITIES;
}

export function getCapability(id) {
  return BY_ID.get(id) ?? null;
}

export function isAvailable(id) {
  return BY_ID.get(id)?.status === CAPABILITY_STATUS.AVAILABLE;
}

/** Zwięzły znacznik luki zdolności do dołączania do paszportów kandydatów. */
export function capabilityGap(id) {
  const c = BY_ID.get(id);
  if (!c) return { id, status: 'UNKNOWN', message: `Nieznana zdolność „${id}".` };
  if (c.status === CAPABILITY_STATUS.AVAILABLE) return null;
  return { id, label: c.label, status: c.status, requires: c.requires ?? null, note: c.note ?? null };
}
