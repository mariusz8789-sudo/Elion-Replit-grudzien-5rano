import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { ExecutionBlockedResult, RunResult } from '../../core/orchestrator/govLowerHarmDiscovery';
import type { GenesisDomainReplayResult } from '../../core/orchestrator/genesisDomainRegistry';
import { beatById, buildNarration, factsFromRun, type GuideLang, type GuideLevel, type NarrationBeat } from '../../core/guide/narrationModel';
import { beatForState, guideReducer, INITIAL_SESSION, pathFor, tourHoldSeconds, type GuideEvent, type GuideMode, type GuideSession } from '../../core/guide/guideMachine';
import { followEvidenceSteps } from '../../core/guide/followEvidence';
import { useVoiceEngine } from '../../core/guide/guideRuntime';
import { clearSpotlight, performGuideAction, playBeatSound } from './guideActions';
import { GuideOverlay } from './GuideOverlay';

/**
 * GuidedDiscovery — the guide's controller inside the Research Console
 * (D-119). It owns the session state machine, derives facts from the REAL run
 * the console holds, builds beats from those facts, and on every step does
 * three things at once: VOICE (the engine speaks the beat), ACTION (DOM
 * spotlight / typed example / scroll / gates), VISUAL (the console's own
 * panels). GUIDED waits for the person; TOUR advances on its own clock and
 * runs the real pipeline and the real replay itself. It never invents a
 * result: the run and the replay are the console's, exactly as they are.
 */
export interface GuidedDiscoveryProps {
  readonly autoplay: GuideMode | null;
  readonly result: RunResult | ExecutionBlockedResult | null;
  readonly running: boolean;
  readonly replay: GenesisDomainReplayResult | null;
  readonly replayBusy: boolean;
  readonly onRun: () => void;
  readonly onReplay: () => void;
  readonly onPrepareTour: () => void;
  readonly onExit?: () => void;
}

const LEVEL_KEY = 'genesis.guide.level';
function loadLevel(): GuideLevel {
  try { const v = window.localStorage.getItem(LEVEL_KEY); return v === 'SCIENTIST' || v === 'AUDITOR' ? v : 'EXPLORER'; } catch { return 'EXPLORER'; }
}

