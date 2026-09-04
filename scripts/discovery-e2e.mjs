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
import { chromium } from 'playwright';

const CHROME = process.env.GENESIS_CHROMIUM_PATH || '/usr/bin/chromium';
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

  // --- Warstwa kontaktów: kto z kim, gdzie i jakim kanałem ---
  const contactCase = (variant, mobility) => d.runDiscoveryCase({
    ...spec, initialConditions: cohortConditions,
    baseParams: mobility === undefined ? { severeRate: 0.2 } : { severeRate: 0.2, mobility: mobility },
    baselineScenario: 'BASELINE', variantScenario: variant,
  });
  const schoolCase = contactCase('SCHOOL_CLOSURE');
  const shieldMobile = contactCase('PROTECT_SENIORS');
  const shieldHome = contactCase('PROTECT_SENIORS', 0.4);
  const metricOf = (c, key) => c.comparison.metrics.find((m) => m.key === key);
  const baselineGraph = schoolCase.arms[0].run.transmissionGraph;
  const clusters = d.analyseTransmissionClusters(baselineGraph);
  const homeboundClusters = d.analyseTransmissionClusters(shieldHome.arms[1].run.transmissionGraph);
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
    priorityNeutralWinners: priorityNeutral.winnerByObjective,
    priorityNeutralConflict: Boolean(priorityNeutral.conflictNote),
    seniorLoadCalibrated: priority.rankingByObjective.hospitalizedEver_senior[0].referenceValue,
    seniorLoadNeutral: priorityNeutral.rankingByObjective.hospitalizedEver_senior[0].referenceValue,

    contactTypesNotModeled: d.CONTACT_TYPES_NOT_MODELED.slice(),
    contactNetworkNotModeled: d.CONTACT_NETWORK_NOT_MODELED.slice(),
    graphSize: baselineGraph.length,
    graphTypes: baselineGraph.map((e) => e.contactType).filter((t, i, a) => a.indexOf(t) === i).sort(),
    graphHasProbability: baselineGraph.every((e) => e.transmissionProbability > 0 && e.transmissionProbability <= 1),
    householdEdgesConsistent: baselineGraph.filter((e) => e.contactType === 'HOUSEHOLD').every((e) => e.sourceHouseholdId === e.targetHouseholdId),
    attribution: clusters.attribution.filter((a) => a.transmissions > 0).map((a) => [a.contactType, a.transmissions]),
    attributionTotal: clusters.attribution.reduce((n, a) => n + a.transmissions, 0),
    dominantRoute: d.dominantContactType(clusters),
    householdClusterCount: clusters.householdClusters.length,
    householdCalibration: schoolCase.arms[0].run.households.calibration,
    householdMembersUnique: (() => {
      const m = schoolCase.arms[0].run.households.households.flatMap((h) => h.memberIds);
      return new Set(m).size === m.length;
    })(),
    schoolLever: schoolCase.comparison.controlledDifference,
    schoolReplay: schoolCase.replay.status,
    schoolVerdict: schoolCase.conclusion.verdict,
    schoolTransBefore: metricOf(schoolCase, 'transmissions_SCHOOL').baseline,
    schoolTransAfter: metricOf(schoolCase, 'transmissions_SCHOOL').variant,
    schoolTotalBefore: metricOf(schoolCase, 'transmissions_total').baseline,
    schoolTotalAfter: metricOf(schoolCase, 'transmissions_total').variant,
    seniorHouseholdShareMobile: d.shareIntoBand(d.analyseTransmissionClusters(shieldMobile.arms[1].run.transmissionGraph), 'senior', 'HOUSEHOLD'),
    seniorHouseholdShareHome: d.shareIntoBand(homeboundClusters, 'senior', 'HOUSEHOLD'),
    seniorAttackHomeBase: metricOf(shieldHome, 'attackRate_senior').baseline,
    seniorAttackHomeShielded: metricOf(shieldHome, 'attackRate_senior').variant,
    shieldHomeReplay: shieldHome.replay.status,

    interfaceVersion: d.WORLD_ENGINE_INTERFACE_VERSION,
    contractEntities: [...new Set(d.WORLD_ENGINE_FIELD_CONTRACT.map((f) => f.entity))].sort(),
    contractProvenances: [...new Set(d.WORLD_ENGINE_FIELD_CONTRACT.map((f) => f.provenance))].sort(),
    decisionFieldsOwnedByCore: d.WORLD_ENGINE_FIELD_CONTRACT
      .filter((f) => ['transmissionOccurred', 'transmissionProbability', 'contactType'].includes(f.field))
      .every((f) => f.provenance === 'MODEL_DERIVED'),
    blockedCapabilities: d.CAPABILITY_REQUIREMENTS.map((c) => c.capability).sort(),
    everyCapabilityBlockedToday: d.CAPABILITY_REQUIREMENTS.every((c) => c.availableToday === false),
    emptyPayloadUnlocks: d.validateWorldPayload({ contractVersion: d.WORLD_ENGINE_INTERFACE_VERSION }).unlockedCapabilities,
    rejectsNotModeled: d.validateWorldPayload({ contractVersion: d.WORLD_ENGINE_INTERFACE_VERSION, providedFields: ['ContactEvent.duration'] }).valid,
    rejectsBadVersion: d.validateWorldPayload({ contractVersion: '0.0.1' }).valid,
    unlocksOnlyOnCompleteFields: [
      d.validateWorldPayload({ contractVersion: d.WORLD_ENGINE_INTERFACE_VERSION, providedFields: ['Route.segments'] }).unlockedCapabilities.length,
      d.validateWorldPayload({ contractVersion: d.WORLD_ENGINE_INTERFACE_VERSION, providedFields: ['Route.segments', 'AgentMovement.route'] }).unlockedCapabilities.length,
    ],
    transitShare: clusters.locationAttribution.transitShare,
    attributionConfidence: clusters.locationAttribution.confidence,
    otherDwell: clusters.attribution.find((a) => a.contactType === 'OTHER').dwellTransmissions,
    otherTransit: clusters.attribution.find((a) => a.contactType === 'OTHER').transitTransmissions,
    transitInsideBuildings: clusters.locationAttribution.transitInsideBuildings,
    dwellInsideBuildings: clusters.locationAttribution.dwellInsideBuildings,
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
check('ochrona najliczniejszej grupy wygrywa i na zgonach, i na szczycie', actual.priorityWinners.totalDeaths === 'PROTECT_ADULTS' && actual.priorityWinners.peakInfectious === 'PROTECT_ADULTS', JSON.stringify(actual.priorityRankingDeaths));
check('zwycięzca faktycznie bije odniesienie', actual.priorityRankingDeaths[0][1] < actual.priorityRankingDeaths[0][2], JSON.stringify(actual.priorityRankingDeaths[0]));
check('najgorsza opcja jest raportowana jako gorsza od odniesienia', actual.priorityRankingDeaths[2][1] > actual.priorityRankingDeaths[2][2], JSON.stringify(actual.priorityRankingDeaths[2]));
check('rozbieżność celów jest zgłaszana, gdy naprawdę występuje', actual.priorityNeutralConflict === true && new Set(Object.values(actual.priorityNeutralWinners).filter(Boolean)).size > 1, JSON.stringify(actual.priorityNeutralWinners));
check('kalibracja zmienia skalę obciążenia seniorów przy tej samej epidemii', actual.seniorLoadCalibrated > actual.seniorLoadNeutral * 2, `${actual.seniorLoadNeutral} → ${actual.seniorLoadCalibrated}`);

