import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from 'react';
import { MatrixController, createBrowserHost, type MatrixConfigInput, type MatrixTelemetry } from './matrixController';
import type { ActivityLevel, QualityLevel } from './matrixEngine';

/**
 * LIVE MATRIX BACKGROUND — a thin React adapter over `MatrixController`.
 *
 * This file deliberately owns NO animation logic, no configuration merging and
 * no measurement. Everything testable lives in `matrixController.ts`; what is
 * left here is the part that genuinely needs React and the DOM: creating the
 * canvas, wiring `ResizeObserver` / `matchMedia` / `visibilitychange`, and
 * tearing all of it down again.
 *
 * StrictMode is safe by construction: the controller is created inside the
 * mount effect and destroyed in its cleanup, so React's deliberate
 * mount→unmount→mount double-invoke produces a fresh controller each time
 * rather than a second animation loop against the first one's state.
 */

export interface LiveMatrixBackgroundProps extends MatrixConfigInput {
  className?: string;
  style?: CSSProperties;
}

export interface LiveMatrixBackgroundHandle {
  setActivityLevel(level: ActivityLevel): void;
  setQuality(quality: QualityLevel): void;
  /** Real measurements from the renderer itself — null fields mean "not measured", never a guess. */
  getTelemetry(): MatrixTelemetry | null;
}

export const LiveMatrixBackground = forwardRef<LiveMatrixBackgroundHandle, LiveMatrixBackgroundProps>(
  function LiveMatrixBackground(props, ref) {
    const { activity, density, speed, glow, intensity, quality, seed, reducedMotion, className, style } = props;

    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const controllerRef = useRef<MatrixController | null>(null);

    useImperativeHandle(ref, () => ({
      setActivityLevel: (level) => controllerRef.current?.setActivityLevel(level),
      setQuality: (q) => controllerRef.current?.setQuality(q),
      getTelemetry: () => controllerRef.current?.telemetry() ?? null,
    }), []);

    // Mount once. Props are NOT in these deps: a prop change must reconfigure
    // the existing controller, never tear down and rebuild the whole lifecycle
    // (which is how the duplicate-loop and lost-canvas-state classes of bug
    // start). The props effect below handles updates.
    useEffect(() => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const controller = new MatrixController(createBrowserHost(canvas), {
        activity, density, speed, glow, intensity, quality, seed, reducedMotion,
      });
      controllerRef.current = controller;

      const measure = (): void => {
        const rect = container.getBoundingClientRect();
        controller.resize(rect.width, rect.height);
      };
      measure();

      const observer = new ResizeObserver(measure);
      observer.observe(container);

      const mq = typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
      const onMotionChange = (): void => controller.systemMotionPreferenceChanged();
      mq?.addEventListener?.('change', onMotionChange);

      const onVisibility = (): void => controller.setHidden(document.hidden);
      document.addEventListener('visibilitychange', onVisibility);

      return () => {
        observer.disconnect();
        mq?.removeEventListener?.('change', onMotionChange);
        document.removeEventListener('visibilitychange', onVisibility);
        controller.destroy();
        controllerRef.current = null;
      };
      // Intentionally empty: this effect owns MOUNT, not updates. Adding props
      // here would tear the controller down and rebuild it on every prop
      // change, which is exactly how duplicate loops and lost canvas state
      // begin. The effect below is the update path.
    }, []);

    // Updates flow into the live controller, which diffs them itself.
    useEffect(() => {
      controllerRef.current?.applyProps({ activity, density, speed, glow, intensity, quality, seed, reducedMotion });
    }, [activity, density, speed, glow, intensity, quality, seed, reducedMotion]);

    return (
      <div
        ref={containerRef}
        className={className}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, overflow: 'hidden', background: '#020604',
          pointerEvents: 'none', zIndex: 0, ...style,
        }}
      >
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
    );
  },
);

export default LiveMatrixBackground;
