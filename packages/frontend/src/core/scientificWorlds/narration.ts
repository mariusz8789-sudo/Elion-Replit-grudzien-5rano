import type { GuideLang, GuideLevel } from '../guide/narrationModel';
import type { AgentReport } from './agentController';
import type { ExperimentSession, ReplayVerdict } from './experimentSession';

/**
 * SCIENTIFIC WORLDS — WHAT THE AGENT SAYS.
 *
 * Narration is a pure projection of the sealed session (and the replay
 * verdict, when one exists) onto sentences. Every number is read from the
 * session; nothing about progress or success is invented. Three levels:
 * EXPLORER (plain words), SCIENTIST (the values with units), AUDITOR (the
 * hashes and the provenance chain). The epistemic status is always spoken.
 */

export interface NarrationLine { readonly key: string; readonly text: string; }

const STATUS_PL: Readonly<Record<ExperimentSession['epistemicStatus'], string>> = {
  REAL_OBSERVATION: 'rzeczywista obserwacja', VERIFIED_SOURCE: 'zweryfikowane źródło', MODEL: 'wynik modelu (oszacowanie)', SIMULATION: 'symulacja',
  HYPOTHESIS: 'hipoteza', SPECULATIVE: 'spekulacja — brak dowodów', FICTION_INSPIRED_SCENARIO: 'scenariusz inspirowany fikcją', NOT_MODELED: 'nie modelowane', INSUFFICIENT_EVIDENCE: 'niewystarczające dowody',
};
const STATUS_EN: Readonly<Record<ExperimentSession['epistemicStatus'], string>> = {
  REAL_OBSERVATION: 'a real observation', VERIFIED_SOURCE: 'a verified source', MODEL: 'a model estimate', SIMULATION: 'a simulation',
  HYPOTHESIS: 'a hypothesis', SPECULATIVE: 'speculative, with no evidence', FICTION_INSPIRED_SCENARIO: 'a fiction-inspired scenario', NOT_MODELED: 'not modelled', INSUFFICIENT_EVIDENCE: 'insufficient evidence',
};

const EXPERIMENT_PL: Readonly<Record<string, string>> = { 'crystal-synthesis': 'synteza kryształu', 'collision-batch': 'paczka zderzeń', 'micro-blackhole': 'próba horyzontu zdarzeń', 'seir-epidemic': 'symulacja epidemii SEIRD' };
const EXPERIMENT_EN: Readonly<Record<string, string>> = { 'crystal-synthesis': 'crystal synthesis', 'collision-batch': 'collision batch', 'micro-blackhole': 'event-horizon attempt', 'seir-epidemic': 'SEIRD epidemic simulation' };

function fmt(v: number | string | boolean): string {
  if (typeof v === 'number') return Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(2) : String(+v.toFixed(3));
  if (typeof v === 'boolean') return v ? 'tak' : 'nie';
  return v;
}

function headline(s: ExperimentSession, lang: GuideLang): string {
  const o = s.outputs;
  switch (s.experimentId) {
    case 'crystal-synthesis':
      return lang === 'pl' ? `Otrzymałem strukturę ${o.name} w sieci ${o.lattice}, stała a ${fmt(o.aPm)} pm, ${o.stable ? 'stabilną' : 'niestabilną'} według oszacowania energii formowania.`
        : `I obtained structure ${o.name}, a ${o.lattice} lattice with a = ${fmt(o.aPm)} pm, ${o.stable ? 'stable' : 'unstable'} by the formation-energy estimate.`;
    case 'collision-batch':
      return lang === 'pl' ? `Wygenerowałem ${fmt(o.events)} zdarzeń; pierwsze to ${o.firstEventId}, proces ${o.firstProcess}, pT ${fmt(o.firstHardPT)} GeV.`
        : `I generated ${fmt(o.events)} events; the first is ${o.firstEventId}, process ${o.firstProcess}, pT ${fmt(o.firstHardPT)} GeV.`;
    case 'micro-blackhole':
      return o.formed
        ? (lang === 'pl' ? `W tym scenariuszu horyzont się formuje: promień Schwarzschilda ${fmt(o.rsM)} m, temperatura Hawkinga ${fmt(o.temperatureK)} K.` : `In this scenario a horizon forms: Schwarzschild radius ${fmt(o.rsM)} m, Hawking temperature ${fmt(o.temperatureK)} K.`)
        : (lang === 'pl' ? `Przy tej energii horyzont się nie formuje (${o.reason}).` : `At this energy no horizon forms (${o.reason}).`);
    case 'seir-epidemic':
      return lang === 'pl' ? `Szczyt zakażeń ${fmt(o.peakInfected)} osób w dniu ${fmt(o.peakDay)} przy R0 ${fmt(o.r0)}; łącznie ${fmt(o.totalInfected)} zakażonych, ${fmt(o.finalDead)} zgonów w modelu.`
        : `Infections peak at ${fmt(o.peakInfected)} on day ${fmt(o.peakDay)} with R0 ${fmt(o.r0)}; ${fmt(o.totalInfected)} infected in total, ${fmt(o.finalDead)} deaths in the model.`;
    default:
      return lang === 'pl' ? `Eksperyment ${s.experimentId} zakończony.` : `Experiment ${s.experimentId} finished.`;
  }
}

