/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { VisualFidelityHarness, computeFidelity, decodePng, evaluateFidelity } from './VisualFidelityHarness.js';

/** Minimal PNG encoder for the tests (8-bit RGB, filter 0, CRC fields left zero: the decoder does not verify them). */
function encodePng(width: number, height: number, rgb: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) { raw[y * (1 + width * 3)] = 0; for (let x = 0; x < width; x++) { const [r, g, b] = rgb(x, y); const o = y * (1 + width * 3) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
  const chunk = (type: string, data: Buffer): Buffer => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

describe('VisualFidelityHarness — the Eyes', () => {
  it('decodes an 8-bit RGB PNG pixel-exactly', () => {
    const img = decodePng(encodePng(4, 2, (x, y) => [x * 60, y * 200, 7]));
    expect(img.width).toBe(4); expect(img.height).toBe(2); expect(img.channels).toBe(3);
    expect(Array.from(img.pixels.slice(0, 6))).toEqual([0, 0, 7, 60, 0, 7]);
    expect(Array.from(img.pixels.slice(12, 15))).toEqual([0, 200, 7]);
  });
  it('rejects a flat black frame (FLAT_IMAGE) and a Matrix-green line drawing (green dominance)', () => {
    const black = computeFidelity(decodePng(encodePng(64, 64, () => [0, 0, 0])));
    expect(evaluateFidelity(black)).toEqual({ ok: false, reason: 'FLAT_IMAGE' });
    const wire = computeFidelity(decodePng(encodePng(64, 64, (x, y) => ((x % 4 === 0 || y % 4 === 0) ? [20, 200, 40] : [10, 40, 15]))));
    expect(evaluateFidelity(wire).ok).toBe(false);
    expect(['MATRIX_GREEN_DOMINANCE', 'WIREFRAME_LINES_DOMINANT', 'LOW_COLOR_DEPTH']).toContain(evaluateFidelity(wire).reason);
  });
  it('accepts a lit, colourful, shaded frame', () => {
    const shaded = computeFidelity(decodePng(encodePng(96, 96, (x, y) => [Math.round(30 + 200 * (x / 96)), Math.round(40 + 150 * (y / 96)), Math.round(120 + 100 * Math.sin(x * 0.3) * Math.cos(y * 0.2))])));
    expect(evaluateFidelity(shaded)).toEqual({ ok: true });
    expect(shaded.uniqueColors16).toBeGreaterThan(24);
  });
  it('inspectBuffer reports DECODE_ERROR for junk and a reason for a rejected frame', () => {
    const h = new VisualFidelityHarness();
    expect(h.inspectBuffer('junk.png', Buffer.from('not a png')).reason?.startsWith('DECODE_ERROR')).toBe(true);
    const rep = h.inspectBuffer('black.png', encodePng(16, 16, () => [0, 0, 0]));
    expect(rep.ok).toBe(false); expect(rep.reason).toBe('FLAT_IMAGE'); expect(rep.metrics?.meanLuma).toBe(0);
  });
});
