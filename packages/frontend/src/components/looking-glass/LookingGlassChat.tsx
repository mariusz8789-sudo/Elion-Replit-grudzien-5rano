import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openLookingGlass, type LookingGlassSession } from '../../core/lookingGlass/scenarioSession';
import { nearestSupportedAlternative } from '../../core/lookingGlass/scenarioResolution';
import { anchoredSequenceDuration, sampleAnchoredSequence, scrubToSeconds } from '../../core/lookingGlass/anchoredTemporal';
import { ExperiencePlayer, frameAt, type ExperienceFrame } from '../../core/lookingGlass/experienceOrchestrator';
import type { SavedExperiment } from '../../core/scienceMemory';
import type { InspectableEvent } from '../../core/lookingGlass/eventInspection';
import { ComparisonPanel } from './ComparisonPanel';
import { EventInspector } from './EventInspector';

/**
 * LOOKING GLASS — THE CHAT THAT ANSWERS WITH A WORLD.
 *
 * The deliberate product difference: a reply here is never a paragraph of
 * prose that sounds authoritative. Every turn resolves to one of exactly
 * four things, and each is a claim the user can check.
 *
 *  READY         a real world, with the engine that produced it named, the
 *                keyframes it actually computed, and a door into it.
 *  NEEDS_INPUT   the sentence was too thin, and it says which part.
 *  NOT_MODELLED  understood, and no Genesis model produces it. It names the
 *                missing solver instead of rendering a convincing fiction.
 *  REFUSED       the safety boundary — consequences and response yes,
 *                weapon design no.
 *
 * The parse strip showing KIND / SPAN / VIEWPOINT is not decoration: it is
 * the system showing its work, so a user can see it was misread rather than
 * discovering it downstream in a world that quietly answered a different
 * question. That is the whole reason the parser is a deterministic grammar
 * and reports what it could not resolve.
 *
 * This component renders no 3D and owns no state of its own beyond the
 * transcript and the scrub position — the science is entirely
 * `openLookingGlass`, and entering a world hands off to the existing lab.
 */

interface Turn {
  readonly id: string;
  readonly text: string;
  readonly session: LookingGlassSession;
}

const EXAMPLES: readonly string[] = [
  'Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy',
  'Visualize a bioreactor cell culture over 12 hours from the perspective of a scientist',
  'Show a quarantine scenario over 90 days from the control room operator',
  'Pokaż powódź w tym mieście przez 72 godziny',
];

const STATUS_LABEL: Readonly<Record<string, string>> = {
  READY: 'ŚWIAT GOTOWY',
  NEEDS_INPUT: 'BRAKUJE DANYCH',
  NOT_MODELLED: 'NIE ZAMODELOWANE',
  REFUSED: 'POZA ZAKRESEM',
};

/**
 * Plays the experience timeline. Holds a clock and nothing else: what the
 * clock MEANS at any instant is `frameAt`, so this control, a scrub bar and
 * an offline capture cannot disagree.
 */
