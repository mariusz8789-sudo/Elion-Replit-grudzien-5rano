/**
 * Fix area 1 (Mirror consolidation). Before V2 there were at least four independent
 * Mirror implementations in play: the real repo's `mirrorTwin.ts` (state machine only,
 * scripted synthetic telemetry, no camera), D-142's `mirror.ts` (state machine + real
 * getUserMedia), bio-real-lab-v1's `mirror.ts` (a near-duplicate of D-142's, independently
 * written), and assorted bridge/client skeletons (`GenesisMirrorBridge.ts`,
 * `GenesisMirrorClient.ts`) that are already dead code in the real repo.
 *
 * V2 rule: this is the ONLY Mirror state machine in this package. D-142 and
 * bio-real-lab-v2 both import it instead of declaring their own. It is a superset of the
 * real repo's `mirrorTwin.ts` state union (`MIRROR_IDLE | SCANNING | SYNCING | TWIN_READY
 * | DIVERGENCE_MODE | CAPTURE | REPLAY`), adding `CONSENT_REQUIRED` and `ERROR`, so a real
 * repo integration can treat this as a strict superset rather than a competing model. See
 * `legacyNotes.ts` for the exact state-name compatibility mapping and the explicit
 * retirement note for the old per-package mirror.ts files.
 */
export type MirrorState =
  | "MIRROR_IDLE"
  | "CONSENT_REQUIRED"
  | "SCANNING"
  | "SYNCING"
  | "TWIN_READY"
  | "DIVERGENCE_MODE"
  | "CAPTURE"
  | "REPLAY"
  | "ERROR";

export interface MirrorFrame {
  id: string;
  capturedAt: string;
  width: number;
  height: number;
  source: "REAL_BROWSER_CAMERA" | "FAKE_DEVICE" | "SYNTHETIC";
}

export interface MirrorFrameSource {
  requestConsent(): Promise<boolean>;
  start(): Promise<void>;
  nextFrame(): Promise<MirrorFrame>;
  stop(): Promise<void>;
}

export interface MirrorSnapshot {
  state: MirrorState;
  consent: boolean;
  frameCount: number;
  lastFrame?: MirrorFrame;
  divergenceReason?: string;
  /**
   * Always "EXPERIMENTAL". This label must never be dropped or reinterpreted by an
   * integrator — real physical-camera behavior is unverifiable from cloud-only evidence
   * (no camera hardware in this environment), and no medical/clinical claim is implied.
   */
  label: "EXPERIMENTAL";
}

export class GenesisMirrorRuntime {
  private snapshotState: MirrorSnapshot = {
    state: "MIRROR_IDLE",
    consent: false,
    frameCount: 0,
    label: "EXPERIMENTAL",
  };

  constructor(private readonly frames: MirrorFrameSource) {}

  snapshot(): Readonly<MirrorSnapshot> {
    return structuredClone(this.snapshotState);
  }

  async begin(): Promise<void> {
    this.snapshotState.state = "CONSENT_REQUIRED";
    this.snapshotState.consent = await this.frames.requestConsent();
    if (!this.snapshotState.consent) {
      this.snapshotState.state = "ERROR";
      return;
    }
    await this.frames.start();
    this.snapshotState.state = "SCANNING";
    const frame = await this.frames.nextFrame();
    this.snapshotState.frameCount += 1;
    this.snapshotState.lastFrame = frame;
    this.snapshotState.state = "SYNCING";
    this.snapshotState.state = "TWIN_READY";
  }

  divergence(reason?: string): void {
    if (this.snapshotState.state !== "TWIN_READY" && this.snapshotState.state !== "SYNCING") {
      throw new Error("Divergence can only be entered from SYNCING or TWIN_READY.");
    }
    this.snapshotState.state = "DIVERGENCE_MODE";
    if (reason !== undefined) this.snapshotState.divergenceReason = reason;
  }

  resync(): void {
    if (this.snapshotState.state !== "DIVERGENCE_MODE") throw new Error("Not in divergence mode.");
    this.snapshotState.state = "TWIN_READY";
    delete this.snapshotState.divergenceReason;
  }

  capture(): void {
    if (!this.snapshotState.consent) throw new Error("Camera consent is required.");
    this.snapshotState.state = "CAPTURE";
  }

  replay(): void {
    if (this.snapshotState.frameCount < 1) throw new Error("No captured frame exists.");
    this.snapshotState.state = "REPLAY";
  }

  async close(): Promise<void> {
    await this.frames.stop();
    this.snapshotState = {
      state: "MIRROR_IDLE",
      consent: false,
      frameCount: 0,
      label: "EXPERIMENTAL",
    };
  }
}
