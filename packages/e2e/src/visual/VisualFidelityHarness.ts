/* Proprietary / All Rights Reserved - Genesis OS */
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
export interface FidelityMetrics {
  readonly width: number; readonly height: number; readonly meanLuma: number; readonly lumaVariance: number;
  readonly edgeDensity: number; readonly colorfulness: number; readonly greenDominance: number;
  readonly uniqueColors16: number; readonly histogram: readonly number[];
}
export interface FidelityReport { readonly path: string; readonly ok: boolean; readonly reason?: string; readonly metrics?: FidelityMetrics; }
interface PngImage { readonly width: number; readonly height: number; readonly pixels: Uint8Array; readonly channels: 3 | 4; }
export class LowFidelityError extends Error { constructor(reason: string, readonly metrics: FidelityMetrics) { super('LOW_FIDELITY_REJECT: ' + reason); this.name = 'LowFidelityError'; } }
/** Deterministic minimal PNG (8-bit truecolor) decoder: IHDR/IDAT + zlib inflate + scanline unfilter. */
export function decodePng(buf: Buffer): PngImage {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('BAD_SIGNATURE');
  let pos = 8; let width = 0; let height = 0; let bitDepth = 0; let colorType = 0;
  const idat: Buffer[] = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error('UNSUPPORTED_PNG');
  const channels: 3 | 4 = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const row = y * stride; const prev = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[row + x - channels] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = x >= channels && y > 0 ? out[prev + x - channels] : 0;
      let v = raw[rp++];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; v = (v + pr) & 255; }
      out[row + x] = v;
    }
  }
  return { width, height, pixels: out, channels };
}
/** Inputs are already normalised to 0..1 by computeFidelity (the delivered version divided by 255 a second time, which made every frame FLAT_IMAGE). */
const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export function computeFidelity(img: PngImage): FidelityMetrics {
  const step = Math.max(1, Math.floor((img.width * img.height) / 200000));
  const lumas: number[] = []; const hist = new Array<number>(16).fill(0);
  const colors = new Set<number>();
  let edge = 0; let colorful = 0; let greenDom = 0; let total = 0; let prevL: number | null = null;
  for (let i = 0; i < img.width * img.height; i += step) {
    const o = i * img.channels;
    const r = img.pixels[o] / 255; const g = img.pixels[o + 1] / 255; const b = img.pixels[o + 2] / 255;
    const l = luma(r, g, b);
    lumas.push(l); hist[Math.min(15, Math.floor(l * 16))]++; total++;
    colors.add(((img.pixels[o] >> 4) << 8) | ((img.pixels[o + 1] >> 4) << 4) | (img.pixels[o + 2] >> 4));
    colorful += Math.max(r, g, b) - Math.min(r, g, b);
    if (g > r + 0.08 && g > b + 0.08) greenDom++;
    if (prevL !== null && Math.abs(l - prevL) > 0.16) edge++;
    prevL = l;
  }
  const mean = lumas.reduce((a, b) => a + b, 0) / Math.max(1, total);
  const variance = lumas.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, total);
  return {
    width: img.width, height: img.height,
    meanLuma: +mean.toFixed(4), lumaVariance: +variance.toFixed(5),
    edgeDensity: +(edge / Math.max(1, total)).toFixed(4),
    colorfulness: +(colorful / Math.max(1, total)).toFixed(4),
    greenDominance: +(greenDom / Math.max(1, total)).toFixed(4),
    uniqueColors16: colors.size,
    histogram: hist.map(h => +(h / Math.max(1, total)).toFixed(4)),
  };
}
/** Documented rejection rules: flat, black, matrix-green, wireframe-line-dominated, low color depth. */
export function evaluateFidelity(m: FidelityMetrics): { ok: boolean; reason?: string } {
  if (m.lumaVariance < 0.002) return { ok: false, reason: 'FLAT_IMAGE' };
  if (m.meanLuma < 0.02) return { ok: false, reason: 'BLACK_IMAGE' };
  if (m.greenDominance > 0.55 && m.colorfulness < 0.12) return { ok: false, reason: 'MATRIX_GREEN_DOMINANCE' };
  if (m.edgeDensity > 0.35 && m.colorfulness < 0.10) return { ok: false, reason: 'WIREFRAME_LINES_DOMINANT' };
  if (m.uniqueColors16 < 24) return { ok: false, reason: 'LOW_COLOR_DEPTH' };
  return { ok: true };
}
export class VisualFidelityHarness {
  inspectBuffer(path: string, buf: Buffer): FidelityReport {
    try {
      const metrics = computeFidelity(decodePng(buf));
      const verdict = evaluateFidelity(metrics);
      return verdict.ok ? { path, ok: true, metrics } : { path, ok: false, reason: verdict.reason, metrics };
    } catch (e) { return { path, ok: false, reason: 'DECODE_ERROR:' + String(e) }; }
  }
  inspectFile(path: string): FidelityReport { return this.inspectBuffer(path, readFileSync(path)); }
  inspectDirectory(dir: string): readonly FidelityReport[] {
    return readdirSync(dir).filter(f => f.toLowerCase().endsWith('.png')).map(f => this.inspectFile(dir + '/' + f));
  }
  /** Throws LowFidelityError('LOW_FIDELITY_REJECT: …') when the "eyes" reject the artifact. */
  assertFidelity(path: string): FidelityMetrics {
    const rep = this.inspectFile(path);
    if (!rep.ok || !rep.metrics) throw new LowFidelityError(rep.reason ?? 'UNKNOWN', rep.metrics ?? computeFidelity(decodePng(readFileSync(path))));
    return rep.metrics;
  }
}
