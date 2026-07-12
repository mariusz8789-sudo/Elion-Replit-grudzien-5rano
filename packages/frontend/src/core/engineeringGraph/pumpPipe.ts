import { ModelGraph } from '../modelGraph/graph';
import { EngineeringModel } from './EngineeringModel';
import type { Provenance } from './provenance';

/**
 * Pierwszy demonstrator inżynierski (Faza 1): układ POMPA–RUROCIĄG (pompowanie
 * cieczy przez rurę na wysokość statyczną). Wybrany świadomie, bo cała fizyka
 * jest zamkniętoformułowa i podręcznikowa, a wrażliwość jest spektakularna
 * (strata ciśnienia ∝ D⁻⁵ — zmiana średnicy rury dominuje wynik), co idealnie
 * demonstruje sens rankingu wrażliwości i rekomendacji pomiarowych.
 *
 * ŁAŃCUCH PRZYCZYNOWY (7 parametrów → 7 wielkości pochodnych):
 *   Q, D                → flowVelocity  v = Q/(πD²/4)                [dokładne]
 *   ρ, v, D, μ          → reynolds      Re = ρvD/μ                    [dokładne]
 *   Re, ε, D            → frictionFactor f = Swamee–Jain(Re, ε/D)     [MODEL EMPIRYCZNY]
 *   f, L, D, v          → headLoss      h_f = f(L/D)(v²/2g)           [dokładne z f]
 *   h_f, H_static       → totalHead     H = H_static + h_f            [dokładne]
 *   ρ, Q, H             → hydraulicPower P_h = ρgQH                   [dokładne]
 *   P_h, η              → shaftPower     P_s = P_h/η                  [dokładne]
 *
 * ŹRÓDŁA RÓWNAŃ (wszystkie standardowe, cytowane — żadne nie jest „wymyślone przez AI"):
 *  - Darcy–Weisbach: h_f = f·(L/D)·v²/(2g) — Munson/White, mechanika płynów.
 *  - Swamee–Jain (1976): f = 0,25 / [log₁₀(ε/(3,7D) + 5,74/Re⁰·⁹)]²,
 *    jawne przybliżenie równania Colebrooka–White'a, ważne dla 5000<Re<10⁸,
 *    10⁻⁶<ε/D<10⁻². To MODEL EMPIRYCZNY (korelacja dopasowana do danych),
 *    stąd prowieniencja modelu 'empirical-model'.
 *  - Reynolds Re = ρvD/μ; moc hydrauliczna P = ρgQH — definicje/wyprowadzenia dokładne.
 *  - Przepływ laminarny (Re<2300): f = 64/Re (dokładne, Hagen–Poiseuille).
 *
 * PROWIENIENCJA PARAMETRÓW (domyślny scenariusz „stalowa rura, woda"):
 *  - Q, D, L, H_static: podane przez użytkownika (projekt).
 *  - ρ, μ: dane producenta / tablicowe (woda 20°C).
 *  - ε (chropowatość): DANE PRODUCENTA/TABLICOWE dla NOWEJ stali handlowej.
 *    Dla rury starej/skorodowanej degraduje się do „wymaga walidacji fizycznej"
 *    (pomiar in situ) — mechanizm degradacji prowieniencji pokazuje η poniżej.
 *  - η (sprawność pompy): OSZACOWANIE INŻYNIERSKIE — z krzywej pompy, ale
 *    punkt pracy przesuwa η; bez pomiaru to szacunek. To celowo pokazuje, jak
 *    słabo wsparty, silnie sterujący parametr wywołuje rekomendację pomiarową.
 */

const G = 9.81;

/** Współczynnik tarcia Darcy'ego: Swamee–Jain dla turbulentnego, 64/Re dla laminarnego. */
export function frictionFactor(reynolds: number, relativeRoughness: number): number {
  if (reynolds < 2300) return 64 / Math.max(reynolds, 1e-6);
  const t = Math.log10(relativeRoughness / 3.7 + 5.74 / Math.pow(reynolds, 0.9));
  return 0.25 / (t * t);
}

export interface PumpPipeDefaults {
  volumetricFlow: number; // m³/s
  pipeDiameter: number; // m
  pipeLength: number; // m
  pipeRoughnessMm: number; // mm
  staticLift: number; // m
  fluidDensity: number; // kg/m³
  fluidViscosity: number; // Pa·s
  pumpEfficiency: number; // -
}

