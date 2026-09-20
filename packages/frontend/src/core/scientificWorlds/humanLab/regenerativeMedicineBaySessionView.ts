import type { ExperimentSession } from '../experimentSession';

export interface RegenerativeBaySessionView {
  readonly sessionId: string;
  readonly experimentId: string;
  readonly subjectId: string;
  readonly epistemicStatus: string;
  readonly engineLabel: string;
  readonly contentHash: string;
  readonly replayFingerprint: string;
  readonly outputs: readonly { readonly key: string; readonly value: string }[];
  readonly evidenceHashes: readonly string[];
  readonly statusLabel: 'MODEL' | 'SIMULATION' | 'OTHER';
}

export function toRegenerativeBaySessionView(session: ExperimentSession): RegenerativeBaySessionView {
  const outputs = Object.entries(session.outputs).map(([key, value]) => ({ key, value: String(value) }));
  return {
    sessionId: session.sessionId,
    experimentId: session.experimentId,
    subjectId: typeof session.inputs.subjectId === 'string' ? session.inputs.subjectId : 'unknown-subject',
    epistemicStatus: session.epistemicStatus,
    engineLabel: session.engineLabel,
    contentHash: session.contentHash,
    replayFingerprint: session.replayFingerprint,
    outputs,
    evidenceHashes: session.evidenceHashes,
    statusLabel: session.epistemicStatus === 'MODEL' ? 'MODEL' : session.epistemicStatus === 'SIMULATION' ? 'SIMULATION' : 'OTHER',
  };
}
