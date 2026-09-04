import { ModelGraph } from './graph';
import { lorentzGamma } from '../physics';

/**
 * Particle Lab × Graf Modeli — relatywistyczna energia i pęd cząstki
 * (Priorytet 1). Łączy mechanikę (masa, pęd) ze szczególną teorią względności
 * (γ) realnymi krawędziami obliczeniowymi. Wszystko DOKŁADNE w ramach STW dla
 * cząstki swobodnej: E = γmc², E_kin = (γ−1)mc², p = γmβc.
 * Masy w MeV/c², energie w MeV, pęd w MeV/c (jednostki naturalne fizyki cząstek).
 */

export const BASELINE_REST_MASS_MEV = 0.511; // elektron
export const BASELINE_BETA = 0.9;

export function buildRelativisticEnergyGraph(): ModelGraph {
  const g = new ModelGraph();

  g.addNode(
    { id: 'restMassMeV', label: 'Masa spoczynkowa m', unit: 'MeV/c²', domain: 'mechanika relatywistyczna',
      honesty: 'exact', honestyNote: 'Masa spoczynkowa cząstki (elektron 0,511; proton 938,3) — zadana.', derivation: 'direct',
      inputs: [], compute: (i) => i.restMassMeV ?? BASELINE_REST_MASS_MEV, formula: 'm (parametr)' },
    BASELINE_REST_MASS_MEV,
  );
  g.addNode(
    { id: 'velocityFraction', label: 'Prędkość β = v/c', unit: '', domain: 'szczególna teoria względności',
      honesty: 'exact', honestyNote: 'Prędkość cząstki jako ułamek c. Ważne 0 ≤ β < 1.', derivation: 'direct',
      inputs: [], compute: (i) => i.velocityFraction ?? BASELINE_BETA, formula: 'β (parametr)' },
    BASELINE_BETA,
  );

  g.addNode({
    id: 'lorentzGammaFactor', label: 'Czynnik Lorentza γ', unit: '', domain: 'szczególna teoria względności',
    honesty: 'exact', honestyNote: 'γ = 1/√(1−β²). Dokładne; rośnie nieograniczenie przy β→1.',
    derivation: 'direct', inputs: ['velocityFraction'], compute: (i) => lorentzGamma(i.velocityFraction),
    formula: 'γ = 1/√(1−β²)',
  });
  g.addNode({
    id: 'totalEnergyMeV', label: 'Energia całkowita E', unit: 'MeV', domain: 'mechanika relatywistyczna',
    honesty: 'exact', honestyNote: 'E = γmc² — łączy masę (mechanika) z γ (STW). Dokładne dla cząstki swobodnej.',
    derivation: 'direct', inputs: ['lorentzGammaFactor', 'restMassMeV'], compute: (i) => i.lorentzGammaFactor * i.restMassMeV,
    formula: 'E = γmc²',
  });
  g.addNode({
    id: 'kineticEnergyMeV', label: 'Energia kinetyczna E_kin', unit: 'MeV', domain: 'mechanika relatywistyczna',
    honesty: 'exact', honestyNote: 'E_kin = (γ−1)mc² — dokładna relatywistyczna energia kinetyczna. Dla β≪1 dąży do ½mv².',
    derivation: 'direct', inputs: ['lorentzGammaFactor', 'restMassMeV'], compute: (i) => (i.lorentzGammaFactor - 1) * i.restMassMeV,
    formula: 'E_kin = (γ−1)mc²',
  });
  g.addNode({
    id: 'momentumMeVc', label: 'Pęd p', unit: 'MeV/c', domain: 'mechanika relatywistyczna',
    honesty: 'exact', honestyNote: 'p = γmβc — relatywistyczny pęd. Dokładne.',
    derivation: 'direct', inputs: ['lorentzGammaFactor', 'restMassMeV', 'velocityFraction'],
    compute: (i) => i.lorentzGammaFactor * i.restMassMeV * i.velocityFraction,
    formula: 'p = γmβc',
  });

  return g;
}
