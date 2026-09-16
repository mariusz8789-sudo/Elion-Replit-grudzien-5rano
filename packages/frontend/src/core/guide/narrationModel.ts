import type { ExecutionBlockedResult, RunResult } from '../orchestrator/govLowerHarmDiscovery';
import type { GenesisDomainReplayResult } from '../orchestrator/genesisDomainRegistry';

/**
 * GUIDE NARRATION MODEL (D-119) — facts → beats. Pure functions, no DOM, no
 * voice. The guide never says anything the current run does not confirm:
 * every beat is gated by a predicate over `GuideFacts`, every number in a
 * sentence is interpolated from those facts, and a WINNER beat can only be
 * built from a real WinnerRecord (a NO_WINNER is narrated with its blocker,
 * never softened). Three audience levels change the amount of detail, never
 * the facts; `plain` is the "explain it simpler" variant of the same beat.
 */

export type GuideLevel = 'EXPLORER' | 'SCIENTIST' | 'AUDITOR';
export type GuideLang = 'pl' | 'en';
export type BeatId = 'intro' | 'ask' | 'running' | 'blocked' | 'candidates' | 'evidence' | 'falsification' | 'gate' | 'verdict' | 'recipe' | 'replay' | 'world';

export interface GuideFacts {
  readonly phase: 'IDLE' | 'RUNNING' | 'DONE' | 'BLOCKED';
  readonly executionBlocked: string | null;
  readonly candidatesTotal: number;
  readonly candidatesCleared: number;
  readonly top2Names: readonly string[];
  readonly observations: number;
  readonly g2Observable: string | null;
  readonly g2Discriminability: number | null;
  readonly conjuncts: readonly { readonly criterion: string; readonly held: boolean }[];
  readonly favouriteName: string | null;
  readonly gateOutcome: string | null;
  readonly verdict: string | null;
  readonly winnerName: string | null;
  readonly winnerId: string | null;
  readonly blockedAt: string | null;
  readonly blockedReason: string | null;
  readonly recipeFingerprint: string | null;
  readonly auditFingerprint: string | null;
  readonly custodyHash: string | null;
  readonly custodyStatus: string | null;
  readonly stagesOk: number;
  readonly stagesTotal: number;
  readonly replay: 'MATCH' | 'DRIFT' | null;
}

export const IDLE_FACTS: GuideFacts = {
  phase: 'IDLE', executionBlocked: null, candidatesTotal: 0, candidatesCleared: 0, top2Names: [], observations: 0,
  g2Observable: null, g2Discriminability: null, conjuncts: [], favouriteName: null, gateOutcome: null, verdict: null,
  winnerName: null, winnerId: null, blockedAt: null, blockedReason: null, recipeFingerprint: null, auditFingerprint: null,
  custodyHash: null, custodyStatus: null, stagesOk: 0, stagesTotal: 0, replay: null,
};

/** Projects a finished (or blocked) run onto the facts the guide may speak about. */
export function factsFromRun(result: RunResult | ExecutionBlockedResult | null, replay: GenesisDomainReplayResult | null, running = false): GuideFacts {
  if (running) return { ...IDLE_FACTS, phase: 'RUNNING' };
  if (result === null) return IDLE_FACTS;
  if (result.kind === 'EXECUTION_BLOCKED') return { ...IDLE_FACTS, phase: 'BLOCKED', executionBlocked: `${result.code}: ${result.error}` };
  const d = result.detail;
  const r = result.winnerRecord;
  const f = d?.falsification ?? null;
  const custody = result.evidenceCustody;
  const favourite = d?.gateDecisions[0];
  return {
    phase: 'DONE',
    executionBlocked: null,
    candidatesTotal: d?.candidates.length ?? 0,
    candidatesCleared: d?.candidates.filter((c) => c.qualifies).length ?? 0,
    top2Names: d?.candidates.filter((c) => c.inTop2).map((c) => c.candidateName) ?? [],
    observations: d?.evidence.length ?? 0,
    g2Observable: f !== null && f.outcome === 'EXPERIMENT_SELECTED' ? f.observableId : null,
    g2Discriminability: f !== null && f.outcome === 'EXPERIMENT_SELECTED' ? f.discriminability : null,
    conjuncts: d?.conjuncts.map((c) => ({ criterion: c.criterion, held: c.held })) ?? [],
    favouriteName: favourite?.candidateName ?? null,
    gateOutcome: favourite?.outcome ?? null,
    verdict: result.verdict,
    winnerName: r?.kind === 'WINNER_RECORD' ? r.candidateName : null,
    winnerId: r?.kind === 'WINNER_RECORD' ? r.winnerId : null,
    blockedAt: r?.kind === 'NO_WINNER_BLOCKER' ? r.blockedAt : null,
    blockedReason: r?.kind === 'NO_WINNER_BLOCKER' ? r.reason : null,
    recipeFingerprint: r?.kind === 'WINNER_RECORD' ? r.fingerprints.recipeFingerprint : (result.recipeFingerprint ?? null),
    auditFingerprint: result.auditFingerprint,
    custodyHash: custody?.record?.artifact?.hash ?? null,
    custodyStatus: custody === null ? null : custody.ok ? 'FROZEN' : 'FAILED',
    stagesOk: result.stages.filter((s) => s.status === 'OK').length,
    stagesTotal: result.stages.length,
    replay: replay === null ? null : replay.ok ? 'MATCH' : 'DRIFT',
  };
}

