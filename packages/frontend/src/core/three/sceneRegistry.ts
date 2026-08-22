import type { Sim3D } from './types';

/**
 * GENESIS SCENE REGISTRY — jedna lista wymienialnych światów dla tej samej
 * powłoki UI (`components/genesis/SceneStage.tsx`).
 *
 * Cel architektoniczny: podmiana sceny Epidemic City → City → Lake → River →
 * Factory → Ecosystem → Laboratory NIE może wymagać przebudowy interfejsu.
 * Każdy świat to po prostu `Sim3D` montowany przez wspólny `useThreeLoop`.
 *
 * UCZCIWOŚĆ: rejestr deklaruje TYLKO to, co istnieje. Świat bez realnego
 * modelu ma `status: 'PLANNED'` i **nie ma** `create()` — nie da się go
 * uruchomić, więc nie może udawać symulacji. To ta sama zasada, co
 * `ENGINE_NOT_AVAILABLE` w Experiment Fabric: brak silnika jest jawny,
 * nie zastępowany atrapą.
 */

export type SceneStatus = 'AVAILABLE' | 'PLANNED';

export interface GenesisSceneDescriptor {
  id: string;
  label: string;
  /** Krótki opis domeny świata — pokazywany w przełączniku scen. */
  summary: string;
  status: SceneStatus;
  /** Trasa istniejącego ekranu tej sceny (gdy AVAILABLE). */
  hash?: string;
  /** Fabryka świata — obecna WYŁĄCZNIE dla scen o statusie AVAILABLE. */
  create?: () => Sim3D;
  /** Czego brakuje, żeby scena stała się dostępna (gdy PLANNED). */
  requires?: string;
}

const SCENES: readonly GenesisSceneDescriptor[] = [
  {
    id: 'epidemic-city',
    label: 'Epidemic City',
    summary: 'Agentowy model epidemii w małym mieście — realny EpidemicCitySimulation.',
    status: 'AVAILABLE',
    hash: '#/city3d',
  },
  {
    id: 'high-fidelity-street',
    label: 'Street Slice',
    summary: 'Kwartał ulicy w wysokiej wierności — ci sami agenci, bliższa kamera.',
    status: 'AVAILABLE',
    hash: '#/hf-slice',
  },
  { id: 'city', label: 'City', summary: 'Pełna skala miasta: transport, infrastruktura, zabudowa.', status: 'PLANNED', requires: 'Model miejski (transport/infrastruktura) + dane GIS z licencją.' },
  { id: 'lake', label: 'Lake', summary: 'Zbiornik wodny: termika, tlen, eutrofizacja.', status: 'PLANNED', requires: 'Zwalidowany model limnologiczny + dane batymetryczne.' },
  { id: 'river', label: 'River', summary: 'Przepływ i transport zanieczyszczeń w rzece.', status: 'PLANNED', requires: 'Solver hydrauliczny 1D/2D + dane przekrojów koryta.' },
  { id: 'factory', label: 'Factory', summary: 'Proces produkcyjny, przepływ materiału, wąskie gardła.', status: 'PLANNED', requires: 'Model kolejkowy / discrete-event + dane linii produkcyjnej.' },
  { id: 'ecosystem', label: 'Ecosystem', summary: 'Populacje, drapieżnictwo, sieci troficzne.', status: 'PLANNED', requires: 'Zwalidowany model populacyjny + parametry gatunków.' },
  { id: 'laboratory', label: 'Laboratory', summary: 'Scena laboratoryjna dla eksperymentów molekularnych.', status: 'PLANNED', requires: 'Wiązanie na realne silniki (RDKit/PySCF/OpenMM) w warstwie sceny.' },
];

export function listGenesisScenes(): readonly GenesisSceneDescriptor[] {
  return SCENES;
}

export function getGenesisScene(id: string): GenesisSceneDescriptor | undefined {
  return SCENES.find((scene) => scene.id === id);
}

export function availableGenesisScenes(): readonly GenesisSceneDescriptor[] {
  return SCENES.filter((scene) => scene.status === 'AVAILABLE');
}
