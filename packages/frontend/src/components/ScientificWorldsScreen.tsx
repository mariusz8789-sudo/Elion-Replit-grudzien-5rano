import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useThreeLoop } from '../core/three/useThreeLoop';
import { AgentLabScene3D, type AgentCameraMode } from '../core/three/agentLabScene3D';
import { AgentController, type AgentReport } from '../core/scientificWorlds/agentController';
import { planActions } from '../core/scientificWorlds/actionPlanner';
import { parseWorldCommands } from '../core/scientificWorlds/worldCommand';
import { LAB_CATALOG, LAB_OBSTACLES, LAB_ROOM, LAB_SPAWN, LAB_STATIONS, LAB_WORLD_ID } from '../core/scientificWorlds/labWorld';
import { createLabExperimentRunner, type LabArtifact } from '../core/scientificWorlds/experimentRunners';
import { replayExperimentSession, type ExperimentSession, type ReplayVerdict } from '../core/scientificWorlds/experimentSession';
import { AGENT_STATE_LABEL_PL, type AgentActionState } from '../core/scientificWorlds/agentActionMachine';
import { narrateReport, narrateSession, type NarrationLine } from '../core/scientificWorlds/narration';
import { kernelLedger } from '../core/agent/cyberReasoningKernel';
import { getVoiceEngine } from '../core/guide/guideRuntime';
import type { GuideLevel } from '../core/guide/narrationModel';
import { requestOpenScienceChat } from '../core/scienceChatBridge';

/**
 * SCIENTIFIC WORLDS (`#/scientific-worlds`) — the laboratory the user
 * commands in plain language. Text → typed WorldCommand → ActionPlan → the
 * suited agent walks, reaches, works the console → ONE ExperimentSession
 * through the kernel's engines → the result appears in the world and in the
 * evidence panel, with its epistemic status, hashes and a replay button.
 *
 * The camera looks through the helmet visor (body and hands in frame); a
 * spectator camera is secondary. The HUD keeps to reserved safe zones —
 * status top-left, evidence top-right, command bar at the bottom — and
 * never covers the centre of the frame. Nothing on this screen is a
 * placeholder number: the log starts empty and every line comes from a
 * real command, session or verdict.
 */

const STATE_NAMES: readonly AgentActionState[] = ['IDLE', 'MOVING_TO_TARGET', 'ARRIVED', 'ALIGNING', 'REACHING', 'INTERACTING', 'EXECUTING', 'OBSERVING', 'REPORTING', 'RETURNING', 'BLOCKED'];

export const QUICK_COMMANDS: readonly { readonly label: string; readonly text: string }[] = [
  { label: 'Synteza NaCl', text: 'Idź do syntezatora kryształów i uruchom próbę NaCl. Potem pokaż mi, co otrzymałeś i skąd to pochodzi.' },
  { label: 'Zderzacz 13 TeV', text: 'Podejdź do konsoli zderzacza i uruchom paczkę zderzeń przy 13 TeV.' },
  { label: 'Epidemia', text: 'Idź do pulpitu epidemiologicznego i zasymuluj epidemię.' },
  { label: 'Okno', text: 'Idź do okna obserwacyjnego.' },
];

export interface TranscriptEntry { readonly id: number; readonly who: 'user' | 'agent' | 'system'; readonly text: string; }

/** Pure: what the HUD says about a parsed command before the body moves. */
export function describePlan(commandCount: number, unresolved: readonly string[], steps: readonly string[], rejected: readonly { reason: string }[]): string {
  const parts: string[] = [];
  if (commandCount) parts.push(`Rozumiem ${commandCount} ${commandCount === 1 ? 'polecenie' : 'polecenia'}: ${steps.join(' → ') || 'bez kroków'}.`);
  if (unresolved.length) parts.push(`Nie zrozumiałem: „${unresolved.join('”, „')}”.`);
  for (const r of rejected) parts.push(`Odrzucone: ${r.reason}.`);
  if (!parts.length) parts.push('Nie znalazłem polecenia w tym tekście.');
  return parts.join(' ');
}

