/**
 * Genesis OS — PAKIET ODTWARZALNOŚCI (P3.2). Jedno polecenie, zero kluczy,
 * zero sieci, zero stanu z poprzednich uruchomień.
 *
 *   node scripts/repro-demo.mjs
 *
 * DLACZEGO TO NIE JEST „DEMO". Demo pokazuje, że coś się uruchomiło. Ten skrypt
 * porównuje każdy wynik z WARTOŚCIĄ OCZEKIWANĄ zapisaną w repo
 * (`docs/REPRODUCIBILITY_PACK.md` cytuje dokładnie te same liczby) i kończy się
 * kodem 1, gdy cokolwiek się rozjechało. Recenzent nie musi wierzyć w wynik —
 * uruchamia i patrzy na kod wyjścia.
 *
 * Co jest sprawdzane, i dlaczego akurat to:
 *   1. Bramka runtime (P0.1) — bez niej nic innego nie ma prawa wystartować.
 *   2. Trwałość danych + realny drill backup→restore (P0.2) na tymczasowej bazie.
 *   3. Tożsamość wydania (P0.3) — który kod to właściwie jest.
 *   4. Kontrakt zmiennych środowiskowych (P0.4) — czy deklaracja pokrywa kod.
 *   5. Kotwica zewnętrzna (P2.3) — obserwacja, której Genesis NIE wyprodukował.
 *   6. Autonomiczne dochodzenie QE3 — falsyfikacja odrzucająca 3 z 4 hipotez.
 *
 * Punkty 5 i 6 dotyczą kodu w TypeScripcie, więc skrypt bunduje wąską fasadę
 * (`core/repro/reproEntry.node.ts`) esbuildem do katalogu tymczasowego. Nic nie
 * jest instalowane ani zapisywane w repo.
 *
 * Flagi:  --json   wypisz maszynowo czytelny raport zamiast tabeli
 *         --update wypisz blok oczekiwanych wartości do wklejenia w dokumentację
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_MODE = process.argv.includes('--json');
const UPDATE_MODE = process.argv.includes('--update');

/**
 * WARTOŚCI OCZEKIWANE — deterministyczne i policzone, nie wpisane z pamięci.
 * Każda z nich jest sprawdzalna niezależnie: masa molowa z tablicy IUPAC 2021
 * w repo, wartość PubChem z przypiętego payloadu, odciski z jednej prymitywy
 * `fnv1a(canonicalJson(...))`.
 */
const EXPECTED = {
  anchorAssessment: 'SUPPORTED_WITHIN_PROTOCOL',
  anchorObserved: 194.19,
  anchorPredicted: 194.194,
  anchorOrigin: 'REFERENCE',
  anchorReplay: 'MATCH',
  anchorFingerprint: 'prediction-verification_c5c0af94',
  anchorTautology: 'EMPIRICAL_TEST',
  anchorBeliefBefore: 0.5,
  keplerAssessment: 'SUPPORTED_WITHIN_PROTOCOL',
  keplerObserved: 687.0,
  keplerPredicted: 687.2335878355307,
  keplerOrigin: 'REFERENCE',
  keplerReplay: 'MATCH',
  keplerFingerprint: 'prediction-verification_7530a91a',
  keplerTautology: 'EMPIRICAL_TEST',
  keplerBeliefBefore: 0.5,
  qe3Rounds: 2,
  qe3Probes: [1, 0],
  qe3Surviving: ['h:a-0.4'],
  qe3Falsified: ['h:a-0.2', 'h:a-0.6', 'h:a-0.8'],
  qe3StopReason: 'NO_CONTENDERS_LEFT',
  qe3Provenance: 'SIMULATED',
  qe4P1: 'SUPPORTED_WITHIN_MODEL',
  qe4P2: 'SUPPORTED_WITHIN_MODEL',
  qe4P3: 'SUPPORTED_WITHIN_MODEL',
  qe4P4: 'SUPPORTED_WITHIN_MODEL',
  qe4Tautology: 'EMPIRICAL_TEST',
  qe4Fingerprint: 'a6578ae8',
  qe4Doi: '10.5281/zenodo.2527010',
  qe4RegimeRounds: 7,
  qe4RegimeStopReason: 'ROUND_BUDGET_EXHAUSTED',
  qe4RegimeWinner: 'qe4-regime-logarithmic-k5',
  discoveryQe4Winner: 'y = c0 + c1·log(x)',
  discoveryQe4Stop: 'EXPERIMENT_SPACE_EXHAUSTED',
  // Moved by M3's parsimony term (ranking by chi-square + k·ln(n) instead of raw
  // weighted RSS, under which an extra coefficient could only ever help). The
  // SCIENCE is unchanged: QE4 still concludes logarithmic growth and still picks
  // [20,16,10,6]. Kepler's fingerprint did not move — its linear model wins under
  // either ranking rule.
  discoveryQe4Fingerprint: '44f245c9',
  discoveryKeplerWinner: 'y = c0 + c1·x',
  discoveryKeplerStop: 'CONVERGENCE',
  discoveryKeplerSlope: 1.49987,
  discoveryKeplerFingerprint: 'f4804820',
  discoveryDerivedWinnerFingerprint: '315b1877',
  gapTrigger: 'LOW_DISCRIMINABILITY',
  gapStopReason: 'OBSERVATION_GAP',
  gapThreshold: 1,
  qe4RegimeFingerprints: ['e7b90572', '3c3e9083', 'c82210fb', '67711185', 'cc3e4323', 'bb6aec30', '2d470070'],
  conformalSampleSize: 9,
  conformalCalibrationSize: 5,
  conformalHoldoutSize: 4,
  conformalSplitFingerprint: 'b3554e77',
  conformalProvenance: 'REFERENCE',
  conformalConfidenceLevel: 0.9,
  conformalGuaranteeAchievable: false,
  conformalCalibrationFingerprint: '1752250d',
  conformalReplay: 'MATCH',
  conformalNominalCoverage: 0.9,
  conformalObservedCoverage: 0,
  conformalCoverageSampleSize: 4,
  conformalRivalDiscriminability: 1.1686521299655943,
  conformalRivalGapTrigger: null,
};

