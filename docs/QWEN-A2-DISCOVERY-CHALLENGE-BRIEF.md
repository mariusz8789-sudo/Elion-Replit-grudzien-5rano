# QWEN IMPLEMENTATION BRIEF — D-062
## GENESIS A2/LOWER-HARM REAL DISCOVERY CHALLENGE
### baseline → hypotheses → generated candidates → frozen experiment → real evidence → falsification → D-057 → WinnerRecord → ResearchRecipe

**Repository state this brief was written against: commit `856518b`, branch `claude/genesis-autonomous-completion-95bt4e`.**
Every path, export, constant, fingerprint and number below was read or executed from that commit. Nothing here is recalled from memory.

---

## §0. HOW TO READ THIS BRIEF — AND THE ONE RULE THAT MATTERS MOST

**READ THE REPO BEFORE YOU TOUCH THE CODE.** You have no repository access, so this
brief carries the repo to you. Every contract you need is quoted verbatim below. If
something you want to call is **not** quoted here, it is not confirmed to exist —
say so, do not invent its signature.

Every section that names existing code uses this format:

```
REAL FILE:        packages/frontend/src/core/...
EXPORTED CONTRACT: the exact TypeScript signature, copied from the file
CURRENT FUNCTION:  what it does today, in one sentence
USED BY:           the real call sites
DO NOT MODIFY:     what you must not change, and why
```

**The single most important rule of this mission:**

> A run that ends `NO_WINNER`, names the exact blocker, and proposes the next
> experiment **PASSES**.
> A run that reports a `WINNER` without real evidence clearing the real, unmodified
> gates **FAILS**, no matter how good the code is.

---

## §1. THE MISSION IN ONE PARAGRAPH

Genesis today generates and ranks candidates. It has never yet produced a
`WinnerRecord` on real evidence, and therefore never a `ResearchRecipe`. This
mission is the first honest attempt to get there: pick one real question inside the
existing LOWER-HARM / A2 substrate, freeze a real baseline and a real
"better-than-baseline" rule **before** looking at results, let Genesis generate
candidates that are **not in its fixed candidate set**, give each one a mechanism and
a falsifiable prediction, test them against **real randomised trial evidence already
pinned in this repo**, run at least three rounds where round N+1 genuinely depends on
round N, and then let the **existing, unmodified** D-057 Winner Promotion Gate decide.
If it promotes, build the `ResearchRecipe`. If it does not, report exactly why and
what experiment would change the answer.

---

## §2. WHAT I VERIFIED BY EXECUTION (not by reading)

I ran the real pipeline at `856518b`. These are its actual outputs. You are building
on top of this exact state.

### §2.1 `node scripts/gov-drug-lower-harm-funnel-demonstrator.mjs`

```
CANDIDATE POOL: 12 real, mechanism-generated candidates
HARD FILTER: qualifying 3, eliminated 9
diversity: 1 distinct mechanism class among qualifiers
TOP10 (filled 3): GLP-1 (CHEMBL1240772) 1.2750 | LIRAGLUTIDE (CHEMBL4084119) -0.0457 | EXENATIDE (CHEMBL414357) -0.2000
TOP2: CHEMBL1240772, CHEMBL4084119
FROZEN CRITERIA fingerprint: 2d525a35
G2: EXPERIMENT_SELECTED, observable EFFICACY_DELTA_PP, falsificationPower 100%, unresolvedPairs 0
ADJUDICATION: CHEMBL1240772 REFUSE (EVIDENCE_SUFFICIENT); CHEMBL4084119 REFUSE (EVIDENCE_SUFFICIENT)
VERDICT: NO_WINNER
  [HELD]   G2_SEPARATES_TOP2
  [FAILED] AGREES_WITH_PRE_EXPERIMENT_RANK — G2 favours CHEMBL4084119; pre-experiment #1 was CHEMBL1240772
  [FAILED] FAVOURED_CANDIDATE_PASSES_SAFETY_GATE — REFUSE (EVIDENCE_SUFFICIENT)
runFingerprint: 2e6eb55e
```

### §2.2 Per-candidate evidence inventory (probe over `runA2Analysis()`)

| ChEMBL id | name | efficacy rows | HbA1c | DIRECT | INDIRECT | safety rows | vetoed |
|---|---|---|---|---|---|---|---|
| CHEMBL414357 | EXENATIDE | 1 | 1 | 0 | 1 | 8 | no |
| CHEMBL5314341 | GLUCAGON | 0 | 0 | 0 | 0 | 0 | no |
| CHEMBL1240772 | GLP-1 | 1 | 1 | 0 | 1 | 8 | no |
| CHEMBL2381848 | PF-06291874 | 1 | 1 | 0 | 1 | 8 | no |
| CHEMBL4084119 | LIRAGLUTIDE | 2 | 2 | 0 | 2 | 8 | no |
| CHEMBL4518483 | DANUGLIPRON | 1 | 1 | 0 | 1 | 8 | **yes** |
| CHEMBL4446782 | ORFORGLIPRON | 1 | 1 | 0 | 1 | 8 | **yes** |
| CHEMBL567 | PERPHENAZINE | 0 | 0 | 0 | 0 | 0 | no |
| CHEMBL4297630 | COTADUTIDE | 3 | 2 | 0 | 2 | 8 | **yes** |
| CHEMBL4297839 | TIRZEPATIDE | 1 | 1 | 0 | 1 | 8 | **yes** |
| CHEMBL1933349 | MK-0893 | 0 | 0 | 0 | 0 | 8 | no |
| CHEMBL3707351 | ADOMEGLIVANT | 3 | 3 | 0 | 3 | 8 | no |

### §2.3 THE THREE FINDINGS THAT DEFINE THIS MISSION

**FINDING 1 — the evidence-STRENGTH axis is NOT the blocker here.**
Every efficacy row in the space today is `NAIVE_INDIRECT`, which
`evidenceClassMapping.ts` maps to `INDIRECT_RANDOMISED` = **rank 9**, and the D-057
gate's `STRONG_THRESHOLD_RANK` **is** `INDIRECT_RANDOMISED` = 9. So `EVIDENCE_STRENGTH`
already passes in this domain. This is the opposite of the NASA/Kepler run (D-061),
where `OBSERVATIONAL` = 6 made promotion structurally impossible. **Promotion is
reachable in LOWER-HARM.** That is why this domain, and not another, is the target.

