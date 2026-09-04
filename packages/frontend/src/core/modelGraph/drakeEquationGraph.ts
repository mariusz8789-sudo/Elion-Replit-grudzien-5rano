import { ModelGraph } from './graph';

/**
 * Graf równania Drake'a (Priorytet 1: adopcja przez Civilization Lab).
 *
 * N = R⋆ · f_p · n_e · f_l · f_i · f_c · L. To NIE jest przewidywanie — to
 * RAMA POJĘCIOWA porządkująca niewiadome: kilka czynników jest bardzo słabo
 * ograniczonych obserwacyjnie (f_l, f_i, f_c, L), więc wynik rozciąga się o wiele
 * rzędów wielkości. Dlatego poziom uczciwości = 'theoretical', a derivation węzła
 * N = 'interpretive' (most/interpretacja, nie dokładne wyprowadzenie z danych).
 * Wartość edukacyjna: pokazuje, KTÓRE założenie najmocniej steruje wynikiem.
 */

export const BASELINE_STAR_FORMATION = 1.5; // gwiazd/rok (Droga Mleczna)
export const BASELINE_FP = 0.9;
export const BASELINE_NE = 0.2;
export const BASELINE_FL = 0.5;
export const BASELINE_FI = 0.1;
export const BASELINE_FC = 0.1;
export const BASELINE_LIFETIME_LOG10 = 4; // 10⁴ lat

const DOMAIN = 'astrobiologia (spekulacja)';

function param(id: string, label: string, unit: string, note: string, baseline: number) {
  return {
    def: {
      id, label, unit, domain: DOMAIN, honesty: 'theoretical' as const, honestyNote: note,
      derivation: 'direct' as const, inputs: [] as string[],
      compute: (i: Record<string, number>) => i[id] ?? baseline, formula: `${id} (parametr)`,
    },
    baseline,
  };
}

export function buildDrakeEquationGraph(): ModelGraph {
  const g = new ModelGraph();

  const params = [
    param('starFormationRate', 'Tempo powstawania gwiazd R⋆', 'gwiazd/rok', 'Względnie dobrze ograniczone obserwacyjnie dla Drogi Mlecznej.', BASELINE_STAR_FORMATION),
    param('fractionWithPlanets', 'Ułamek gwiazd z planetami f_p', '', 'Coraz lepiej znane dzięki misjom (Kepler/TESS) — bliskie 1.', BASELINE_FP),
    param('earthlikePerSystem', 'Planety w ekosferze n_e', '', 'Niepewne — zależy od definicji „w ekosferze".', BASELINE_NE),
    param('fractionDevelopingLife', 'Ułamek z życiem f_l', '', 'BARDZO słabo ograniczone — jedna znana próbka (Ziemia).', BASELINE_FL),
    param('fractionIntelligent', 'Ułamek z inteligencją f_i', '', 'Praktycznie nieznane — czysta spekulacja.', BASELINE_FI),
    param('fractionCommunicative', 'Ułamek komunikujących się f_c', '', 'Praktycznie nieznane — czysta spekulacja.', BASELINE_FC),
    param('lifetimeLog10Years', 'log₁₀ czasu życia cywilizacji L', 'log₁₀(lat)', 'Najbardziej sporny czynnik — rozpiętość wielu rzędów wielkości.', BASELINE_LIFETIME_LOG10),
  ];
  for (const p of params) g.addNode(p.def, p.baseline);

  g.addNode({
    id: 'civilizationCount', label: 'Liczba cywilizacji N (Droga Mleczna)', unit: '', domain: DOMAIN,
    honesty: 'theoretical',
    honestyNote: 'N = R⋆·f_p·n_e·f_l·f_i·f_c·L. RAMA POJĘCIOWA, nie przewidywanie: kilka czynników jest praktycznie nieznanych, więc N rozciąga się o wiele rzędów wielkości. Pokazuje, które założenie dominuje wynik — nie „ile jest cywilizacji".',
    derivation: 'interpretive',
    inputs: ['starFormationRate', 'fractionWithPlanets', 'earthlikePerSystem', 'fractionDevelopingLife', 'fractionIntelligent', 'fractionCommunicative', 'lifetimeLog10Years'],
    compute: (i) =>
      i.starFormationRate * i.fractionWithPlanets * i.earthlikePerSystem *
      i.fractionDevelopingLife * i.fractionIntelligent * i.fractionCommunicative *
      Math.pow(10, i.lifetimeLog10Years),
    formula: 'N = R⋆·f_p·n_e·f_l·f_i·f_c·L',
  });

  return g;
}