// --- Sieć kontaktów i transmisji ---
check('praca i transport pozostają NOT_MODELED', JSON.stringify(actual.contactTypesNotModeled.slice().sort()) === JSON.stringify(['TRANSPORT', 'WORK']), JSON.stringify(actual.contactTypesNotModeled));
check('brak macierzy kontaktów i demografii gospodarstw jest zadeklarowany', actual.contactNetworkNotModeled.includes('age-specific-contact-matrix') && actual.contactNetworkNotModeled.includes('household-demography'), JSON.stringify(actual.contactNetworkNotModeled));
check('graf transmisji powstał z realnych zdarzeń', actual.graphSize > 0 && actual.graphHasProbability, `${actual.graphSize} krawędzi`);
check('żadna krawędź nie ma typu, którego model nie zna', actual.graphTypes.every((t) => !actual.contactTypesNotModeled.includes(t)), JSON.stringify(actual.graphTypes));
check('krawędzie domowe łączą wyłącznie współmieszkańców', actual.householdEdgesConsistent === true);
check('atrybucja pokrywa wszystkie transmisje', actual.attributionTotal === actual.graphSize, `${actual.attributionTotal} vs ${actual.graphSize}`);
check('dominująca droga wskazana z realnych zdarzeń', actual.dominantRoute !== null && !actual.contactTypesNotModeled.includes(actual.dominantRoute), String(actual.dominantRoute));
check('gospodarstwa są realne, ale ich rozkład oznaczony jako syntetyczny', actual.householdCalibration === 'SYNTHETIC_CALIBRATION_REQUIRED' && actual.householdMembersUnique === true, actual.householdCalibration);
check('A. zamknięcie szkoły to osobna, kontrolowana dźwignia', actual.schoolLever === 'closeSchools' && actual.schoolReplay === 'MATCH', `${actual.schoolLever}/${actual.schoolReplay}`);
check('A. transmisja szkolna znika całkowicie', actual.schoolTransBefore > 0 && actual.schoolTransAfter === 0, `${actual.schoolTransBefore} → ${actual.schoolTransAfter}`);
check('A. ale łączna transmisja nie spada — kontakty się przenoszą', actual.schoolTotalAfter > actual.schoolTotalBefore && actual.schoolVerdict === 'NOT_SUPPORTED', `${actual.schoolTotalBefore} → ${actual.schoolTotalAfter}, ${actual.schoolVerdict}`);
check('B. przy pozostaniu w domu zakażenia seniorów biegną przez gospodarstwo', actual.seniorHouseholdShareHome > actual.seniorHouseholdShareMobile && actual.seniorHouseholdShareHome > 0.3, `${(actual.seniorHouseholdShareMobile * 100).toFixed(0)}% → ${(actual.seniorHouseholdShareHome * 100).toFixed(0)}%`);
check('B. i wtedy ochrona seniorów przestaje chronić', actual.seniorAttackHomeShielded > actual.seniorAttackHomeBase && actual.shieldHomeReplay === 'MATCH', `${actual.seniorAttackHomeBase.toFixed(3)} → ${actual.seniorAttackHomeShielded.toFixed(3)}`);