**FINDING 2 — the real blocker is evidence VOLUME per candidate.**
`MINIMUM_OBSERVATIONS = 3` (`agent/practicalCandidateGate.ts`), enforced twice: once
by `evaluatePracticalCandidate` (`EVIDENCE_SUFFICIENT`) and again by
`canPromoteToWinnerRecord`. No non-vetoed, floor-clearing candidate in the space has
3 efficacy rows. That is why the funnel refuses. It is a correct refusal.

**FINDING 3 — there is real, already-pinned, already-hashed DIRECT randomised
evidence in this repository that the pipeline has never read.**
`biotechData/a2-ozempic-substitute/reference-semaglutide-NCT03987919.json` is
SURPASS-2. It is used today **only** as the semaglutide comparator and (in D-046) for
one safety category. Its **four randomised arms** carry HbA1c and adverse-event counts
that no candidate-side code path reads. `a2Surpass2ReAdjudication.ts` says so in its
own header, verbatim:

> *"Efficacy is NOT touched. SURPASS-2 also carries HbA1c outcomes; pulling those in
> would be a second, undeclared change riding on this one."*

D-062 is that second change — **declared, sealed, and scoped on its own**, which is
exactly the form the earlier module said it would have to take.

---

## §3. THE DISCOVERY CHALLENGE — `GOV-DRUG-D062-DOSE-STRATIFIED-LOWER-HARM`

### §3.1 The question

> Among incretin-agonist **dose strata** — not molecules — is there one that
> retains at least the baseline's HbA1c effect while carrying **lower** measured
> harm than the baseline, under the already-frozen LOWER-HARM rule?

### §3.2 Why this is a real discovery and not a re-ranking

The existing candidate space is **molecule-level**. A trial's adverse-event arm is
picked by `pickCandidateAeGroupTitle` inside the unmodified `extractCandidateSafety`,
whose rule is **"highest parsed mg wins"**. Consequence, structurally:

> **Every dose below a trial's maximum is invisible to Genesis today.**

So `tirzepatide @ 5 mg` is **not a member of the fixed candidate set**, cannot be
retrieved from it, and is not a re-ranking of it. It is a *strategy* candidate in the
sense §3 of the mission allows: a regimen, not a new molecule. It carries a real
mechanism hypothesis, a real falsifiable prediction, and — uniquely in this repo —
**within-trial randomised evidence** for both its benefit and its harm.

### §3.3 The mechanism hypothesis (the "why should this work?" §7 demands)

> Incretin-receptor agonist **efficacy** and **gastrointestinal / systemic harm** are
> both dose-dependent, but they are not the same function of dose. If the efficacy
> dose-response saturates earlier than the harm dose-response, then a sub-maximal
> dose stratum can sit above the efficacy floor while carrying strictly less harm
> than both the label-maximum dose and the baseline.

That is a claim about two curves, it predicts a specific number at each dose, and it
is falsified by the arms themselves. It is not "score = 0.91".

### §3.4 The four hypotheses Genesis must carry (minimum)

| id | statement | mechanism | falsified by |
|---|---|---|---|
| `H-SATURATING-EFFICACY` | HbA1c effect saturates with dose (concave) | receptor occupancy saturation | a fitted efficacy dose-response whose held-out arm error exceeds tolerance, or a monotone-linear form fitting better |
| `H-LINEAR-HARM` | AE incidence keeps rising with dose (no saturation) | exposure-proportional GI signalling | a fitted harm dose-response that saturates as strongly as efficacy |
| `H-SEPARATION` | there exists a dose where efficacy ≥ floor AND harm < baseline | the two curves separate | no dose stratum satisfies both against the real arm counts |
| `H-NO-SEPARATION` | no such dose exists; harm tracks efficacy | shared mechanism | any stratum that does satisfy both |

`H-SEPARATION` and `H-NO-SEPARATION` are a genuine mutually-exclusive pair. That is
what makes the experiment discriminating rather than confirmatory.

---

## §4. THE BASELINE — REAL, PROVENANCED, FROZEN BEFORE THE RUN

```
BASELINE IDENTITY
  name                 semaglutide
  moleculeChemblId     CHEMBL2108724
  regimen              1 mg subcutaneous weekly
  armId                EG003 / OG002 (SURPASS-2 arm identifiers)
  nAtRisk              469
SOURCE
  registry             CLINICALTRIALS_GOV
  studyId              NCT03987919  (SURPASS-2)
  sourceUrl            https://clinicaltrials.gov/api/v2/studies/NCT03987919
  narrowed sha256      385c58a1b7a19bedac0bb303846a8cffb23242d912edd7fc91fa93d5b278a8b0  (42793 bytes)
  upstream raw sha256  1e72fb8ddc9131e0a384d49b83ed2b5ed17915d805458fbc4c659d8c06f70f12  (120327 bytes)
  retrievedAt          2026-09-13T13:45:36.656Z
  randomised           true
POPULATION (carried, never assumed)
  "Adults with type 2 diabetes, inadequately controlled on metformin (40 weeks)"
OUTCOME METRICS (read from the pinned file, never typed by hand)
  HbA1c change from baseline, LEAST_SQUARES_MEAN, Standard Error, "Percentage of HbA1c"
  adverse-event counts at the registry's own >=5% reporting threshold
APPLICABILITY CONDITIONS
  T2D on metformin; 40 weeks; this dose; this trial's population only
```

**Two baselines exist in this repo and they must not be confused.**

* `REFERENCE_HBA1C_DELTA_PP = -1.7` (`a2OzempicSubstitute.ts`, from SUSTAIN-7
  `NCT03191396`) is the **efficacy-floor reference** the existing preregistration
  already froze. **Keep using it for the floor.** Do not change it.
* The **SURPASS-2 semaglutide arm** is the **within-trial comparator** for the new
  direct comparisons. It is the only arm that was randomised against the candidate
  arms, and therefore the only one that can yield `DIRECT_RANDOMISED`.

