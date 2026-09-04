import type { ScientificEvidenceChain } from './scientificDiscovery';

export interface WhyNextExperimentAdvice {
  assessment: ScientificEvidenceChain['assessment']['assessment'];
  why: string;
  evidenceBasis: readonly string[];
  limitations: readonly string[];
  nextExperiment: {
    action: string;
    parameter: string;
    rationale: string;
    autoRun: false;
  };
}

function changedParameter(chain: ScientificEvidenceChain): string {
  const baseline = chain.design.arms.find((arm) => arm.kind === 'baseline')?.request.parameters ?? {};
  const variant = chain.design.arms.find((arm) => arm.kind === 'variant')?.request.parameters ?? {};
  const key = Object.keys({ ...baseline, ...variant }).find((candidate) => baseline[candidate] !== variant[candidate]);
  return key ?? 'UNRESOLVED_PARAMETER';
}

export function explainScientificEvidence(chain: ScientificEvidenceChain): WhyNextExperimentAdvice {
  const assessment = chain.assessment.assessment;
  const parameter = changedParameter(chain);
  const completedArms = chain.arms.filter((arm) => arm.reproduction === 'MATCH').length;
  const basis = [
    `assessment=${assessment}`,
    `arms=${chain.arms.length}`,
    `completedWithMATCH=${completedArms}`,
    `runs=${chain.allRuns.length}`,
    `primaryMetric=${chain.design.primaryMetric}`,
  ];
  const why = assessment === 'SUPPORTED_WITHIN_PROTOCOL'
    ? 'Wyniki były zgodne z prerejestrowanym kryterium w granicach tego modelu i tych armów.'
    : assessment === 'FALSIFIED_WITHIN_PROTOCOL'
      ? 'Wyniki nie były zgodne z prerejestrowanym kryterium w granicach tego modelu i tych armów.'
      : 'Nie ma wystarczającego, powtarzalnego dowodu do oceny kryterium w tym protokole.';
  return {
    assessment,
    why,
    evidenceBasis: basis,
    limitations: [
      'To nie jest odkrycie, dowód przyczynowości ani predykcja poza zakresem modelu.',
      'Kolejny eksperyment wymaga osobnej prerejestracji; Genesis nie uruchamia go automatycznie.',
      ...(assessment === 'INCONCLUSIVE' ? ['Co najmniej jeden arm lub primary metric nie dostarczył kompletnego dowodu.'] : []),
    ],
    nextExperiment: {
      action: 'Zaprojektuj nowy protokół z jednym dodatkowym, jawnie prerejestrowanym wariantem.',
      parameter,
      rationale: 'Najpierw zmień tylko jeden parametr i zachowaj ten sam model, primary metric oraz kontrolę powtórzeń; wartość wariantu musi zostać podana przez użytkownika.',
      autoRun: false,
    },
  };
}
