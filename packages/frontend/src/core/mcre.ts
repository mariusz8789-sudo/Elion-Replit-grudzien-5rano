import { ModelGraph } from './modelGraph/graph';

/**
 * MCRE — Model Conflict Resolution Engine (Founder Directive, priorytet 2).
 *
 * Gdy dwa NAUKOWO UZASADNIONE modele przewidują różne wartości tej samej
 * wielkości, Genesis OS NIE wybiera po cichu wersji „wygodnej dla AI". Wykrywa
 * konflikt, pokazuje obie predykcje, ich założenia, dziedziny ważności i status,
 * a następnie wskazuje, KTÓRY POMIAR najlepiej rozstrzygnąłby spór. System musi
 * umieć powiedzieć: „NIE WIEMY OBECNIE, który model lepiej opisuje ten przypadek"
 * — to cecha, nie usterka.
 *
 * Pierwszy realny przypadek: współczynnik tarcia w rurze. Korelacje Swameego–Jaina
 * i Blasiusa są OBIE powszechnie stosowane, ale Blasius zakłada rurę GŁADKĄ
 * (ignoruje chropowatość), więc dla rur chropowatych rozjeżdżają się realnie.
 * To nie jest wymyślony konflikt — to znana granica stosowalności.
 */

const G = 9.81;

/** Swamee–Jain: jawne przybliżenie Colebrooka. Ważne 5000<Re<10⁸, 10⁻⁶<ε/D<10⁻². */
export function swameeJain(reynolds: number, relRoughness: number): number {
  if (reynolds < 2300) return 64 / Math.max(reynolds, 1e-6);
  const t = Math.log10(relRoughness / 3.7 + 5.74 / Math.pow(reynolds, 0.9));
  return 0.25 / (t * t);
}

/** Blasius: f = 0,316/Re^0,25. Ważne dla rur GŁADKICH, 4000<Re<10⁵. Ignoruje chropowatość. */
export function blasius(reynolds: number): number {
  if (reynolds < 2300) return 64 / Math.max(reynolds, 1e-6);
  return 0.316 / Math.pow(reynolds, 0.25);
}

export interface ConflictParamSpec {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}

export interface ModelVariant {
  id: string;
  label: string;
  graph: ModelGraph;
  assumptions: string;
  applicableDomain: string;
  /** Czy bieżący stan mieści się w dziedzinie ważności tego modelu. */
  inDomain: (g: ModelGraph) => boolean;
}

export interface ConflictOutputSpec {
  id: string;
  label: string;
  unit: string;
  format?: (v: number) => string;
}

export interface ModelConflict {
  title: string;
  headline: string;
  params: ConflictParamSpec[];
  variants: ModelVariant[];
  outputs: ConflictOutputSpec[];
  /** Pomiar, który realnie rozstrzygnąłby konflikt. */
  resolvingMeasurement: string;
  /** Próg względnego rozrzutu, powyżej którego uznajemy konflikt (np. 0,05 = 5%). */
  threshold: number;
}

export interface OutputComparison {
  id: string;
  label: string;
  unit: string;
  values: { variantId: string; value: number }[];
  /** (max−min)/|średnia|. */
  spread: number;
  divergent: boolean;
}

export interface ConflictResult {
  outputs: OutputComparison[];
  firstDivergentId: string | null;
  conflictDetected: boolean;
  /** Które warianty są w swojej dziedzinie ważności przy bieżących parametrach. */
  inDomain: Record<string, boolean>;
}

/**
 * Ocena konfliktu: stosuje TE SAME parametry do każdego wariantu, zbiera wyjścia,
 * liczy rozrzut i wskazuje PIERWSZĄ (w kolejności zależności) rozbieżną wielkość.
 */
export function evaluateConflict(conflict: ModelConflict, params: Record<string, number>): ConflictResult {
  for (const v of conflict.variants) v.graph.applyParameterSnapshot(params);

  const outputs: OutputComparison[] = conflict.outputs.map((o) => {
    const values = conflict.variants.map((v) => ({ variantId: v.id, value: v.graph.getValue(o.id) }));
    const nums = values.map((x) => x.value).filter((x) => Number.isFinite(x));
    const max = Math.max(...nums);
    const min = Math.min(...nums);
    const mean = nums.reduce((a, b) => a + b, 0) / (nums.length || 1);
    const spread = mean !== 0 ? (max - min) / Math.abs(mean) : 0;
    return { id: o.id, label: o.label, unit: o.unit, values, spread, divergent: spread > conflict.threshold };
  });

  const firstDivergent = outputs.find((o) => o.divergent) ?? null;
  const inDomain: Record<string, boolean> = {};
  for (const v of conflict.variants) inDomain[v.id] = v.inDomain(v.graph);

  return {
    outputs,
    firstDivergentId: firstDivergent?.id ?? null,
    conflictDetected: outputs.some((o) => o.divergent),
    inDomain,
  };
}