Using the SUSTAIN-7 constant for the floor and the SURPASS-2 arm for the comparison
is not an inconsistency — it is the difference between "how much effect must a
candidate retain" (a frozen policy number) and "what was this candidate randomised
against" (a fact about a study). State this distinction explicitly in your code
comments; a reviewer will ask.

---

## §5. THE FROZEN "BETTER THAN BASELINE" RULE

### §5.1 It is INHERITED, not invented

Every numeric term below already exists, already sealed, in
`govDrugLowerHarmPreregistration.ts` (`LOWER_HARM_PREREGISTRATION.fingerprint = c827c79c`)
and `a2OzempicSubstitutePreregistration.ts` (`A2_PREREGISTRATION.fingerprint = 4642088a`).
**You may not re-tune any of them.** D-062's own seal *records* them; it does not set them.

```
BETTER_THAN_BASELINE(candidate stratum S, baseline B) :=
  (1) EFFICACY FLOOR      efficacy(S) / REFERENCE_HBA1C_DELTA_PP  >=  0.70
                          [LOWER_HARM_PREREGISTRATION.efficacyFloor, unchanged]
  AND
  (2) EFFICACY NON-INFERIORITY TO THE COMPARATOR ARM
                          hba1cChange(S) <= hba1cChange(B)   (more negative = stronger)
  AND
  (3) STRICTLY LOWER HARM ON AT LEAST ONE PREREGISTERED CATEGORY
                          riskRatio(S vs B) < 1 with ci95.high < 1
  AND
  (4) NO WORSE HARM ANYWHERE
                          no preregistered category has riskRatio > 1 with ci95.low > 1
                          [this IS the existential safety veto, A2_PREREGISTRATION
                           .effectSizeThresholds.safetyRiskRatioMeaningfulDeviation = 1,
                           applied by the unmodified falsifyCandidate]
  AND
  (5) EVIDENCE MINIMUM    >= 3 real observations behind S
                          [agent/practicalCandidateGate.ts::MINIMUM_OBSERVATIONS = 3]
  AND
  (6) EVIDENCE STRENGTH   >= 1 observation at rank >= INDIRECT_RANDOMISED (9)
                          [orchestrator/winnerGate.ts, unchanged]
```

Conjuncts (1)/(4) are the existing rule verbatim. (2)/(3) are what "better than
baseline" means once a *within-trial comparator arm* exists — which it did not before
D-062. (5)/(6) are the existing gates.

### §5.2 Freeze it properly

Seal a `D062_PREREGISTRATION` object with its own `scenarioId`, its own fingerprint,
and an explicit `inheritedFrom: ['c827c79c', '4642088a']`. Compute the fingerprint
**at module load**, before any candidate is read. Assert the literal value in a test
**before** the test uses it — the same pattern
`govDrugLowerHarmPreregistration.test.ts` already uses.

### §5.3 The verdict vocabulary — reuse, do not extend

`LOWER_HARM_ALLOWED_VERDICTS = ['WINNER','CONFLICTING_EVIDENCE','NO_WINNER','INSUFFICIENT_EVIDENCE']`.
No new verdict label. `CONFLICTING_EVIDENCE` is the correct answer when one stratum
dominates on efficacy and another on harm — do not force a tie-break.

### §5.4 HARK DISCLOSURE — READ THIS, IT PROTECTS THE RESULT

While choosing this target I **did look at** SURPASS-2's arm-level HbA1c values and
adverse-event counts, to establish that the challenge is *feasible at all* (that
≥3 direct observations exist, and that both outcome directions are physically
possible in the data). I did **not** tune a single threshold to those numbers —
every threshold in §5.1 is imported from a seal that predates D-062 by many commits.

Record this disclosure in `docs/DECISIONS.md` under D-062. Do not hide it. A
preregistration whose author had seen the data, and which says so and imports all its
constants from an earlier seal, is honest. One that pretends otherwise is not.

---

## §6. REAL DATA — EXACTLY WHAT TO READ AND WHERE

```
REAL FILE: packages/frontend/src/core/biotechData/a2-ozempic-substitute/reference-semaglutide-NCT03987919.json
STRUCTURE (verified by inspection at 856518b):
  top-level keys: nctId, briefTitle, arms, hba1cOutcomes, weightOutcomes, adverseEvents
  hba1cOutcomes: 4 entries; weightOutcomes: 2; arms: 4
  adverseEvents.eventGroups:
    EG000 "5 mg Tirzepatide"   otherNumAtRisk 470  seriousNumAffected 33  deaths 4
    EG001 "10 mg Tirzepatide"  otherNumAtRisk 469  seriousNumAffected 25  deaths 4
    EG002 "15 mg Tirzepatide"  otherNumAtRisk 470  seriousNumAffected 27  deaths 4
    EG003 "1 mg Semaglutide"   otherNumAtRisk 469  seriousNumAffected 13  deaths 1
  adverseEvents.otherEvents terms (the registry's own >=5% set):
    Abdominal pain, Constipation, Diarrhoea, Dyspepsia, Nausea, Vomiting, Decreased appetite
  hba1cOutcomes[0] PRIMARY "Change From Baseline in Hemoglobin A1c (HbA1c) (10 mg and 15 mg)"
    paramType LEAST_SQUARES_MEAN, dispersionType "Standard Error", unit "Percentage of HbA1c"
    groups OG000 "10 mg Tirzepatide", OG001 "15 mg Tirzepatide", OG002 "1 mg Semaglutide"
  hba1cOutcomes[1] SECONDARY "Change From Baseline in HbA1c (5 mg)"
    groups OG000 "5 mg Tirzepatide", OG001 "1 mg Semaglutide"
```

**CRITICAL PARSING TRAP — this will bite you if you skip it.**
`groupId` values are **outcome-local**. In `hba1cOutcomes[0]`, `OG002` is semaglutide.
In `hba1cOutcomes[1]`, semaglutide is `OG001`. And in `adverseEvents.eventGroups` the
semaglutide arm is `EG003`. **Never** match arms by `groupId` across outcomes. Match by
the group **title**, exactly as `surpass2ArmByTitle()` already does, and throw on a
title that does not resolve — never fall back to an index.

**Fail closed on absence.** A missing count is NO DATA, never a zero. This is already
the rule in `surpass2DirectEvidence.ts` (`surpass2Observation` throws); keep it.

---

