import { HYPOTHESIS_PROBLEMS, type HypothesisProblem } from '../experimentFabric/hypothesisLoop';
import { canonicalJson, fnv1a } from '../events/hash';
import { normalize } from '../generator/resolve';

/**
 * CHAT ENTRY FOR THE SCIENTIFIC DISCOVERY LOOP — question routing only.
 *
 * This maps what a person typed onto a research question Genesis ALREADY
 * declares (`HYPOTHESIS_PROBLEMS`, hypothesisLoop.ts). It is not a second
 * catalog: `available` below is derived from that one array, so a question
 * added there is offered here the same day, and a question removed there
 * stops being offered here, with no list to keep in sync by hand.
 *
 * The matching doctrine is deliberately copied from
 * `simulation/preparednessQuestions.ts::resolvePreparednessQuestion`, which
 * already governs the other place a free-text question can start a real run:
 * matching is LITERAL — the declared statement, the problem id, or one of the
 * declared phrasings — and there is intentionally no similarity measure.
 * "Almost matches" is not enough to start a real experiment, because the
 * result would then answer a different question than the one that was asked.
 * A miss returns NOT_AVAILABLE together with the whole real catalog, so the
 * refusal shows what Genesis CAN answer instead of just saying no.
 *
 * Nothing here generates a hypothesis, selects an experiment, executes, or
 * judges anything: it resolves a `problemId` and stops. The loop itself stays
 * `scientificDiscoveryLoop.ts`, unchanged and un-duplicated.
 */

export const DISCOVERY_QUESTION_CONTRACT_VERSION = '1.0.0';

/**
 * Declared phrasings per problem — the same idea as
 * `GovernedPreparednessQuestion.phrasing`. These are alternative ways a
 * person might name a question Genesis already declares; they never widen
 * what Genesis can answer, they only spare the user from pasting the exact
 * statement. Keyed by `problemId` so the compiler points at this table when
 * a problem id changes, and `discoveryQuestions.test.ts` fails if a declared
 * problem has no phrasings at all — a research question nobody can reach
 * from chat is the defect this file exists to prevent.
 */
export const DISCOVERY_QUESTION_PHRASINGS: Readonly<Record<string, readonly string[]>> = {
  'problem:lowest-modeled-deaths': [
    'ktora interwencja daje najnizsza liczbe zgonow', 'najnizsza liczba zgonow', 'ktora interwencja jest najlepsza',
    'lowest modeled deaths', 'which intervention is best',
  ],
  'problem:intervention-timing': [
    'jak pozno mozna wprowadzic izolacje', 'kiedy wprowadzic izolacje', 'moment wprowadzenia interwencji',
    'timing interwencji', 'intervention timing', 'how late can we intervene',
  ],
  'problem:pyscf-h2-bond-length-stability': [
    'dlugosc wiazania h-h', 'dlugosc wiazania wodoru', 'najstabilniejsza dlugosc wiazania', 'energia rhf',
    'sto-3g', 'pyscf', 'h2 bond length', 'most stable bond length',
  ],
  'problem:chem-rdkit-molecular-weight-comparison': [
    'masa czasteczkowa', 'najwyzsza masa czasteczkowa', 'porownaj masy czasteczkowe', 'rdkit',
    'molecular weight', 'smiles mass',
  ],
  'problem:particle-relativistic-kinetic-energy-velocity': [
    'relatywistyczna energia kinetyczna', 'energia kinetyczna czastki', 'predkosc beta', 'lorentz',
    'relativistic kinetic energy',
  ],
  'problem:cell-population-growth-rate-fastest-to-capacity': [
    'tempo wzrostu populacji', 'wzrost logistyczny', 'pojemnosc srodowiska', 'ktore tempo wzrostu',
    'logistic growth', 'population growth rate',
  ],
};

export type DiscoveryQuestionStatus = 'GOVERNED' | 'NOT_AVAILABLE';

export interface DiscoveryQuestionCatalogEntry {
  readonly problemId: string;
  readonly statement: string;
  readonly domainId: string;
  readonly modelId: string;
}

export interface DiscoveryQuestionResolution {
  readonly contractVersion: string;
  readonly status: DiscoveryQuestionStatus;
  /** Literally what the person typed — Genesis records the question, never a paraphrase of it. */
  readonly askedText: string;
  readonly problem: HypothesisProblem | null;
  readonly reason: string;
  /** Shown on refusal: the person must see what IS answerable, derived from the real catalog. */
  readonly available: readonly DiscoveryQuestionCatalogEntry[];
  /** Deterministic — the same question always resolves to the same fingerprint. */
  readonly resolutionFingerprint: string;
}

export function discoveryQuestionCatalog(): readonly DiscoveryQuestionCatalogEntry[] {
  return HYPOTHESIS_PROBLEMS.map((problem) => ({
    problemId: problem.problemId,
    statement: problem.statement,
    domainId: problem.domainId,
    modelId: problem.modelId,
  }));
}

/*
 * `normalize` is Genesis's one existing text folder (`generator/resolve.ts`),
 * the same one `resolveCommand.ts` already uses — imported rather than
 * re-implemented, so a phrasing matches here exactly when it would match
 * anywhere else in the chat layer.
 */