const checks = [];
const record = (name, ok, detail) => { checks.push({ name, ok, detail }); return ok; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- 1. Bramka runtime -------------------------------------------------------
const { checkNodeRuntime, MINIMUM_NODE } = await import(path.join(REPO, 'packages/backend/src/nodeRuntime.mjs'));
const runtime = checkNodeRuntime();
record('P0.1 runtime', runtime.ok, `${runtime.version} (wymagane >= ${MINIMUM_NODE}), node:sqlite dostępny`);

// --- 2. Trwałość + drill backup→restore --------------------------------------
const { classifyDbPath, snapshotDatabase, restoreDatabase } = await import(path.join(REPO, 'packages/backend/src/dbDurability.mjs'));
const dbDir = mkdtempSync(path.join(tmpdir(), 'genesis-repro-db-'));
let durabilityDetail;
let drillOk;
try {
  const live = path.join(dbDir, 'genesis.db');
  const db = new DatabaseSync(live);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('CREATE TABLE repro (id TEXT PRIMARY KEY, payload TEXT NOT NULL);');
  db.prepare('INSERT INTO repro VALUES (?, ?)').run('anchor-1', 'przed backupem');
  // Baza CELOWO otwarta: przy WAL świeży zapis siedzi w -wal, więc `cp` dałby
  // backup bez tego wiersza. To jest ten tryb porażki, który drill wyklucza.
  const snapshot = snapshotDatabase({ dbPath: live, dir: dbDir });
  db.prepare('INSERT INTO repro VALUES (?, ?)').run('anchor-2', 'po backupie');
  db.close();
  const restored = path.join(dbDir, 'restored.db');
  restoreDatabase({ backupFile: snapshot.file, dbPath: restored });
  const check = new DatabaseSync(restored);
  const rows = check.prepare('SELECT id FROM repro ORDER BY id').all().map((r) => r.id);
  check.close();
  drillOk = eq(rows, ['anchor-1']);
  durabilityDetail = `snapshot ${snapshot.bytes} B; po restore wiersze=[${rows.join(', ')}] (oczekiwane [anchor-1] — wiersz z WAL jest, wiersz po backupie nie)`;
  const verdict = classifyDbPath({ dbPath: '/data/genesis.db', appDir: path.join(REPO, 'packages/backend') });
  record('P0.2 trwałość', verdict.durability === 'PERSISTENT', `ścieżka /data/genesis.db → ${verdict.durability}`);
} finally {
  rmSync(dbDir, { recursive: true, force: true });
}
record('P0.2 drill backup→restore', drillOk, durabilityDetail);

// --- 3. Tożsamość wydania ----------------------------------------------------
const { resolveBuildInfo } = await import(path.join(REPO, 'packages/backend/src/buildInfo.mjs'));
const build = resolveBuildInfo({ env: process.env, repoDir: REPO });
record('P0.3 tożsamość wydania', build.commitSource !== 'unavailable', `commit ${build.commitShort} (źródło: ${build.commitSource})`);

// --- 4. Kontrakt zmiennych środowiskowych ------------------------------------
const envUsed = new Set(
  execFileSync('git', ['grep', '-hoE', 'process\\.env\\.[A-Z_][A-Z0-9_]*', '--', 'packages/', 'scripts/'], { cwd: REPO, encoding: 'utf8' })
    .split('\n').map((l) => l.replace('process.env.', '').trim())
    .filter((n) => n && !['NODE_ENV', 'CI', 'GITHUB_ACTIONS', 'npm_package_version'].includes(n)),
);
const envDocumented = new Set(
  [...execFileSync('cat', ['.env.example'], { cwd: REPO, encoding: 'utf8' }).matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)].map((m) => m[1]),
);
const envMissing = [...envUsed].filter((n) => !envDocumented.has(n));
record('P0.4 kontrakt .env', envMissing.length === 0, `${envUsed.size} zmiennych w kodzie, ${envDocumented.size} udokumentowanych, brakuje ${envMissing.length}`);