/** Wspólny graf przepływu w rurze; jedyna różnica między wariantami to wzór na współczynnik tarcia. */
function buildFlowGraph(frictionFn: (re: number, relRough: number) => number): ModelGraph {
  const g = new ModelGraph();
  const P = (id: string, label: string, unit: string, base: number) =>
    g.addNode({ id, label, unit, domain: 'przepływ w rurze', honesty: 'exact', honestyNote: `${label} — zadane.`, derivation: 'direct', inputs: [], compute: (i) => i[id] ?? base, formula: `${id}` }, base);
  P('volumetricFlow', 'Przepływ Q', 'm³/s', 0.05);
  P('pipeDiameter', 'Średnica D', 'm', 0.1);
  P('pipeLength', 'Długość L', 'm', 100);
  P('pipeRoughnessMm', 'Chropowatość ε', 'mm', 0.5);
  P('fluidDensity', 'Gęstość ρ', 'kg/m³', 998);
  P('fluidViscosity', 'Lepkość μ', 'Pa·s', 1.002e-3);

  g.addNode({ id: 'flowVelocity', label: 'Prędkość v', unit: 'm/s', domain: 'przepływ w rurze', honesty: 'exact', honestyNote: 'v=Q/A.', derivation: 'direct', inputs: ['volumetricFlow', 'pipeDiameter'], compute: (i) => i.volumetricFlow / (Math.PI * i.pipeDiameter * i.pipeDiameter / 4), formula: 'v=Q/A' });
  g.addNode({ id: 'reynolds', label: 'Reynolds Re', unit: '', domain: 'przepływ w rurze', honesty: 'exact', honestyNote: 'Re=ρvD/μ.', derivation: 'direct', inputs: ['fluidDensity', 'flowVelocity', 'pipeDiameter', 'fluidViscosity'], compute: (i) => (i.fluidDensity * i.flowVelocity * i.pipeDiameter) / i.fluidViscosity, formula: 'Re=ρvD/μ' });
  g.addNode({ id: 'frictionFactor', label: 'Współczynnik tarcia f', unit: '', domain: 'przepływ w rurze', honesty: 'simplified', honestyNote: 'Korelacja empiryczna — patrz założenia wariantu.', derivation: 'approximate', inputs: ['reynolds', 'pipeRoughnessMm', 'pipeDiameter'], compute: (i) => frictionFn(i.reynolds, (i.pipeRoughnessMm / 1000) / i.pipeDiameter), formula: 'f = korelacja(Re, ε/D)' });
  g.addNode({ id: 'headLoss', label: 'Strata ciśnienia h_f', unit: 'm', domain: 'przepływ w rurze', honesty: 'exact', honestyNote: 'Darcy–Weisbach h_f=f(L/D)v²/2g.', derivation: 'direct', inputs: ['frictionFactor', 'pipeLength', 'pipeDiameter', 'flowVelocity'], compute: (i) => i.frictionFactor * (i.pipeLength / i.pipeDiameter) * (i.flowVelocity * i.flowVelocity / (2 * G)), formula: 'h_f=f(L/D)v²/2g' });
  return g;
}

export function buildFrictionConflict(): ModelConflict {
  const sj = buildFlowGraph(swameeJain);
  const bl = buildFlowGraph(blasius);
  return {
    title: 'Konflikt modeli: współczynnik tarcia w rurze',
    headline: 'Ta sama rura, dwie uznane korelacje tarcia (Swamee–Jain vs Blasius) — gdzie i dlaczego się rozjeżdżają?',
    threshold: 0.05,
    params: [
      { id: 'volumetricFlow', label: 'Przepływ Q', unit: 'm³/s', min: 0.005, max: 0.2, step: 0.005, format: (v) => v.toFixed(3) },
      { id: 'pipeDiameter', label: 'Średnica D', unit: 'm', min: 0.05, max: 0.3, step: 0.005, format: (v) => v.toFixed(3) },
      { id: 'pipeRoughnessMm', label: 'Chropowatość ε', unit: 'mm', min: 0.001, max: 3, step: 0.01, format: (v) => v.toFixed(2) },
    ],
    variants: [
      {
        id: 'swamee-jain', label: 'Swamee–Jain', graph: sj,
        assumptions: 'Uwzględnia chropowatość (ε/D). Jawne przybliżenie równania Colebrooka–White\'a.',
        applicableDomain: 'Turbulentny, 5000 < Re < 10⁸, 10⁻⁶ < ε/D < 10⁻².',
        inDomain: (g) => { const re = g.getValue('reynolds'); return re > 5000 && re < 1e8; },
      },
      {
        id: 'blasius', label: 'Blasius', graph: bl,
        assumptions: 'Zakłada rurę GŁADKĄ — IGNORUJE chropowatość. f=0,316/Re^0,25.',
        applicableDomain: 'Rura gładka, 4000 < Re < 10⁵.',
        inDomain: (g) => { const re = g.getValue('reynolds'); return re > 4000 && re < 1e5; },
      },
    ],
    outputs: [
      { id: 'reynolds', label: 'Reynolds Re', unit: '', format: (v) => v.toExponential(2) },
      { id: 'frictionFactor', label: 'Współczynnik tarcia f', unit: '', format: (v) => v.toFixed(4) },
      { id: 'headLoss', label: 'Strata ciśnienia h_f', unit: 'm', format: (v) => v.toFixed(2) },
    ],
    resolvingMeasurement:
      'Zmierz rzeczywisty SPADEK CIŚNIENIA na odcinku rury (→ rzeczywiste f) LUB chropowatość ε metodą profilometryczną. Dla rury chropowatej Blasius systematycznie zaniża stratę, bo pomija ε; pomiar spadku ciśnienia rozstrzyga, który model pasuje do TEJ rury.',
  };
}
