import { useEffect, useRef, useState } from 'react';
import { createMirrorSession, mirrorTransition, type MirrorTwinSession } from '@genesis/core/flagship/mirrorTwin.js';
import {
  createBrowserCameraAdapter,
  type BrowserCameraAdapter,
  type CameraCapabilityState,
} from '../core/mirrorProduct/browserCameraAdapter';

/**
 * Post-consent stages (SYNCING onward) have no real computation to drive them
 * — the twin's appearance/divergence/capture/replay are inherently
 * `dataLabel: 'SYNTHETIC_CINEMATIC'` per the canonical contract — so they
 * remain a manual, explicit "advance" affordance. The one stage this file
 * genuinely automates from REAL evidence is CONSENT_REQUIRED -> SCANNING ->
 * SYNCING, driven by the real `BrowserCameraAdapter` below.
 */
function advancePostScan(session: MirrorTwinSession): MirrorTwinSession {
  switch (session.state) {
    case 'SYNCING': return mirrorTransition(session, { type: 'SYNC_TICK', progress: 1 }, Date.now());
    case 'TWIN_READY': return mirrorTransition(session, { type: 'DIVERGE', action: 'Synthetic twin performs the scripted divergence preview.' }, Date.now());
    case 'DIVERGENCE_MODE': return mirrorTransition(session, { type: 'CAPTURE' }, Date.now());
    case 'CAPTURE': return mirrorTransition(session, { type: 'REPLAY' }, Date.now());
    case 'REPLAY': return mirrorTransition(session, { type: 'RESET' }, Date.now());
    default: return session;
  }
}

function cameraStatusLabel(state: CameraCapabilityState): string {
  switch (state.status) {
    case 'UNAVAILABLE': return 'UNAVAILABLE — no camera API in this browser/context';
    case 'NOT_REQUESTED': return 'NOT_REQUESTED';
    case 'PERMISSION_DENIED': return 'PERMISSION_DENIED';
    case 'STREAM_OPEN': return `STREAM_OPEN — ${state.deviceLabel ?? 'unnamed device'} (${state.trackCount} track(s))`;
    case 'STOPPED': return 'STOPPED';
    case 'ERROR': return `ERROR — ${state.errorMessage ?? 'unknown'}`;
  }
}

