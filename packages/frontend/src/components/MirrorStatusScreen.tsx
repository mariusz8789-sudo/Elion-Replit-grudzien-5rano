import { useState } from 'react';
import { createMirrorSession, mirrorTransition, type MirrorTwinSession } from '@genesis/core/flagship/mirrorTwin.js';

function advance(session: MirrorTwinSession): MirrorTwinSession {
  switch (session.state) {
    case 'MIRROR_IDLE': return mirrorTransition(session, { type: 'ENTER_ZONE' }, 1);
    case 'CONSENT_REQUIRED': return mirrorTransition(session, { type: 'CONSENT_GRANTED' }, 2);
    case 'SCANNING': return mirrorTransition(session, { type: 'TELEMETRY', payload: { consent: true, containsRawImage: false, mode: 'SYNTHETIC_FALLBACK', confidence: 0.8, sentAt: 2, ttlMs: 10_000 } }, 3);
    case 'SYNCING': return mirrorTransition(session, { type: 'SYNC_TICK', progress: 1 }, 4);
    case 'TWIN_READY': return mirrorTransition(session, { type: 'DIVERGE', action: 'Synthetic twin performs the scripted divergence preview.' }, 5);
    case 'DIVERGENCE_MODE': return mirrorTransition(session, { type: 'CAPTURE' }, 6);
    case 'CAPTURE': return mirrorTransition(session, { type: 'REPLAY' }, 7);
    case 'REPLAY': return mirrorTransition(session, { type: 'RESET' }, 8);
  }
}

export function MirrorStatusScreen(): JSX.Element {
  const [session, setSession] = useState(() => createMirrorSession('mirror-ui-session', 'human-explorer'));
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
        <h1>EXPERIMENTAL / SYNTHETIC</h1>
        <p>Istniejąca maszyna stanów MirrorTwin. Obecny sygnał to <b>SYNTHETIC_FALLBACK</b>; kamera, face tracking i prawdziwa tożsamość nie są podłączone. <b>LOCAL_CAMERA_VALIDATION_REQUIRED</b>.</p>
        <dl className="pilot-provenance">
          <div><dt>State</dt><dd data-testid="mirror-state">{session.state}</dd></div>
          <div><dt>Camera</dt><dd>NOT_CONNECTED</dd></div>
          <div><dt>Identity scope</dt><dd>{session.identityScope}</dd></div>
          <div><dt>Raw image retention</dt><dd>NONE</dd></div>
          <div><dt>Data label</dt><dd>{session.dataLabel}</dd></div>
        </dl>
        <button className="chip-btn pilot-primary" type="button" onClick={() => setSession((current) => advance(current))} data-testid="mirror-advance">Następny stan</button>
      </section>
    </main>
  );
}

export default MirrorStatusScreen;
