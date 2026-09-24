export type PreventionTopic = 'cigarette' | 'vaping' | 'alcohol' | 'cannabis' | 'harmful-drugs';
export type PreventionTarget = 'lungs' | 'heart' | 'brain' | 'liver' | 'whole-body';
export type PreventionStage = 'immediate' | 'short-term' | 'repeated-use' | 'long-term';

export interface PreventionCatalogEntry {
  readonly topic: PreventionTopic;
  readonly labelPl: string;
  readonly affectedTargets: readonly PreventionTarget[];
  readonly defaultTarget: PreventionTarget;
  readonly plainLanguage: string;
  readonly stages: Readonly<Record<PreventionStage, string>>;
  readonly warning: string;
  readonly evidenceLabel: 'ESTABLISHED_HEALTH_RISK' | 'PARTIAL_LONG_TERM_EVIDENCE' | 'EDUCATIONAL_OVERVIEW_ONLY';
  readonly sources: readonly string[];
  readonly limitations: readonly string[];
  readonly nextSteps: readonly string[];
}

export interface PreventionEducationResult {
  readonly topic: PreventionTopic;
  readonly topicLabel: string;
  readonly target: PreventionTarget;
  readonly stage: PreventionStage;
  readonly affectedOrgans: string;
  readonly explanation: string;
  readonly stageExplanation: string;
  readonly warning: string;
  readonly classification: 'EDUCATIONAL_MODEL';
  readonly presentation: 'SIMULATION';
  readonly clinicalUse: 'NOT_MEDICAL_DIAGNOSIS';
  readonly evidenceLabel: PreventionCatalogEntry['evidenceLabel'];
  readonly visualizationFocus: 'left-lung' | 'heart' | 'brain' | 'liver' | 'body';
  readonly limitations: string;
  readonly sources: string;
  readonly nextSteps: string;
}

export const PREVENTION_STAGES: readonly PreventionStage[] = ['immediate', 'short-term', 'repeated-use', 'long-term'];