// --- 5 i 6. Warstwa naukowa (TypeScript, bundlowana na czas uruchomienia) ----
const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-repro-bundle-'));
let anchor;
let keplerAnchor;
let qe3;
let qe4;
let qe4Regime;
let dQe4, dKepler, dDerived, dGap, dGraph, dFrontier, dGate, conformal;
try {
  const out = path.join(bundleDir, 'repro.mjs');
  execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
    path.join(REPO, 'packages/frontend/src/core/repro/reproEntry.node.ts'),
    '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
    // Kotwica Kepler/Mars importuje przypiętą stronę NASA jako surowy tekst
    // (Vite `?raw`, jak w przeglądarce) — esbuild potrzebuje tego jawnie.
    // QE4 robi to samo dla przypiętych plików .csv Brydgesa.
    '--loader:.html=text',
    '--loader:.csv=text',
  ], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
  const science = await import(out);
  anchor = science.reproExternalAnchor(science.MOLECULAR_WEIGHT_ANCHOR_ID);
  keplerAnchor = science.reproExternalAnchor(science.KEPLER_MARS_ANCHOR_ID);
  qe3 = science.reproQe3Inquiry();
  qe4 = science.reproQe4BrydgesAnalysis();
  qe4Regime = science.reproQe4RegimeInquiry();
  dQe4 = science.reproDiscoveryCampaignQe4();
  dGap = science.reproObservationGap();
  dGraph = science.reproDiscoveryGraph();
  dFrontier = science.reproFrontierAcceptance();
  dGate = science.reproPracticalCandidateGate();
  dKepler = science.reproDiscoveryCampaignKepler();
  dDerived = science.reproDiscoveryCampaignQe4WithoutLog();
  conformal = science.reproConformalPrediction();
} finally {
  rmSync(bundleDir, { recursive: true, force: true });
}

record('P2.3 kotwica (PubChem): werdykt', anchor.assessment === EXPECTED.anchorAssessment, `${anchor.assessment} (oczekiwane ${EXPECTED.anchorAssessment})`);
record('P2.3 kotwica (PubChem): obserwacja zewnętrzna', anchor.observedValue === EXPECTED.anchorObserved && anchor.observationOrigin === EXPECTED.anchorOrigin,
  `${anchor.observedValue} g/mol, pochodzenie ${anchor.observationOrigin} (oczekiwane ${EXPECTED.anchorObserved} / ${EXPECTED.anchorOrigin})`);
record('P2.3 kotwica (PubChem): predykcja Genesis', Math.abs(anchor.predictedValue - EXPECTED.anchorPredicted) < 1e-9,
  `${anchor.predictedValue} g/mol (oczekiwane ${EXPECTED.anchorPredicted})`);
record('P2.3 kotwica (PubChem): odcisk, replay, Tautology Gate',
  anchor.verificationFingerprint === EXPECTED.anchorFingerprint && anchor.replay === EXPECTED.anchorReplay && anchor.tautologyClassification === EXPECTED.anchorTautology,
  `${anchor.verificationFingerprint} / ${anchor.replay} / ${anchor.tautologyClassification} (oczekiwane ${EXPECTED.anchorFingerprint} / ${EXPECTED.anchorReplay} / ${EXPECTED.anchorTautology})`);
record('P2.3 kotwica (PubChem): rewizja przekonania, next question',
  anchor.beliefBefore === EXPECTED.anchorBeliefBefore && anchor.beliefAfter > anchor.beliefBefore && anchor.nextQuestion.length > 20,
  `przekonanie ${anchor.beliefBefore}→${anchor.beliefAfter.toFixed(3)} (oczekiwane start ${EXPECTED.anchorBeliefBefore}, wzrost bo SUPPORTED); "${anchor.nextQuestion.slice(0, 60)}..."`);

record('P2.3 kotwica (Kepler/Mars): werdykt', keplerAnchor.assessment === EXPECTED.keplerAssessment, `${keplerAnchor.assessment} (oczekiwane ${EXPECTED.keplerAssessment})`);
record('P2.3 kotwica (Kepler/Mars): obserwacja zewnętrzna', keplerAnchor.observedValue === EXPECTED.keplerObserved && keplerAnchor.observationOrigin === EXPECTED.keplerOrigin,
  `${keplerAnchor.observedValue} days, pochodzenie ${keplerAnchor.observationOrigin} (oczekiwane ${EXPECTED.keplerObserved} / ${EXPECTED.keplerOrigin})`);
