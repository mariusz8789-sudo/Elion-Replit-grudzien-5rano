/**
 * Genesis Discovery Engine — dowód E2E w prawdziwej przeglądarce.
 *
 * Testy jednostkowe biegną w Node. Ten skrypt sprawdza coś innego: że warstwa
 * odkrycia wykonuje REALNE przebiegi w Chromium, na kodzie zbudowanym dla
 * przeglądarki, i że daje TE SAME odciski co Node. Zgodność odcisków między
 * środowiskami jest mocniejszym dowodem determinizmu niż powtórzenie w jednym.
 *
 * Warstwa nie ma UI i nie powinna go mieć — logika naukowa nie należy do
 * interfejsu — więc E2E ładuje moduł bezpośrednio, bez ekranu.
 *
 * Użycie: node scripts/discovery-e2e.mjs
 * Kod wyjścia 0 = wszystkie sprawdzenia przeszły; 2 = wykryto niezgodność.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';

const { chromium } = pkg;
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROOT = new URL('..', import.meta.url).pathname;

const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    console.log(`  FAIL ${name}${detail ? ` :: ${detail}` : ''}`);
    failures.push(name);
  }
};

const work = mkdtempSync(join(tmpdir(), 'genesis-de-'));
const entry = join(work, 'entry.ts');
writeFileSync(entry, `
import * as discovery from '${join(ROOT, 'packages/frontend/src/core/discovery/index.ts')}';
globalThis.__genesisDiscovery = discovery;
`);
const bundle = join(work, 'discovery.bundle.js');
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  entry, '--bundle', '--format=iife', '--platform=browser', '--target=es2020', `--outfile=${bundle}`,
], { stdio: 'inherit' });

const scenario = `
export default function scenario(d) {
  const initialConditions = { nAgents: 160, initialInfected: 5, seed: 777, days: 40, stepsPerDay: 4 };
  const spec = {
    question: 'Czy izolacja objawowych obniża szczyt zakażeń?',
    hypothesis: {
      statement: 'Izolacja objawowych obniża szczytową liczbę zakaźnych.',
      falsification: { metric: 'peakInfectious', relation: 'less-than', rationale: 'Izolacja usuwa zakaźnych z obiegu kontaktów.' },
      assumptions: [],
    },
    baselineScenario: 'BASELINE',
    variantScenario: 'ISOLATION',
    initialConditions,
  };
  const c = d.runDiscoveryCase(spec);
  const timing = c.followUp.find((f) => f.plan && f.plan.kind === 'intervention-timing');
  const timingRun = timing ? d.runFollowUp(timing) : null;
  const multi = c.followUp.find((f) => f.plan && f.plan.kind === 'multi-seed');
  const multiRun = multi ? d.runFollowUp(multi) : null;
  const beds = d.runParameterSweep({
    question: 'Ile łóżek usuwa dni bez opieki?',
    scenario: 'BASELINE', parameter: 'totalBeds', values: [2, 4, 8, 16, 32],
    initialConditions, hospitalCapacity: { totalBeds: 4, icuBeds: 1, icuShareOfAdmissions: 0.22 },
  });
  const blocked = d.runDiscoveryCase({ ...spec, baselineScenario: 'ISOLATION', variantScenario: 'CONTACT_REDUCTION' });
  const notModeled = d.runDiscoveryCase({ ...spec, variantScenario: 'VACCINATION' });

  // --- Warstwa kohortowa: heterogeniczna populacja ---
  const cohortConditions = { nAgents: 260, initialInfected: 5, seed: 4242, days: 60, stepsPerDay: 4 };
  const illustrative = d.defineCohortProfile('age-gradient-illustrative', {
    severityMultiplier: { child: 0.2, adult: 1, senior: 4 },
    fatalityMultiplier: { child: 0.1, adult: 1, senior: 6 },
  });
  const neutralCase = d.runDiscoveryCase({
    ...spec, initialConditions: cohortConditions, baseParams: { severeRate: 0.2 },
    baselineScenario: 'BASELINE', variantScenario: 'PROTECT_SENIORS',
  });
  const calibratedCase = d.runDiscoveryCase({
    ...spec, initialConditions: cohortConditions, baseParams: { severeRate: 0.2 },
    baselineScenario: 'BASELINE', variantScenario: 'PROTECT_SENIORS', cohort: illustrative,
  });
  const priority = d.runProtectionPriorityStudy({
    question: 'Kogo chronić najpierw?',
    initialConditions: cohortConditions, baseParams: { severeRate: 0.2 }, cohort: illustrative,
  });
  const priorityNeutral = d.runProtectionPriorityStudy({
    question: 'Kogo chronić najpierw?',
    initialConditions: cohortConditions, baseParams: { severeRate: 0.2 },
  });
  const plainRun = d.runDiscoveryCase({ ...spec, initialConditions: cohortConditions, baseParams: { severeRate: 0.2 } });
  return {
    caseId: c.caseId,
    status: c.status,
    runFingerprint: c.runFingerprint,
    evidencePackId: c.evidence.evidencePackId,
    missingFields: c.evidence.missingFields,
    comparison: c.comparison.status,
    controlledDifference: c.comparison.controlledDifference,
    replay: d.replayDiscoveryCase(c).status,
    verdict: c.conclusion.verdict,
    peak: c.comparison.metrics.find((m) => m.key === 'peakInfectious'),
    followUpKinds: c.followUp.map((f) => (f.plan ? f.plan.kind : 'NOT_MODELED')),
    timingFingerprints: timingRun ? timingRun.sweep.points.map((p) => p.runFingerprint) : [],
    timingPeaks: timingRun ? timingRun.sweep.points.map((p) => p.summary && p.summary.peakInfectious) : [],
    timingMonotonicity: timingRun ? timingRun.sweep.monotonicity.find((m) => m.metric === 'peakInfectious').verdict : null,
    multiSeedPeaks: multiRun ? multiRun.multiRun.dispersion.find((x) => x.metric === 'peakInfectious') : null,
    bedInputFingerprints: beds.points.map((p) => p.inputFingerprint),
    bedFingerprints: beds.points.map((p) => p.runFingerprint),
    bedUnmet: beds.points.map((p) => p.summary && p.summary.totalUnmetCareDays),
    bedSummaries: beds.points.map((p) => p.summary && JSON.stringify(p.summary)),
    blockedStatus: blocked.status,
    blockedReason: blocked.comparison.blockedReason,
    blockedGate: d.evaluateGate(blocked, 'SUPPORTED').allowed,
    notModeledStatus: notModeled.status,
    notModeledHasReason: Boolean(notModeled.notModeledReason),

    cohortNotModeled: d.COHORT_NOT_MODELED.slice(),
    cohortVariableProvenance: d.COHORT_VARIABLES.map((v) => v.id + ':' + v.provenance),
    illustrativeCalibration: illustrative.calibration,
    neutralIsNeutral: d.differentiatesCohorts(d.NEUTRAL_COHORT_PROFILE),
    plainBands: plainRun.arms[0].summary.byBand,
    neutralProtectFingerprint: neutralCase.arms[1].run.resultFingerprint,
    calibratedProtectFingerprint: calibratedCase.arms[1].run.resultFingerprint,
    calibratedBands: calibratedCase.arms[0].summary.byBand,
    cohortLever: calibratedCase.comparison.controlledDifference,
    cohortReplay: calibratedCase.replay.status,
    cohortCaseStatus: calibratedCase.status,
    cohortLimitations: calibratedCase.limitations.join(' | '),
    priorityStatus: priority.status,
    priorityWinners: priority.winnerByObjective,
    priorityConflict: Boolean(priority.conflictNote),
    priorityAdmitted: priority.candidates.filter((c) => c.admitted).length,
    priorityReplays: priority.candidates.map((c) => c.case.replay.status),
    priorityRankingDeaths: priority.rankingByObjective.totalDeaths.map((r) => [r.scenario, r.value, r.referenceValue]),
    priorityNeutralWinnerDeaths: priorityNeutral.winnerByObjective.totalDeaths,
  };
}
`;
writeFileSync(join(work, 'scenario-browser.js'), scenario.replace('export default function scenario', 'window.__scenario = function scenario'));

// --- Wartości odniesienia policzone w Node z TEGO SAMEGO kodu źródłowego ---
const nodeEntry = join(work, 'node-entry.ts');
writeFileSync(join(work, 'scenario.ts'), scenario);
writeFileSync(nodeEntry, `
import * as d from '${join(ROOT, 'packages/frontend/src/core/discovery/index.ts')}';
import scenario from '${join(work, 'scenario.ts')}';
console.log('__RESULT__' + JSON.stringify(scenario(d)));
`);
const nodeBundle = join(work, 'node.mjs');
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  nodeEntry, '--bundle', '--format=esm', '--platform=node', '--target=node22', `--outfile=${nodeBundle}`,
], { stdio: 'inherit' });
const nodeOut = execFileSync('node', [nodeBundle], { cwd: ROOT, encoding: 'utf8' });
const expected = JSON.parse(nodeOut.split('__RESULT__')[1].trim());

// --- Ten sam kod w Chromium ---
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
await page.setContent('<!doctype html><title>Genesis Discovery E2E</title><body>');
await page.addScriptTag({ content: readFileSync(bundle, 'utf8') });
await page.addScriptTag({ content: readFileSync(join(work, 'scenario-browser.js'), 'utf8') });
const actual = await page.evaluate(() => window.__scenario(window.__genesisDiscovery));
await browser.close();

console.log('\nGenesis Discovery Engine — E2E w Chromium\n');
check('brak błędów runtime w przeglądarce', pageErrors.length === 0, pageErrors.join(' | '));
check('sprawa kończy się statusem SUPPORTED', actual.status === 'SUPPORTED', actual.status);
check('porównanie ma dokładnie jedną kontrolowaną różnicę', actual.comparison === 'COMPLETED' && actual.controlledDifference === 'isolate', `${actual.comparison}/${actual.controlledDifference}`);
check('odtworzenie w przeglądarce daje MATCH', actual.replay === 'MATCH', actual.replay);
check('pakiet dowodowy jest kompletny', actual.missingFields.length === 0, JSON.stringify(actual.missingFields));
check('wniosek wynika z realnego spadku szczytu', actual.verdict === 'SUPPORTED' && actual.peak.variant < actual.peak.baseline, JSON.stringify(actual.peak));
check('follow-up „moment izolacji" wykonał realne przebiegi', new Set(actual.timingFingerprints).size === actual.timingFingerprints.length && actual.timingFingerprints.length > 1, JSON.stringify(actual.timingFingerprints));
check('opóźniona izolacja podnosi szczyt monotonicznie', actual.timingMonotonicity === 'INCREASING', `${actual.timingMonotonicity} ${JSON.stringify(actual.timingPeaks)}`);
check('replikacja po ziarnach dała rozrzut', actual.multiSeedPeaks && actual.multiSeedPeaks.max > actual.multiSeedPeaks.min, JSON.stringify(actual.multiSeedPeaks && actual.multiSeedPeaks.distribution));
check('sweep łóżek: każdy punkt to osobne wejście', new Set(actual.bedInputFingerprints).size === actual.bedInputFingerprints.length, JSON.stringify(actual.bedInputFingerprints));
// Odcisk WYNIKU identyfikuje wynik, nie wejście: dwa punkty o identycznym
// rozdziale pacjentów słusznie mają ten sam odcisk. Wymagamy więc dokładnie
// tego: różny wynik <=> różny odcisk.
check('sweep łóżek: różny wynik daje różny odcisk, identyczny wynik ten sam', (() => {
  for (let i = 0; i < actual.bedFingerprints.length; i++) {
    for (let j = i + 1; j < actual.bedFingerprints.length; j++) {
      const sameSummary = actual.bedSummaries[i] === actual.bedSummaries[j];
      const sameFingerprint = actual.bedFingerprints[i] === actual.bedFingerprints[j];
      if (sameSummary !== sameFingerprint) return false;
    }
  }
  return new Set(actual.bedFingerprints).size > 1;
})(), JSON.stringify(actual.bedFingerprints));
check('sweep łóżek: brak opieki spada wraz z pojemnością', actual.bedUnmet[0] > 0 && actual.bedUnmet[actual.bedUnmet.length - 1] === 0, JSON.stringify(actual.bedUnmet));
check('sprawa splątana jest zablokowana', actual.blockedStatus === 'BLOCKED' && actual.blockedReason === 'CONFOUNDED_MULTIPLE_DIFFERENCES', `${actual.blockedStatus}/${actual.blockedReason}`);
check('bramka nie przepuszcza zablokowanej sprawy do SUPPORTED', actual.blockedGate === false);
check('scenariusz spoza modelu kończy się NOT_MODELED z powodem', actual.notModeledStatus === 'NOT_MODELED' && actual.notModeledHasReason);

// --- Heterogeniczna populacja ---
check('każda zmienna kohortowa deklaruje prowenancję', actual.cohortVariableProvenance.every((v) => /:(STRUCTURAL|REQUIRES_CALIBRATION|NOT_MODELED)$/.test(v)), JSON.stringify(actual.cohortVariableProvenance));
check('profil bez źródła jest oznaczony REQUIRES_CALIBRATION', actual.illustrativeCalibration === 'REQUIRES_CALIBRATION', actual.illustrativeCalibration);
check('profil neutralny niczego nie różnicuje', actual.neutralIsNeutral === false);
check('model deklaruje, czego w strukturze populacji nie ma', actual.cohortNotModeled.includes('comorbidities') && actual.cohortNotModeled.includes('vaccine-efficacy'), JSON.stringify(actual.cohortNotModeled));
check('bez kalibracji wiek nie tworzy gradientu ciężkości', (() => {
  const shares = ['child', 'adult', 'senior'].map((b) => actual.plainBands[b].severeShareOfInfected).filter((v) => v > 0);
  return Math.max(...shares) / Math.min(...shares) < 2.5;
})(), JSON.stringify(actual.plainBands));
check('kalibracja tworzy realny gradient ciężkości wg wieku', actual.calibratedBands.senior.severeShareOfInfected > actual.calibratedBands.child.severeShareOfInfected * 3, JSON.stringify(['child', 'senior'].map((b) => actual.calibratedBands[b].severeShareOfInfected)));
check('profil kohortowy zmienia przebieg, więc i odcisk', actual.neutralProtectFingerprint !== actual.calibratedProtectFingerprint, `${actual.neutralProtectFingerprint} vs ${actual.calibratedProtectFingerprint}`);
check('ochrona priorytetowa to jedna kontrolowana dźwignia', actual.cohortLever === 'priority-protection', actual.cohortLever);
check('sprawa z heterogeniczną populacją odtwarza się', actual.cohortReplay === 'MATCH' && actual.cohortCaseStatus !== 'BLOCKED', `${actual.cohortReplay}/${actual.cohortCaseStatus}`);
check('sprawa niesie prowenancję profilu w ograniczeniach', actual.cohortLimitations.includes('REQUIRES_CALIBRATION'), actual.cohortLimitations.slice(0, 160));
check('„kogo chronić najpierw": wszyscy kandydaci udowodnieni', actual.priorityStatus === 'COMPLETED' && actual.priorityAdmitted === 3 && actual.priorityReplays.every((r) => r === 'MATCH'), `${actual.priorityStatus}/${actual.priorityAdmitted}/${JSON.stringify(actual.priorityReplays)}`);
check('najmniej zgonów daje ochrona seniorów przy tej kalibracji', actual.priorityWinners.totalDeaths === 'PROTECT_SENIORS', JSON.stringify(actual.priorityRankingDeaths));
check('najniższy szczyt daje ochrona dorosłych — inny cel, inny zwycięzca', actual.priorityWinners.peakInfectious === 'PROTECT_ADULTS', actual.priorityWinners.peakInfectious);
check('rozbieżność celów jest zgłoszona, a nie ukryta', actual.priorityConflict === true);
check('bez kalibracji odpowiedź jest inna — nie jest wpisana na stałe', actual.priorityNeutralWinnerDeaths !== actual.priorityWinners.totalDeaths, `${actual.priorityNeutralWinnerDeaths} vs ${actual.priorityWinners.totalDeaths}`);

// Najmocniejszy dowód: identyczne odciski w Node i w przeglądarce.
for (const key of ['caseId', 'runFingerprint', 'evidencePackId', 'timingFingerprints', 'bedInputFingerprints', 'bedFingerprints', 'timingPeaks', 'bedUnmet', 'followUpKinds', 'calibratedProtectFingerprint', 'plainBands', 'calibratedBands', 'priorityWinners', 'priorityRankingDeaths']) {
  check(`Node i Chromium zgodne: ${key}`, JSON.stringify(actual[key]) === JSON.stringify(expected[key]), `${JSON.stringify(expected[key])} vs ${JSON.stringify(actual[key])}`);
}

console.log(`\n${failures.length === 0 ? 'E2E OK' : `E2E FAILED (${failures.length})`}\n`);
process.exit(failures.length === 0 ? 0 : 2);