export function narrateSession(session: ExperimentSession, opts: { readonly level: GuideLevel; readonly lang: GuideLang; readonly includeProvenance: boolean; readonly replay?: ReplayVerdict | null }): readonly NarrationLine[] {
  const { level, lang, includeProvenance, replay } = opts;
  const lines: NarrationLine[] = [];
  const name = (lang === 'pl' ? EXPERIMENT_PL : EXPERIMENT_EN)[session.experimentId] ?? session.experimentId;
  lines.push({ key: 'result', text: headline(session, lang) });
  lines.push({ key: 'status', text: lang === 'pl' ? `Status poznawczy: ${STATUS_PL[session.epistemicStatus]}; etykieta silnika ${session.engineLabel}. Hash potwierdza tożsamość zapisu, nie prawdziwość twierdzenia.` : `Epistemic status: ${STATUS_EN[session.epistemicStatus]}; engine label ${session.engineLabel}. The hash proves the record's identity, not the truth of the claim.` });
  if (level !== 'EXPLORER') {
    const vals = Object.entries(session.outputs).slice(0, 8).map(([k, v]) => `${k} ${fmt(v)}`).join(', ');
    lines.push({ key: 'values', text: lang === 'pl' ? `Wartości: ${vals}.` : `Values: ${vals}.` });
    lines.push({ key: 'steps', text: lang === 'pl' ? `Kroki: ${session.steps.join(' → ')}.` : `Steps: ${session.steps.join(' → ')}.` });
  }
  if (includeProvenance || level === 'AUDITOR') {
    lines.push({ key: 'provenance', text: lang === 'pl'
      ? `Skąd to pochodzi: ${name}, ziarno ${session.seed}, wejścia ${JSON.stringify(session.inputs)}; sesja ${session.sessionId}, hash treści ${session.contentHash.slice(0, 16)}…, odcisk replay ${session.replayFingerprint.slice(0, 16)}…, wpisy w ledgerze: ${session.evidenceHashes.length}.`
      : `Provenance: ${name}, seed ${session.seed}, inputs ${JSON.stringify(session.inputs)}; session ${session.sessionId}, content hash ${session.contentHash.slice(0, 16)}…, replay fingerprint ${session.replayFingerprint.slice(0, 16)}…, ledger entries: ${session.evidenceHashes.length}.` });
  }
  if (replay) {
    lines.push({ key: 'replay', text: replay.status === 'MATCH'
      ? (lang === 'pl' ? 'Replay: odtworzyłem sesję od nowa i wszystkie wyniki się zgadzają (MATCH).' : 'Replay: I rebuilt and re-ran the session; every output matched (MATCH).')
      : (lang === 'pl' ? `Replay: DRIFT — ponowne wykonanie różni się w polach ${replay.driftedKeys.join(', ')}. To realny błąd odtwarzalności.` : `Replay: DRIFT — the rerun differs on ${replay.driftedKeys.join(', ')}. This is a real reproducibility failure.`) });
  }
  return lines;
}

export function narrateReport(report: AgentReport, opts: { readonly level: GuideLevel; readonly lang: GuideLang; readonly replay?: ReplayVerdict | null }): readonly NarrationLine[] {
  const lines: NarrationLine[] = [];
  if (report.session) lines.push(...narrateSession(report.session, { ...opts, includeProvenance: report.includeProvenance }));
  else if (report.includeResult) lines.push({ key: 'none', text: opts.lang === 'pl' ? 'Nie mam jeszcze żadnego wyniku — najpierw uruchom eksperyment przy stanowisku.' : 'I have no result yet — run an experiment at a station first.' });
  for (const d of report.deferred) {
    lines.push({ key: `defer-${d.intent}`, text: d.intent === 'SCENARIO'
      ? (opts.lang === 'pl' ? `Scenariusz „${d.text}” przekazuję do komory scenariuszy — to pytanie kontrfaktyczne, nie zadanie dla rąk.` : `The scenario “${d.text}” goes to the scenario chamber — a counterfactual question, not a job for the hands.`)
      : (opts.lang === 'pl' ? `Pytanie „${d.text}” przekazuję do Zapytaj — odpowiedź wymaga źródeł, nie stanowiska.` : `The question “${d.text}” goes to Ask — it needs sources, not a station.`) });
  }
  for (const r of report.rejected) lines.push({ key: `rejected-${r.commandId}`, text: opts.lang === 'pl' ? `Odrzuciłem polecenie: ${r.reason}.` : `I refused a command: ${r.reason}.` });
  return lines;
}