record('P2.3 kotwica (Kepler/Mars): predykcja Genesis (universe-kepler)', Math.abs(keplerAnchor.predictedValue - EXPECTED.keplerPredicted) < 1e-9,
  `${keplerAnchor.predictedValue} days (oczekiwane ${EXPECTED.keplerPredicted})`);
record('P2.3 kotwica (Kepler/Mars): odcisk, replay, Tautology Gate',
  keplerAnchor.verificationFingerprint === EXPECTED.keplerFingerprint && keplerAnchor.replay === EXPECTED.keplerReplay && keplerAnchor.tautologyClassification === EXPECTED.keplerTautology,
  `${keplerAnchor.verificationFingerprint} / ${keplerAnchor.replay} / ${keplerAnchor.tautologyClassification} (oczekiwane ${EXPECTED.keplerFingerprint} / ${EXPECTED.keplerReplay} / ${EXPECTED.keplerTautology})`);
record('P2.3 kotwica (Kepler/Mars): rewizja przekonania, next question',
  keplerAnchor.beliefBefore === EXPECTED.keplerBeliefBefore && keplerAnchor.beliefAfter > keplerAnchor.beliefBefore && keplerAnchor.nextQuestion.length > 20,
  `przekonanie ${keplerAnchor.beliefBefore}→${keplerAnchor.beliefAfter.toFixed(3)} (oczekiwane start ${EXPECTED.keplerBeliefBefore}, wzrost bo SUPPORTED); "${keplerAnchor.nextQuestion.slice(0, 60)}..."`);

record('QE3 dochodzenie: przebieg', qe3.rounds === EXPECTED.qe3Rounds && eq(qe3.probes, EXPECTED.qe3Probes),
  `${qe3.rounds} rundy, sondy whiteNoise=[${qe3.probes.join(', ')}] (oczekiwane ${EXPECTED.qe3Rounds} / [${EXPECTED.qe3Probes.join(', ')}])`);
record('QE3 dochodzenie: falsyfikacja', eq([...qe3.surviving], EXPECTED.qe3Surviving) && eq([...qe3.falsified].sort(), [...EXPECTED.qe3Falsified].sort()),
  `ocalała [${qe3.surviving.join(', ')}], sfalsyfikowane [${qe3.falsified.join(', ')}], stop ${qe3.stopReason}`);
record('QE3 dochodzenie: prowieniencja', qe3.dataProvenance === EXPECTED.qe3Provenance,
  `${qe3.dataProvenance} — dokładna algebra na zadeklarowanym stanie JEST symulacją i tak jest oznaczona`);

record('QE4 (Brydges/Zenodo 2527010): P1-P4 werdykty',
  qe4.p1Verdict === EXPECTED.qe4P1 && qe4.p2Verdict === EXPECTED.qe4P2 && qe4.p3Verdict === EXPECTED.qe4P3 && qe4.p4Verdict === EXPECTED.qe4P4,
  `P1=${qe4.p1Verdict} P2=${qe4.p2Verdict} P3=${qe4.p3Verdict} P4=${qe4.p4Verdict} (oczekiwane wszystkie ${EXPECTED.qe4P1})`);
record('QE4: Tautology Gate (wszystkie 4 EMPIRICAL_TEST)',
  [qe4.p1Tautology, qe4.p2Tautology, qe4.p3Tautology, qe4.p4Tautology].every((t) => t === EXPECTED.qe4Tautology),
  `[${qe4.p1Tautology}, ${qe4.p2Tautology}, ${qe4.p3Tautology}, ${qe4.p4Tautology}] (oczekiwane wszystkie ${EXPECTED.qe4Tautology})`);
record('QE4: P4 integralność (0 punktów poza pasmem ±3σ)', qe4.p4FailingCount === 0,
  `${qe4.p4FailingCount} punktów poza pasmem z 74 porównanych`);
record('QE4: odcisk wyniku (replay)', qe4.resultFingerprint === EXPECTED.qe4Fingerprint,
  `${qe4.resultFingerprint} (oczekiwane ${EXPECTED.qe4Fingerprint})`);
record('QE4: tożsamość zbioru', qe4.datasetDoi === EXPECTED.qe4Doi, `DOI ${qe4.datasetDoi} (oczekiwane ${EXPECTED.qe4Doi})`);

record('QE4 regime inquiry (P0-2/P0-3/P0-5): przebieg i stop', qe4Regime.rounds === EXPECTED.qe4RegimeRounds && qe4Regime.stopReason === EXPECTED.qe4RegimeStopReason,
  `${qe4Regime.rounds} rund, stop=${qe4Regime.stopReason} (oczekiwane ${EXPECTED.qe4RegimeRounds} / ${EXPECTED.qe4RegimeStopReason})`);
