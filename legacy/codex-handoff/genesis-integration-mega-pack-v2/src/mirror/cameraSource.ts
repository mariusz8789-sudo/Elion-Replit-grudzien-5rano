import type { MirrorFrame, MirrorFrameSource } from "./mirrorContract.js";

/**
 * Real getUserMedia-backed camera source. Its correctness against an actual physical
 * camera and a real browser permission prompt is UNVERIFIABLE in this cloud sandbox
 * (no camera hardware, no interactive browser session) and must be confirmed locally
 * before any claim of "physical camera validated" is made.
 */
export class BrowserCameraFrameSource implements MirrorFrameSource {
  private stream: MediaStream | undefined;
  private n = 0;

  async requestConsent(): Promise<boolean> {
    if (!globalThis.navigator?.mediaDevices?.getUserMedia) return false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      return true;
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    if (!this.stream) throw new Error("Camera stream is not available.");
  }

  async nextFrame(): Promise<MirrorFrame> {
    if (!this.stream) throw new Error("Camera stream is not available.");
    const track = this.stream.getVideoTracks()[0];
    const settings = track?.getSettings();
    this.n += 1;
    return {
      id: `camera-frame:${String(this.n).padStart(6, "0")}`,
      capturedAt: new Date().toISOString(),
      width: settings?.width ?? 0,
      height: settings?.height ?? 0,
      source: "REAL_BROWSER_CAMERA",
    };
  }

  async stop(): Promise<void> {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
  }
}

/** Deterministic, no-hardware camera source for tests, demos, and the existing scripted
 * agentic-science-runtime flow (real repo's `agenticScienceRuntime.ts::runFlagshipJourney`
 * currently feeds mirrorTwin.ts a hardcoded SYNTHETIC_FALLBACK event sequence — this class
 * is a drop-in replacement for that scripted path against the canonical runtime). */
export class FakeCameraFrameSource implements MirrorFrameSource {
  private n = 0;
  constructor(private readonly consent: boolean = true) {}
  async requestConsent(): Promise<boolean> {
    return this.consent;
  }
  async start(): Promise<void> {}
  async nextFrame(): Promise<MirrorFrame> {
    this.n += 1;
    return {
      id: `fake-frame:${String(this.n).padStart(6, "0")}`,
      capturedAt: new Date(0).toISOString(),
      width: 640,
      height: 480,
      source: "FAKE_DEVICE",
    };
  }
  async stop(): Promise<void> {}
}