export function MirrorStatusScreen(): JSX.Element {
  const [session, setSession] = useState(() => createMirrorSession('mirror-ui-session', 'human-explorer'));
  const adapterRef = useRef<BrowserCameraAdapter | null>(null);
  if (!adapterRef.current) adapterRef.current = createBrowserCameraAdapter();
  const [cameraState, setCameraState] = useState<CameraCapabilityState>(() => adapterRef.current!.getState());
  const [blocked, setBlocked] = useState<string | null>(null);

  // Real cleanup: every opened MediaStreamTrack is stopped on unmount — no leaked camera access.
  useEffect(() => () => { adapterRef.current?.stop(); }, []);

  async function requestCameraConsent() {
    setBlocked(null);
    const state = await adapterRef.current!.requestCapability();
    setCameraState(state);
    if (state.status === 'STREAM_OPEN') {
      setSession((current) => mirrorTransition(current, { type: 'CONSENT_GRANTED' }, Date.now()));
    } else {
      setBlocked(`Camera consent could not be established: ${cameraStatusLabel(state)}.`);
      setSession((current) => mirrorTransition(current, { type: 'CONSENT_DECLINED' }, Date.now()));
    }
  }

  function declineConsent() {
    adapterRef.current?.stop();
    setCameraState(adapterRef.current!.getState());
    setSession((current) => mirrorTransition(current, { type: 'CONSENT_DECLINED' }, Date.now()));
  }

  // The ONE real-evidence-driven transition: once a real stream is open, send the honest
  // SYNTHETIC_FALLBACK telemetry the canonical TELEMETRY event requires — never MEDIAPIPE.
  useEffect(() => {
    if (session.state !== 'SCANNING') return;
    const telemetry = adapterRef.current!.buildTelemetry(Date.now());
    if (!telemetry) {
      setBlocked('No real camera stream is open — cannot honestly report scan telemetry.');
      return;
    }
    setSession((current) => mirrorTransition(current, { type: 'TELEMETRY', payload: telemetry }, Date.now()));
  }, [session.state]);

  function resetAll() {
    adapterRef.current?.stop();
    setCameraState(adapterRef.current!.getState());
    setBlocked(null);
    setSession(createMirrorSession('mirror-ui-session', 'human-explorer'));
  }

  const hasRefusal = session.refusals.length > 0;

  return (
    <main className="mirror-status" id="main-content" data-testid="mirror-status" data-state={session.state}>
      <section className="mirror-stage" aria-label="Synthetic Mirror preview">
        <div className="mirror-grid" aria-hidden="true" />
        <div className="mirror-avatar mirror-subject" aria-hidden="true"><i /><span>SUBJECT PROXY</span></div>
        <div className="mirror-link" aria-hidden="true" />
        <div className="mirror-avatar mirror-twin" aria-hidden="true"><i /><span>SYNTHETIC TWIN</span></div>
      </section>
      <section className="mirror-panel gx-glass">
        <span className="gx-eyebrow">Genesis Mirror</span>
        <h1>EXPERIMENTAL / SYNTHETIC / NOT_CALIBRATED</h1>
        <p>
          Istniejąca maszyna stanów MirrorTwin. Prawdziwa jest wyłącznie zgoda i obecność kamery przeglądarki
          (adapter poniżej) — nie ma tu prawdziwego śledzenia twarzy (MediaPipe). Sygnał telemetryczny jest zawsze
          uczciwie oznaczony jako <b>SYNTHETIC_FALLBACK</b>. <b>LOCAL_CAMERA_VALIDATION_REQUIRED</b> dla realnego trybu MEDIAPIPE.
        </p>
        <dl className="pilot-provenance">
          <div><dt>State</dt><dd data-testid="mirror-state">{session.state}</dd></div>
          <div><dt>Camera</dt><dd data-testid="mirror-camera-status">{cameraStatusLabel(cameraState)}</dd></div>
          <div><dt>Identity scope</dt><dd>{session.identityScope}</dd></div>
          <div><dt>Raw image retention</dt><dd>NONE</dd></div>
          <div><dt>Data label</dt><dd>{session.dataLabel}</dd></div>
          <div><dt>Source mode</dt><dd>{session.appearance.sourceMode ?? 'NONE'}</dd></div>
        </dl>

        {session.state === 'CONSENT_REQUIRED' && (
          <div className="pilot-actions">
            <button className="chip-btn pilot-primary" type="button" onClick={() => { void requestCameraConsent(); }} data-testid="mirror-grant-consent">
              Grant camera consent
            </button>
            <button className="chip-btn" type="button" onClick={declineConsent} data-testid="mirror-decline-consent">
              Decline
            </button>
          </div>
        )}

        {['SYNCING', 'TWIN_READY', 'DIVERGENCE_MODE', 'CAPTURE', 'REPLAY'].includes(session.state) && (
          <button className="chip-btn pilot-primary" type="button" onClick={() => setSession((current) => advancePostScan(current))} data-testid="mirror-advance">
            Następny stan
          </button>
        )}

        {session.state === 'MIRROR_IDLE' && (
          <button className="chip-btn pilot-primary" type="button" onClick={() => setSession((current) => mirrorTransition(current, { type: 'ENTER_ZONE' }, Date.now()))} data-testid="mirror-enter-zone">
            Enter Mirror zone
          </button>
        )}

        {(blocked || hasRefusal) && (
          <p className="settings-hint" role="alert" data-testid="mirror-blocked">
            {blocked ?? `Blocked: ${session.refusals[session.refusals.length - 1]}`}
          </p>
        )}

        <button className="chip-btn" type="button" onClick={resetAll} data-testid="mirror-reset">Reset</button>
      </section>
    </main>
  );
}

export default MirrorStatusScreen;
