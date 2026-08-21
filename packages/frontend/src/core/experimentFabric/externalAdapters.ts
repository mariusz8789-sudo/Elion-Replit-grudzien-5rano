import type { ExperimentRoute } from './types';

/** Extension manifests. Runtime availability remains separately validated by the execution environment. */
export const EXTERNAL_ADAPTER_CONTRACT_VERSION = '1.0.0';

export type ExternalAdapterStatus = 'ENGINE_NOT_AVAILABLE' | 'NOT_CONFIGURED' | 'REQUIRES_VALIDATION';
export type ExternalExecutionBackend = 'local-container' | 'remote-api' | 'hpc-job' | 'webgpu' | 'file-import';
export type ExternalScientificDomain =
  | 'cfd' | 'pde' | 'electromagnetism' | 'thermodynamics' | 'general-relativity'
  | 'astrophysics' | 'radiation-transport' | 'nuclear' | 'quantum' | 'gis' | 'environment' | 'cheminformatics' | 'biology';

export interface ExternalAdapterManifest {
  contractVersion: string;
  id: string;
  title: string;
  status: ExternalAdapterStatus;
  domains: readonly ExternalScientificDomain[];
  backend: ExternalExecutionBackend;
  /** URI for technical provenance, not a dependency download instruction. */
  primaryDocumentation: string;
  inputSchema: readonly string[];
  outputSchema: readonly string[];
  requiredProvenance: readonly string[];
  requiredRuntime: readonly string[];
  route: ExperimentRoute;
  limitation: string;
}

export interface SpatialImportManifest {
  contractVersion: string;
  id: string;
  title: string;
  status: Extract<ExternalAdapterStatus, 'NOT_CONFIGURED' | 'REQUIRES_VALIDATION'>;
  primaryDocumentation: string;
  sourceLicenseOrTerms: string;
  supportedLayers: readonly ('buildings' | 'roads' | 'rail' | 'water' | 'terrain' | 'dem' | 'boundaries' | 'environmental')[];
  requiredRequestFields: readonly ('bbox' | 'crs' | 'sourceTimestamp' | 'sourceQuery' | 'license' | 'attribution')[];
  normalizedOutput: 'GenesisSpatialDataset@1.0.0';
  requiredProvenance: readonly string[];
  limitation: string;
}