record('QE4 regime inquiry: zwycięska hipoteza (wyliczona z siatki, nie literał)', qe4Regime.winningHypothesisId === EXPECTED.qe4RegimeWinner,
  `${qe4Regime.winningHypothesisId} (oczekiwane ${EXPECTED.qe4RegimeWinner})`);
record('QE4 regime inquiry: kotwica anty-HARK nienaruszona w KAŻDEJ rundzie', qe4Regime.antiHarkingIntactEveryRound === true,
  `antiHarkingIntactEveryRound=${qe4Regime.antiHarkingIntactEveryRound}`);
record('QE4 regime inquiry: odciski rund (replay)', eq(qe4Regime.roundFingerprints, EXPECTED.qe4RegimeFingerprints),
  `[${qe4Regime.roundFingerprints.join(', ')}] (oczekiwane [${EXPECTED.qe4RegimeFingerprints.join(', ')}])`);



record('Discovery engine CASE A (QE4, kwantowa): zwycieski MODEL wyliczony, nie zadeklarowany',
  dQe4.winningFormula === EXPECTED.discoveryQe4Winner && dQe4.stopReason === EXPECTED.discoveryQe4Stop,
  `${dQe4.winningFormula} / stop=${dQe4.stopReason} (oczekiwane ${EXPECTED.discoveryQe4Winner} / ${EXPECTED.discoveryQe4Stop})`);
record('Discovery engine CASE A: odcisk kampanii (replay)',
  dQe4.campaignFingerprint === EXPECTED.discoveryQe4Fingerprint,
  `${dQe4.campaignFingerprint} (oczekiwane ${EXPECTED.discoveryQe4Fingerprint})`);
record('Discovery engine CASE B (Kepler, astronomia): TEN SAM silnik, inna nauka, inny ksztalt',
  dKepler.winningFormula === EXPECTED.discoveryKeplerWinner && dKepler.stopReason === EXPECTED.discoveryKeplerStop,
  `${dKepler.winningFormula} / stop=${dKepler.stopReason} (oczekiwane ${EXPECTED.discoveryKeplerWinner} / ${EXPECTED.discoveryKeplerStop})`);
record('Discovery engine CASE B: III prawo Keplera odzyskane z 9 liczb NASA (nachylenie ~3/2)',
  Math.abs((dKepler.winningCoefficients[dKepler.winningCoefficients.length - 1] ?? 0) - EXPECTED.discoveryKeplerSlope) < 0.001,
  `nachylenie=${dKepler.winningCoefficients[dKepler.winningCoefficients.length - 1]} (oczekiwane ~${EXPECTED.discoveryKeplerSlope} = 3/2)`);
record('Discovery engine CASE B: odcisk kampanii (replay)',
  dKepler.campaignFingerprint === EXPECTED.discoveryKeplerFingerprint,
  `${dKepler.campaignFingerprint} (oczekiwane ${EXPECTED.discoveryKeplerFingerprint})`);
record('Discovery engine: obie kampanie wybieraja INNE eksperymenty (dowod, ze nie jest zahardkodowane)',
  JSON.stringify(dQe4.selectedExperiments) !== JSON.stringify(dKepler.selectedExperiments),
  `QE4 wybral [${dQe4.selectedExperiments.join(', ')}], Kepler [${dKepler.selectedExperiments.join(', ')}]`);
record('Discovery engine: model B WYPROWADZONY z residuum (gramatyka bez LOG) — zawiera czlon, ktorego gramatyka nie miala',
  dDerived.derivedModelFormulas.some((f) => f.includes('log')),
  `wyprowadzone ${dDerived.derivedModelFormulas.length}: ${dDerived.derivedModelFormulas.join(' ; ')}`);
record('Discovery engine: parsymonia ODMAWIA koronowania modelu, ktorego poprawa nie pokrywa kosztu informacyjnego',
  dDerived.winnerWasDerivedAtRound === 0 && !String(dDerived.winningFormula).includes('log'),
  `zwyciezca "${dDerived.winningFormula}" (z gramatyki, runda ${dDerived.winnerWasDerivedAtRound}) — model z log dopasowuje sie lepiej, ale nie o wiecej niz ln(n) na dodatkowy wspolczynnik`);
record('Discovery engine: kotwica anty-HARK nienaruszona we wszystkich trzech kampaniach',
  dQe4.antiHarkingIntactEveryRound && dKepler.antiHarkingIntactEveryRound && dDerived.antiHarkingIntactEveryRound,
  `qe4=${dQe4.antiHarkingIntactEveryRound} kepler=${dKepler.antiHarkingIntactEveryRound} derived=${dDerived.antiHarkingIntactEveryRound}`);