## §7. REUSE / EXTEND / NEW — THE COMPLETE TABLE

### §7.1 REUSE VERBATIM — call these, never reimplement, never edit

| what | REAL FILE | EXPORTED CONTRACT |
|---|---|---|
| NL → problem | `core/orchestrator/nl.ts` | `parseProblem(problemId: string, input: NLInput, hash: (v:unknown)=>string): ProblemRecord` |
| the 20-stage pipeline | `core/orchestrator/orchestrator.ts` | `runScientificDiscovery(problem, adapters, mode): DiscoveryRun` |
| the promotion gate | `core/orchestrator/winnerGate.ts` | `canPromoteToWinnerRecord(input: PromotionInput): PromotionResult`, `asEvidenceClass(v: string): EvidenceClass` |
| evidence class ranks | `core/agent/evidenceProvenance.ts` | `DEFAULT_EVIDENCE_CLASS_RANK` |
| computed evidence class | `core/agent/evidenceProvenance.ts` | `classifyComparisonEvidenceClass(exposed, reference): EvidenceClass` |
| risk-ratio + CI | `core/agent/evidenceProvenance.ts` | `compareCountedOutcomes(exposed, reference): RiskRatioComparison \| null` |
| SURPASS-2 arms/observations | `core/biotechData/surpass2DirectEvidence.ts` | `surpass2Arms()`, `surpass2ArmByTitle(title)`, `surpass2Observation(term, armTitle)`, `surpass2DirectComparisons(term, referenceArmTitle)`, `SURPASS2_STUDY`, `SURPASS2_POPULATION` |
| A2 analysis | `core/biotechData/a2OzempicSubstitute.ts` | `runA2Analysis(): A2AnalysisReport`, `loadCandidateSummaries()`, `falsifyCandidate(...)`, `scoreCandidate(...)`, `extractCandidateSafety(...)`, `decideA2Verdict(...)` |
| lower-harm ranking | `core/biotechData/govDrugLowerHarmRanking.ts` | `rankForLowerHarm(reports)`, `evaluateEfficacyFloor(report)`, `computeLowerHarmScore(report)` |
| the funnel organs | `core/biotechData/govDrugLowerHarmFunnel.ts` | `checkDiversity`, `selectTop10`, `selectTop2`, `freezeFalsificationCriteria`, `runG2Falsification`, `runAdjudication`, `decideFunnelVerdict`, `LOWER_HARM_TOP10_CAP`, `LOWER_HARM_TOP2_CAP` |
| the safety/governance gate | `core/agent/practicalCandidateGate.ts` | `evaluatePracticalCandidate(gated): GateDecision`, `surfaceFor(...)`, `MINIMUM_OBSERVATIONS = 3` |
| discriminating experiment | `core/agent/differentiatingExperimentGenerator.ts` | `generateDifferentiatingExperiment(...)` |
| custody | `core/orchestrator/evidenceCustody.ts` + `core/evidenceConnectors/store.ts` | `verifyEvidenceCustody(store, source, port): Promise<EvidenceCustodyResult>` |
| the Mind layer | `core/mind/*` | `runResearch`, `ResearchStateLog`, `MindKnowledgeIndex`, `expectedDiscriminationGain`, `computeNoveltyLevel`, `buildStructuredProblemExtension` |
| model space | `core/agent/modelSpace.ts` | `generateModelSpace`, `mutateModelSpec`, `fitModelSpec`, `modelSelectionScore`, `holdoutScore`, `modelSpecFingerprint`, `renderModelSpec` |
| hashing | `core/events/hash.ts` | `canonicalJson(v)`, `fnv1a(s)` |

### §7.2 EXTEND — compatible additions only, no behaviour change for existing callers

| what | REAL FILE | how |
|---|---|---|
| arm-level observation ids | new module (see §7.3), **not** an edit to `govDrugLowerHarmFunnel.ts` | today `buildGatedCandidate` builds `observationIds` as `report.efficacy.map(e => 'ctgov:' + e.nctId)` — trial-level, so three arms of one trial collapse to three identical strings. Your new adapter must build **arm-level** ids: `ctgov:NCT03987919:OG000`. Distinct arms are distinct observations; three copies of one NCT id are not. |
| the Recipe contract | `core/biotechData/govLowerHarmRecipe.ts` | **add optional fields only.** Existing callers (`govLowerHarmAdapters.ts::buildRecipe`) must keep compiling and must keep producing the same `recipeFingerprint` when the new fields are absent. See §12. |
| the domain registry | `core/orchestrator/genesisDomainRegistry.ts` | add `'D062_DOSE_STRATIFIED'` to `GenesisDomainId` and a descriptor. Do not remove or rename the existing two. |

### §7.3 NEW — the only files you create

```
packages/frontend/src/core/biotechData/d062DoseStratifiedPreregistration.ts
packages/frontend/src/core/biotechData/d062DoseStrata.ts
packages/frontend/src/core/biotechData/d062DoseResponse.ts
packages/frontend/src/core/orchestrator/d062Adapters.ts
packages/frontend/src/core/orchestrator/d062Discovery.ts
packages/frontend/src/__tests__/d062DoseStratifiedDiscovery.test.ts
scripts/genesis-d062-discovery-challenge.mjs
```

Seven files. If your design needs an eighth, say why in one sentence at the top of it.

---

## §8. THE CONTRACTS YOU MUST IMPLEMENT AGAINST — VERBATIM

### §8.1 `OrchestratorAdapters` — every port is SYNCHRONOUS

```
REAL FILE: packages/frontend/src/core/orchestrator/contracts.ts
DO NOT MODIFY: this file. Not one line.
```