export function GuidedDiscovery(p: GuidedDiscoveryProps): React.ReactElement | null {
  const engine = useVoiceEngine();
  const lang: GuideLang = engine.settings.lang;
  const [session, setSession] = useState<GuideSession>(INITIAL_SESSION);
  const [level, setLevelState] = useState<GuideLevel>(() => (typeof window === 'undefined' ? 'EXPLORER' : loadLevel()));
  const [plain, setPlain] = useState(false);
  const [follow, setFollow] = useState<number | null>(null);
  const [typed, setTyped] = useState(false);

  const facts = useMemo(() => factsFromRun(p.result, p.replay, p.running), [p.result, p.replay, p.running]);
  const factsRef = useRef(facts);
  factsRef.current = facts;
  const beats = useMemo(() => buildNarration(facts, { level, lang }), [facts, level, lang]);
  const beatId = beatForState(session.state);
  const beat: NarrationBeat | null = beatId === null ? null : beatById(beats, beatId);
  const followSteps = useMemo(() => followEvidenceSteps(facts, lang), [facts, lang]);

  const dispatch = useCallback((ev: GuideEvent): void => { setSession((s) => guideReducer(s, ev, factsRef.current)); }, []);

  // Auto-start.
  useEffect(() => {
    if (p.autoplay === null) return;
    if (p.autoplay === 'TOUR') p.onPrepareTour();
    dispatch({ type: 'START', mode: p.autoplay });
  }, []);

  // Follow the run the console really performs. The pipeline can finish inside one render
  // frame (the `running` flag then never reaches this effect), so the arrival of a NEW result
  // is the authoritative signal; the flag only adds the RUNNING step when it is observable.
  const wasRunning = useRef(false);
  const lastResult = useRef<GuidedDiscoveryProps['result']>(p.result);
  useEffect(() => {
    if (session.state === 'IDLE') { lastResult.current = p.result; return; }
    if (p.running && !wasRunning.current) { wasRunning.current = true; dispatch({ type: 'RUN_STARTED' }); return; }
    if (p.running) return;
    // A new result only means "the run finished" while the guide is waiting for one (ASK / RUNNING);
    // later in the path the console re-rendering with a rebuilt result is not a new run.
    const waiting = session.state === 'ASK' || session.state === 'RUNNING';
    const arrived = waiting && p.result !== null && p.result !== lastResult.current;
    if (wasRunning.current || arrived) {
      wasRunning.current = false;
      lastResult.current = p.result;
      if (p.result?.kind === 'EXECUTION_BLOCKED') dispatch({ type: 'RUN_BLOCKED' });
      else if (p.result !== null) dispatch({ type: 'RUN_FINISHED' });
    }
  }, [p.running, p.result, session.state, dispatch]);

  // VOICE → ACTION → VISUAL on every step (and on repeat / plain / level / language changes).
  const speak = useCallback((b: NarrationBeat | null, usePlain: boolean): void => {
    if (b === null) return;
    engine.speak({ key: usePlain ? `${b.id}:plain` : `${b.id}:${b.level}`, text: usePlain ? b.plain : b.text, lang: b.lang });
  }, [engine]);

  const lastActed = useRef<string>('');
  useEffect(() => {
    if (beat === null) { if (session.state === 'IDLE' || session.state === 'DONE') clearSpotlight(); return; }
    const key = `${session.state}:${session.utterance}:${follow ?? '-'}`;
    const fresh = lastActed.current !== key;
    lastActed.current = key;
    if (follow !== null) {
      const step = followSteps[follow];
      if (step !== undefined) { performGuideAction({ kind: 'spotlight', selector: step.selector }); engine.speak({ key: `follow:${step.id}`, text: step.text, lang }); }
      return;
    }
    if (fresh) {
      if (session.state === 'WORLD') clearSpotlight();
      else if (beat.action.kind === 'type-example') { setTyped(false); performGuideAction(beat.action, { onTyped: () => setTyped(true) }); }
      else performGuideAction(beat.action);
      playBeatSound(beat.sound);
    }
    speak(beat, plain);
  }, [session.state, session.utterance, follow, plain, level, lang]);

  // TOUR clock: advance on the beat's hold; run the pipeline at ASK; run the replay at REPLAY.
  useEffect(() => {
    if (session.mode !== 'TOUR' || session.state === 'IDLE' || session.state === 'DONE') return;
    if (session.state === 'ASK') {
      if (!typed) return;
      const t = window.setTimeout(() => { if (!p.running && p.result === null) p.onRun(); }, 1800);
      return () => window.clearTimeout(t);
    }
    if (session.state === 'RUNNING' && p.running) return;
    if (session.state === 'REPLAY' && p.replay === null) {
      if (!p.replayBusy) p.onReplay();
      return;
    }
    const hold = tourHoldSeconds(session.state) * 1000;
    const t = window.setTimeout(() => {
      if (session.state === 'WORLD') { window.location.hash = '#/discovery-hall?tour=1'; return; }
      dispatch({ type: 'NEXT' });
    }, hold);
    return () => window.clearTimeout(t);
  }, [session.mode, session.state, typed, p.running, p.result, p.replay, p.replayBusy, p, dispatch]);

  useEffect(() => () => { engine.stop(); clearSpotlight(); }, [engine]);

  if (session.state === 'IDLE') return null;

  const pl = lang === 'pl';
  const path = pathFor(facts);
  const at = path.indexOf(session.state);
  const canBack = at > 0 && follow === null;
  let nextLabel = pl ? 'Dalej ▶' : 'Next ▶';
  let canNext = true;
  let onNext = (): void => dispatch({ type: 'NEXT' });
  if (follow !== null) {
    onNext = () => setFollow(follow + 1 < followSteps.length ? follow + 1 : null);
    nextLabel = follow + 1 < followSteps.length ? (pl ? 'Następny krok ▶' : 'Next step ▶') : (pl ? 'Wróć do przewodnika' : 'Back to the guide');
  } else if (session.state === 'ASK') {
    nextLabel = pl ? 'Uruchom proces ▶' : 'Run the process ▶';
    canNext = !p.running && p.result === null;
    onNext = () => p.onRun();
    if (p.result !== null && !p.running) { canNext = true; onNext = () => dispatch({ type: 'RUN_FINISHED' }); nextLabel = pl ? 'Pokaż wynik ▶' : 'Show the result ▶'; }
  } else if (session.state === 'RUNNING' && p.running) {
    nextLabel = pl ? 'Genesis pracuje…' : 'Genesis is working…';
    canNext = false;
  } else if (session.state === 'REPLAY' && p.replay === null) {
    nextLabel = p.replayBusy ? (pl ? 'Odtwarzam…' : 'Replaying…') : (pl ? 'Odtwórz i porównaj ▶' : 'Replay and compare ▶');
    canNext = !p.replayBusy;
    onNext = () => p.onReplay();
  } else if (session.state === 'WORLD') {
    nextLabel = pl ? 'Wejdź do laboratorium 3D ▶' : 'Enter the 3D lab ▶';
    onNext = () => { window.location.hash = '#/discovery-hall?tour=1'; };
  } else if (session.state === 'DONE') {
    nextLabel = pl ? 'Zakończ' : 'Finish';
    onNext = () => { dispatch({ type: 'STOP' }); p.onExit?.(); };
  }

  const caption = follow !== null ? (followSteps[follow]?.text ?? null) : beat === null ? (session.state === 'DONE' ? (pl ? 'To koniec. Każdy wynik, który widziałeś, można odtworzyć i sprawdzić.' : 'That is the end. Every result you saw can be replayed and checked.') : null) : (plain ? beat.plain : beat.text);

  const extra = session.state === 'EVIDENCE' && follow === null && followSteps.length > 0 ? (
    <div className="guide-extra">
      <button type="button" className="chip-btn" onClick={() => setFollow(0)} data-testid="guide-follow">🔗 {pl ? 'Śledź dowody' : 'Follow the evidence'}</button>
    </div>
  ) : undefined;

  return (
    <GuideOverlay
      session={session}
      caption={caption}
      voiceState={engine.state}
      settings={engine.settings}
      level={level}
      plain={plain}
      canNext={canNext}
      canBack={canBack}
      nextLabel={nextLabel}
      voiceSource={engine.lastProvider}
      onNext={onNext}
      onBack={() => dispatch({ type: 'BACK' })}
      onRepeat={() => dispatch({ type: 'REPEAT' })}
      onPauseResume={() => { if (engine.state === 'PAUSED') engine.resume(); else engine.pause(); }}
      onTogglePlain={() => setPlain((v) => !v)}
      onLevel={(l) => { setLevelState(l); try { window.localStorage.setItem(LEVEL_KEY, l); } catch { /* keep in memory */ } }}
      onLang={(l) => engine.update({ lang: l })}
      onVolume={(v) => engine.update({ volume: v })}
      onToggleVoice={() => engine.update({ enabled: !engine.settings.enabled })}
      onClose={() => { engine.stop(); clearSpotlight(); dispatch({ type: 'STOP' }); p.onExit?.(); }}
      extra={extra}
    />
  );
}