export type GuideAction =
  | { readonly kind: 'none' }
  | { readonly kind: 'spotlight'; readonly selector: string }
  | { readonly kind: 'type-example'; readonly selector: string; readonly text: string }
  | { readonly kind: 'scroll'; readonly selector: string }
  | { readonly kind: 'open-gates' }
  | { readonly kind: 'navigate'; readonly hash: string };

export interface NarrationBeat {
  readonly id: BeatId;
  readonly level: GuideLevel;
  readonly lang: GuideLang;
  /** What the guide says at this level. */
  readonly text: string;
  /** The "explain it simpler" variant — always the plainest wording of the same fact. */
  readonly plain: string;
  readonly action: GuideAction;
  readonly sound: 'stage' | 'gate' | 'winner' | 'none';
}

export const CANONICAL_QUESTION = 'Among candidates in the GLP-1R/GIPR/GCGR mechanistic space, find the alternative that achieves clinically meaningful efficacy at the lowest achievable burden of harm relative to semaglutide.';

const short = (fp: string | null, n = 8): string => (fp === null ? '' : fp.slice(0, n));
const prettyCriterion = (c: string): string => c.toLowerCase().replace(/_/g, ' ');
const sigma = (v: number | null): string => (v === null ? '' : `${v.toFixed(2)}σ`);
const list = (xs: readonly string[], lang: GuideLang): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${lang === 'pl' ? 'i' : 'and'} ${xs[xs.length - 1]}`);

interface BeatSpec {
  readonly id: BeatId;
  readonly requires: (f: GuideFacts) => boolean;
  readonly text: (f: GuideFacts, level: GuideLevel, lang: GuideLang) => string;
  readonly plain: (f: GuideFacts, lang: GuideLang) => string;
  readonly action: (f: GuideFacts) => GuideAction;
  readonly sound: NarrationBeat['sound'];
}

const SPECS: readonly BeatSpec[] = [
  {
    id: 'intro',
    requires: () => true,
    text: (_f, _l, lang) => lang === 'pl'
      ? 'Witaj w Genesis. To środowisko do badania hipotez, eksperymentów i możliwych scenariuszy. Nie musisz znać nauki ani technologii — wystarczy pytanie.'
      : 'Welcome to Genesis, an environment for testing hypotheses, experiments and possible scenarios. You need no science or technology background — only a question.',
    plain: (_f, lang) => (lang === 'pl' ? 'Genesis pomaga sprawdzić, czy jakiś pomysł ma sens — i pokazuje, jak to sprawdził.' : 'Genesis helps you check whether an idea holds up — and shows how it checked.'),
    action: () => ({ kind: 'none' }),
    sound: 'none',
  },
  {
    id: 'ask',
    requires: () => true,
    text: (_f, _l, lang) => lang === 'pl'
      ? 'Zaczynamy od pytania. Nie musisz wiedzieć, jak przeprowadzić eksperyment. Powiedz Genesis, czego chcesz się dowiedzieć — możesz użyć przykładu, zmienić go albo wpisać własne.'
      : 'We start with a question. You do not need to know how to run an experiment. Tell Genesis what you want to find out — use the example, change it, or write your own.',
    plain: (_f, lang) => (lang === 'pl' ? 'Wpisz, co chcesz sprawdzić. Przykład już tu jest.' : 'Type what you want to check. An example is already here.'),
    action: () => ({ kind: 'type-example', selector: '[data-guide="question"]', text: CANONICAL_QUESTION }),
    sound: 'none',
  },
  {
    id: 'running',
    requires: (f) => f.phase === 'RUNNING' || f.phase === 'DONE',
    text: (f, level, lang) => {
      const head = lang === 'pl'
        ? 'Genesis zaczyna analizę. Najpierw definiuje problem, potem generuje i porządkuje możliwe odpowiedzi.'
        : 'Genesis begins the analysis. First it defines the problem, then it generates and organises the possible answers.';
      if (f.phase !== 'DONE') return head;
      const stages = lang === 'pl' ? `Przebieg ma ${f.stagesTotal} etapów; ${f.stagesOk} zakończyło się poprawnie.` : `The run has ${f.stagesTotal} stages; ${f.stagesOk} completed correctly.`;
      const audit = level === 'AUDITOR' ? (lang === 'pl' ? ` Każdy etap ma własny odcisk; odcisk audytu to ${short(f.auditFingerprint)}.` : ` Every stage carries its own fingerprint; the audit fingerprint is ${short(f.auditFingerprint)}.`) : '';
      return level === 'EXPLORER' ? `${head} ${stages}` : `${head} ${stages}${audit}`;
    },
    plain: (f, lang) => (f.phase === 'DONE'
      ? (lang === 'pl' ? `Genesis przeszedł przez ${f.stagesTotal} kroków, jeden po drugim, i zapisał każdy z nich.` : `Genesis went through ${f.stagesTotal} steps, one after another, and recorded each of them.`)
      : (lang === 'pl' ? 'Genesis właśnie pracuje nad Twoim pytaniem.' : 'Genesis is working on your question now.')),
    action: () => ({ kind: 'scroll', selector: '[data-testid="pipeline-timeline"]' }),
    sound: 'stage',
  },
  {
    id: 'blocked',
    requires: (f) => f.phase === 'BLOCKED',
    text: (f, _l, lang) => (lang === 'pl'
      ? `Genesis zatrzymał się, zanim padła jakakolwiek decyzja: ${f.executionBlocked ?? ''}. To nie jest wynik — to odmowa pracy na niezweryfikowanych danych.`
      : `Genesis stopped before any decision was made: ${f.executionBlocked ?? ''}. That is not a result — it is a refusal to work on unverified data.`),
    plain: (_f, lang) => (lang === 'pl' ? 'Genesis nie zaczął, bo nie ufa danym. Woli nic nie powiedzieć niż zgadywać.' : 'Genesis did not start because it does not trust the data. It would rather say nothing than guess.'),
    action: () => ({ kind: 'spotlight', selector: '.gu-locked-panel' }),
    sound: 'none',
  },
  {
    id: 'candidates',
    requires: (f) => f.phase === 'DONE' && f.candidatesTotal > 0,
    text: (f, level, lang) => {
      const base = lang === 'pl'
        ? `Teraz sprawdzamy, które możliwości mają wystarczające podstawy, a które trzeba odrzucić. Genesis ocenił ${f.candidatesTotal} kandydatów; ${f.candidatesCleared} przeszło próg skuteczności i weto bezpieczeństwa.`
        : `Now we check which possibilities have enough ground and which must be rejected. Genesis scored ${f.candidatesTotal} candidates; ${f.candidatesCleared} cleared the efficacy floor and the safety veto.`;
      const pair = f.top2Names.length > 0 ? (lang === 'pl' ? ` Para do rozstrzygnięcia: ${list(f.top2Names, lang)}.` : ` The pair to decide between: ${list(f.top2Names, lang)}.`) : '';
      return level === 'EXPLORER' ? base : `${base}${pair}`;
    },
    plain: (f, lang) => (lang === 'pl' ? `Z ${f.candidatesTotal} pomysłów ${f.candidatesCleared} przeszły dalej. Reszta odpadła i widać dlaczego.` : `Out of ${f.candidatesTotal} ideas, ${f.candidatesCleared} went through. The rest were dropped, and you can see why.`),
    action: () => ({ kind: 'scroll', selector: '[data-testid="candidate-space"]' }),
    sound: 'stage',
  },
  {
    id: 'evidence',
    requires: (f) => f.phase === 'DONE' && f.observations > 0,
    text: (f, level, lang) => {
      const base = lang === 'pl'
        ? `Nie wystarczy nam wynik. Chcemy wiedzieć, skąd on się wziął. Za tym przebiegiem stoi ${f.observations} realnych obserwacji z badań klinicznych.`
        : `A result is not enough. We want to know where it came from. Behind this run stand ${f.observations} real clinical-trial observations.`;
      const custody = f.custodyHash !== null
        ? (lang === 'pl' ? ` Dane zostały zamrożone i zweryfikowane hashem${level === 'AUDITOR' ? ` ${short(f.custodyHash, 16)}` : ''}, zanim padła jakakolwiek decyzja.` : ` The data was frozen and hash-verified${level === 'AUDITOR' ? ` (${short(f.custodyHash, 16)})` : ''} before any decision was made.`)
        : '';
      return level === 'EXPLORER' ? base : `${base}${custody}`;
    },
    plain: (f, lang) => (lang === 'pl' ? `Każdy wynik prowadzi do prawdziwych badań — tu jest ich ${f.observations}. Możesz kliknąć i zobaczyć źródło.` : `Every result leads back to real studies — here there are ${f.observations}. You can click and see the source.`),
    action: () => ({ kind: 'scroll', selector: '[data-testid="provenance-dag"]' }),
    sound: 'stage',
  },
  {
    id: 'falsification',
    requires: (f) => f.phase === 'DONE' && f.conjuncts.length > 0,
    text: (f, level, lang) => {
      const base = lang === 'pl'
        ? 'Genesis próbuje również znaleźć powód, dla którego własna hipoteza może być błędna.'
        : 'Genesis also tries to find a reason why its own hypothesis might be wrong.';
      if (f.g2Observable === null) return lang === 'pl' ? `${base} Tym razem nie było testu, który rozdzieliłby kandydatów.` : `${base} This time there was no test that could separate the candidates.`;
      const detail = lang === 'pl'
        ? ` Test ${f.g2Observable} rozdziela obu kandydatów z siłą ${sigma(f.g2Discriminability)}, a reguła decyzyjna została zamrożona, zanim odczytano wynik.`
        : ` The ${f.g2Observable} test separates the two candidates with ${sigma(f.g2Discriminability)}, and the decision rule was frozen before the result was read.`;
      return level === 'EXPLORER' ? base : `${base}${detail}`;
    },
    plain: (f, lang) => (f.g2Observable === null
      ? (lang === 'pl' ? 'Genesis sam szuka błędu w swoim pomyśle. Tym razem nie było czym go sprawdzić.' : 'Genesis looks for the flaw in its own idea. This time there was nothing to test it with.')
      : (lang === 'pl' ? 'Genesis sam szuka błędu w swoim pomyśle. Ten test bardzo dobrze rozróżniał obie możliwości.' : 'Genesis looks for the flaw in its own idea. This test told the two possibilities apart very well.')),
    action: () => ({ kind: 'scroll', selector: '[data-testid="g2-band"], .gu-gate-g2' }),
    sound: 'stage',
  },
  {
    id: 'gate',
    requires: (f) => f.phase === 'DONE' && f.conjuncts.length > 0,
    text: (f, level, lang) => {
      const held = f.conjuncts.filter((c) => c.held).length;
      const base = lang === 'pl'
        ? `Dopiero teraz wynik przechodzi przez końcową bramkę: ${f.conjuncts.length} warunki, każdy otwiera się tylko wtedy, gdy jest naprawdę spełniony. Otworzyły się ${held} z ${f.conjuncts.length}.`
        : `Only now does the result pass through the final gate: ${f.conjuncts.length} conditions, each opening only when it really holds. ${held} of ${f.conjuncts.length} opened.`;
      const which = level === 'EXPLORER' ? '' : ` ${f.conjuncts.map((c) => `${prettyCriterion(c.criterion)}: ${c.held ? (lang === 'pl' ? 'spełniony' : 'held') : (lang === 'pl' ? 'niespełniony' : 'failed')}`).join('; ')}.`;
      const gov = f.gateOutcome !== null && f.favouriteName !== null
        ? (lang === 'pl' ? ` Bramka nadzoru dla ${f.favouriteName}: ${f.gateOutcome.replace(/_/g, ' ')} — Genesis niczego nie aktywuje sam.` : ` Governance gate for ${f.favouriteName}: ${f.gateOutcome.replace(/_/g, ' ')} — Genesis activates nothing on its own.`)
        : '';
      return `${base}${which}${gov}`;
    },
    plain: (f, lang) => {
      const held = f.conjuncts.filter((c) => c.held).length;
      return lang === 'pl' ? `Na końcu są ${f.conjuncts.length} bramki. Otworzyły się ${held}. Wynik przechodzi tylko, gdy otworzą się wszystkie.` : `At the end there are ${f.conjuncts.length} gates. ${held} opened. A result passes only when all of them open.`;
    },
    action: () => ({ kind: 'open-gates' }),
    sound: 'gate',
  },
  {
    id: 'verdict',
    requires: (f) => f.phase === 'DONE' && f.verdict !== null,
    text: (f, level, lang) => {
      if (f.winnerName !== null) {
        const base = lang === 'pl'
          ? `Genesis znalazł kandydata spełniającego wymagania tej konkretnej ścieżki: ${f.winnerName}.`
          : `Genesis found a candidate that meets the requirements of this specific path: ${f.winnerName}.`;
        const caveat = lang === 'pl' ? ' To nie jest twierdzenie o wyższości nad lekiem referencyjnym; decyzja należy do człowieka.' : ' This is not a claim of superiority over the reference drug; the decision belongs to a person.';
        const audit = level === 'AUDITOR' ? (lang === 'pl' ? ` Identyfikator ${f.winnerId ?? ''}, odcisk audytu ${short(f.auditFingerprint)}.` : ` Identifier ${f.winnerId ?? ''}, audit fingerprint ${short(f.auditFingerprint)}.`) : '';
        return `${base}${level === 'EXPLORER' ? '' : caveat}${audit}`;
      }
      if (f.blockedAt !== null) {
        return lang === 'pl'
          ? `Tym razem Genesis nie znalazł wyniku spełniającego wszystkie wymagania. I właśnie pokazujemy Ci dlaczego: przebieg zatrzymał się na ${f.blockedAt}.${level === 'EXPLORER' ? '' : ` ${f.blockedReason ?? ''}`}`
          : `This time Genesis found no result that meets every requirement. And we show you exactly why: the run stopped at ${f.blockedAt}.${level === 'EXPLORER' ? '' : ` ${f.blockedReason ?? ''}`}`;
      }
      return lang === 'pl' ? `Werdykt tego przebiegu: ${f.verdict ?? ''}.` : `The verdict of this run: ${f.verdict ?? ''}.`;
    },
    plain: (f, lang) => (f.winnerName !== null
      ? (lang === 'pl' ? `Jest wynik: ${f.winnerName}. Przeszedł wszystkie sprawdzenia tej ścieżki. Ostatnie słowo ma człowiek.` : `There is a result: ${f.winnerName}. It passed every check on this path. A person has the last word.`)
      : (lang === 'pl' ? 'Tym razem nie ma zwycięzcy. Genesis pokazuje, na czym się zatrzymał, zamiast udawać.' : 'This time there is no winner. Genesis shows where it stopped instead of pretending.')),
    action: () => ({ kind: 'scroll', selector: '[data-testid="run-verdict-hero"]' }),
    sound: 'winner',
  },
  {
    id: 'recipe',
    requires: (f) => f.phase === 'DONE' && f.winnerName !== null && f.recipeFingerprint !== null,
    text: (f, level, lang) => {
      const base = lang === 'pl'
        ? 'Zwycięzca dostaje Research Recipe: mechanizm, wymagane właściwości, identyfikatory, wyniki falsyfikacji i ograniczenia. Bez dawkowania i bez procedury syntezy.'
        : 'The winner gets a Research Recipe: mechanism, required properties, identifiers, falsification results and limits. No dosing and no synthesis procedure.';
      return level === 'AUDITOR' ? `${base} ${lang === 'pl' ? 'Odcisk receptury' : 'Recipe fingerprint'} ${short(f.recipeFingerprint)}.` : base;
    },
    plain: (_f, lang) => (lang === 'pl' ? 'Do wyniku dołączona jest lista: co to jest, co musi spełniać i czego nie wiemy.' : 'The result comes with a list: what it is, what it must satisfy, and what we do not know.'),
    action: () => ({ kind: 'scroll', selector: '[data-testid="winner-record"]' }),
    sound: 'stage',
  },
  {
    id: 'replay',
    requires: (f) => f.phase === 'DONE',
    text: (f, level, lang) => {
      if (f.replay === null) return lang === 'pl' ? 'Na koniec Genesis odtwarza cały przebieg od zera i porównuje odciski — wynik można sprawdzić jutro, na innej maszynie.' : 'Finally Genesis replays the whole run from scratch and compares fingerprints — the result can be checked tomorrow, on another machine.';
      if (f.replay === 'MATCH') return lang === 'pl' ? `Odtworzenie zgadza się: dwa niezależne przebiegi dały ten sam werdykt i ten sam odcisk${level === 'AUDITOR' ? ` ${short(f.auditFingerprint)}` : ''}.` : `The replay matches: two independent runs produced the same verdict and the same fingerprint${level === 'AUDITOR' ? ` ${short(f.auditFingerprint)}` : ''}.`;
      return lang === 'pl' ? 'Odtworzenie się nie zgadza: dwa przebiegi dały różne wyniki. Genesis pokazuje to wprost — temu wynikowi nie można jeszcze ufać.' : 'The replay does not match: two runs gave different results. Genesis shows this openly — this result cannot be trusted yet.';
    },
    plain: (f, lang) => (f.replay === 'MATCH'
      ? (lang === 'pl' ? 'Genesis policzył wszystko drugi raz i wyszło dokładnie to samo.' : 'Genesis computed everything a second time and got exactly the same.')
      : f.replay === 'DRIFT'
        ? (lang === 'pl' ? 'Genesis policzył wszystko drugi raz i wyszło coś innego — więc mówi, że nie można temu ufać.' : 'Genesis computed everything a second time and got something else — so it says this cannot be trusted.')
        : (lang === 'pl' ? 'Genesis może policzyć wszystko jeszcze raz, żeby sprawdzić, czy wyjdzie to samo.' : 'Genesis can compute everything again to check it comes out the same.')),
    action: () => ({ kind: 'scroll', selector: '[data-testid="replay-section"]' }),
    sound: 'stage',
  },
  {
    id: 'world',
    requires: (f) => f.phase === 'DONE',
    text: (_f, _l, lang) => (lang === 'pl'
      ? 'To samo odkrycie możesz zobaczyć od środka: w laboratorium 3D Genesis opowiada je krok po kroku.'
      : 'You can see the same discovery from the inside: in the 3D lab Genesis tells it step by step.'),
    plain: (_f, lang) => (lang === 'pl' ? 'Wejdźmy do laboratorium i zobaczmy to jeszcze raz, ale w 3D.' : 'Let us step into the lab and see it again, in 3D.'),
    action: () => ({ kind: 'navigate', hash: '#/discovery-hall?tour=1' }),
    sound: 'none',
  },
];

export function buildNarration(facts: GuideFacts, opts: { readonly level: GuideLevel; readonly lang: GuideLang }): readonly NarrationBeat[] {
  return SPECS.filter((s) => s.requires(facts)).map((s) => ({
    id: s.id,
    level: opts.level,
    lang: opts.lang,
    text: s.text(facts, opts.level, opts.lang),
    plain: s.plain(facts, opts.lang),
    action: s.action(facts),
    sound: s.sound,
  }));
}

export function beatById(beats: readonly NarrationBeat[], id: BeatId): NarrationBeat | null {
  return beats.find((b) => b.id === id) ?? null;
}