const ENGINE_ADAPTERS: readonly ExternalAdapterManifest[] = [
  {
    contractVersion: EXTERNAL_ADAPTER_CONTRACT_VERSION, id: 'pymeep-maxwell-fdtd', title: 'PyMeep Maxwell / FDTD adapter', status: 'REQUIRES_VALIDATION',
    domains: ['electromagnetism'], backend: 'local-container',
    primaryDocumentation: 'https://meep.readthedocs.io/en/latest/Python_Tutorials/Basics/',
    inputSchema: ['n1 refractive index', 'n2 refractive index', 'Meep frequency', 'FDTD resolution'],
    outputSchema: ['power transmittance', 'power reflectance', 'Fresnel analytical reference', 'absolute error', 'energy closure'],
    requiredProvenance: ['PyMeep version', 'worker hash', 'declared material indices', 'frequency', 'resolution', 'reference-case evidence'],
    requiredRuntime: ['GENESIS_MEEP_PYTHON interpreter', 'PyMeep import', 'reference n1=1/n2=2 Fresnel case passes'], route: { kind: 'none' },
    limitation: 'Backend zawiera rzeczywisty adapter Node → PyMeep dla 1D, normalnego padania na bezstratną granicę dielektryczną. Science Chat przekazuje niezmieniony, zatwierdzony plan do /api/compute/fabric/run; przeglądarka nie wykonuje FDTD. Endpoint przed wykonaniem weryfikuje GENESIS_MEEP_PYTHON oraz referencyjny przypadek Fresnela, a bez runtime’u zwraca blokadę bez wyniku.',
  },
  {
    contractVersion: EXTERNAL_ADAPTER_CONTRACT_VERSION, id: 'rdkit-molecular-descriptors', title: 'RDKit molecular-descriptors adapter', status: 'REQUIRES_VALIDATION',
    domains: ['cheminformatics'], backend: 'local-container',
    primaryDocumentation: 'https://www.rdkit.org/docs/GettingStartedInPython.html',
    inputSchema: ['SMILES molecular graph'],
    outputSchema: ['canonical SMILES', 'formula', 'molecular mass', 'Crippen logP', 'HBD/HBA', 'ring metrics', 'TPSA', 'Lipinski rule-of-five violations'],
    requiredProvenance: ['RDKit version', 'worker hash', 'canonical SMILES', 'descriptor method', 'declared runtime interpreter'],
    requiredRuntime: ['GENESIS_RDKIT_PYTHON interpreter', 'RDKit import', 'reference descriptor cases pass'], route: { kind: 'none' },
    limitation: 'Backend uruchamia rzeczywisty worker RDKit do deskryptorów topologicznych 2D jawnego SMILES. Science Chat przekazuje zatwierdzony tekst struktury do /api/compute/fabric/run; przeglądarka nie wyprowadza wartości. Bez runtime’u endpoint zwraca blokadę bez wyniku. Adapter nie wykonuje QSAR, docking, ADMET, dynamiki molekularnej, predykcji aktywności lub zaleceń chemicznych.',
  },
  {
    contractVersion: EXTERNAL_ADAPTER_CONTRACT_VERSION, id: 'openmm-hiv-10e8-long-md', title: 'OpenMM HIV 10E8/MPER long-MD job adapter', status: 'ENGINE_NOT_AVAILABLE',
    domains: ['biology'], backend: 'hpc-job',
    primaryDocumentation: 'https://docs.openmm.org/latest/userguide/application/01_getting_started.html',
    inputSchema: ['manifested PDB artifact', 'chain mapping', 'PDBFixer preparation policy', 'force-field and solvent policy', 'integrator and random seed', 'run length', 'hardware allocation'],
    outputSchema: ['prepared topology hash', 'trajectory artifact hash', 'energy time series', 'RMSD/RMSF observables', 'run diagnostics', 'redocking-validation link when applicable'],
    requiredProvenance: ['PDB ID and SHA-256', 'chain mapping', 'PDBFixer version and preparation log', 'OpenMM version', 'force-field XML hashes', 'platform/GPU driver metadata', 'seed', 'trajectory and log hashes'],
    requiredRuntime: ['persistent long-job execution environment', 'approved OpenMM runtime', 'validated PDBFixer policy', 'resource quota', 'artifact storage', 'predeclared geometric acceptance criteria'], route: { kind: 'none' },
    limitation: 'Nie jest uruchomiony przez bieżący Fabric. Krótki run 5GHW po PDBFixer przekroczył budżet CPU sandboxa bez wyniku, dlatego adapter pozostaje ENGINE_NOT_AVAILABLE. Dopuszczenie wymaga reprodukowalnego jobu długotrwałego, kontroli przygotowania PDB, artefaktów trajektorii i predefiniowanego benchmarku; wynik MD nie może być przedstawiany jako powinowactwo, neutralizacja, immunogenność ani skuteczność szczepionki.',
  },
  {
    contractVersion: EXTERNAL_ADAPTER_CONTRACT_VERSION, id: 'openfoam-cfd', title: 'OpenFOAM CFD adapter', status: 'ENGINE_NOT_AVAILABLE',
    domains: ['cfd', 'thermodynamics', 'radiation-transport'], backend: 'local-container',
    primaryDocumentation: 'https://www.openfoam.com/documentation/overview',
    inputSchema: ['mesh reference', 'boundary conditions', 'material properties', 'solver case', 'time controls'],
    outputSchema: ['field snapshots', 'mesh metadata', 'residual history', 'derived observables'],
    requiredProvenance: ['OpenFOAM version', 'case files hash', 'mesh hash', 'boundary-condition snapshot', 'solver log hash'],
    requiredRuntime: ['approved container image', 'resource limits', 'case validation', 'job isolation'], route: { kind: 'none' },
    limitation: 'Nie jest zainstalowany ani wywoływany. Obecny model pompa–rurociąg nie jest CFD.',
  },
  {
    contractVersion: EXTERNAL_ADAPTER_CONTRACT_VERSION, id: 'fenicsx-pde', title: 'FEniCSx PDE / FEM adapter', status: 'ENGINE_NOT_AVAILABLE',
    domains: ['pde', 'electromagnetism', 'thermodynamics', 'cfd'], backend: 'local-container',
    primaryDocumentation: 'https://docs.fenicsproject.org/',
    inputSchema: ['weak form identifier', 'mesh reference', 'finite-element space', 'boundary conditions', 'material fields', 'time controls'],
    outputSchema: ['solution fields', 'mesh metadata', 'convergence diagnostics', 'derived observables'],
    requiredProvenance: ['DOLFINx version', 'UFL form hash', 'mesh hash', 'PETSc options', 'boundary-condition snapshot'],
    requiredRuntime: ['approved container image', 'MPI policy', 'PETSc solver policy', 'resource limits'], route: { kind: 'none' },
    limitation: 'Nie jest zainstalowany ani wywoływany; wymagane są jawne równanie, siatka i warunki brzegowe.',
  },
  {
    contractVersion: EXTERNAL_ADAPTER_CONTRACT_VERSION, id: 'einstein-toolkit-nr', title: 'Einstein Toolkit numerical-relativity adapter', status: 'ENGINE_NOT_AVAILABLE',
    domains: ['general-relativity', 'astrophysics'], backend: 'hpc-job',
    primaryDocumentation: 'https://einsteintoolkit.org/',
    inputSchema: ['thorn set', 'initial-data specification', 'mesh refinement policy', 'gauge conditions', 'time controls'],
    outputSchema: ['spacetime fields', 'constraint diagnostics', 'wave-extraction artifacts', 'checkpoints'],
    requiredProvenance: ['Einstein Toolkit release', 'thorn manifest', 'parameter file hash', 'hardware/runtime metadata', 'checkpoint hashes'],
    requiredRuntime: ['HPC job adapter', 'validated thorn set', 'resource quota', 'checkpoint storage'], route: { kind: 'none' },
    limitation: 'Nie jest solverem zastępczym dla analitycznego Schwarzschilda ani nie jest uruchomiony przez Genesis.',
  },
  {
    contractVersion: EXTERNAL_ADAPTER_CONTRACT_VERSION, id: 'openmc-radiation', title: 'OpenMC radiation / neutron transport adapter', status: 'ENGINE_NOT_AVAILABLE',
    domains: ['radiation-transport', 'nuclear'], backend: 'local-container',
    primaryDocumentation: 'https://docs.openmc.org/en/stable/',
    inputSchema: ['geometry', 'materials', 'cross-section library reference', 'source definition', 'tallies', 'run controls'],
    outputSchema: ['tallies', 'uncertainty estimates', 'particle transport diagnostics', 'statepoint artifacts'],
    requiredProvenance: ['OpenMC version', 'material definitions hash', 'cross-section dataset ID', 'geometry hash', 'random seed', 'statepoint hash'],
    requiredRuntime: ['approved container image', 'licensed or provenance-approved nuclear data', 'resource limits', 'artifact storage'], route: { kind: 'none' },
    limitation: 'Nie jest zainstalowany ani używany do obecnego dydaktycznego modelu jądrowego.',
  },
  {
    contractVersion: EXTERNAL_ADAPTER_CONTRACT_VERSION, id: 'quantum-schrodinger', title: 'Quantum Schrödinger solver adapter', status: 'ENGINE_NOT_AVAILABLE',
    domains: ['quantum'], backend: 'local-container',
    primaryDocumentation: 'https://github.com/Genesis-OS/adapter-contracts#quantum-schrodinger',
    inputSchema: ['Hamiltonian', 'basis or spatial grid', 'initial state', 'boundary conditions', 'time controls'],
    outputSchema: ['state amplitudes', 'probability density', 'conservation diagnostics', 'observables'],
    requiredProvenance: ['solver implementation and version', 'Hamiltonian hash', 'basis/grid hash', 'time integrator', 'tolerance'],
    requiredRuntime: ['validated quantum solver', 'numerical-stability policy', 'resource limits'], route: { kind: 'none' },
    limitation: 'Brak zarejestrowanego solvera tunelowania; istniejące wizualizacje kwantowe nie są wynikiem tego adaptera.',
  },
] as const;

