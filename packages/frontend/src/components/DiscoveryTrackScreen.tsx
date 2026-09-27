import { useEffect, useState } from 'react';
import type React from 'react';
import { runAutonomousOrchestrator, type OrchestratorCampaignRecord } from '../core/agent/campaignOrchestrator';
import { makeKeplerDomainAdapter, makeQe4DomainAdapter } from '../core/biotechData/domainAdapterRegistry';
import { KEPLER_MARS_ANCHOR_ID } from '../core/biotechData/externalAnchor';
import { runGenuineDiscoveryPipeline } from '../core/agent/genuineDiscoveryOrchestrator';
import type { LiteratureSearchClient } from '../core/agent/literatureNoveltyAdapter';
import type { ModelSpec } from '../core/agent/modelSpace';
import type { StructuralDeclaration } from '../core/agent/selfFalsificationBattery';
import type { DiscoveryRecord, DiscoveryStatus, NoveltyEvidence, SelfFalsificationProbeName } from '../core/agent/discoveryContracts';
import './reviewerRoom.css';

/**
 * #/discovery-track — ŚCIEŻKA ODKRYCIA (Phase F) na dwóch prawdziwych
 * rekordach kampanii Phase E, policzona w przeglądarce recenzenta.
 *
 * Ten ekran nie liczy żadnej nauki. Buduje dokładnie te same wejścia, które
 * buduje `scripts/genuine-discovery-e2e-01.mjs` (Kepler z zadeklarowaną
 * kotwicą publiczną; QE4 bez kotwicy), przepuszcza je przez
 * `runGenuineDiscoveryPipeline` (nowość L1–L6 → replikacja → 13 sond
 * samofalsyfikacji → DiscoveryStatus) i renderuje to, co pipeline zwrócił.
 * Żadnych wyników wpisanych na sztywno: gdyby moduły policzyły inaczej,
 * ekran pokazałby inaczej.
 *
 * Literatura (L5/L6): w tym środowisku OpenAlex/Crossref są nieosiągalne
 * (polityka sieci — patrz `literatureNoveltyAdapter.ts`), więc wstrzykujemy
 * klienta, który ZAWSZE zgłasza brak dostępu i nigdy nie wykonuje fetch.
 * `runLiteratureLayer` mapuje to uczciwie na NO_ACCESS, a
 * `classifyDiscoveryStatus` nie może wtedy wyjść ponad UNKNOWN.
 */

/** Klient literatury bez sieci: zgłasza brak dostępu, nigdy nie wykonuje fetch. */
export const NO_ACCESS_LITERATURE_CLIENT: LiteratureSearchClient = {
  name: 'OpenAlex+Crossref (NO_ACCESS w tym środowisku)',
  search: () => Promise.reject(new Error('NO_ACCESS: zewnętrzne wyszukiwanie literatury nie jest dostępne w tym środowisku (brak wywołania sieciowego).')),
};

/** Identyczne z E2E-01: model rywalizujący (stała) i deklaracja strukturalna wywołującego. */
const RIVAL: ModelSpec = { id: 'rival', terms: [{ basis: 'CONSTANT' }], lineage: null };
const CLEAN_DECLARATION: StructuralDeclaration = {
  representativeSampling: true, leakageChecked: true, knownUncontrolledConfounders: [],
  measurementInstrumentValidated: true, numericalPrecisionChecked: true, preprocessingDocumented: true, temporalOrderingRespected: true,
};
const BASE = { rivalSpec: RIVAL, structuralDeclaration: CLEAN_DECLARATION, numberOfHypothesesTested: 1, multipleTestingCorrectionApplied: false } as const;

export interface DiscoveryTrackEntry {
  readonly id: 'kepler' | 'qe4';
  readonly title: string;
  readonly dataset: string;
  readonly anchorNote: string;
  readonly campaign: OrchestratorCampaignRecord;
  readonly discoveryPointCount: number;
  /** null wyłącznie wtedy, gdy kampania nie ma zwycięskiego modelu (pipeline zwraca null, nigdy nie zmyśla). */
  readonly record: DiscoveryRecord | null;
}

