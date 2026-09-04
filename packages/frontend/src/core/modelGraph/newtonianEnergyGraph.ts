import { ModelGraph } from './graph';
import { BASELINE_BETA, BASELINE_REST_MASS_MEV } from './relativisticEnergyGraph';

/**
 * NEWTONIAN (CLASSICAL) KINETIC ENERGY — Model A in the Counterfactual Model
 * Tournament (`experimentFabric/modelVsModelCompare.ts`) that answers "where
 * do the classical and relativistic models of kinetic energy disagree?"
 * against `particle-relativistic-energy` (Model B, `relativisticEnergyGraph.ts`,
 * unchanged).
 *
 * Deliberately shares the SAME input node ids (`restMassMeV`,
 * `velocityFraction`) and the SAME output node id (`kineticEnergyMeV`) as the
 * relativistic graph, so the two models are directly, honestly comparable on
 * one observable without a metric-name mapping layer.
 *
 * E_kin_classical = ½mβ² (in these natural units — m in MeV/c², β = v/c
 * dimensionless — this is exactly the standard ½mv² with c folded into the
 * unit choice, i.e. the leading term of a Taylor expansion of the exact
 * relativistic E_kin = (γ−1)mc² around β=0). No new physics, no fitted
 * constant: this is the textbook low-velocity limit, computed exactly as
 * classical mechanics defines it — never as an approximation of the
 * relativistic graph's own output.
 */
export function buildNewtonianEnergyGraph(): ModelGraph {
  const g = new ModelGraph();

  g.addNode(
    { id: 'restMassMeV', label: 'Masa m', unit: 'MeV/c²', domain: 'mechanika klasyczna',
      honesty: 'exact', honestyNote: 'Masa cząstki — zadana, ta sama wielkość co w modelu relatywistycznym.', derivation: 'direct',
      inputs: [], compute: (i) => i.restMassMeV ?? BASELINE_REST_MASS_MEV, formula: 'm (parametr)' },
    BASELINE_REST_MASS_MEV,
  );
  g.addNode(
    { id: 'velocityFraction', label: 'Prędkość β = v/c', unit: '', domain: 'mechanika klasyczna',
      honesty: 'exact', honestyNote: 'Prędkość jako ułamek c — ta sama wielkość co w modelu relatywistycznym.', derivation: 'direct',
      inputs: [], compute: (i) => i.velocityFraction ?? BASELINE_BETA, formula: 'β (parametr)' },
    BASELINE_BETA,
  );
  g.addNode({
    id: 'kineticEnergyMeV', label: 'Energia kinetyczna E_kin (klasyczna)', unit: 'MeV', domain: 'mechanika klasyczna',
    honesty: 'exact', honestyNote: 'E_kin = ½mβ² — dokładna klasyczna (nierelatywistyczna) energia kinetyczna. Jest to znany wzór szkoły newtonowskiej, poprawny wyłącznie w granicy β≪1; TO JEST INNY MODEL niż relatywistyczny, nie jego przybliżenie liczone tu na nowo.',
    derivation: 'approximate', inputs: ['restMassMeV', 'velocityFraction'],
    compute: (i) => 0.5 * i.restMassMeV * i.velocityFraction * i.velocityFraction,
    formula: 'E_kin = ½mβ²',
  });

  return g;
}