// --- Kontrakt dla World Engine ---
check('kontrakt pokrywa wszystkie encje z briefu', ['AgentPosition', 'AgentMovement', 'Location', 'Route', 'ContactEvent', 'TransmissionEvent'].every((e) => actual.contractEntities.includes(e)), JSON.stringify(actual.contractEntities));
check('każde pole ma prowenancję z zamkniętej listy', JSON.stringify(actual.contractProvenances) === JSON.stringify(['MODEL_DERIVED', 'NOT_MODELED', 'WORLD_DERIVED']), JSON.stringify(actual.contractProvenances));
check('pola decyzyjne zostają po stronie Scientific Core', actual.decisionFieldsOwnedByCore === true);
check('wszystkie zdolności zależne od świata są dziś zablokowane', actual.everyCapabilityBlockedToday === true && actual.emptyPayloadUnlocks.length === 0, JSON.stringify(actual.blockedCapabilities));
check('walidator odrzuca złą wersję kontraktu', actual.rejectsBadVersion === false);
check('walidator odrzuca ładunek podający pole NOT_MODELED', actual.rejectsNotModeled === false);
check('zdolność odblokowuje dopiero komplet pól', actual.unlocksOnlyOnCompleteFields[0] === 0 && actual.unlocksOnlyOnCompleteFields[1] === 1, JSON.stringify(actual.unlocksOnlyOnCompleteFields));
check('atrybucja miejsca zgłasza niską wiarygodność', actual.transitShare > 0.5 && actual.attributionConfidence === 'LOW', `${(actual.transitShare * 100).toFixed(1)}% w tranzycie`);
check('OTHER jest w 100% artefaktem ruchu, nie miejscem', actual.otherDwell === 0 && actual.otherTransit > 0, `dwell=${actual.otherDwell} transit=${actual.otherTransit}`);
check('nawet w budynkach przeważa przechodzenie nad pobytem', actual.transitInsideBuildings > actual.dwellInsideBuildings, `${actual.transitInsideBuildings} vs ${actual.dwellInsideBuildings}`);

// Najmocniejszy dowód: identyczne odciski w Node i w przeglądarce.
for (const key of ['caseId', 'runFingerprint', 'evidencePackId', 'timingFingerprints', 'bedInputFingerprints', 'bedFingerprints', 'timingPeaks', 'bedUnmet', 'followUpKinds', 'calibratedProtectFingerprint', 'plainBands', 'calibratedBands', 'priorityWinners', 'priorityRankingDeaths', 'attribution', 'graphTypes', 'dominantRoute', 'schoolTransBefore', 'schoolTotalAfter', 'seniorHouseholdShareHome', 'transitShare', 'otherTransit', 'transitInsideBuildings', 'blockedCapabilities']) {
  check(`Node i Chromium zgodne: ${key}`, JSON.stringify(actual[key]) === JSON.stringify(expected[key]), `${JSON.stringify(expected[key])} vs ${JSON.stringify(actual[key])}`);
}

console.log(`\n${failures.length === 0 ? 'E2E OK' : `E2E FAILED (${failures.length})`}\n`);
process.exit(failures.length === 0 ? 0 : 2);
