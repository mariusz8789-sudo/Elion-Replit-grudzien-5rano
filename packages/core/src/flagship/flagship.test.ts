/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from '../knowledge/EvidenceLedger.js';
import { SessionEventLog, replaySessionEvents, verifySessionChain } from './sessionEventLog.js';
import { guardWorldMode } from './epistemicGuard.js';
import { createMirrorSession, mirrorTransition } from './mirrorTwin.js';
import { PORTAL_SEQUENCE, advancePortal, createPortal, openAndTraverse } from './portal.js';
import { clockComparison, configureTimeMachine } from './timeMachine.js';
import { ingestCosmosObservation, previousCosmosRecords, recordCosmosInterpretation } from './cosmosObserver.js';
import { createCaptureSpec } from './capturePreset.js';
import { C_SI, spacetimePhoton } from './spacetimePhoton.js';
import { spacetimePhotonProvider } from '../mythos/KernelProviderRegistry.js';

const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };

describe('flagship layer (D-130) — contracts on canonical hashing, every state labelled', () => {
  it('session event log: hash-chained, deterministic, replay equal by value, tamper detected, restorable', () => {
    const c1 = { t: 0, now() { return (this.t += 1); } }; const c2 = { t: 0, now() { return (this.t += 1); } };
    const a = new SessionEventLog(c1); const b = new SessionEventLog(c2);
    for (const log of [a, b]) { log.append('s1', 'SESSION_STARTED', { sessionId: 's1' }); log.append('s1', 'WORLD_CREATED', { worldId: 'w' }); log.append('s1', 'EVIDENCE_APPENDED', { id: 'EV-1' }); log.append('s1', 'CAPTURE_CREATED', { captureId: 'cap:1' }); }
    expect(a.read('s1').map((e) => e.hash)).toEqual(b.read('s1').map((e) => e.hash));
    const sa = replaySessionEvents(a.read('s1')); const sb = replaySessionEvents(b.read('s1'));
    expect(sa).toEqual(sb); expect(sa.route).toEqual(['SESSION_STARTED', 'WORLD_CREATED', 'EVIDENCE_APPENDED', 'CAPTURE_CREATED']); expect(sa.evidenceIds).toEqual(['EV-1']); expect(sa.captureIds).toEqual(['cap:1']);
    expect(verifySessionChain(a.read('s1')).ok).toBe(true);
    const tampered = a.read('s1').map((e, i) => (i === 1 ? { ...e, payload: { worldId: 'x' } } : e));
    expect(verifySessionChain(tampered).errors).toContain('HASH_MISMATCH@1');
    expect(() => SessionEventLog.fromEvents(clock, tampered)).toThrow(/SESSION_LOG_REJECTED/);
    expect(SessionEventLog.fromEvents(clock, a.read('s1')).read('s1').length).toBe(4);
  });
  it('epistemic firewall: speculative/fictional worlds cap claims; a status is never raised', () => {
    expect(guardWorldMode('SPECULATIVE', 'REAL_OBSERVATION')).toMatchObject({ allowed: false, status: 'SPECULATIVE' });
    expect(guardWorldMode('FICTIONAL', 'MODEL')).toMatchObject({ allowed: false, status: 'FICTIONAL' });
    expect(guardWorldMode('SCIENTIFIC', 'SIMULATION')).toMatchObject({ allowed: true, status: 'SIMULATION' });
    expect(guardWorldMode('COUNTERFACTUAL', 'HYPOTHESIS')).toMatchObject({ allowed: true, status: 'HYPOTHESIS' });
  });
  it('mirror twin: consent-gated sync, 1:1 session proxy, deliberate divergence, illegal events refused not thrown', () => {
    let m = createMirrorSession('s1', 'subject-1');
    expect(m.identityScope).toBe('VISUAL_SESSION_PROXY');
    m = mirrorTransition(m, { type: 'DIVERGE', action: 'walks away' }, 0); expect(m.state).toBe('MIRROR_IDLE'); expect(m.refusals[0]).toMatch(/ILLEGAL_EVENT:DIVERGE@MIRROR_IDLE/);
    m = mirrorTransition(m, { type: 'ENTER_ZONE' }, 0);
    expect(m.state).toBe('CONSENT_REQUIRED');
    m = mirrorTransition(m, { type: 'CONSENT_DECLINED' }, 1); expect(m.state).toBe('CONSENT_REQUIRED'); expect(m.refusals).toContain('NO_CONSENT');
    m = mirrorTransition(m, { type: 'CONSENT_GRANTED' }, 2); expect(m.state).toBe('SCANNING');
    m = mirrorTransition(m, { type: 'TELEMETRY', payload: { consent: false, containsRawImage: false, mode: 'MEDIAPIPE', confidence: 0.9, sentAt: 0, ttlMs: 1000 } }, 10); expect(m.state).toBe('SCANNING'); expect(m.refusals).toContain('NO_CONSENT');
    m = mirrorTransition(m, { type: 'TELEMETRY', payload: { consent: true, containsRawImage: false, mode: 'MEDIAPIPE', confidence: 0.9, sentAt: 0, ttlMs: 1000 } }, 10); expect(m.state).toBe('SYNCING');
    m = mirrorTransition(m, { type: 'SYNC_TICK', progress: 0.5 }, 20); expect(m.state).toBe('SYNCING'); expect(m.appearance.face).toBe('CAPTURE_PENDING');
    m = mirrorTransition(m, { type: 'SYNC_TICK', progress: 1 }, 30); expect(m.state).toBe('TWIN_READY'); expect(m.appearance).toMatchObject({ face: 'SYNCED_SESSION_PROXY', clothing: 'SYNCED_SESSION_PROXY', sourceMode: 'MEDIAPIPE' });
    m = mirrorTransition(m, { type: 'DIVERGE', action: 'Twin walks to the portal while the subject raises the left hand' }, 40); expect(m.state).toBe('DIVERGENCE_MODE'); expect(m.divergenceAction).toMatch(/Twin walks/);
    m = mirrorTransition(m, { type: 'CAPTURE' }, 50); m = mirrorTransition(m, { type: 'REPLAY' }, 60); expect(m.state).toBe('REPLAY');
    expect(m.dataLabel).toBe('SYNTHETIC_CINEMATIC'); expect(m.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
  it('circular gate: the phase sequence in order, destination status carried through the guard, skips refused; phase tunnel labelled', () => {
    const p = createPortal({ sessionId: 's1', style: 'CIRCULAR_GATE', sourceWorldId: 'lab', destinationWorldId: 'mars-lab', destinationMode: 'SCIENTIFIC', requestedDestinationStatus: 'SIMULATION' });
    expect(p.phase).toBe('DORMANT'); expect(p.destinationStatus).toBe('SIMULATION'); expect(p.tunnelStatus).toBe('FICTIONAL');
    expect(advancePortal(p, 'TRAVERSAL').refusals[0]).toMatch(/ILLEGAL_PHASE/);
    const done = openAndTraverse(p); expect(done.phase).toBe('CLOSE'); expect(done.traversed).toBe(true); expect(done.refusals).toEqual([]);
    expect(PORTAL_SEQUENCE.length).toBe(8);
    const fict = createPortal({ sessionId: 's1', style: 'PHASE_TUNNEL', sourceWorldId: 'lab', destinationWorldId: 'fiction', destinationMode: 'FICTIONAL', requestedDestinationStatus: 'MODEL', tunnelMode: 'CONCEPTUAL_PHYSICS_MODEL', massKgForVisual: 1e30 });
    expect(fict.destinationStatus).toBe('FICTIONAL'); expect(fict.refusals[0]).toMatch(/cap claims/); expect(fict.tunnelStatus).toBe('MODEL'); expect(fict.visual.warp).toBeGreaterThan(1);
  });
  it('time machine: scientific mode computes only the supported clock comparison and refuses the rest; speculative needs assumptions; fictional carries the disclaimer', () => {
    const c = clockComparison({ relativeSpeedMps: 7660, gravitationalMassKg: 5.972e24, radiusM: 6.371e6 + 400e3, referenceRadiusM: 6.371e6, coordinateSeconds: 86400 });
    expect(c.regime).toBe('WEAK_FIELD'); expect(c.lorentzGamma).toBeGreaterThan(1); expect(c.gravitationalRateRatio).toBeGreaterThan(1); expect(Math.abs(c.differenceSeconds)).toBeLessThan(1e-3);
    const sci = configureTimeMachine({ sessionId: 's1', mode: 'SCIENTIFIC_MODEL', targetTimeLabel: 'ISS day', assumptions: ['weak field'], request: { kind: 'CLOCK_COMPARISON', relativeSpeedMps: 7660, gravitationalMassKg: 5.972e24, radiusM: 6.771e6, referenceRadiusM: 6.371e6, coordinateSeconds: 86400 } });
    expect(sci.epistemicStatus).toBe('MODEL'); expect(sci.computation?.regime).toBe('WEAK_FIELD'); expect(sci.refusal).toBeNull();
    expect(configureTimeMachine({ sessionId: 's1', mode: 'SCIENTIFIC_MODEL', targetTimeLabel: '1889', assumptions: [] }).refusal).toMatch(/UNSUPPORTED_CALCULATION/);
    expect(configureTimeMachine({ sessionId: 's1', mode: 'SPECULATIVE_PHYSICS', targetTimeLabel: 'x', assumptions: [] }).refusal).toMatch(/REQUIRES_EXPLICIT_ASSUMPTIONS/);
    expect(configureTimeMachine({ sessionId: 's1', mode: 'SPECULATIVE_PHYSICS', targetTimeLabel: 'x', assumptions: ['closed timelike curves exist'] }).epistemicStatus).toBe('SPECULATIVE');
    const f = configureTimeMachine({ sessionId: 's1', mode: 'FICTIONAL_UNIVERSE', targetTimeLabel: '2140', assumptions: [] }); expect(f.epistemicStatus).toBe('FICTIONAL'); expect(f.disclaimer).toMatch(/DISCLAIMER/);
  });
  it('cosmos observer: versions are new ledger records that name what they supersede; nothing overwritten; interpretation is a separate model claim', () => {
    const l = new EvidenceLedger(clock);
    const v1 = ingestCosmosObservation(l, { sourceId: 'gaia-dr3-sample', sourceUri: 'https://gea.esac.esa.int/archive/', datasetVersion: 'DR3', observedAt: '2022-06-13T00:00:00Z', contentHash: 'h1', summary: 'positions of 3 stars', objectIds: ['star-a', 'star-b', 'star-c'], licenceNote: 'ESA/Gaia/DPAC terms', retrievedBy: 'test' });
    expect(v1.supersedes).toBeNull(); expect(v1.changed).toEqual(['star-a', 'star-b', 'star-c']); expect(v1.visualUpdateAllowed).toBe(true);
    const v2 = ingestCosmosObservation(l, { sourceId: 'gaia-dr3-sample', sourceUri: 'https://gea.esac.esa.int/archive/', datasetVersion: 'DR3.1', observedAt: '2023-01-01T00:00:00Z', contentHash: 'h2', summary: 'one new star', objectIds: ['star-a', 'star-b', 'star-c', 'star-d'], licenceNote: 'ESA/Gaia/DPAC terms', retrievedBy: 'test' });
    expect(v2.supersedes).toBe(v1.recordId); expect(v2.changed).toEqual(['star-d']); expect(v2.unchanged.length).toBe(3);
    expect(previousCosmosRecords(l, 'gaia-dr3-sample').length).toBe(2); expect(l.getActive().every((r) => r.claimType === 'observation')).toBe(true);
    const again = ingestCosmosObservation(l, { sourceId: 'gaia-dr3-sample', sourceUri: 'https://gea.esac.esa.int/archive/', datasetVersion: 'DR3.1', observedAt: '2023-01-01T00:00:00Z', contentHash: 'h2', summary: 'one new star', objectIds: ['star-a', 'star-b', 'star-c', 'star-d'], licenceNote: 'ESA/Gaia/DPAC terms', retrievedBy: 'test' });
    expect(again.deduped).toBe(true); expect(again.visualUpdateAllowed).toBe(false);
    const interp = recordCosmosInterpretation(l, v2.recordId, 'star-d is a candidate binary', 'test');
    expect(l.getActive().find((r) => r.id === interp)?.claimType).toBe('model');
    expect(() => ingestCosmosObservation(l, { sourceId: 'x', sourceUri: '', datasetVersion: '', contentHash: '', summary: '', objectIds: [], licenceNote: '', retrievedBy: 't' })).toThrow(/REQUIRES_URI_VERSION_HASH/);
  });
  it('capture spec: aspect presets with safe insets, captions sorted, a badge always, a replay key required', () => {
    const c = createCaptureSpec({ sessionId: 's1', title: 'Mirror divergence', aspect: '9:16', captions: [{ atS: 4, text: 'twin walks away' }, { atS: 1, text: 'sync complete' }], status: 'SIMULATION', replayKey: 'rk-1' });
    expect(c.frame).toMatchObject({ width: 1080, height: 1920 }); expect(c.captions.map((x) => x.atS)).toEqual([1, 4]); expect(c.badge.text).toMatch(/not a direct observation/); expect(c.privacy).toBe('NO_USER_DATA_IN_FRAME');
    expect(createCaptureSpec({ sessionId: 's1', title: 't', aspect: '1:1', captions: [], status: 'FICTIONAL', replayKey: 'rk' }).badge.text).toMatch(/FICTIONAL/);
    expect(() => createCaptureSpec({ sessionId: 's1', title: 't', aspect: '16:9', captions: [], status: 'MODEL', replayKey: '' })).toThrow(/REPLAY_KEY/);
  });
  it('spacetime photon: Shapiro delay and deflection at the solar limb match the textbook order, flat baseline has none, c is untouched, provider anchors on the ledger', () => {
    const sun = spacetimePhoton({ massKg: 1.989e30, impactParameterM: 6.957e8, emitterDistanceM: 1.496e11, receiverDistanceM: 1.496e11 });
    expect(sun.deflectionArcsec).toBeGreaterThan(1.7); expect(sun.deflectionArcsec).toBeLessThan(1.8);
    expect(sun.shapiroDelayS).toBeGreaterThan(1e-4); expect(sun.shapiroDelayS).toBeLessThan(3e-4); expect(sun.regime).toBe('WEAK_FIELD');
    const flat = spacetimePhoton({ massKg: 0, impactParameterM: 6.957e8, emitterDistanceM: 1.496e11, receiverDistanceM: 1.496e11 });
    expect(flat.shapiroDelayS).toBe(0); expect(flat.deflectionRad).toBe(0); expect(flat.curvedTravelTimeS).toBe(flat.flatTravelTimeS); expect(sun.flatTravelTimeS).toBe(flat.flatTravelTimeS);
    expect(C_SI).toBe(299_792_458); expect(sun.notes.join(' ')).toMatch(/measures nothing/);
    expect(spacetimePhoton({ massKg: 1.989e30, impactParameterM: 10_000, emitterDistanceM: 1e11, receiverDistanceM: 1e11 }).regime).toBe('OUT_OF_MODEL');
    const l = new EvidenceLedger(clock); const p = spacetimePhotonProvider(l);
    const a = p.analyze({} as never, { massKg: 1.989e30, impactParameterM: 6.957e8, emitterDistanceM: 1.496e11, receiverDistanceM: 1.496e11, worldId: 'w' }) as { ledgerContentHash: string; label: string };
    expect(a.label).toBe('SPACETIME_PHOTON_WEAK_FIELD_MODEL'); expect(l.getActive()[0].claimType).toBe('model');
  });
});