export interface DiscoveryTrackResult {
  readonly entries: readonly DiscoveryTrackEntry[];
  readonly literatureClientName: string;
}

/** Buduje wejścia dokładnie jak scripts/genuine-discovery-e2e-01.mjs i uruchamia istniejący pipeline. Czyste: bez sieci, bez LLM. */
export async function computeDiscoveryTrack(): Promise<DiscoveryTrackResult> {
  const clients = [NO_ACCESS_LITERATURE_CLIENT];

  const keplerTrace = runAutonomousOrchestrator({
    seedAdapter: makeKeplerDomainAdapter(), options: { maxRounds: 7, maxTerms: 2 }, maxCampaigns: 1,
    declaredPublicAnchorResolver: () => ({ anchorId: KEPLER_MARS_ANCHOR_ID, summary: "Kepler's third law -- established public knowledge." }),
  });
  const keplerCampaign = keplerTrace.campaigns[0]!;
  const keplerRecord = await runGenuineDiscoveryPipeline({
    campaign: keplerCampaign, literatureClients: clients, matchThreshold: 0.5,
    discoveryDataset: { datasetId: 'kepler-disc', points: [] }, replicationDataset: null, ...BASE,
  });

  const qe4Trace = runAutonomousOrchestrator({ seedAdapter: makeQe4DomainAdapter(), options: { maxRounds: 6, maxTerms: 2 }, maxCampaigns: 1 });
  const qe4Campaign = qe4Trace.campaigns[0]!;
  const qe4Points = qe4Campaign.result.rounds.flatMap((r) => r.admittedX).map((x) => ({ x, y: 0, sigma: 1 }));
  const qe4Record = await runGenuineDiscoveryPipeline({
    campaign: qe4Campaign, literatureClients: clients, matchThreshold: 0.5,
    discoveryDataset: { datasetId: 'qe4-disc', points: qe4Points }, replicationDataset: null, ...BASE,
  });

  return {
    literatureClientName: NO_ACCESS_LITERATURE_CLIENT.name,
    entries: [
      {
        id: 'kepler', title: 'Kepler — III prawo (NASA NSSDC, dane przypięte)', dataset: 'kepler-disc',
        anchorNote: 'Zadeklarowana kotwica publiczna: ' + KEPLER_MARS_ANCHOR_ID,
        campaign: keplerCampaign, discoveryPointCount: 0, record: keplerRecord,
      },
      {
        id: 'qe4', title: 'QE4 — dane kwantowe (przypięte), bez kotwicy publicznej', dataset: 'qe4-disc',
        anchorNote: 'Brak zadeklarowanej kotwicy publicznej.',
        campaign: qe4Campaign, discoveryPointCount: qe4Points.length, record: qe4Record,
      },
    ],
  };
}

/* ---------- etykiety (słownictwo istniejące w UI, tłumaczone bez zmiany kodów) ---------- */

const NOVELTY_LAYERS: readonly { readonly key: keyof Pick<NoveltyEvidence, 'l1InternalMemory' | 'l2PreregisteredCorpus' | 'l3PinnedPublicDatasets' | 'l4DeclaredAnchors' | 'l5ExternalLiteratureSearch' | 'l6PostDiscoveryRecheck'>; readonly label: string }[] = [
  { key: 'l1InternalMemory', label: 'L1 · Pamięć wewnętrzna (rejestr sfalsyfikowanych modeli / znanych wyników)' },
  { key: 'l2PreregisteredCorpus', label: 'L2 · Korpus prerejestrowany' },
  { key: 'l3PinnedPublicDatasets', label: 'L3 · Przypięte publiczne zbiory danych' },
  { key: 'l4DeclaredAnchors', label: 'L4 · Zadeklarowane kotwice publiczne' },
  { key: 'l5ExternalLiteratureSearch', label: 'L5 · Zewnętrzne wyszukiwanie literatury (OpenAlex/Crossref)' },
  { key: 'l6PostDiscoveryRecheck', label: 'L6 · Ponowne sprawdzenie po odkryciu' },
];