function SequencePlayer({ session }: { session: LookingGlassSession }): JSX.Element | null {
  const player = useMemo(() => new ExperiencePlayer(session.experience), [session]);
  const [frame, setFrame] = useState<ExperienceFrame | null>(() => frameAt(session.experience, 0));
  const [, forceStatus] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // A stalled frame must not teleport the world. Without a cap, one
      // slow frame — a backgrounded tab, a software renderer, a GC pause —
      // advances the sequence by however long it took, skipping states the
      // viewer never saw. Capped at 100 ms, playback simply slows instead.
      const delta = Math.min(0.1, (now - last) / 1000);
      last = now;
      setFrame(player.advance(delta));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [player]);

  if (!frame || session.experience.durationSeconds <= 0) return null;
  const playing = player.playbackStatus === 'PLAYING';

  return (
    <div className="lg-seq">
      <div className="lg-seq-head">
        <span className={`lg-seq-kind lg-seq-kind-${frame.shot.kind.toLowerCase()}`}>{frame.shot.kind}</span>
        <span className="lg-seq-cam">{frame.cameraMode}</span>
        <span className="lg-seq-reason">{frame.shot.reason}</span>
      </div>
      <input
        className="lg-scrub"
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={frame.progress}
        aria-label="Przewiń sekwencję"
        onChange={(event) => { player.seek(Number(event.target.value)); setFrame(player.currentFrame); forceStatus((n) => n + 1); }}
      />
      <div className="lg-seq-controls">
        <button
          type="button"
          className="lg-seq-btn"
          onClick={() => { player.toggle(); forceStatus((n) => n + 1); }}
        >
          {playing ? '❚❚ Pauza' : '▶ Odtwórz'}
        </button>
        <button type="button" className="lg-seq-btn" onClick={() => { player.replay(); forceStatus((n) => n + 1); }}>↻ Od nowa</button>
        {[1, 2, 4, 8].map((speed) => (
          <button
            key={speed}
            type="button"
            className={`lg-seq-speed${player.playbackSpeed === speed ? ' is-active' : ''}`}
            onClick={() => { player.setSpeed(speed); forceStatus((n) => n + 1); }}
          >
            {speed}×
          </button>
        ))}
        <span className="lg-seq-time">
          {frame.elapsedSeconds.toFixed(1)} / {session.experience.durationSeconds.toFixed(1)} s
          {' · '}
          {/* Only stated where a state index really exists — a world-time
              marker has none, and inventing one would name a state the run
              never produced. */}
          {frame.stateIndex !== null ? `stan ${frame.stateIndex}` : `czas świata ${Math.round(frame.worldTick)}`}
        </span>
      </div>
    </div>
  );
}

/**
 * The one real write path from a Looking Glass session into Genesis's
 * durable, replay-verified Scientific Memory — `saveScenarioCounterfactualToMemory`,
 * the same store the first-person lab and `ScientificMemoryScreen` already
 * use. Rendered only when `comparison.evidence` says a real counterfactual
 * artifact exists behind the comparison (see `scenarioComparison.ts`); a
 * comparison without one — the laboratory's hypothesis ranking — has nothing
 * honest to persist here, so no button appears at all rather than one that
 * fails on click.
 */
function ComparisonCommit({ session }: { session: LookingGlassSession }): JSX.Element | null {
  const [saved, setSaved] = useState<SavedExperiment | null>(null);
  if (session.comparison?.status !== 'READY' || session.comparison.evidence === null) return null;
  return (
    <div className="lg-cmp-commit">
      {saved ? (
        <p className="lg-cmp-committed">
          Zapisano w Pamięci Naukowej jako <code>{saved.experimentId}</code> — odtworzenie obu ramion zweryfikowane (MATCH).
        </p>
      ) : (
        <button type="button" className="lg-cmp-commit-btn" onClick={() => setSaved(session.commitComparisonToMemory())}>
          Zapisz porównanie w Pamięci Naukowej
        </button>
      )}
    </div>
  );
}