```ts
export interface OrchestratorAdapters {
  generate(req: StructuredExperimentRequest): readonly Candidate[];
  normalizeDedup(cs: readonly Candidate[]): readonly Candidate[];
  hardFilter(cs: readonly Candidate[]): readonly Candidate[];
  diversity(cs: readonly Candidate[]): readonly Candidate[];
  rank(cs: readonly Candidate[]): readonly Candidate[];
  top10(cs: readonly Candidate[]): readonly Candidate[];
  top2(cs: readonly Candidate[]): readonly Candidate[];
  seal(problem: ProblemRecord): FreezeSeal;
  verifySealUnchanged(seal: FreezeSeal): boolean;
  planExperiments(top2: readonly Candidate[], seal: FreezeSeal): readonly string[];
  execute(plan: readonly string[]): readonly ExecutedExperiment[];
  ingestEvidence(executed: readonly ExecutedExperiment[]): readonly IngestedEvidence[];
  falsify(top2: readonly Candidate[], evidence: readonly ExecutedExperiment[], seal: FreezeSeal): FalsificationOutcome;
  adjudicate(top2: readonly Candidate[], evidence: readonly ExecutedExperiment[], seal: FreezeSeal): AdjudicationOutcome;
  compare(top2: readonly Candidate[], seal: FreezeSeal): string;
  buildRecipe(winner: WinnerRecordRef): RecipeOutcome | null;
  recommendNext(run: DiscoveryRun): string;
  hash(value: unknown): string;
}
```

**NOT ONE OF THESE MAY RETURN A `Promise`.** Custody and any other async work happens
in the entry-point wrapper *before* the pipeline starts, and the resolved value is
injected as a plain value. `govLowerHarmDiscovery.ts` is your worked example. If you
return a Promise from a port, everything downstream silently compares `[object Promise]`.

**`top2()` is a stage NAME, not a length constraint.** Its signature is
`(cs: readonly Candidate[]) => readonly Candidate[]`. `govE2E01Adapters.ts` already
returns its real TOP3 there. Return the number of strata your frozen rule says to
compare — but if you return more than 2, say so in the stage note.

### §8.2 The supporting shapes

```ts
export interface Candidate {
  readonly candidateId: string;
  readonly mechanismClass: string;
  readonly score: number;
  readonly riskGrade: string;
  readonly evidenceRefs: readonly string[];
}
export interface ExecutedExperiment {
  readonly experimentId: string;
  readonly evidenceClass: string;                        // -> asEvidenceClass()
  readonly summary: Readonly<Record<string, number>>;    // MUST carry observationCount
}
export interface IngestedEvidence { readonly ref: string; readonly provenance: string; }
export interface FalsificationOutcome { readonly survived: readonly boolean[]; readonly note: string; }
export interface AdjudicationOutcome { readonly verdict: Verdict; readonly winner?: WinnerRecordRef; }
export interface WinnerRecordRef {
  readonly winnerId: string;
  readonly verdict: 'WINNER';
  readonly conjunctionOk: boolean;
  readonly fingerprints: Readonly<Record<string, string>>;
}
export interface RecipeOutcome { readonly recipeFingerprint: string; }
export type Verdict = 'WINNER' | 'NO_WINNER' | 'CONFLICTING_EVIDENCE' | 'INSUFFICIENT_EVIDENCE';
```

### §8.3 How the D-057 gate reads your `execute()` output — the exact code

```
REAL FILE: packages/frontend/src/core/orchestrator/orchestrator.ts (lines ~113-125)
DO NOT MODIFY: this file. The gate stays exactly as it is.
```

```ts
const inventory = ex.map((e) => {
  const declared = e.summary.observationCount;
  return { evidenceClass: asEvidenceClass(e.evidenceClass),
           observationCount: Number.isFinite(declared) && declared > 0 ? declared : 1 };
});
const promotion = canPromoteToWinnerRecord({ adjudicationVerdict: adj.verdict, inventory });
if (promotion.outcome === 'PROMOTE') { ... A.buildRecipe(adj.winner) ... }
else { push('18_RECIPE_OR_LOCK', 'LOCKED', promotion, `NO_PROMOTION: ${promotion.reasons.join('; ')}`); }
```

So your `execute()` must emit, **per stratum**, `evidenceClass: 'DIRECT_RANDOMISED'`
and a **truthful** `summary.observationCount` = the number of real, distinct arm-level
observations behind that stratum. **Never inflate this number.** If a stratum has 2
observations, write 2 and let the gate refuse. An inflated count is the single most
destructive thing you could do in this mission, because it is invisible in the output
and it manufactures a winner.

### §8.4 The gate itself, verbatim — so you know exactly what you are up against

```
REAL FILE: packages/frontend/src/core/orchestrator/winnerGate.ts
DO NOT MODIFY.
```

```ts
const STRONG_THRESHOLD_RANK = DEFAULT_EVIDENCE_CLASS_RANK.INDIRECT_RANDOMISED;  // 9

export function canPromoteToWinnerRecord(input: PromotionInput): PromotionResult {
  // VERDICT_NOT_WINNER      if adjudicationVerdict !== 'WINNER'
  // EVIDENCE_SUFFICIENT     if totalObservations < MINIMUM_OBSERVATIONS (3)
  // EVIDENCE_STRENGTH       if strongCount < minimumStrong (default 1)
  // PROMOTE iff reasons.length === 0
}
```

`DEFAULT_EVIDENCE_CLASS_RANK` = `{DIRECT_RANDOMISED:10, INDIRECT_RANDOMISED:9,
POOLED_META:8, NETWORK_META:7, OBSERVATIONAL:6, REGULATORY_LABEL:5, POST_MARKETING:4,
MECHANISTIC:3, COMPUTATIONAL:2, UNVERIFIED:1}`.

### §8.5 `compareCountedOutcomes` — what it gives you and what it refuses

```
REAL FILE: packages/frontend/src/core/agent/evidenceProvenance.ts
```

```ts
export interface CountedOutcomeObservation {
  readonly observationId: string;
  readonly context?: ObservationContext;
  readonly study: SourceStudyIdentity;   // carries contentSha256 + randomised
  readonly arm: ArmIdentity;             // { groupId, title, nAtRisk }
  readonly term: string;
  readonly numAffected: number;
  readonly numAtRisk: number;
  readonly codingSystem: string | null;
  readonly population: string;
}
export function compareCountedOutcomes(exposed, reference): RiskRatioComparison | null;
```

* It **throws** if `arm.nAtRisk !== numAtRisk` — "one of the two was read from the
  wrong arm". Do not paper over this; it is the trap that caught a real defect before.
* It returns **`null`**, not a fabricated interval, when either arm has zero events.
  Treat `null` as NO COMPARISON, never as "no difference".