const SPATIAL_IMPORTS: readonly SpatialImportManifest[] = [
  {
    contractVersion: EXTERNAL_ADAPTER_CONTRACT_VERSION, id: 'osm-overpass', title: 'OpenStreetMap / Overpass import', status: 'REQUIRES_VALIDATION',
    primaryDocumentation: 'https://dev.overpass-api.de/overpass-doc/en/preface/preface.html', sourceLicenseOrTerms: 'Wymaga utrwalenia licencji, atrybucji i timestampu źródła dla każdej paczki.',
    supportedLayers: ['buildings', 'roads', 'rail', 'water', 'boundaries'],
    requiredRequestFields: ['bbox', 'crs', 'sourceTimestamp', 'sourceQuery', 'license', 'attribution'], normalizedOutput: 'GenesisSpatialDataset@1.0.0',
    requiredProvenance: ['Overpass endpoint', 'query hash', 'OSM base timestamp', 'bbox', 'CRS', 'attribution', 'normalized artifact hash'],
    limitation: 'Minimalny importer oficjalnego OSM Map API pobiera ograniczony bbox i normalizuje drogi/budynki/wodę z pełnym provenance. Overpass, relacje, cache produkcyjny, walidacja geometrii i podłączenie do WorldAdapter wymagają osobnego etapu.',
  },
  {
    contractVersion: EXTERNAL_ADAPTER_CONTRACT_VERSION, id: 'usgs-national-map', title: 'USGS National Map / DEM import', status: 'NOT_CONFIGURED',
    primaryDocumentation: 'https://www.usgs.gov/the-national-map-data-delivery/gis-data-download', sourceLicenseOrTerms: 'Źródło regionalne; zakres, produkt i warunki muszą być zapisane per import.',
    supportedLayers: ['dem', 'terrain', 'water', 'roads', 'buildings', 'boundaries'],
    requiredRequestFields: ['bbox', 'crs', 'sourceTimestamp', 'sourceQuery', 'license', 'attribution'], normalizedOutput: 'GenesisSpatialDataset@1.0.0',
    requiredProvenance: ['dataset product ID', 'download URL', 'capture timestamp', 'bbox', 'CRS', 'vertical datum', 'artifact hash'],
    limitation: 'Nie pobiera danych i nie deklaruje globalnego zasięgu; adapter ma być włączany per legalnie zweryfikowane źródło.',
  },
] as const;

export function listExternalEngineAdapters(): readonly ExternalAdapterManifest[] { return ENGINE_ADAPTERS; }
export function getExternalEngineAdapter(id: string): ExternalAdapterManifest | undefined { return ENGINE_ADAPTERS.find((entry) => entry.id === id); }
export function listSpatialImportAdapters(): readonly SpatialImportManifest[] { return SPATIAL_IMPORTS; }
export function getSpatialImportAdapter(id: string): SpatialImportManifest | undefined { return SPATIAL_IMPORTS.find((entry) => entry.id === id); }