const LEVEL_GLOSS: Readonly<Record<string, string>> = {
  NOT_NEW: 'już znane',
  POSSIBLY_NOVEL: 'możliwie nowe',
  NOVEL_WITHIN_CHECKED_CORPUS: 'nowe w sprawdzonym korpusie',
  UNKNOWN: 'nieznane',
  NOT_RUN: 'nie uruchomiono',
  KNOWN: 'znane',
  NO_KNOWN_PRIOR_FOUND: 'nie znaleziono znanego pierwowzoru (w sprawdzonym zakresie)',
  UNVERIFIABLE: 'nieweryfikowalne',
  NO_ACCESS: 'brak dostępu',
};

const STATUS_GLOSS: Readonly<Record<DiscoveryStatus, string>> = {
  REPRODUCTION: 'reprodukcja ustalonej wiedzy publicznej',
  KNOWN_RESULT: 'wynik już znany Genesis (pamięć wewnętrzna)',
  EXTENSION: 'rozszerzenie znanego wyniku',
  NOVEL_HYPOTHESIS: 'nowa hipoteza (sufit: nie jest to odkrycie)',
  DISCOVERY_CANDIDATE: 'kandydat na odkrycie — bramki nie w komplecie',
  DISCOVERY: 'każda maszynowo weryfikowalna bramka przeszła (nie: zgoda społeczności)',
  UNKNOWN: 'nieznane — nowości nie da się ustalić poza pamięcią wewnętrzną',
  NO_ACCESS: 'brak dostępu do danych',
  CONFLICTING_EVIDENCE: 'dowody sprzeczne',
  FAILED_DISCOVERY: 'replikacja nie powiodła się',
};

const PROBE_LABEL: Readonly<Record<SelfFalsificationProbeName, string>> = {
  LEAKAGE: 'Wyciek danych',
  SELECTION_BIAS: 'Błąd selekcji',
  MULTIPLE_TESTING: 'Wielokrotne testowanie',
  OVERFITTING: 'Przeuczenie',
  HIDDEN_PREREG: 'Ukryta prerejestracja',
  DATASET_CONTAMINATION: 'Kontaminacja zbiorów',
  TAUTOLOGY: 'Tautologia',
  CONFOUNDING: 'Zmienne zakłócające',
  ALTERNATIVE_MODEL: 'Model alternatywny',
  MEASUREMENT_ARTIFACT: 'Artefakt pomiarowy',
  NUMERICAL_ARTIFACT: 'Artefakt numeryczny',
  PREPROCESSING_ARTIFACT: 'Artefakt przetwarzania wstępnego',
  TEMPORAL_LEAKAGE: 'Wyciek czasowy',
};

const METHOD_LABEL: Readonly<Record<string, string>> = {
  DETERMINISTIC_PROBE: 'sonda deterministyczna',
  STATISTICAL_TEST: 'test statystyczny',
  STRUCTURAL_REVIEW: 'przegląd strukturalny (deklaracja wywołującego)',
};

const VERDICT_LABEL: Readonly<Record<string, string>> = { PASS: 'PASS — przeszła', FAIL: 'FAIL — nie przeszła', UNRESOLVED: 'UNRESOLVED — nierozstrzygnięta' };

function tagClass(value: string): string {
  if (value === 'PASS' || value === 'WITHSTOOD' || value === 'REPLICATED') return 'rv-tag rv-tag-good';
  if (value === 'FAIL' || value === 'BROKE_CLAIM' || value === 'FAILED') return 'rv-tag rv-tag-bad';
  return 'rv-tag';
}