export function ScientificWorldsScreen(): JSX.Element {
  const runner = useMemo(() => createLabExperimentRunner(LAB_WORLD_ID, kernelLedger), []);
  const controller = useMemo(() => new AgentController({ room: LAB_ROOM, obstacles: LAB_OBSTACLES, stations: LAB_STATIONS, start: LAB_SPAWN, runner, worldId: LAB_WORLD_ID, defaultSeed: 7 }), [runner]);
  const sim = useMemo(() => new AgentLabScene3D(controller, LAB_STATIONS, LAB_ROOM), [controller]);
  const params = useMemo(() => ({}), []);
  const [agentState, setAgentState] = useState<AgentActionState>('IDLE');
  const [stationId, setStationId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [session, setSession] = useState<ExperimentSession | null>(null);
  const [artifactKind, setArtifactKind] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplayVerdict | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [text, setText] = useState('');
  const [camera, setCamera] = useState<AgentCameraMode>('VISOR');
  const [voice, setVoice] = useState(false);
  const [level, setLevel] = useState<GuideLevel>('EXPLORER');
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [frames, setFrames] = useState(0);
  const logicalTime = useRef(0);
  const nextId = useRef(1);
  const levelRef = useRef(level); levelRef.current = level;
  const voiceRef = useRef(voice); voiceRef.current = voice;

  const say = useCallback((who: TranscriptEntry['who'], line: string) => {
    setTranscript((t) => [...t.slice(-40), { id: nextId.current++, who, text: line }]);
  }, []);
  const speak = useCallback((lines: readonly NarrationLine[]) => {
    for (const l of lines) say('agent', l.text);
    if (voiceRef.current) {
      const engine = getVoiceEngine();
      const joined = lines.map((l) => l.text).join(' ');
      engine.speak({ key: `worlds:${lines[0]?.key ?? 'line'}`, text: joined, lang: 'pl' });
    }
  }, [say]);

  const onStats = useCallback((s: Record<string, number>) => {
    setAgentState((prev) => { const next = STATE_NAMES[s.agentState ?? 0] ?? 'IDLE'; return prev === next ? prev : next; });
    setProgress((p) => (Math.abs(p - (s.progress ?? 0)) > 0.02 ? s.progress ?? 0 : p));
    setFrames((f) => (s.frames && s.frames - f >= 10 ? s.frames : f));
  }, []);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true, onStats);

  useEffect(() => {
    sim.setUpdateListener((u) => {
      if (u.stationId) setStationId(u.stationId);
      setBlocked(u.blockedReason);
      if (u.sessionSealed) {
        const { session: sealed, artifact } = u.sessionSealed;
        setSession(sealed); setReplay(null); setArtifactKind((artifact as LabArtifact).kind);
        if (sealed.stationId) sim.setArtifact(sealed.stationId, artifact as LabArtifact);
      }
      if (u.report) {
        const report: AgentReport = u.report;
        speak(narrateReport(report, { level: levelRef.current, lang: 'pl' }));
        if (report.deferred.some((d) => d.intent === 'ASK')) { /* the question is handed to Science Chat by the button below */ }
      }
    });
    return () => sim.setUpdateListener(null);
  }, [sim, speak]);

  const submit = useCallback((raw: string) => {
    const t = raw.trim(); if (!t) return;
    say('user', t);
    logicalTime.current += 1;
    const parsed = parseWorldCommands(t, LAB_CATALOG, logicalTime.current);
    const plan = planActions(parsed.commands, LAB_CATALOG, controller.station);
    say('system', describePlan(parsed.commands.length, parsed.unresolved, plan.steps.map((s) => s.kind), plan.rejected));
    if (plan.steps.length === 0) return;
    const started = controller.startPlan(plan);
    if (!started.ok) say('system', `Agent nie może przyjąć planu: ${started.reason}.`);
    else { setBlocked(null); const first = plan.steps.find((s) => 'stationId' in s); sim.setHighlight(first && 'stationId' in first ? first.stationId : null); }
    setText('');
  }, [controller, say, sim]);

  const onSubmit = (e: FormEvent): void => { e.preventDefault(); submit(text); };
  const doReplay = (): void => {
    if (!session) return;
    const verdict = replayExperimentSession(session, runner);
    setReplay(verdict);
    if (session.stationId) sim.setArtifact(session.stationId, verdict.artifact as LabArtifact);
    speak(narrateSession(session, { level: levelRef.current, lang: 'pl', includeProvenance: false, replay: verdict }).filter((l) => l.key === 'replay'));
  };
  const toggleCamera = (): void => { const next: AgentCameraMode = camera === 'VISOR' ? 'SPECTATOR' : 'VISOR'; setCamera(next); sim.setCameraMode(next); };
  const station = stationId ? LAB_STATIONS.find((s) => s.id === stationId) ?? null : null;
  const working = agentState === 'REACHING' || agentState === 'INTERACTING' || agentState === 'EXECUTING';

  return (
    <main id="main-content" className={`sw sw-cam-${camera.toLowerCase()}`} aria-label="Światy naukowe — laboratorium agenta" data-testid="scientific-worlds" data-agent-state={agentState} data-frames={frames} data-camera={camera}>
      <canvas ref={canvasRef} className="sw-canvas" data-testid="sw-canvas" />
      {camera === 'VISOR' && (
        <div className="sw-visor" aria-hidden="true" data-testid="sw-visor">
          <div className="sw-visor-frame" />
          <div className="sw-visor-glare" />
          <div className="sw-visor-breath" />
          {working && <div className="sw-reticle" />}
        </div>
      )}
      {loading && <div className="sw-loading" role="status">Ładowanie laboratorium…</div>}
      {failed && <p className="cw-error sw-glerror" role="alert">WebGL niedostępny — laboratorium 3D nie może się uruchomić na tym urządzeniu.</p>}

      <section className="sw-hud sw-hud-status" aria-label="Stan agenta" data-testid="sw-status">
        <div className="sw-badges">
          <span className="sw-badge">ŚWIAT: LABORATORIUM</span>
          <span className="sw-badge" data-testid="sw-agent-state">AGENT: {AGENT_STATE_LABEL_PL[agentState]}</span>
          {station && <span className="sw-badge">STANOWISKO: {station.label}</span>}
          <span className="sw-badge">KAMERA: {camera === 'VISOR' ? 'WIZJER' : 'OBSERWATOR'}</span>
        </div>
        {agentState !== 'IDLE' && agentState !== 'BLOCKED' && <div className="sw-progress" aria-hidden="true"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
        {blocked && <p className="cw-error" role="alert" data-testid="sw-blocked">Zablokowany: {blocked}</p>}
        <div className="sw-actions">
          <button type="button" className="sw-btn" onClick={toggleCamera} data-testid="sw-camera">{camera === 'VISOR' ? 'Kamera obserwatora' : 'Wróć do wizjera'}</button>
          <button type="button" className={`sw-btn${voice ? ' is-on' : ''}`} onClick={() => setVoice((v) => !v)} aria-pressed={voice} data-testid="sw-voice">Głos {voice ? 'wł.' : 'wył.'}</button>
          <select className="sw-select" value={level} onChange={(e) => setLevel(e.target.value as GuideLevel)} aria-label="Poziom narracji" data-testid="sw-level">
            <option value="EXPLORER">Odkrywca</option><option value="SCIENTIST">Naukowiec</option><option value="AUDITOR">Audytor</option>
          </select>
        </div>
      </section>

      <section className={`sw-hud sw-hud-evidence${evidenceOpen ? '' : ' is-collapsed'}`} aria-label="Dowody i sesja" data-testid="sw-evidence">
        <button type="button" className="sw-hud-toggle" onClick={() => setEvidenceOpen((o) => !o)} aria-expanded={evidenceOpen}>DOWODY · SESJA {evidenceOpen ? '▾' : '▸'}</button>
        {evidenceOpen && (session ? (
          <dl className="sw-session" data-testid="sw-session" data-session-id={session.sessionId}>
            <dt>Sesja</dt><dd className="cw-mono">{session.sessionId}</dd>
            <dt>Eksperyment</dt><dd className="cw-mono">{session.experimentId} · ziarno {session.seed}</dd>
            <dt>Status</dt><dd><span className={`sw-status sw-status-${session.epistemicStatus.toLowerCase()}`} data-testid="sw-epistemic">{session.epistemicStatus}</span> · {session.engineLabel}</dd>
            <dt>Wejścia</dt><dd className="cw-mono">{JSON.stringify(session.inputs)}</dd>
            <dt>Wyniki</dt><dd className="cw-mono sw-outputs" data-testid="sw-outputs">{Object.entries(session.outputs).map(([k, v]) => <span key={k}>{k}: {String(v)}</span>)}</dd>
            <dt>Ledger</dt><dd className="cw-mono cw-wrap">{session.evidenceHashes.map((h) => <span key={h} data-testid="sw-ledger-hash">contentHash {h}</span>)}</dd>
            <dt>Hash sesji</dt><dd className="cw-mono cw-wrap" data-testid="sw-content-hash">{session.contentHash}</dd>
            <dt>Odcisk replay</dt><dd className="cw-mono cw-wrap">{session.replayFingerprint}</dd>
            <dt>Artefakt</dt><dd className="cw-mono">{artifactKind ?? '—'} · renderowany z tej sesji</dd>
            <dt>Replay</dt>
            <dd>
              <button type="button" className="sw-btn" onClick={doReplay} data-testid="sw-replay">Powtórz eksperyment</button>
              {replay && <span className={`sw-status sw-replay-${replay.status.toLowerCase()}`} data-testid="sw-replay-verdict"> {replay.status}</span>}
            </dd>
          </dl>
        ) : (
          <p className="sw-faint" data-testid="sw-no-session">Brak sesji. Każdy eksperyment tworzy jedną sesję z hashem treści, odciskiem replay i wpisem w EvidenceLedger.</p>
        ))}
      </section>

      <section className="sw-hud sw-hud-command" aria-label="Polecenia" data-testid="sw-command">
        <ol className="sw-transcript" data-testid="sw-transcript" aria-live="polite">
          {transcript.map((e) => <li key={e.id} className={`sw-line sw-line-${e.who}`}>{e.text}</li>)}
        </ol>
        <form className="sw-form" onSubmit={onSubmit}>
          <input className="sw-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Napisz polecenie, np. „Idź do syntezatora i uruchom próbę NaCl”" aria-label="Polecenie dla agenta" data-testid="sw-input" />
          <button type="submit" className="sw-btn sw-btn-primary" data-testid="sw-send">Wyślij</button>
          <button type="button" className="sw-btn" onClick={() => requestOpenScienceChat()} data-testid="sw-ask">Zapytaj</button>
        </form>
        <div className="sw-quick">
          {QUICK_COMMANDS.map((q) => <button key={q.label} type="button" className="sw-chip" onClick={() => submit(q.text)} data-testid={`sw-quick-${q.label.split(' ')[0].toLowerCase()}`}>{q.label}</button>)}
        </div>
      </section>
    </main>
  );
}

export default ScientificWorldsScreen;