* `evidenceClass` is **computed** by `classifyComparisonEvidenceClass`, never declared:
  same randomised study → `DIRECT_RANDOMISED`; different studies → `INDIRECT_RANDOMISED`;
  either not randomised → `OBSERVATIONAL`. You cannot assert your way to rank 10.
* The interval is Katz log — the same estimator A2 already uses. Do not add a second one.

---

## §9. CANDIDATE LINEAGE — WHAT COUNTS AS WHAT

`core/mind/contracts.ts`:
`export type MindLineage = 'FIXED_LIST' | 'INITIAL_SPACE' | 'MUTATED' | 'SYMBOLIC_COMPOSITION';`

Map this domain onto it, and report each bucket **separately** in the E2E output:

| level | in this challenge | must be non-empty? |
|---|---|---|
| **L0 FIXED_LIST** | the 12 molecule-level candidates from `loadCandidateSummaries()` | yes — this is the control |
| **L1 INITIAL_SPACE** | dose strata enumerated from the real arms of the pinned trial | yes |
| **L2 MUTATED** | strata derived by moving along the dose axis (e.g. an interpolated dose the model predicts but no arm measured) | **may be empty — say so** |
| **L3 SYMBOLIC_COMPOSITION** | dose-response functional forms from `generateModelSpace`/`mutateModelSpec` that the `ModelBasis` vocabulary can express | yes, for the mechanism models |

**Hard rules:**

* An L2 stratum with **no measuring arm** has **no evidence**. It may be *proposed* and
  *predicted*; it may **never** be promoted. If your best candidate is L2, the honest
  outcome is `NO_WINNER` plus "the next experiment is a trial arm at that dose".
* **Lineage level is not novelty.** Never write "L3 therefore novel".
* Prior-art novelty is a **separate axis**. No prior-art corpus is reachable from this
  sandbox. Report `NO_ACCESS` / `UNVERIFIABLE`, exactly as D-061 did. Do not claim novelty.
* **If the winning candidate turns out to be a member of the L0 fixed list, the E2E
  output must print `NOT A TRUE DISCOVERY RUN`** — in those words. That is §6 of the
  mission and it is not negotiable.

---

## §10. EXPERIMENT SELECTION

Use the existing discrimination machinery. Two options, both real:

* `core/agent/differentiatingExperimentGenerator.ts::generateDifferentiatingExperiment`
  — already wired by `runG2Falsification`; prefer it for the TOP2 pair.
* `core/mind/informationGain.ts::expectedDiscriminationGain(pairs)` — for choosing which
  outcome term / which stratum pair to examine next.

```
EXPORTED CONTRACT (core/mind/informationGain.ts):
  export const INFORMATION_GAIN_METRIC_DOC: string
  export function sigmaSeparation(pair: PairDiscrimination): number
  export function expectedDiscriminationGain(pairs: readonly PairDiscrimination[]): number
  export function rankExperimentsByGain<E>(experiments: readonly E[], gainOf: (e: E) => number): readonly E[]
PairDiscrimination = { hypothesisA, hypothesisB, predictedDifference, pooledSigma }
```

**Name it honestly.** It is *predicted separation in pooled sigma*. It is **not**
entropy reduction, **not** mutual information, **not** Bayesian value-of-information.
`INFORMATION_GAIN_METRIC_DOC` already says this; quote it in your output rather than
paraphrasing it into something stronger.

---

## §11. FALSIFICATION — WHAT IS REQUIRED AND WHAT YOU MAY HONESTLY SKIP

1. **Dose-response falsification (real, do this).** Fit the efficacy and harm models on
   a subset of arms and predict the held-out arm. With 3 tirzepatide doses, leave-one-out
   is a genuine test: state the tolerance **before** fitting. Use `fitModelSpec` +
   `holdoutScore`; both `modelSelectionScore` and `holdoutScore` are **LOWER IS BETTER**
   — sort ascending. (I got this backwards in D-060 and only the real run caught it.)
2. **G2 differentiating experiment (real, do this).** Through `runG2Falsification` /
   `generateDifferentiatingExperiment`, unmodified.
3. **The existential safety veto (real, unmodified).** `falsifyCandidate` decides it.
   Do not restate the threshold in your own code; it lives inside that function.
4. **The 13-probe self-falsification battery.** `core/agent/selfFalsificationBattery.ts`.
   Run what the data genuinely supports and **report the fraction honestly**, e.g.
   `"3 of 13 executed; 10 unavailable — no disjoint replication cohort exists for this
   trial"`. D-060 reports `PARTIAL: 2 of 13`. **Do not fabricate the missing probes and
   do not report 13/13.**

---

## §12. THE RESEARCH RECIPE — THE ACTUAL END GOAL

### §12.1 What exists today

```
REAL FILE: packages/frontend/src/core/biotechData/govLowerHarmRecipe.ts
EXPORTED CONTRACT:
  export interface LowerHarmResearchRecipe {
    readonly mechanism: string;
    readonly formulationConcept: string;
    readonly conceptualSynthesisRoute: string;
    readonly requiredProperties: readonly string[];
    readonly materialClasses: readonly string[];
    readonly provenance: string;
    readonly sources: readonly string[];
    readonly identifiers: readonly string[];
    readonly evidence: readonly string[];
    readonly replay: string;
    readonly dualUseGuard: 'ASSERTED';
    readonly recipeFingerprint: string;
  }
  export function buildLowerHarmRecipe(winner: A2CandidateReport, replayFingerprint: string): LowerHarmResearchRecipe | null
USED BY: core/orchestrator/govLowerHarmAdapters.ts::buildRecipe
DO NOT MODIFY: the existing 12 fields, their names, their types, or the fingerprint
               computation when the new optional fields are absent.
```

### §12.2 The gap you must close — as an OPTIONAL EXTENSION

The mission's §15 list has ~18 fields; the contract above has 12 and only ~6 overlap.
**Extend this interface with optional fields. Do not create a second recipe engine.**