// --- M1: ObservationGapRequest (realne dane, realny brak rozroznialnosci) ----
record('M1: silnik ODMAWIA uruchomienia eksperymentu, ktory nie rozroznia zywych modeli',
  dGap.trigger === EXPECTED.gapTrigger && dGap.stopReason === EXPECTED.gapStopReason && dGap.selectedAnyExperimentAfterGap === false,
  `trigger=${dGap.trigger} stop=${dGap.stopReason} wybrany eksperyment po luce=${dGap.selectedAnyExperimentAfterGap} (oczekiwane ${EXPECTED.gapTrigger} / ${EXPECTED.gapStopReason} / false)`);
record('M1: rozroznialnosc realnie zmierzona i ponizej progu 1 sigma (nie zero, tylko za malo)',
  dGap.discriminability !== null && dGap.discriminability > 0 && dGap.discriminability < EXPECTED.gapThreshold,
  `discriminability=${dGap.discriminability}x sigma, prog=${dGap.threshold}x sigma; nieobserwowanych eksperymentow zostalo: ${dGap.experimentsLeftUnobserved}`);
record('M1: request nazywa BRAKUJACY pomiar i przyrzad, nie zmyslajac kosztu',
  dGap.instrumentClass.includes('trapped-ion') && dGap.costEstimate === null && dGap.statusAtEmission === 'OPEN',
  `"${dGap.requiredObservable}" / ${dGap.instrumentClass} / do: ${dGap.requestedFrom} / koszt=${dGap.costEstimate === null ? 'NIEZADEKLAROWANY' : dGap.costEstimate} / status=${dGap.statusAtEmission}`);
record('M1: odcisk luki (replay) i spelnienie z lancuchem opieki wchodzi jako OBSERVATION, nie FACT',
  dGap.replay === 'MATCH' && dGap.fulfilledEpistemicStatus === 'OBSERVATION' && dGap.fulfilledStatus === 'FULFILLED' && dGap.custodySteps === 2,
  `${dGap.gapFingerprint} / ${dGap.replay} / ${dGap.fulfilledEpistemicStatus} / ${dGap.fulfilledStatus} / krokow opieki=${dGap.custodySteps}`);
// --- §5: Discovery Graph + transfer miedzy kampaniami ------------------------
record('§5: graf odkrycia obejmuje caly lancuch rozumowania kampanii i jest deterministyczny',
  dGraph.replay === 'MATCH' && dGraph.kinds.includes('OBSERVATION') && dGraph.kinds.includes('DISCOVERY') && dGraph.kinds.includes('REVISION'),
  `${dGraph.qe4Nodes} wezlow / ${dGraph.qe4Edges} krawedzi, replay=${dGraph.replay}, rodzaje: ${dGraph.kinds.join(', ')}`);
record('§5: wiedza przechodzi miedzy DWIEMA realnymi kampaniami bez podnoszenia statusu epistemicznego',
  dGraph.importedCount > 0 && dGraph.statusPreserved === true,
  `zaimportowano ${dGraph.importedCount} wezlow z QE4 do kampanii Keplera; status zachowany 1:1 = ${dGraph.statusPreserved}`);
record('§5: model SFALSYFIKOWANY nie wraca bez jawnej zmiany zalozen — a po zmianie wraca NADAL jako BLOCKED',
  dGraph.falsifiedRefusedWithoutAssumptionChange > 0 && dGraph.falsifiedAdmittedAfterAssumptionChange > 0 && dGraph.statusStillBlockedAfterImport === true,
  `odrzucone bez zmiany zalozen: ${dGraph.falsifiedRefusedWithoutAssumptionChange}; wpuszczone po nazwaniu zmiany: ${dGraph.falsifiedAdmittedAfterAssumptionChange}, wszystkie dalej BLOCKED=${dGraph.statusStillBlockedAfterImport}`);
record('§5: import jest idempotentny — drugi transfer tego samego grafu nie dokłada nic',
  dGraph.secondImportAddedNothing === true,
  `drugi import dodal 0 wezlow = ${dGraph.secondImportAddedNothing}`);

record('M1: istniejace kampanie NIETKNIETE — Kepler zbiega bez luki, QE4 zachowuje odcisk',
  dKepler.observationGapTriggers.length === 0 && dQe4.campaignFingerprint === EXPECTED.discoveryQe4Fingerprint && dQe4.observationGapTriggers.join(',') === 'NO_ATTACHED_EXPERIMENT',
  `kepler luki=${dKepler.observationGapTriggers.length}, qe4 odcisk=${dQe4.campaignFingerprint}, qe4 luka=${dQe4.observationGapTriggers.join(',') || 'brak'}`);