export const PREVENTION_LAB_CATALOG: Readonly<Record<PreventionTopic, PreventionCatalogEntry>> = {
  cigarette: {
    topic: 'cigarette', labelPl: 'Palenie papierosów', affectedTargets: ['lungs', 'heart'], defaultTarget: 'lungs',
    plainLanguage: 'Dym tytoniowy szkodzi drogom oddechowym, płucom, sercu i naczyniom. Model pokazuje kierunek znanych zagrożeń, bez przewidywania wyniku konkretnej osoby.',
    stages: {
      immediate: 'Dym podrażnia drogi oddechowe, a nikotyna wpływa na układ krążenia.',
      'short-term': 'Może pojawić się kaszel, więcej śluzu i gorsza tolerancja wysiłku.',
      'repeated-use': 'Powtarzana ekspozycja podtrzymuje stan zapalny i obciąża serce oraz naczynia.',
      'long-term': 'Rośnie ryzyko przewlekłych chorób płuc, chorób sercowo-naczyniowych i nowotworów.',
    },
    warning: 'Najbezpieczniejszym wyborem jest niepalenie i unikanie dymu tytoniowego.', evidenceLabel: 'ESTABLISHED_HEALTH_RISK',
    sources: ['https://www.cdc.gov/tobacco/about/cigarettes-and-cardiovascular-disease.html', 'https://www.cdc.gov/tobacco/hcp/patient-care-settings/respiratory.html'],
    limitations: ['Brak modelu dawki i indywidualnego ryzyka.', 'Etapy nie są prognozą kliniczną.'],
    nextSteps: ['Pokaż wpływ palenia na serce', 'Porównaj papierosy i e-papierosy'],
  },
  vaping: {
    topic: 'vaping', labelPl: 'E-papierosy / vaping', affectedTargets: ['lungs', 'brain'], defaultTarget: 'lungs',
    plainLanguage: 'Aerozol e-papierosów nie jest obojętny dla płuc, a większość produktów zawiera uzależniającą nikotynę. Mózg młodych osób nadal się rozwija.',
    stages: {
      immediate: 'Aerozol może podrażniać drogi oddechowe; nikotyna szybko dociera do mózgu.',
      'short-term': 'Możliwe są kaszel, podrażnienie i narastanie potrzeby ponownego użycia nikotyny.',
      'repeated-use': 'Powtarzane używanie może utrwalać zależność od nikotyny i ekspozycję płuc na szkodliwe substancje.',
      'long-term': 'Pełny zakres skutków długoterminowych jest nadal badany; Genesis nie przedstawia liczbowej prognozy.',
    },
    warning: 'E-papierosy nie są bezpieczne dla dzieci i młodzieży.', evidenceLabel: 'PARTIAL_LONG_TERM_EVIDENCE',
    sources: ['https://www.cdc.gov/tobacco/e-cigarettes/health-effects.html'],
    limitations: ['Skład aerozolu różni się między produktami.', 'Długoterminowe następstwa nie są tu ilościowane.'],
    nextSteps: ['Pokaż wpływ nikotyny na mózg', 'Porównaj papierosy i e-papierosy'],
  },
  alcohol: {
    topic: 'alcohol', labelPl: 'Alkohol', affectedTargets: ['brain', 'liver'], defaultTarget: 'brain',
    plainLanguage: 'Alkohol zaburza komunikację w mózgu i może obciążać wiele narządów, w tym wątrobę. Ten model nie oblicza stężenia alkoholu ani bezpiecznej dawki.',
    stages: {
      immediate: 'Pogarszają się reakcja, koordynacja, ocena sytuacji i pamięć.',
      'short-term': 'Wzrasta ryzyko urazu, zatrucia i niebezpiecznych decyzji.',
      'repeated-use': 'Powtarzane używanie może utrwalać szkodliwe wzorce i zwiększać obciążenie wątroby.',
      'long-term': 'Długotrwałe intensywne używanie może uszkadzać mózg, wątrobę i inne układy organizmu.',
    },
    warning: 'Nie prowadź ani nie podejmuj ryzykownych działań po alkoholu; w sytuacji zagrożenia poproś dorosłego lub służby o pomoc.', evidenceLabel: 'ESTABLISHED_HEALTH_RISK',
    sources: ['https://www.niaaa.nih.gov/alcohols-effects-health/alcohols-effects-body', 'https://www.niaaa.nih.gov/publications/alcohol-and-brain-overview'],
    limitations: ['Brak kalkulatora dawki, stężenia alkoholu i indywidualnego metabolizmu.', 'Model nie udziela porady medycznej.'],
    nextSteps: ['Pokaż wpływ alkoholu na wątrobę', 'Pokaż wpływ alkoholu na mózg'],
  },
  cannabis: {
    topic: 'cannabis', labelPl: 'Marihuana / cannabis', affectedTargets: ['brain', 'lungs', 'heart'], defaultTarget: 'brain',
    plainLanguage: 'THC może wpływać na pamięć, uwagę, koordynację i czas reakcji. Palenie marihuany naraża płuca na dym i substancje drażniące.',
    stages: {
      immediate: 'Mogą pogorszyć się pamięć krótkotrwała, uwaga, koordynacja i czas reakcji.',
      'short-term': 'Upośledzenie reakcji zwiększa ryzyko w ruchu drogowym i podczas obsługi urządzeń.',
      'repeated-use': 'Powtarzane używanie może wiązać się z problemami w nauce i ryzykiem rozwoju zaburzenia używania.',
      'long-term': 'Skutki zależą od wieku, częstości i sposobu używania; dla części następstw dowody pozostają niepełne.',
    },
    warning: 'Nie prowadź po użyciu; młody rozwijający się mózg jest szczególnie istotnym obszarem profilaktyki.', evidenceLabel: 'PARTIAL_LONG_TERM_EVIDENCE',
    sources: ['https://www.cdc.gov/cannabis/health-effects/lung-health.html', 'https://www.cdc.gov/cannabis/health-effects/heart-health.html', 'https://nida.nih.gov/publications/research-reports/marijuana/how-does-marijuana-produce-its-effects'],
    limitations: ['Brak modelu dawki, mocy produktu i drogi podania.', 'Nie wszystkie skutki długoterminowe są ilościowo ustalone.'],
    nextSteps: ['Pokaż wpływ marihuany na płuca', 'Pokaż wpływ marihuany na mózg'],
  },
  'harmful-drugs': {
    topic: 'harmful-drugs', labelPl: 'Szkodliwe substancje psychoaktywne', affectedTargets: ['brain', 'heart', 'whole-body'], defaultTarget: 'brain',
    plainLanguage: 'Różne substancje działają odmiennie. Wspólne zagrożenia mogą obejmować zaburzenia pracy mózgu i serca, zatrucie oraz rozwój uzależnienia.',
    stages: {
      immediate: 'Możliwe są nieprzewidywalne zmiany świadomości, reakcji, oddechu lub pracy serca.',
      'short-term': 'Rośnie ryzyko zatrucia, urazu i niebezpiecznych decyzji.',
      'repeated-use': 'Powtarzane używanie może zmieniać układ nagrody i zwiększać ryzyko uzależnienia.',
      'long-term': 'Skutki zależą od konkretnej substancji; ogólny model nie może przewidzieć uszkodzeń narządów.',
    },
    warning: 'To ogólny przegląd profilaktyczny. W razie podejrzenia zatrucia natychmiast wezwij pomoc.', evidenceLabel: 'EDUCATIONAL_OVERVIEW_ONLY',
    sources: ['https://nida.nih.gov/publications/drugs-brains-behavior-science-addiction'],
    limitations: ['Kategoria obejmuje różne substancje i nie jest modelem toksykologicznym.', 'Brak porad dotyczących dawki lub sposobu użycia.'],
    nextSteps: ['Dowiedz się, jak powstaje uzależnienie', 'Pokaż rolę mózgu i układu nagrody'],
  },
};

const TARGET_FOCUS: Readonly<Record<PreventionTarget, PreventionEducationResult['visualizationFocus']>> = {
  lungs: 'left-lung', heart: 'heart', brain: 'brain', liver: 'liver', 'whole-body': 'body',
};

export function runPreventionEducation(topic: PreventionTopic, requestedTarget?: PreventionTarget, stage: PreventionStage = 'short-term'): PreventionEducationResult {
  const entry = PREVENTION_LAB_CATALOG[topic];
  const target = requestedTarget && entry.affectedTargets.includes(requestedTarget) ? requestedTarget : entry.defaultTarget;
  return {
    topic, topicLabel: entry.labelPl, target, stage, affectedOrgans: entry.affectedTargets.join(', '),
    explanation: entry.plainLanguage, stageExplanation: entry.stages[stage], warning: entry.warning,
    classification: 'EDUCATIONAL_MODEL', presentation: 'SIMULATION', clinicalUse: 'NOT_MEDICAL_DIAGNOSIS',
    evidenceLabel: entry.evidenceLabel, visualizationFocus: TARGET_FOCUS[target],
    limitations: entry.limitations.join(' '), sources: entry.sources.join(', '), nextSteps: entry.nextSteps.join(' | '),
  };
}