export const PUMP_PIPE_DEFAULTS: PumpPipeDefaults = {
  volumetricFlow: 0.05,
  pipeDiameter: 0.1,
  pipeLength: 100,
  pipeRoughnessMm: 0.045, // stal handlowa
  staticLift: 10,
  fluidDensity: 998,
  fluidViscosity: 1.002e-3,
  pumpEfficiency: 0.7,
};

function param(id: string, label: string, unit: string, note: string, value: number) {
  return {
    id, label, unit, domain: 'układ pompa–rurociąg', honesty: 'exact' as const,
    honestyNote: note, derivation: 'direct' as const, inputs: [] as string[],
    compute: (i: Record<string, number>) => i[id] ?? value, formula: `${id} (parametr)`, _init: value,
  };
}

export function buildPumpPipeModel(defaults: PumpPipeDefaults = PUMP_PIPE_DEFAULTS): EngineeringModel {
  const g = new ModelGraph();

  const params = [
    param('volumetricFlow', 'Natężenie przepływu Q', 'm³/s', 'Wydatek zadany przez projekt.', defaults.volumetricFlow),
    param('pipeDiameter', 'Średnica rury D', 'm', 'Wymiar zadany przez projekt.', defaults.pipeDiameter),
    param('pipeLength', 'Długość rury L', 'm', 'Wymiar zadany przez projekt.', defaults.pipeLength),
    param('pipeRoughness', 'Chropowatość ε', 'mm', 'Nowa stal handlowa — wartość tablicowa/producenta. UWAGA: dla rury starej/skorodowanej degraduje się do „wymaga walidacji fizycznej" (pomiar in situ).', defaults.pipeRoughnessMm),
    param('staticLift', 'Wysokość podnoszenia H_stat', 'm', 'Różnica poziomów — zadana przez projekt.', defaults.staticLift),
    param('fluidDensity', 'Gęstość cieczy ρ', 'kg/m³', 'Woda ~20°C, tablicowa.', defaults.fluidDensity),
    param('fluidViscosity', 'Lepkość dynamiczna μ', 'Pa·s', 'Woda ~20°C, tablicowa.', defaults.fluidViscosity),
    param('pumpEfficiency', 'Sprawność pompy η', '-', 'Z krzywej pompy; zależy od punktu pracy — bez pomiaru to szacunek.', defaults.pumpEfficiency),
  ];
  for (const p of params) {
    const { _init, ...def } = p;
    g.addNode(def, _init);
  }

  g.addNode({
    id: 'flowVelocity', label: 'Prędkość przepływu v', unit: 'm/s', domain: 'układ pompa–rurociąg',
    honesty: 'exact', honestyNote: 'v = Q/A, A=πD²/4 — dokładna definicja przepływu przez przekrój.',
    derivation: 'direct', inputs: ['volumetricFlow', 'pipeDiameter'],
    compute: (i) => i.volumetricFlow / (Math.PI * i.pipeDiameter * i.pipeDiameter / 4),
    formula: 'v = Q / (πD²/4)',
  });

  g.addNode({
    id: 'reynolds', label: 'Liczba Reynoldsa Re', unit: '-', domain: 'układ pompa–rurociąg',
    honesty: 'exact', honestyNote: 'Re = ρvD/μ — bezwymiarowa, rozstrzyga laminarny/turbulentny przepływ.',
    derivation: 'direct', inputs: ['fluidDensity', 'flowVelocity', 'pipeDiameter', 'fluidViscosity'],
    compute: (i) => (i.fluidDensity * i.flowVelocity * i.pipeDiameter) / i.fluidViscosity,
    formula: 'Re = ρvD/μ',
  });

  g.addNode({
    id: 'frictionFactor', label: 'Współczynnik tarcia f', unit: '-', domain: 'układ pompa–rurociąg',
    honesty: 'simplified',
    honestyNote: 'Swamee–Jain (1976) — jawne PRZYBLIŻENIE EMPIRYCZNE równania Colebrooka–White\'a, ważne dla 5000<Re<10⁸. Dla Re<2300 przełącza na dokładne f=64/Re. To korelacja dopasowana do danych, nie wyprowadzenie — stąd prowieniencja modelu „empirical-model".',
    derivation: 'approximate', inputs: ['reynolds', 'pipeRoughness', 'pipeDiameter'],
    compute: (i) => frictionFactor(i.reynolds, (i.pipeRoughness / 1000) / i.pipeDiameter),
    formula: 'f = 0,25 / [log₁₀(ε/(3,7D) + 5,74/Re⁰·⁹)]²',
  });

  g.addNode({
    id: 'headLoss', label: 'Strata ciśnienia (wys. słupa) h_f', unit: 'm', domain: 'układ pompa–rurociąg',
    honesty: 'exact',
    honestyNote: 'Darcy–Weisbach: h_f = f·(L/D)·v²/(2g). Dokładne PRZY danym f — ale f pochodzi z modelu empirycznego, więc efektywna prowieniencja h_f jest ograniczona do „empirical-model" (patrz propagacja). Silnie zależne od D (∝ D⁻⁵).',
    derivation: 'direct', inputs: ['frictionFactor', 'pipeLength', 'pipeDiameter', 'flowVelocity'],
    compute: (i) => i.frictionFactor * (i.pipeLength / i.pipeDiameter) * (i.flowVelocity * i.flowVelocity / (2 * G)),
    formula: 'h_f = f·(L/D)·v²/(2g)',
  });

  g.addNode({
    id: 'totalHead', label: 'Całkowita wysokość podnoszenia H', unit: 'm', domain: 'układ pompa–rurociąg',
    honesty: 'exact', honestyNote: 'H = H_stat + h_f — wysokość statyczna plus strata tarcia. Dokładna suma.',
    derivation: 'direct', inputs: ['staticLift', 'headLoss'],
    compute: (i) => i.staticLift + i.headLoss,
    formula: 'H = H_stat + h_f',
  });

  g.addNode({
    id: 'hydraulicPower', label: 'Moc hydrauliczna P_h', unit: 'W', domain: 'układ pompa–rurociąg',
    honesty: 'exact', honestyNote: 'P_h = ρgQH — moc przekazana cieczy. Dokładna definicja.',
    derivation: 'direct', inputs: ['fluidDensity', 'volumetricFlow', 'totalHead'],
    compute: (i) => i.fluidDensity * G * i.volumetricFlow * i.totalHead,
    formula: 'P_h = ρgQH',
  });

  g.addNode({
    id: 'shaftPower', label: 'Moc na wale P_wał', unit: 'W', domain: 'układ pompa–rurociąg',
    honesty: 'exact', honestyNote: 'P_wał = P_h/η — moc, którą musi dostarczyć silnik. Dokładny iloraz, ale η jest oszacowaniem, więc wynik dziedziczy tę niepewność.',
    derivation: 'direct', inputs: ['hydraulicPower', 'pumpEfficiency'],
    compute: (i) => i.hydraulicPower / i.pumpEfficiency,
    formula: 'P_wał = P_h / η',
  });

  const parameterProvenance: Record<string, Provenance> = {
    volumetricFlow: 'user-provided',
    pipeDiameter: 'user-provided',
    pipeLength: 'user-provided',
    staticLift: 'user-provided',
    fluidDensity: 'manufacturer',
    fluidViscosity: 'manufacturer',
    // Nowa stal handlowa: wartość tablicowa (manufacturer). Dla rury starej/skorodowanej
    // ten parametr degraduje się do 'requires-validation' — patrz honestyNote.
    pipeRoughness: 'manufacturer',
    pumpEfficiency: 'engineering-estimate',
  };
  const modelProvenance: Record<string, Provenance> = {
    flowVelocity: 'calculated',
    reynolds: 'calculated',
    frictionFactor: 'empirical-model',
    headLoss: 'calculated',
    totalHead: 'calculated',
    hydraulicPower: 'calculated',
    shaftPower: 'calculated',
  };

  return new EngineeringModel(g, {
    provenance: { parameterProvenance, modelProvenance },
    valueKind: {}, // wszystkie skalary w Fazie 1
  });
}

/** Kolejność komponentów maszyny w scenie (od źródła do wyjścia) — do wizualizacji przestrzennej i fali przyczynowej. */
export const PUMP_PIPE_COMPONENTS = ['reservoir', 'pump', 'pipe', 'outlet'] as const;

/** Mapuje węzeł grafu na komponent maszyny, przy którym powinien „zapalić się" podczas fali przyczynowej. */
export const NODE_TO_COMPONENT: Record<string, (typeof PUMP_PIPE_COMPONENTS)[number]> = {
  volumetricFlow: 'reservoir',
  staticLift: 'reservoir',
  fluidDensity: 'reservoir',
  fluidViscosity: 'reservoir',
  pumpEfficiency: 'pump',
  hydraulicPower: 'pump',
  shaftPower: 'pump',
  pipeDiameter: 'pipe',
  pipeLength: 'pipe',
  pipeRoughness: 'pipe',
  flowVelocity: 'pipe',
  reynolds: 'pipe',
  frictionFactor: 'pipe',
  headLoss: 'pipe',
  totalHead: 'outlet',
};