// --- A8: Conformal Uncertainty Layer (realne dane Kepler/NASA NSSDC) --------
record('A8 conformal: deterministyczny split kalibracja/holdout',
  conformal.sampleSize === EXPECTED.conformalSampleSize && conformal.calibrationSize === EXPECTED.conformalCalibrationSize
    && conformal.holdoutSize === EXPECTED.conformalHoldoutSize && conformal.splitFingerprint === EXPECTED.conformalSplitFingerprint,
  `n=${conformal.sampleSize} -> kalibracja=${conformal.calibrationSize}/holdout=${conformal.holdoutSize}, split=${conformal.splitFingerprint} (oczekiwane ${EXPECTED.conformalSampleSize} -> ${EXPECTED.conformalCalibrationSize}/${EXPECTED.conformalHoldoutSize}, ${EXPECTED.conformalSplitFingerprint})`);
record('A8 conformal: kwantyl skalibrowany, ale gwarancja NIE osiągnięta na tak małej próbce (uczciwie oflagowane)',
  conformal.guaranteeAchievable === EXPECTED.conformalGuaranteeAchievable && conformal.calibrationWarnings.length > 0 && conformal.provenance === EXPECTED.conformalProvenance,
  `poziom=${conformal.confidenceLevel}, guaranteeAchievable=${conformal.guaranteeAchievable}, pochodzenie=${conformal.provenance} (oczekiwane ${EXPECTED.conformalConfidenceLevel} / ${EXPECTED.conformalGuaranteeAchievable} / ${EXPECTED.conformalProvenance}); "${conformal.calibrationWarnings[0]?.slice(0, 70)}..."`);
record('A8 conformal: odcisk kalibracji i replay',
  conformal.calibrationFingerprint === EXPECTED.conformalCalibrationFingerprint && conformal.replay === EXPECTED.conformalReplay,
  `${conformal.calibrationFingerprint} / ${conformal.replay} (oczekiwane ${EXPECTED.conformalCalibrationFingerprint} / ${EXPECTED.conformalReplay})`);
record('A8 conformal: pokrycie zgłoszone WPROST — nominał vs zaobserwowane, żadnej obietnicy "gwarantowanych 90%"',
  conformal.nominalCoverage === EXPECTED.conformalNominalCoverage && conformal.observedCoverage === EXPECTED.conformalObservedCoverage && conformal.coverageSampleSize === EXPECTED.conformalCoverageSampleSize,
  `nominał=${conformal.nominalCoverage}, zaobserwowane=${conformal.observedCoverage} na próbce=${conformal.coverageSampleSize} punktów holdout (realne dane NASA, mała próbka — DOKŁADNIE dlatego system NIE obiecuje 90% z 5 punktów kalibracji)`);
record('A8 conformal + M1: rywalizujące modele (liniowy vs płaski) na TYCH SAMYCH danych kalibracyjnych dają realną rozróżnialność',
  Math.abs(conformal.rivalDiscriminability - EXPECTED.conformalRivalDiscriminability) < 1e-9 && conformal.rivalGapTrigger === EXPECTED.conformalRivalGapTrigger,
  `dyskryminowalność=${conformal.rivalDiscriminability.toFixed(4)} (oczekiwane ${EXPECTED.conformalRivalDiscriminability.toFixed(4)}), trigger=${conformal.rivalGapTrigger ?? 'null (wystarczająco rozróżnialne, brak luki)'} — TA SAMA klasyfikacja co M1 (classifyObservationGap), żaden nowy silnik`);

// --- §9: AUTONOMOUS_FRONTIER_ACCEPTANCE --------------------------------------
record('§9: pelny lanccuch — pytanie → modele → planner → eksperyment → obserwacja → residuum → NOWY model → rewizja → stop',
  dFrontier.derivedCount > 0 && dFrontier.residualFindingKinds.length > 0 && dFrontier.beliefsMovedUp > 0 && dFrontier.beliefsMovedDown > 0,
  `${dFrontier.rounds} rund, ${dFrontier.observationsAdmitted} obserwacji, residua: ${dFrontier.residualFindingKinds.join('+')}, przekonania w gore/w dol: ${dFrontier.beliefsMovedUp}/${dFrontier.beliefsMovedDown}, stop=${dFrontier.stopReason}`);
record('§9 WARUNEK 1: nowy model powstal PO obserwacji, nie byl prerejestrowany, ma rodowod do residuum, nie zostal zablokowany przez M2',
  dFrontier.derivedAfterObservation === true && dFrontier.derivedWasPreRegistered === false && dFrontier.hasLineageToResidual === true && dFrontier.derivedBlockedByRegistry === false,
  `wyprowadzono ${dFrontier.derivedCount} (zawiera odebrany gramatyce log: ${dFrontier.derivedContainsDeniedBasis}); po obserwacji=${dFrontier.derivedAfterObservation}, prerejestrowany=${dFrontier.derivedWasPreRegistered}, rodowod=${dFrontier.hasLineageToResidual}, zablokowany przez rejestr=${dFrontier.derivedBlockedByRegistry}`);