function gloss(code: string): string {
  const g = LEVEL_GLOSS[code];
  return g ? `${code} — ${g}` : code;
}

/* ---------- widok ---------- */

function NoveltyTable({ evidence }: { evidence: NoveltyEvidence }): React.ReactElement {
  return (
    <table className="rv-table" data-testid="novelty-table">
      <thead><tr><th>Warstwa nowości</th><th>Wynik modułu</th></tr></thead>
      <tbody>
        {NOVELTY_LAYERS.map((layer) => (
          <tr key={layer.key}><td>{layer.label}</td><td><code>{gloss(evidence[layer.key])}</code></td></tr>
        ))}
        <tr><td><strong>Łącznie (overall)</strong></td><td><strong><code data-testid="novelty-overall">{gloss(evidence.overall)}</code></strong> · pewność {evidence.confidence.toFixed(2)}</td></tr>
      </tbody>
    </table>
  );
}

function ReplicationBlock({ record }: { record: DiscoveryRecord }): React.ReactElement {
  const rep = record.replication;
  if (rep === null) {
    return (
      <p className="rv-note" data-testid="replication-not-run">
        <strong>Niezależna replikacja: nie uruchomiono.</strong> Silnik replikacji (`discoveryReplicationEngine.ts`: zamrożenie hipotezy przed dostępem,
        rozłączność zbiorów, dwie próby adwersarialne: label-shuffle i half-split) startuje tylko przy overall = NO_KNOWN_PRIOR_FOUND i osobnym,
        rozłącznym zbiorze replikacyjnym. Tutaj overall = <code>{record.noveltyEvidence.overall}</code>, a zbiór replikacyjny nie został dostarczony —
        pipeline uczciwie zostawia pole puste zamiast fabrykować wynik.
      </p>
    );
  }
  return (
    <div data-testid="replication-block">
      <p className="rv-note">
        Replikacja: <span className={tagClass(rep.result)}>{rep.result}</span> · dowód rozłączności {rep.disjointnessProof} · efekt odkrycia {rep.effectComparison.discoveryEffect.toPrecision(6)}
        {' '}vs replikacji {rep.effectComparison.replicationEffect.toPrecision(6)} · zgodność w granicach niepewności: {rep.effectComparison.agreementWithinUncertainty ? 'tak' : 'nie'}
      </p>
      <table className="rv-table">
        <thead><tr><th>Próba adwersarialna</th><th>Wynik</th><th>Szczegół</th></tr></thead>
        <tbody>
          {rep.adversarialAttempts.map((a) => (
            <tr key={a.attack}><td>{a.attack}</td><td><span className={tagClass(a.result)}>{a.result}</span></td><td>{a.detail}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProbeTable({ record }: { record: DiscoveryRecord }): React.ReactElement {
  const probes = record.selfFalsification.probes;
  return (
    <table className="rv-table" data-testid="probe-table">
      <thead><tr><th>#</th><th>Sonda</th><th>Metoda</th><th>Werdykt</th><th>Powód (z modułu)</th></tr></thead>
      <tbody>
        {probes.map((p, i) => (
          <tr key={p.name} data-testid="probe-row" data-probe={p.name} data-verdict={p.result}>
            <td>{i + 1}</td>
            <td>{PROBE_LABEL[p.name]} <small><code>{p.name}</code></small></td>
            <td>{METHOD_LABEL[p.method] ?? p.method}</td>
            <td><span className={tagClass(p.result)}>{VERDICT_LABEL[p.result] ?? p.result}</span></td>
            <td>{p.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EntryCard({ entry }: { entry: DiscoveryTrackEntry }): React.ReactElement {
  const { campaign, record } = entry;
  const passed = record ? record.selfFalsification.probes.filter((p) => p.result === 'PASS').length : 0;
  return (
    <section className="rv-card" aria-labelledby={`dt-${entry.id}`} data-testid={`discovery-track-${entry.id}`} data-status={record?.status ?? 'NULL'}>
      <p className="rv-kicker">Rekord kampanii Phase E · {entry.anchorNote}</p>
      <h2 id={`dt-${entry.id}`}>{entry.title}</h2>
      <dl className="pilot-provenance">
        <div><dt>Problem</dt><dd>{campaign.result.problem}</dd></div>
        <div><dt>Etykieta Phase E (noveltyGate, tylko sprawdzenia wewnętrzne)</dt><dd><code data-testid={`phase-e-${entry.id}`}>{campaign.resultLabel}</code> · poziom {campaign.noveltyAssessment.level}</dd></div>
        <div><dt>Odcisk kampanii (campaignFingerprint)</dt><dd><code>{campaign.result.campaignFingerprint}</code></dd></div>
        <div><dt>Zbiór odkrycia</dt><dd>{entry.dataset} · {entry.discoveryPointCount} pkt (jak w E2E-01: x przyjęte w rundach, y=0, σ=1 — dane pomocnicze do sond, nie pomiar)</dd></div>
      </dl>

      {record === null ? (
        <p className="rv-verdict rv-bad" data-testid={`status-${entry.id}`}>Pipeline zwrócił null: kampania nie ma zwycięskiego modelu — nie ma czego oceniać, nic nie jest fabrykowane.</p>
      ) : (
        <>
          <h3>1 · Nowość L1–L6</h3>
          <NoveltyTable evidence={record.noveltyEvidence} />
          {record.noveltyEvidence.matchedPriorArt.length > 0 && (
            <p className="rv-note">Dopasowany pierwowzór: {record.noveltyEvidence.matchedPriorArt.map((m) => m.matchedClaim).join(' | ')}</p>
          )}
          {record.noveltyEvidence.limitations.length > 0 && (
            <ul className="pilot-limitations" data-testid={`limitations-${entry.id}`}>
              {record.noveltyEvidence.limitations.map((l) => <li key={l}>{l}</li>)}
            </ul>
          )}

          <h3>2 · Niezależna replikacja</h3>
          <ReplicationBlock record={record} />

          <h3>3 · Samofalsyfikacja: 13 sond ({passed}/13 PASS; UNRESOLVED blokuje DISCOVERY tak samo jak FAIL)</h3>
          <ProbeTable record={record} />

          <h3>4 · DiscoveryStatus</h3>
          <div className={`rv-verdict ${record.status === 'DISCOVERY' ? 'rv-warn' : 'rv-good'}`} data-testid={`status-${entry.id}`}>
            <strong data-testid={`status-code-${entry.id}`}>{record.status}</strong>
            <span>{STATUS_GLOSS[record.status]} · walidacja zewnętrzna: {record.externalValidation}</span>
          </div>
          <dl className="pilot-provenance">
            <div><dt>Odcisk wyniku (outcomeFingerprint)</dt><dd><code data-testid={`fingerprint-${entry.id}`}>{record.outcomeFingerprint}</code></dd></div>
            <div><dt>Odcisk raportu sond</dt><dd><code>{record.selfFalsification.reportFingerprint}</code></dd></div>
            <div><dt>Zamrożona hipoteza (preregFreeze)</dt><dd><code>{record.preregFreeze.hypothesisFingerprint}</code> · predykcja <code>{record.preregFreeze.predictionFingerprint}</code></dd></div>
            <div><dt>Uchwyt replay</dt><dd><code>{record.replayHandle}</code></dd></div>
          </dl>
        </>
      )}
    </section>
  );
}

/** Widok czysty: renderuje wyłącznie to, co pipeline zwrócił. Używany przez ekran i przez test statyczny. */
export function DiscoveryTrackView({ result }: { result: DiscoveryTrackResult }): React.ReactElement {
  return (
    <main className="rv-room" id="main-content" tabIndex={-1} lang="pl" data-testid="discovery-track">
      <header className="rv-hero">
        <p className="rv-kicker">Genesis · Ścieżka odkrycia (Phase F)</p>
        <h1>Nowość L1–L6 → niezależna replikacja → 13 sond samofalsyfikacji → DiscoveryStatus</h1>
        <p>
          Dwa prawdziwe rekordy kampanii Phase E, policzone teraz w Twojej przeglądarce przez te same moduły, które sprawdza
          <code> scripts/genuine-discovery-e2e-01.mjs</code>. Ekran niczego nie liczy sam: pokazuje, co zwrócił <code>runGenuineDiscoveryPipeline</code>.
        </p>
        <p className="rv-note" data-testid="discovery-track-caveat">
          <strong>Ścieżka deterministyczna, bez LLM; status końcowy nigdy nie jest promowany powyżej tego, co dowody pozwalają.</strong>
        </p>
        <p className="rv-note" data-testid="discovery-track-no-access">
          Literatura (OpenAlex/Crossref): NO_ACCESS w tym środowisku — dlatego status nie może przekroczyć UNKNOWN.
          Wstrzyknięty klient: <code>{result.literatureClientName}</code> — nie wykonuje żadnego wywołania sieciowego.
        </p>
        <p className="rv-note">
          Siedem sond STRUCTURAL_REVIEW (selekcja, wyciek, zakłócenia, pomiar, numeryka, przetwarzanie, czas) ocenia deklarację wywołującego, nie dane —
          tutaj zadeklarowano ją jako czystą, identycznie jak w E2E-01; to deklaracja, nie pomiar. Model rywalizujący: stała.
        </p>
      </header>
      {result.entries.map((entry) => <EntryCard key={entry.id} entry={entry} />)}
      <section className="rv-card">
        <p className="rv-kicker">Czego ten ekran nie twierdzi</p>
        <ul className="rv-list">
          <li>Żaden z rekordów nie jest odkryciem. Kepler jest tym, co pipeline policzył jako dopasowanie do kotwicy publicznej; QE4 nie może przejść ponad UNKNOWN bez zewnętrznego sprawdzenia literatury.</li>
          <li>Replikacja i kontaminacja zbiorów nie zostały wykonane, bo nie ma rozłącznego zbioru replikacyjnego — pole pozostaje puste, sondy raportują UNRESOLVED.</li>
          <li>Powtórzenie w Node: <code>node scripts/genuine-discovery-e2e-01.mjs</code> (odciski kampanii do porównania z tymi na ekranie).</li>
        </ul>
      </section>
    </main>
  );
}

/** Jedno obliczenie na załadowanie strony (StrictMode i ponowne montowanie nie uruchamiają pipeline'u dwa razy). */
let cachedRun: Promise<DiscoveryTrackResult> | null = null;
function cachedDiscoveryTrack(): Promise<DiscoveryTrackResult> {
  if (cachedRun === null) cachedRun = computeDiscoveryTrack();
  return cachedRun;
}

export function DiscoveryTrackScreen(): React.ReactElement {
  const [result, setResult] = useState<DiscoveryTrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    cachedDiscoveryTrack().then(
      (r) => { if (alive) setResult(r); },
      (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); },
    );
    return () => { alive = false; };
  }, []);

  if (error !== null) {
    return <main className="rv-room" id="main-content" tabIndex={-1} lang="pl"><p className="rv-verdict rv-bad" role="alert">Pipeline odkrycia zgłosił błąd: {error}</p></main>;
  }
  if (result === null) {
    return <main className="rv-room" id="main-content" tabIndex={-1} lang="pl"><p className="route-loading" role="status">Liczenie ścieżki odkrycia na rekordach Kepler i QE4…</p></main>;
  }
  return <DiscoveryTrackView result={result} />;
}

export default DiscoveryTrackScreen;