function ScenarioCard({ turn }: { turn: Turn }): JSX.Element {
  const { session } = turn;
  const { request, resolution } = session;
  const [scrub, setScrub] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<InspectableEvent | null>(null);

  const duration = session.anchored ? anchoredSequenceDuration(session.anchored) : 0;
  const sample = session.anchored ? sampleAnchoredSequence(session.anchored, scrubToSeconds(session.anchored, scrub)) : null;
  const alternative = nearestSupportedAlternative(resolution);
  const inspectableEvents = useMemo(() => session.world?.getInspectableEvents() ?? [], [session]);

  return (
    <div className={`lg-card lg-card-${resolution.status.toLowerCase()}`}>
      <div className="lg-card-status">{STATUS_LABEL[resolution.status] ?? resolution.status}</div>

      {/* Showing its work: exactly what was read out of the sentence. */}
      <div className="lg-chips">
        <span className={`lg-chip ${request.kind ? '' : 'lg-chip-missing'}`}>
          <b>zjawisko</b>{request.kind ? request.kind.replace(/_/g, ' ').toLowerCase() : 'nie rozpoznano'}
        </span>
        <span className={`lg-chip ${request.span ? '' : 'lg-chip-missing'}`}>
          <b>czas</b>{request.span ? `${request.span.amount} ${request.span.unit.toLowerCase()}` : 'nie podano'}
        </span>
        <span className="lg-chip">
          <b>perspektywa</b>{request.viewpoint.kind.replace(/_/g, ' ').toLowerCase()}
          {request.viewpoint.anchorHint ? ` · ${request.viewpoint.anchorHint}` : ''}
        </span>
        {request.location ? <span className="lg-chip"><b>miejsce</b>{request.location}</span> : null}
        {request.comparison ? <span className="lg-chip lg-chip-mode">porównanie</span> : null}
        {request.cinematic ? <span className="lg-chip lg-chip-mode">sekwencja</span> : null}
      </div>

      {resolution.status === 'READY' && resolution.plan ? (
        <>
          <div className="lg-provenance">
            <div><b>silnik</b> <code>{session.producedBy}</code></div>
            <div><b>przebieg czasu</b> <code>{session.temporalSource}</code></div>
          </div>

          {session.anchored && sample ? (
            <div className="lg-timeline">
              <div className="lg-timeline-head">
                <span className="lg-timeline-now">{sample.from.label}</span>
                <span className="lg-timeline-meta">
                  {session.anchored.keyframes.length} realnych stanów · widok z: {session.anchored.anchor.label}
                </span>
              </div>
              <input
                className="lg-scrub"
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={scrub}
                aria-label="Przewiń czas świata"
                onChange={(event) => setScrub(Number(event.target.value))}
              />
              <div className="lg-timeline-foot">
                <span>0</span>
                <span>{duration.toFixed(0)} s odtwarzania</span>
              </div>
            </div>
          ) : null}

          {/* THE SEQUENCE, PLAYED. The shot list below says what the director
              chose; this plays it, so the edit can be judged as an edit
              rather than read as a table. Every frame is resolved by the
              orchestrator from the same real markers. */}
          <SequencePlayer session={session} />

          <ComparisonPanel comparison={session.comparison} requestedButMissing={session.request.comparison} />
          <ComparisonCommit session={session} />

          {/* THE SAME event rail + inspector the two 3D world screens use
              (City3DWebGLScreen, FirstPersonLabScreen) — rendered here too,
              because a domain with no 3D surface yet (chemistry, today)
              still needs a place to answer "what happened / why / what was
              it before". One inspector component, three screens. */}
          {inspectableEvents.length > 0 && (
            <div className="lg-rail">
              <span className="lg-rail-title">zdarzenia przebiegu ({inspectableEvents.length})</span>
              <div className="lg-rail-items">
                {inspectableEvents.slice(0, 8).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="lg-rail-item"
                    onClick={() => setSelectedEvent(event)}
                  >
                    {event.semanticKind.replace(/_/g, ' ').toLowerCase()} · {event.time.tick}
                  </button>
                ))}
              </div>
            </div>
          )}
          {selectedEvent && (
            <EventInspector
              event={selectedEvent}
              allEvents={inspectableEvents}
              unit={(session.world?.getTemporalRange().unit ?? 'DAY').toLowerCase()}
              onClose={() => setSelectedEvent(null)}
              // The chat has no live world clock to seek — unlike the two 3D
              // screens, there is nothing here for "replay" to DO. Every
              // domain reachable through this rail today reports
              // replay.available === false anyway (no adapter here sets a
              // MATCH verdict before a world is entered), so this button is
              // provably unreachable; closing is the honest fallback if that
              // ever changes, not a fabricated seek.
              onReplay={() => setSelectedEvent(null)}
              moment={session.describeEntityMoment(selectedEvent.time.tick)}
            />
          )}

          <ol className="lg-shots">
            {session.shotPlan.shots.map((shot) => (
              <li key={shot.index} className={`lg-shot lg-shot-${shot.kind.toLowerCase()}`}>
                <span className="lg-shot-kind">{shot.kind}</span>
                <span className="lg-shot-cam">{shot.cameraMode}</span>
                <span className="lg-shot-reason">{shot.reason}</span>
                {/* A shot with no marker is structural, and says so rather
                    than posing as a discovery. */}
                <span className="lg-shot-src">
                  {shot.sourceMarkerId ? `← ${shot.sourceMarkerId}` : 'bez zdarzenia (kadr techniczny)'}
                </span>
              </li>
            ))}
          </ol>

          <div className="lg-actions">
            {session.worldRoute ? (
              <button
                type="button"
                className="lg-enter"
                onClick={() => {
                  // Arm the world bridge FIRST: navigating to a world that has
                  // nothing waiting would show a different, unrelated run.
                  if (session.enterWorld()) window.location.hash = session.worldRoute!;
                }}
              >
                Wejdź do świata
              </button>
            ) : (
              <span className="lg-actions-note">
                Ten scenariusz policzył się, ale nie ma jeszcze świata 3D, który by go pokazał.
              </span>
            )}
            <span className="lg-actions-note">
              {session.shotPlan.markersUsed}/{session.shotPlan.markersAvailable} realnych znaczników użytych w montażu
            </span>
          </div>
        </>
      ) : (
        <div className="lg-refusal">
          {resolution.refusal ? <p className="lg-refusal-text">{resolution.refusal}</p> : null}
          {resolution.notModelled.map((reason) => <p key={reason} className="lg-refusal-text">{reason}</p>)}
          {resolution.missing.length > 0 ? (
            <p className="lg-refusal-text">
              Nie odczytano z pytania: {resolution.missing.map((aspect) => aspect.toLowerCase().replace(/_/g, ' ')).join(', ')}.
            </p>
          ) : null}
          {alternative ? <p className="lg-alternative"><b>Możliwe teraz:</b> {alternative}</p> : null}
        </div>
      )}
    </div>
  );
}