```ts
// ADD to LowerHarmResearchRecipe — every one optional, so existing callers are untouched.
readonly discoveryId?: string;
readonly problemFingerprint?: string;
readonly baseline?: {
  readonly identity: string; readonly armId: string; readonly studyId: string;
  readonly contentSha256: string; readonly outcomeMetrics: Readonly<Record<string, number>>;
  readonly applicabilityConditions: readonly string[];
};
readonly winnerRecordRef?: string;
readonly hypothesisId?: string;
readonly mechanismModel?: { readonly rendered: string; readonly fingerprint: string };
readonly parameters?: Readonly<Record<string, number>>;
readonly parameterConstraints?: readonly string[];
readonly initialConditions?: readonly string[];
readonly frozenPredictionRefs?: readonly string[];
readonly experimentRefs?: readonly string[];
readonly falsificationResults?: readonly { readonly probe: string; readonly outcome: string }[];
readonly researchStateHead?: string;
readonly improvementVsBaseline?: readonly { readonly metric: string; readonly candidate: number; readonly baseline: number; readonly ci95?: { readonly low: number; readonly high: number } }[];
readonly applicabilityConditions?: readonly string[];
readonly limitations?: readonly string[];
readonly reproducibilityInstructions?: readonly string[];
```

### §12.3 Fingerprint determinism — the trap that already cost one session

```
NEVER fold into a fingerprint:
  - EvidenceConnectorStore artifactId  (it is re-minted on EVERY ingest, even for
    byte-identical content — this silently broke replay in D-059)
  - a wall-clock timestamp
  - a random UUID
ALWAYS use:
  - the content sha256 and hashPolicy
  - the preregistration fingerprint
  - the problem fingerprint
  - a fixed provenance-only clock ('1970-01-01T00:00:00Z' is the repo convention)
```

Two back-to-back runs over identical, undrifted evidence **must** produce an identical
`recipeFingerprint` and an identical `auditFingerprint`. Prove it with a replay test
that *fails* if they differ — do not just assert equality in prose.

### §12.4 Replayability

`Recipe → replay → model → parameters → experiment → prediction → result` must be
mechanically checkable. At minimum: a test that reads the recipe's
`mechanismModel.fingerprint` + `parameters`, re-fits from the recorded arms, and
reproduces the recorded prediction bit-for-bit.

---

## §13. THE THREE ROUNDS

```
EXPORTED CONTRACT (core/mind/runResearch.ts):
  readonly makeRoundOptions: (round: number, log: ResearchStateLog, previous: MindDiscoveryResult | null)
      => RunMindDiscoveryOptions;
  readonly shouldContinue: (result: MindDiscoveryResult, round: number)
      => { readonly continue: boolean; readonly reason: string };
```

`previous` is round N-1's **real** result. `MindGeneratorInput.excludeFingerprints`
is how you act on it.

| round | what must genuinely change |
|---|---|
| 1 | baseline frozen; strata enumerated; efficacy + harm dose-response models fitted; TOP2 strata chosen; G2 run; falsification |
| 2 | forms falsified in round 1 are in `excludeFingerprints`; the stratum pair examined is **different**; the outcome term with the highest `expectedDiscriminationGain` is the one examined |
| 3 | an **alternative mechanism** is tested (e.g. harm saturates too — the `H-NO-SEPARATION` branch), against the arms round 2 did not use |

**The machine check, and it must be in the test file:** the audit fingerprints of the
three rounds must differ, **and** the examined stratum pairs must differ. D-061's E2E
check 11b is the pattern:

```
r0=[94a6ab,1e5561]  r1=[c1fd2c,0ff77a]  r2=[753c92,ddac50]
```

If all three rounds use the same pool, delete the loop and say the run is single-round.
A cosmetic loop is worse than an honest one.

### §13.1 Belief change — recorded per round

`core/mind/researchState.ts::ResearchStateLog` is append-only with a hash chain and
`verifyChain()`. Per round, append: `BEFORE → PREDICTION → OBSERVATION → FALSIFICATION
→ SURVIVORS → BELIEF_UPDATE → NEXT_DIRECTION`. Print the head fingerprint and the
chain-verified boolean in the E2E output. If `verifyChain()` returns false, **fail the
run** — do not print a warning and continue.

---

## §14. THE E2E OUTPUT — EXACTLY THIS SHAPE

`scripts/genesis-d062-discovery-challenge.mjs` must print, in order:

```
KNOWN BASELINE            identity, arm, studyId, sha256, outcome metrics, applicability
GENESIS KNOWLEDGE         knowledge snapshot fingerprint, item count, epistemic statuses
HYPOTHESES                H1..H4: id, statement, mechanism, prediction, falsification criterion
MECHANISMS                the fitted dose-response forms, rendered, with fingerprints
CANDIDATES BY LINEAGE     L0 / L1 / L2 / L3 counts AND members
PREDICTIONS               frozen, with their registry ids and frozenAt
ROUND 1                   experiment chosen + why (sigma separation) | evidence | FAILED / SURVIVED
ROUND 2                   what round 1 changed | new pair | FAILED / SURVIVED
ROUND 3                   alternative mechanism | FAILED / SURVIVED
BEST CANDIDATE            id, lineage level, mechanism, score
ABSENT FROM FIXED SET?    YES / NO      <- if NO, print "NOT A TRUE DISCOVERY RUN"
BASELINE COMPARISON       per metric: candidate vs baseline, risk ratio, CI95, DIRECTION
FALSIFICATION             n of 13 probes executed; each unavailable one with its reason
D-057 PROMOTION           PROMOTE / NO_PROMOTION + every reason string verbatim
VERDICT                   WINNER | NO_WINNER | CONFLICTING_EVIDENCE | INSUFFICIENT_EVIDENCE
WinnerRecord              YES / NO
ResearchRecipe            YES / NO + recipeFingerprint
REPLAY                    PASS / FAIL (two runs, identical audit + recipe fingerprints)
WHAT DID GENESIS INVENT?  one paragraph, or the literal string "NOTHING — this run produced no candidate outside its fixed set"
WHY IS IT BETTER THAN BASELINE?  the conjunct table, or the literal string "IT IS NOT — <exact blocker>"
NEXT EXPERIMENT           the specific experiment that would change the answer
```

The last three fields are what the user actually reads. Write them so a scientist can
check them, and so a sceptic cannot accuse them of overreach.

---

## §15. THE TESTS YOU MUST WRITE (negative-first)

In `packages/frontend/src/__tests__/d062DoseStratifiedDiscovery.test.ts`:

1. the D-062 preregistration fingerprint equals its asserted literal, **asserted before first use**
2. the preregistration records `inheritedFrom: ['c827c79c','4642088a']` and re-tunes no threshold
3. `LOWER_HARM_PREREGISTRATION.fingerprint` is still `c827c79c` (untouched)
4. arm titles resolve by title, never by index — a wrong title **throws**
5. `groupId` is never matched across two different outcome objects (regression for the §6 trap)
6. a stratum's `observationCount` equals the number of distinct arm-level observations — no duplicates, no inflation
7. `classifyComparisonEvidenceClass` returns `DIRECT_RANDOMISED` for two SURPASS-2 arms
8. a cross-study comparison returns `INDIRECT_RANDOMISED`, never `DIRECT_RANDOMISED`
9. `compareCountedOutcomes` returns `null` on a zero-event arm and the pipeline treats it as NO DATA
10. **a stratum with 2 observations is refused by `canPromoteToWinnerRecord` with `EVIDENCE_SUFFICIENT`**
11. **a WINNER verdict on `OBSERVATIONAL` evidence is refused with `EVIDENCE_STRENGTH`**
12. an L2 (no measuring arm) candidate can never be promoted
13. the safety veto still fires on the unmodified `falsifyCandidate` path
14. three rounds produce three different audit fingerprints and three different examined pairs
15. `ResearchStateLog.verifyChain()` is true, and a tampered log makes it false
16. two runs produce identical `auditFingerprint` **and** identical `recipeFingerprint`
17. the recipe fingerprint does not change when only the `artifactId` changes
18. `buildLowerHarmRecipe`'s existing 12-field output is byte-identical to before this change
19. no banned output string appears anywhere (`LOWER_HARM_BANNED_OUTPUT_STRINGS`)
20. every existing anchor test still passes (§17)

Write 10 and 11 **first**, before the happy path. They are the tests that make the
result mean something.

---

## §16. WHAT YOU MUST NOT DO

* **No second engine.** Not a second ranking, adjudication, falsification, recipe,
  evidence store, or winner gate. If you find yourself writing a risk-ratio formula,
  stop — `compareCountedOutcomes` already has one.
* **No edit to** `orchestrator.ts`, `winnerGate.ts`, `contracts.ts`,
  `practicalCandidateGate.ts`, `evidenceProvenance.ts`, `a2OzempicSubstitute.ts`,
  `govDrugLowerHarmRanking.ts`, `govDrugLowerHarmFunnel.ts`,
  `govDrugLowerHarmPreregistration.ts`, `a2OzempicSubstitutePreregistration.ts`.
* **No threshold change.** Not `MINIMUM_OBSERVATIONS`, not `STRONG_THRESHOLD_RANK`,
  not the efficacy floor, not the veto threshold, not `TAU_DISCRIMINABILITY`.
* **No synthetic data in `PRODUCTION`.** No fixture promoted to production, no LLM
  output as `FACT`, no model output as observation, no fabricated measurement.
  `SYNTHETIC_TEST_ONLY` exists and is clearly labelled — use it for tests only.
* **No inflated `observationCount`.** See §8.3.
* **No `artifactId` in any fingerprint.** See §12.3.
* **No novelty claim** without a prior-art corpus. `NO_ACCESS` is the honest word.
* **No new verdict label.**
* **Do not return a Promise from any `OrchestratorAdapters` port.**

---

## §17. INVARIANTS THAT MUST STILL HOLD AFTER YOUR CHANGE

These are executed anchors, not documentation. They must print the identical values
after your work:

```
npm run e2e:gov-drug        -> 18/18, fingerprints 399221f5 and f528c881, NO_WINNER
npm run e2e:gov-campaign    -> 16/16, fingerprint 5179c99f
npm run a2:demo             -> 14/14, CONFLICTING_EVIDENCE, a5e0f164 / 4642088a
node scripts/genesis-mind-e2e.mjs -> 18/18, NO_WINNER, state head be81a52c
node scripts/gov-drug-lower-harm-funnel-demonstrator.mjs -> 5/5, NO_WINNER, runFingerprint 2e6eb55e
```

Plus: full frontend suite, backend suite, `tsc`, `eslint`, `build`, module
reachability / orphan scan. Baseline at `856518b`: **546 test files, 6339 passed,
1 skipped, 0 failures.**

Note on the orphan scan: `moduleReachability.test.ts` treats `import type` as a real
import and fails **both** on a new undocumented orphan **and** on a stale
`ALLOWED_ORPHANS` entry for a now-reachable module. Every new module needs a real
runtime caller, or an explicit, justified entry.

---

## §18. DELIVERABLE FORMAT

**Deliver CODE, not architecture.** Complete file contents for each of the seven files
in §7.3, in fenced blocks, each headed by its full path. Plus:

1. A short list of **every assumption you made that this brief did not confirm**, each
   marked `UNVERIFIED`. Claude will check each one against the real repo.
2. The exact `docs/DECISIONS.md` D-062 entry text you propose.
3. Your honest answer to §19.

Do not paraphrase a contract from memory. If this brief did not quote it, it is not
confirmed — flag it `UNVERIFIED` and write the code so the flagged part is easy to fix.

---

## §19. THE QUESTION YOU MUST ANSWER HONESTLY AT THE END

> **Given the real data described in §6, can this challenge reach `WINNER →
> WinnerRecord → ResearchRecipe` at all? If yes, on which stratum and which conjunct
> is tightest. If no, which conjunct fails and what single additional real observation
> would change it.**

Answer it **before** the run, as a prediction, and mark it as such. Then the run either
confirms it or falsifies it — and either way we have learned something. An answer of
"probably not, because conjunct (4) — the serious-adverse-event veto — is likely to
fire" is a **good** answer if that is what you believe. Predicting `NO_WINNER` and
being right is a scientific result. Predicting `WINNER` to please the reader and
being wrong is the only failure mode that matters here.

---

## §20. WHAT HAPPENS AFTER YOU DELIVER

Claude will: check every contract against the real repo, fix what is wrong (not report
it back to you), integrate, run the challenge, verify real evidence, verify replay,
verify falsification, verify D-057, verify the WinnerRecord, verify the Recipe, and run
the full gate — then report the result, whatever it is.

You will not be asked for another round unless the integration uncovers a genuinely
large architectural gap.
