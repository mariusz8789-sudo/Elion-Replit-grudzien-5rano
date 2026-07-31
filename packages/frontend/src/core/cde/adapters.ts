import { buildAtmosphericEscapeGraph } from '../modelGraph/atmosphericEscapeGraph';
import { buildNuclearModelGraph } from '../modelGraph/nuclearGraph';
import type { DomainAdapter } from './passport';

/**
 * Rejestr adapterów dziedziny CDE (Milestone 3). Każdy adapter REUŻYWA istniejący,
 * przetestowany builder Grafu Modeli i tylko dokłada KRYTERIA AKCEPTACJI — zero
 * nowej fizyki, zero duplikatów. To pokazuje ogólność silnika: dowolny graf
 * modeli może stać się dziedziną odkrycia (kandydaci → paszporty).
 *
 * Kryteria są JAWNE i konserwatywne — CDE nie ogłasza „odkrycia", mówi tylko
 * „ten kandydat spełnia podane progi w ramach ważności modelu".
 */

/**
 * Habitowalność termiczna: reużywa flagowy graf ucieczki atmosfery. Szukamy
 * planet, które (a) mieszczą się w umiarkowanym pasie temperatur i (b) utrzymują
 * atmosferę wg kryterium Jeansa (λ ≥ 15 — powszechny próg „bezpiecznego"
 * zatrzymania gazu w skali miliardów lat).
 */
const atmosphericHabitability: DomainAdapter = {
  id: 'atmospheric-habitability',
  label: 'Habitowalność termiczna planety',
  description:
    'Kandydat = zestaw parametrów gwiazdy i planety. Kryteria: temperatura równowagowa w pasie 200–330 K oraz parametr Jeansa λ ≥ 15 (utrzymanie atmosfery). Model uproszczony (ucieczka termiczna Jeansa) — pomija efekt cieplarniany, ucieczkę hydrodynamiczną i wiatr gwiazdowy.',
  honesty: 'simplified',
  honestyNote:
    'Wszystko liczy wykonywalny Graf Modeli ucieczki atmosfery. Wielkości grawitacyjne i termiczne dokładne; temperatura równowagowa i kryterium ucieczki przybliżone. „Spełnia kryteria" ≠ „planeta zamieszkiwalna" — to konieczny, nie wystarczający warunek w ramach tego modelu.',
  buildGraph: buildAtmosphericEscapeGraph,
  params: [
    { id: 'stellarLuminositySolar', min: 0.01, max: 100, step: 0.01, format: (v) => v.toFixed(2) },
    { id: 'orbitalDistanceAu', min: 0.05, max: 30, step: 0.05, format: (v) => v.toFixed(2) },
    { id: 'planetAlbedo', min: 0, max: 0.9, step: 0.01 },
    { id: 'planetMassEarth', min: 0.01, max: 300, step: 0.01, format: (v) => v.toFixed(2) },
    { id: 'planetRadiusEarth', min: 0.1, max: 12, step: 0.1 },
    { id: 'moleculeMassAmu', min: 1, max: 50, step: 1 },
  ],
  outputs: [
    { id: 'equilibriumTempK', format: (v) => v.toFixed(0) },
    { id: 'escapeVelocityMs', format: (v) => (v / 1000).toFixed(2) + ' km/s' },
    { id: 'thermalVelocityMs', format: (v) => (v / 1000).toFixed(3) + ' km/s' },
    { id: 'jeansParameter', format: (v) => (v >= 1e4 ? v.toExponential(2) : v.toFixed(1)) },
  ],
  criteria: [
    { outputId: 'equilibriumTempK', label: 'Temperatura równowagowa', op: 'between', value: 200, value2: 330, unit: 'K' },
    { outputId: 'jeansParameter', label: 'Parametr Jeansa (utrzymanie atmosfery)', op: 'gte', value: 15, unit: '' },
  ],
};

/**
 * Stabilność nuklidu: reużywa graf SEMF. Szukamy nuklidów o wysokiej energii
 * wiązania na nukleon (mocno związane) i płaskim gradiencie stabilności (blisko
 * ścieżki stabilności β). Kryteria semi-empiryczne — to model kroplowy, nie
 * pełna struktura powłokowa.
 */
const nuclearStability: DomainAdapter = {
  id: 'nuclear-stability',
  label: 'Stabilność nuklidu (SEMF)',
  description:
    'Kandydat = liczba protonów Z i neutronów N. Kryteria: energia wiązania na nukleon ≥ 8,4 MeV (mocne wiązanie) oraz |gradient stabilności| ≤ 0,5 MeV (blisko doliny stabilności). Model półempiryczny (kroplowy) — bez efektów powłokowych i liczb magicznych.',
  honesty: 'simplified',
  honestyNote:
    'Wszystko liczy wykonywalny graf SEMF (semi-empiryczny wzór masowy). Trend energii wiązania jest solidny; SEMF nie oddaje efektów powłokowych — „spełnia kryteria" to sygnał kroplowy, nie ostateczny werdykt o stabilności.',
  buildGraph: buildNuclearModelGraph,
  params: [
    { id: 'protonNumber', min: 1, max: 118, step: 1 },
    { id: 'neutronNumber', min: 0, max: 180, step: 1 },
  ],
  outputs: [
    { id: 'bindingPerNucleon', format: (v) => v.toFixed(3) + ' MeV' },
    { id: 'stabilityGradient', format: (v) => v.toFixed(3) + ' MeV' },
    { id: 'massNumber', format: (v) => String(Math.round(v)) },
  ],
  criteria: [
    { outputId: 'bindingPerNucleon', label: 'Energia wiązania na nukleon', op: 'gte', value: 8.4, unit: 'MeV' },
    { outputId: 'stabilityGradient', label: '|Gradient stabilności| (blisko doliny)', op: 'between', value: -0.5, value2: 0.5, unit: 'MeV' },
  ],
};

export const CDE_ADAPTERS: DomainAdapter[] = [atmosphericHabitability, nuclearStability];

export function getAdapter(id: string): DomainAdapter | undefined {
  return CDE_ADAPTERS.find((a) => a.id === id);
}