export function LookingGlassChat(): JSX.Element {
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const submit = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Synchronous by construction: the models are deterministic, so there is
    // no spinner to fake and no streamed prose to wait for.
    const session = openLookingGlass(trimmed);
    setTurns((previous) => [...previous, { id: `${session.request.requestId}-${previous.length}`, text: trimmed, session }]);
    setDraft('');
  }, []);

  const empty = turns.length === 0;
  const placeholder = useMemo(
    () => 'Opisz świat, który chcesz zobaczyć — zjawisko, czas i perspektywę…',
    [],
  );

  return (
    <div className={`lg-root ${empty ? 'lg-root-empty' : ''}`}>
      {empty ? (
        <header className="lg-hero">
          <h1 className="lg-hero-title">Genesis Looking Glass</h1>
          <p className="lg-hero-sub">
            Nie odpowiadamy akapitem. Odpowiadamy światem, w który można wejść —
            albo uczciwym „tego nie umiemy policzyć”.
          </p>
        </header>
      ) : null}

      <div className="lg-thread">
        {turns.map((turn) => (
          <article key={turn.id} className="lg-turn">
            <p className="lg-ask">{turn.text}</p>
            <ScenarioCard turn={turn} />
          </article>
        ))}
      </div>

      <form
        className="lg-composer"
        onSubmit={(event) => { event.preventDefault(); submit(draft); }}
      >
        <textarea
          ref={inputRef}
          className="lg-input"
          rows={empty ? 3 : 2}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(draft); }
          }}
        />
        <button type="submit" className="lg-send" disabled={draft.trim().length === 0}>Uruchom</button>
      </form>

      {empty ? (
        <div className="lg-examples">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className="lg-example" onClick={() => submit(example)}>
              {example}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
