import { CameraRig, type CameraFrameRequest, type CameraTransform } from './cameraRig';

/**
 * GENESIS GRAPHICS RUNTIME — Camera Sequence
 *
 * A reusable "shot list" executor built on `CameraRig`: SCENE -> CAMERA ->
 * TRANSITION -> NEW SHOT, in order. This is the P5 "cinematic world
 * sequencing" primitive — establish, focus, follow, transition, repeat.
 *
 * It does NOT decide what should be observed or why one shot follows
 * another — that's still the caller's (world-direction / C1's) job. This
 * class only ever executes a shot list it's handed: advance a
 * `CameraRig` through `frame()`/`cut()` calls, wait for the rig to settle
 * (plus an optional hold), then move to the next step. No scientific or
 * world-domain knowledge lives here.
 */
export interface CameraSequenceStep {
  request: CameraFrameRequest;
  /** Seconds to hold once the rig has settled on this shot, before advancing. Default 0 (advance as soon as settled). */
  holdSeconds?: number;
  /** Hard `cut()` into this shot instead of an eased `frame()` move. Default false. */
  cut?: boolean;
}

export class CameraSequence {
  private readonly rig: CameraRig;
  private readonly steps: readonly CameraSequenceStep[];
  private index = -1;
  private holdElapsed = 0;
  private finished: boolean;

  constructor(rig: CameraRig, steps: readonly CameraSequenceStep[]) {
    this.rig = rig;
    this.steps = steps;
    this.finished = steps.length === 0;
    if (!this.finished) this.enterStep(0);
  }

  get currentIndex(): number {
    return this.index;
  }

  get currentStep(): CameraSequenceStep | null {
    return this.finished ? null : this.steps[this.index];
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /** Advances the underlying rig and this sequence's own hold/advance timing. Call once per frame. Returns `null` once the sequence has finished. */
  update(dt: number, speed?: number): CameraTransform | null {
    if (this.finished) return null;
    const transform = this.rig.update(dt, speed);
    if (this.rig.isSettled) {
      this.holdElapsed += dt;
      if (this.holdElapsed >= (this.steps[this.index].holdSeconds ?? 0)) this.advanceToNext();
    }
    return transform;
  }

  /** Jumps straight to the next step, skipping any remaining hold on the current one. No-op once finished. */
  skip(): void {
    if (!this.finished) this.advanceToNext();
  }

  private advanceToNext(): void {
    const next = this.index + 1;
    if (next >= this.steps.length) {
      this.finished = true;
      return;
    }
    this.enterStep(next);
  }

  private enterStep(index: number): void {
    this.index = index;
    this.holdElapsed = 0;
    const step = this.steps[index];
    if (step.cut) this.rig.cut(step.request);
    else this.rig.frame(step.request);
  }
}