export function resolveDiscoveryQuestion(text: string): DiscoveryQuestionResolution {
  const askedText = text.trim();
  const normalized = normalize(askedText);
  const available = discoveryQuestionCatalog();

  const matched = HYPOTHESIS_PROBLEMS.find((problem) =>
    // The problem id itself, so a caller that already knows which question it
    // wants (the Matrix, a deep link, a test) goes down the same one path.
    normalized.includes(normalize(problem.problemId))
    // The declared statement, verbatim — always works, for every problem,
    // including one added after this file was last touched.
    || normalized.includes(normalize(problem.statement))
    || (DISCOVERY_QUESTION_PHRASINGS[problem.problemId] ?? []).some((phrase) => normalized.includes(normalize(phrase))));

  const base = { contractVersion: DISCOVERY_QUESTION_CONTRACT_VERSION, askedText, available };
  if (matched === undefined) {
    return {
      ...base,
      status: 'NOT_AVAILABLE',
      problem: null,
      reason: 'To pytanie nie jest żadnym z zadeklarowanych problemów badawczych Genesis. Genesis nie uruchamia pętli na pytaniu „zbliżonym" — konkurencyjne hipotezy powstają z zadeklarowanej powierzchni modelu, więc wynik odpowiadałby wtedy na inne pytanie niż zadane.',
      resolutionFingerprint: fnv1a(canonicalJson({ status: 'NOT_AVAILABLE', askedText })),
    };
  }
  return {
    ...base,
    status: 'GOVERNED',
    problem: matched,
    reason: `Pytanie przypisane do zadeklarowanego problemu ${matched.problemId} (domena ${matched.domainId}, model ${matched.modelId}). Metryka rozstrzygająca: ${matched.primaryMetric}; hipotezy konkurują po ${matched.candidateVariable}.`,
    resolutionFingerprint: fnv1a(canonicalJson({ status: 'GOVERNED', problemId: matched.problemId })),
  };
}

/**
 * Explicit markers that the person is asking for the RESEARCH LOOP — competing
 * hypotheses, preregistered together, executed and then discriminated — rather
 * than for one experiment.
 *
 * This distinction is not cosmetic, and it is why topic alone must never be the
 * trigger: `parser.ts::parseScienceChatMessage` already recognises the DOMAIN of
 * nearly every declared problem (verified, not assumed: a probe over the real
 * catalog showed it claims the timing, PySCF, RDKit, particle and logistic
 * questions), and `ScienceChat.tsx` plans a single Fabric experiment for those
 * before `resolveCommand` is ever reached. Both answers are legitimate; they
 * answer different asks. So the loop is offered only when the message says so.
 */
/**
 * UNAMBIGUOUS: these name the loop itself, so they may take the loop path even
 * when the question does not resolve — the honest answer there is the real
 * catalog, because the person asked for this specific machinery by name.
 */
const DISCOVERY_LOOP_EXPLICIT_MARKERS: readonly string[] = [
  'petla odkrycia', 'petle odkrycia', 'petla naukowa', 'konkurencyjne hipotezy',
  'postaw hipotezy', 'postaw konkurencyjne', 'discovery loop', 'research loop',
  'competing hypotheses', 'run the loop',
];

/**
 * GENERIC research verbs. These are ordinary Polish/English words that older
 * intents already own — "Zbadaj problem trzech ciał" opened the Universe lab
 * long before this file existed, and must keep doing so. So a generic verb
 * routes to the loop ONLY when the rest of the message names a question the
 * catalog declares; otherwise the message falls through to whichever intent
 * already handled it. Found by the existing suite, not by inspection.
 */
const DISCOVERY_LOOP_GENERIC_MARKERS: readonly string[] = [
  'zbadaj', 'przeprowadz badanie', 'pelne badanie',
];

const DISCOVERY_LOOP_MARKERS: readonly string[] = [
  ...DISCOVERY_LOOP_EXPLICIT_MARKERS,
  ...DISCOVERY_LOOP_GENERIC_MARKERS,
];

/** Markers for re-executing the discovery loop already saved in Science Memory. */
const DISCOVERY_REPLAY_MARKERS: readonly string[] = [
  'odtworz petle', 'odtworz badanie', 'odtworz pelna petle', 'powtorz petle',
  'replay petli', 'replay petle', 'replay discovery', 'replay loop', 'odtworz discovery',
];

export function hasDiscoveryLoopMarker(message: string): boolean {
  const norm = normalize(message);
  return DISCOVERY_LOOP_MARKERS.some((marker) => norm.includes(normalize(marker)));
}

/** Only the markers that name the loop itself — see DISCOVERY_LOOP_EXPLICIT_MARKERS. */
export function hasExplicitDiscoveryLoopMarker(message: string): boolean {
  const norm = normalize(message);
  return DISCOVERY_LOOP_EXPLICIT_MARKERS.some((marker) => norm.includes(normalize(marker)));
}

export function hasDiscoveryReplayMarker(message: string): boolean {
  const norm = normalize(message);
  return DISCOVERY_REPLAY_MARKERS.some((marker) => norm.includes(normalize(marker)));
}

/**
 * True only when the message BOTH asks for the loop and names a question Genesis
 * actually declares. `ScienceChat.tsx` uses exactly this to let the single-experiment
 * Fabric planner step aside — deliberately narrow: a loop marker on a question
 * outside the catalog ("zbadaj wpływ temperatury na X") keeps its existing Fabric
 * behaviour rather than being hijacked into a refusal.
 */
export function isDiscoveryLoopRequest(message: string): boolean {
  return hasDiscoveryLoopMarker(message) && resolveDiscoveryQuestion(message).status === 'GOVERNED';
}
