/**
 * scientificDecision (Stage 5) — the Scientific Decision Engine.
 *
 * Turns RDKit-verified descriptors + structural alerts into a decision report that a
 * medicinal chemist can trust: it separates what has been VERIFIED (real computation)
 * from what is a GROUNDED interpretation (deterministic rule over verified facts) from
 * GENERAL scientific knowledge — and, crucially, from what remains UNKNOWN and what
 * REQUIRES EXPERIMENTAL VALIDATION.
 *
 * Hard rules (mandated):
 *   • Never present an interpretation as a verified fact — every statement is tagged.
 *   • Never predict experimental outcomes; never invent biological activity.
 *   • Suggested validation lists STANDARD lab workflows only, each ending with the
 *     explicit reminder that experimental validation is required.
 *
 * Pure + deterministic + unit-tested. No AI, no new computation, no network. It only
 * re-reads numbers RDKit already produced.
 */
import type { MoleculeProps } from './moleculeInterpretation';
import type { IconName } from '../components/Icon';

/** How a statement is justified. Ordered weakest-claim-first in meaning. */
export type EvidenceTag = 'VERIFIED' | 'GROUNDED' | 'GENERAL';
export type DecisionCategory = 'VERIFIED' | 'PROMISING' | 'UNKNOWN' | 'VALIDATION' | 'NEXT';

/** Machine-readable "explain this statement" payload for the expandable UI. */
export interface Explanation {
  descriptors: string[]; // RDKit descriptors that support the statement
  rule: string;          // the exact rule / threshold applied ('' when none)
  origin: string;        // where the statement comes from (computation / rule / general knowledge)
  assumptions: string[]; // what the statement assumes
  limitations: string[]; // what it does NOT establish
}

export interface DecisionStatement {
  category: DecisionCategory;
  tag: EvidenceTag;
  text: string;
  explain: Explanation;
}

/** A suggested next experiment — a STANDARD workflow, never a predicted result. */
export interface ValidationStep {
  workflow: string;     // e.g. "Oznaczenie rozpuszczalności kinetycznej"
  purpose: string;      // what it would measure (not what it will show)
  note: string;         // always the experimental-validation reminder
}

export interface DecisionReport {
  statements: DecisionStatement[];
  strengths: string[];
  risks: string[];
  unknowns: string[];
  validation: ValidationStep[];
  transparency: {
    verifiedDescriptors: string[]; // descriptors actually used
    groundingRules: string[];      // rules that fired
    removedClaims: string[];       // claims we deliberately do NOT make
    confidenceNote: string;        // how confidence was classified
    limitations: string[];         // scientific limitations of the whole report
  };
}

const f = (n: number, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : n);
const REQUIRED = 'Wymagana walidacja eksperymentalna.';

function st(category: DecisionCategory, tag: EvidenceTag, text: string, explain: Partial<Explanation>): DecisionStatement {
  return {
    category, tag, text,
    explain: { descriptors: explain.descriptors ?? [], rule: explain.rule ?? '', origin: explain.origin ?? '', assumptions: explain.assumptions ?? [], limitations: explain.limitations ?? [] },
  };
}

/**
 * Build the full decision report from verified descriptors + structural alerts.
 * `alerts` is the list of RDKit structural-alert names (may be empty/absent).
 */