record('§9 WARUNEK 2: gdy zaden eksperyment nie rozroznia modeli — OBSERVATION_GAP zamiast zgadywania',
  dFrontier.gapOnDegenerate === 'OBSERVATION_GAP',
  `przypadek zdegenerowany zatrzymal sie z: ${dFrontier.gapOnDegenerate}`);
record('§9 WARUNEK 3: replay == MATCH dla kampanii i dla grafu odkrycia',
  dFrontier.replay === 'MATCH' && dFrontier.graphReplay === 'MATCH',
  `kampania=${dFrontier.replay}, graf=${dFrontier.graphReplay}`);

// --- §8: bramka PracticalCandidate (egzekwowana maszynowo) -------------------
record('§8: bramka PRZEPUSZCZA opisowego kandydata z realnej kampanii, do warstwy Government Research',
  dGate.realCandidateOutcome === 'ACTIVATE' && dGate.realCandidateSurface === 'GOVERNMENT_RESEARCH',
  `werdykt=${dGate.realCandidateOutcome}, warstwa=${dGate.realCandidateSurface}`);
record('§8: granica medyczna dziala na TEKSCIE WYNIKU, nie w promptcie — jezyk recepty jest odrzucony',
  dGate.clinicalTextRefused === true && dGate.clinicalTextCriterion.includes('NO_CLINICAL_DIRECTIVE_LANGUAGE') && dGate.clinicalBlockedRefused === true,
  `tekst z recepta odrzucony przez: ${dGate.clinicalTextCriterion}; klasa CLINICAL_BLOCKED odrzucona=${dGate.clinicalBlockedRefused}`);
record('§8: kandydat bez dowodow i bez zadeklarowanych granic nie wychodzi z warstwy badawczej',
  dGate.thinEvidenceRefused === true && dGate.noLimitsRefused === true,
  `za malo obserwacji → REFUSE=${dGate.thinEvidenceRefused}; pusta lista "czego NIE dowiedziono" → REFUSE=${dGate.noLimitsRefused}`);
record('§8: DZIALANIE wymaga czlowieka, a wynik NIEWYGODNY nie jest blokowany (policy ogranicza dzialanie, nie prawde)',
  dGate.interventionNeedsHuman === true && dGate.negativeFindingStillActivates === true && dGate.citizenSurfaceEverReachable === false,
  `interwencja → REQUIRES_HUMAN_APPROVAL=${dGate.interventionNeedsHuman}; wynik negatywny/worst-case dalej ACTIVATE=${dGate.negativeFindingStillActivates}; warstwa obywatelska osiagalna=${dGate.citizenSurfaceEverReachable}`);

// --- Raport ------------------------------------------------------------------
const failed = checks.filter((c) => !c.ok);

if (UPDATE_MODE) {
  console.log(JSON.stringify({ anchor, keplerAnchor, qe3, qe4 }, null, 2));
} else if (JSON_MODE) {
  console.log(JSON.stringify({ commit: build.commit, node: runtime.version, checks, anchor, keplerAnchor, qe3, qe4, ok: failed.length === 0 }, null, 2));
} else {
  console.log(`\nGENESIS OS — PAKIET ODTWARZALNOŚCI`);
  console.log(`commit ${build.commit} (${build.commitSource}) · node ${runtime.version}\n`);
  for (const c of checks) console.log(`  ${c.ok ? 'OK  ' : 'FAIL'}  ${c.name.padEnd(44)} ${c.detail}`);
  console.log(`\n  Kotwica PubChem — czego NIE dowodzi:\n  ${anchor.whatRemainsUntested}`);
  console.log(`\n  Kotwica PubChem — next question:\n  ${anchor.nextQuestion}`);
  console.log(`\n  Kotwica Kepler/Mars — czego NIE dowodzi:\n  ${keplerAnchor.whatRemainsUntested}`);
  console.log(`\n  Kotwica Kepler/Mars — next question:\n  ${keplerAnchor.nextQuestion}`);
  console.log(`\n  A8 conformal — czego NIE dowodzi:\n  9 realnych punktów NASA NSSDC to za mało, by "gwarantowane pokrycie 90%" znaczyło cokolwiek — i system to przyznaje: guaranteeAchievable=false, a zaobserwowane pokrycie na 4 punktach holdout wynosi ${conformal.observedCoverage} (nie ${conformal.nominalCoverage}). To NIE jest błąd metody (patrz duża syntetyczna próbka w conformalPrediction.test.ts, gdzie pokrycie zbiega do nominału) — to jest dokładnie to ostrzeżenie, o które prosił protokół: mała próbka nie daje prawa obiecać nominalnego poziomu ufności.`);
  console.log(`\n  ${failed.length === 0 ? `WYNIK: ${checks.length}/${checks.length} zgodne z wartościami oczekiwanymi w repo.` : `WYNIK: ${failed.length} rozbieżności — ${failed.map((f) => f.name).join('; ')}`}\n`);
}

process.exit(failed.length === 0 ? 0 : 1);
