/**
 * A canvas good enough to BUILD a scene in a plain Node test.
 *
 * The lab's materials paint their textures on a 2D canvas, and these tests run without a DOM. The stub
 * accepts every drawing call and records none: it exists so `attach()` can run and the real three.js
 * object graph (parents, positions, visibility, world transforms) can be examined. Nothing asserted in
 * these tests depends on pixels — the look of the lab is judged in a real browser, not here.
 */

type AnyFn = (...args: unknown[]) => unknown;

const STRING_PROPS = new Set([
  'fillStyle', 'strokeStyle', 'font', 'textAlign', 'textBaseline', 'lineCap', 'lineJoin',
  'shadowColor', 'filter', 'globalCompositeOperation', 'direction',
]);

function context2d(canvas: { width: number; height: number }): unknown {
  const noop: AnyFn = () => undefined;
  return new Proxy({} as Record<string, unknown>, {
    get(_target, key) {
      if (key === 'canvas') return canvas;
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createConicGradient') {
        return () => ({ addColorStop: noop });
      }
      if (key === 'createPattern') return () => null;
      if (key === 'measureText') return () => ({ width: 8 });
      if (key === 'getImageData') {
        return (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(Math.max(4, Math.floor(w) * Math.floor(h) * 4)),
          width: Math.max(1, Math.floor(w)), height: Math.max(1, Math.floor(h)),
        });
      }
      if (key === 'createImageData') return (w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
      if (typeof key === 'string' && STRING_PROPS.has(key)) return '';
      if (key === 'lineWidth' || key === 'globalAlpha' || key === 'shadowBlur') return 1;
      return noop;
    },
    set() { return true; },
  });
}

/** Installs a minimal `document` with canvas support. Returns a function that removes it again. */
export function installCanvasStub(): () => void {
  const g = globalThis as unknown as { document?: unknown };
  if (g.document) return () => undefined;
  const makeCanvas = () => {
    const canvas = { width: 256, height: 256, style: {} as Record<string, string> };
    return Object.assign(canvas, {
      getContext: (kind: string) => (kind === '2d' ? context2d(canvas) : null),
      toDataURL: () => 'data:image/png;base64,',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
  };
  g.document = {
    createElement: (tag: string) => (tag === 'canvas' ? makeCanvas() : { style: {}, appendChild: () => undefined }),
    createElementNS: (_ns: string, tag: string) => (tag === 'canvas' ? makeCanvas() : { style: {} }),
  };
  return () => { delete g.document; };
}