export function buildDecisionReport(p: MoleculeProps, alerts: string[] = []): DecisionReport {
  const statements: DecisionStatement[] = [];
  const strengths: string[] = [];
  const risks: string[] = [];
  const unknowns: string[] = [];
  const groundingRules: string[] = [];
  const alertNames = alerts.map((a) => a.trim()).filter(Boolean);

  // ── VERIFIED: direct RDKit computations (never dressed up as biology) ──────────
  statements.push(st('VERIFIED', 'VERIFIED', `Masa molowa ${f(p.molWt)} g/mol obliczona przez RDKit.`, {
    descriptors: ['molWt'], origin: 'Obliczenie RDKit (Descriptors.MolWt)',
    limitations: ['Wartość fizykochemiczna — nie mówi nic o aktywności biologicznej.'],
  }));
  statements.push(st('VERIFIED', 'VERIFIED', `LogP ${f(p.logP)} (model Wildman–Crippen, RDKit).`, {
    descriptors: ['logP'], origin: 'Obliczenie RDKit (Crippen.MolLogP)',
    assumptions: ['LogP to oszacowanie modelowe, nie wartość zmierzona.'],
    limitations: ['Typowy błąd modelu ~±0.5 jednostki logP — traktuj jako oszacowanie, nie pomiar.'],
  }));
  statements.push(st('VERIFIED', 'VERIFIED', `TPSA ${f(p.tpsa, 1)} Å² (Ertl 2000, RDKit).`, {
    descriptors: ['tpsa'], origin: 'Obliczenie RDKit (Descriptors.TPSA)',
    limitations: ['Deskryptor topologiczny — nie zastępuje pomiaru permeacji.'],
  }));
  statements.push(st('VERIFIED', 'VERIFIED', `Donory/akceptory wiązań H: HBD ${p.hbd}, HBA ${p.hba} (zliczenie grafowe, RDKit).`, {
    descriptors: ['hbd', 'hba'], origin: 'Obliczenie RDKit (Lipinski.NumHDonors / NumHAcceptors)',
  }));
  statements.push(st('VERIFIED', 'VERIFIED',
    p.lipinskiPass ? `Reguła Lipinskiego: spełniona (${p.lipinskiViolations} naruszeń).` : `Reguła Lipinskiego: ${p.lipinskiViolations} naruszeń.`, {
    descriptors: ['molWt', 'logP', 'hbd', 'hba', 'lipinskiViolations'],
    rule: 'Ro5: MW≤500, LogP≤5, HBD≤5, HBA≤10', origin: 'Reguła nad zweryfikowanymi deskryptorami RDKit',
    limitations: ['Ro5 to heurystyka biodostępności doustnej, nie gwarancja wchłaniania.'],
  }));

  // ── PROMISING: grounded interpretation of favorable verified values ────────────
  if (p.lipinskiPass) {
    groundingRules.push('lipinskiPass → profil drug-like');
    statements.push(st('PROMISING', 'GROUNDED', 'Profil fizykochemiczny zgodny z drug-like (Ro5) — sprzyja podaniu doustnemu.', {
      descriptors: ['molWt', 'logP', 'hbd', 'hba'], rule: 'Ro5 spełniona → drug-like',
      origin: 'Interpretacja deterministyczna na zweryfikowanych faktach RDKit',
      assumptions: ['Ro5 przewiduje tendencję, nie potwierdza biodostępności.'],
      limitations: ['Nie dowodzi wchłaniania, ekspozycji ani aktywności — to wymaga eksperymentu.'],
    }));
    strengths.push('Zgodność z regułą Lipinskiego (Ro5) — korzystny punkt startowy dla podania doustnego.');
  } else {
    risks.push(`Naruszenie Ro5 (${p.lipinskiViolations}) — podwyższone ryzyko słabej biodostępności doustnej.`);
  }
  if (p.logP >= 0 && p.logP <= 3) {
    groundingRules.push('0 ≤ LogP ≤ 3 → zrównoważona lipofilowość');
    statements.push(st('PROMISING', 'GROUNDED', `Zrównoważona lipofilowość (LogP ${f(p.logP)}) — korzystny zakres dla permeacji i rozpuszczalności.`, {
      descriptors: ['logP'], rule: '0 ≤ LogP ≤ 3', origin: 'Interpretacja deterministyczna na LogP',
      assumptions: ['LogP jest oszacowaniem modelowym.'], limitations: ['Rozpuszczalność i permeacja wymagają pomiaru.'],
    }));
    strengths.push(`Zrównoważona lipofilowość (LogP ${f(p.logP)}).`);
  }
  if (p.tpsa < 90) {
    groundingRules.push('TPSA < 90 → sprzyja absorpcji doustnej');
    strengths.push(`Niska TPSA (${f(p.tpsa, 1)} Å²) — sprzyja absorpcji doustnej.`);
  }

  // ── UNKNOWN + risks: things descriptors CANNOT establish (never fabricate) ──────
  if (p.logP > 5) risks.push(`Wysoka lipofilowość (LogP ${f(p.logP)} > 5) — ryzyko słabej rozpuszczalności.`);
  if (p.tpsa > 140) risks.push(`Wysoka TPSA (${f(p.tpsa, 1)} Å² > 140) — przewidywana słaba permeacja bierna.`);
  for (const name of alertNames) {
    risks.push(`Alert strukturalny: ${name} — do oceny pod kątem liabilności (nie przesądza toksyczności).`);
    statements.push(st('UNKNOWN', 'GENERAL', `Wykryto alert strukturalny „${name}" — wymaga oceny ekspertackiej.`, {
      origin: 'Ogólna wiedza chemii medycznej (dopasowanie wzorca strukturalnego)',
      assumptions: ['Alert wskazuje motyw do sprawdzenia, nie potwierdza szkodliwości.'],
      limitations: ['Nie stanowi predykcji toksyczności ani aktywności — wymaga danych eksperymentalnych.'],
    }));
  }

  // These are ALWAYS unknown from structure alone — we state that explicitly.
  unknowns.push('Aktywność biologiczna i cel molekularny — nie wynikają z deskryptorów fizykochemicznych.');
  unknowns.push('Toksyczność i profil bezpieczeństwa in vitro/in vivo — nieoznaczone.');
  unknowns.push('Rozpuszczalność, przenikalność i parametry PK — wartości zmierzone nieznane.');
  unknowns.push('Metabolizm i interakcje — nieoznaczone.');
  statements.push(st('UNKNOWN', 'GENERAL', 'Genesis nie przewiduje aktywności biologicznej ani wyników eksperymentów — te pozostają nieznane do czasu badań.', {
    origin: 'Zasada uczciwości Genesis', limitations: ['Deskryptory obliczeniowe nie zastępują danych eksperymentalnych.'],
  }));

  // ── VALIDATION: standard workflows only, never predicted outcomes ──────────────
  const validation: ValidationStep[] = [
    { workflow: 'Oznaczenie rozpuszczalności kinetycznej i termodynamicznej', purpose: 'zmierzyć realną rozpuszczalność (uzupełnić LogP/TPSA obliczone)', note: REQUIRED },
    { workflow: 'Test permeacji (PAMPA / Caco-2)', purpose: 'zmierzyć przenikalność błonową', note: REQUIRED },
    { workflow: 'Panel ADMET in vitro (mikrosomy, CYP, hERG)', purpose: 'ocenić metabolizm i wczesne liabilności', note: REQUIRED },
    { workflow: 'Docking molekularny wobec hipotetycznego celu', purpose: 'wygenerować hipotezę wiązania do dalszej weryfikacji', note: REQUIRED },
    { workflow: 'Testy komórkowe (aktywność / cytotoksyczność)', purpose: 'zmierzyć efekt biologiczny', note: REQUIRED },
    { workflow: 'Wstępne badania PK in vivo', purpose: 'zmierzyć ekspozycję i klirens', note: REQUIRED },
  ];

  // ── NEXT STEPS: what the scientist should do, honestly ─────────────────────────
  const next: string[] = [];
  if (!p.lipinskiPass || p.logP > 5) next.push('Rozważ optymalizację struktury pod kątem lipofilowości/rozpuszczalności przed testami in vitro.');
  if (alertNames.length) next.push('Zleć ekspercki przegląd alertów strukturalnych przed syntezą.');
  next.push('Zmierz rozpuszczalność i permeację, aby zastąpić oszacowania obliczeniowe danymi.');
  next.push('Sformułuj i przetestuj hipotezę celu molekularnego w standardowym workflow (docking → assay).');
  for (const n of next) statements.push(st('NEXT', 'GENERAL', n, { origin: 'Sugerowany standardowy workflow badawczy', limitations: [REQUIRED] }));

  // ── Transparency: why Genesis reached this conclusion ──────────────────────────
  const removedClaims = [
    'Nie twierdzimy, że cząsteczka jest aktywna biologicznie.',
    'Nie przewidujemy wyniku żadnego eksperymentu.',
    'Nie deklarujemy skuteczności ani bezpieczeństwa.',
    'Nie prezentujemy interpretacji (⚠) jako zweryfikowanego faktu (✓).',
  ];

  return {
    statements, strengths, risks, unknowns, validation,
    transparency: {
      verifiedDescriptors: ['molWt', 'logP', 'tpsa', 'hbd', 'hba', 'lipinskiViolations'],
      groundingRules,
      removedClaims,
      confidenceNote: 'Klasyfikacja: ✓ Zweryfikowane obliczenie (RDKit) · ⚠ Interpretacja ugruntowana (reguła na faktach) · ⓘ Ogólna wiedza naukowa. LogP oznaczono jako oszacowanie modelowe (~±0.5).',
      limitations: [
        'Raport opiera się wyłącznie na deskryptorach obliczeniowych RDKit — bez danych eksperymentalnych.',
        'Deskryptory fizykochemiczne nie przewidują aktywności biologicznej ani bezpieczeństwa.',
        'Każdy wniosek kierunkowy wymaga potwierdzenia eksperymentalnego.',
      ],
    },
  };
}

export const DECISION_CATEGORY_META: Record<DecisionCategory, { label: string; icon: IconName }> = {
  VERIFIED: { label: 'Zweryfikowane', icon: 'check' },
  PROMISING: { label: 'Obiecujące', icon: 'alert' },
  UNKNOWN: { label: 'Nieznane', icon: 'search' },
  VALIDATION: { label: 'Wymaga walidacji', icon: 'flask' },
  NEXT: { label: 'Następne kroki', icon: 'book' },
};

export const EVIDENCE_TAG_META: Record<EvidenceTag, { kind: 'ok' | 'warn' | 'info'; label: string; icon: IconName }> = {
  VERIFIED: { kind: 'ok', label: 'Zweryfikowane obliczenie', icon: 'check' },
  GROUNDED: { kind: 'warn', label: 'Interpretacja ugruntowana', icon: 'alert' },
  GENERAL: { kind: 'info', label: 'Ogólna wiedza naukowa', icon: 'spark' },
};
