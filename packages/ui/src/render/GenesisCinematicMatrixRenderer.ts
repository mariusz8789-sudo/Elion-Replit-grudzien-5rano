import { mulberry32, canonicalJson as stableStringify, sha256Hex as sha256hex } from '@genesis/core/determinism.js';
export { mulberry32, stableStringify, sha256hex };
export interface Clock { now(): number; }
export interface MatrixRainColumn { readonly columnIndex: number; readonly speed: number; readonly characters: readonly string[]; readonly opacity: number; readonly headRow: number; }
export interface ChromeMaterialConfig { readonly metalness: number; readonly roughness: number; readonly tintHex: string; readonly envIntensity: number; }
export interface PlatformConfig { readonly platformId: string; readonly radius: number; readonly emissiveColor: string; readonly pulseFrequencyHz: number; }
export interface CinematicRenderFrame { readonly frameSeq: number; readonly cameraPosition: readonly [number, number, number]; readonly cameraTarget: readonly [number, number, number]; readonly activeRainColumns: readonly MatrixRainColumn[]; readonly dataLabel: 'SYNTHETIC_CINEMATIC'; readonly fingerprint: string; }
export interface SequenceFrame extends CinematicRenderFrame { readonly chainHash: string; }
const MATRIX_GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'Ω', 'Ψ', 'Σ', 'Δ'];
export class GenesisCinematicMatrixRenderer {
  constructor(private clock: Clock, private seed: number) {}
  createChromeMaterial(): ChromeMaterialConfig { return { metalness: 0.95, roughness: 0.08, tintHex: '#00ff66', envIntensity: 1.4 }; }
  createPlatform(id: string, radius = 2.5): PlatformConfig { return { platformId: id, radius, emissiveColor: '#00ffcc', pulseFrequencyHz: 1.25 }; }
  platformPulse(p: PlatformConfig, timeS: number): number { return +(0.5 + 0.5 * Math.sin(2 * Math.PI * p.pulseFrequencyHz * timeS)).toFixed(6); }
  rainOffset(speed: number, frameSeq: number): number { return Math.floor(frameSeq * speed); }
  generateMatrixRainStream(columnCount = 32, rowsPerColumn = 20, frameSeq = 0): readonly MatrixRainColumn[] {
    const rng = mulberry32(this.seed); const columns: MatrixRainColumn[] = [];
    for (let c = 0; c < columnCount; c++) {
      const base: string[] = []; for (let r = 0; r < rowsPerColumn; r++) base.push(MATRIX_GLYPHS[Math.floor(rng() * MATRIX_GLYPHS.length)]);
      const speed = +(0.5 + rng() * 1.5).toFixed(2); const opacity = +(0.3 + rng() * 0.7).toFixed(2);
      const headRow = ((this.rainOffset(speed, frameSeq) % rowsPerColumn) + rowsPerColumn) % rowsPerColumn;
      const characters = base.map((_, r) => base[(r + headRow) % rowsPerColumn]);
      columns.push({ columnIndex: c, speed, characters, opacity, headRow });
    }
    return columns;
  }
  renderFrame(seq: number, totalFrames = 300): CinematicRenderFrame {
    const angle = (seq / totalFrames) * Math.PI * 2;
    const camX = +(Math.sin(angle) * 12.0).toFixed(3);
    const camY = +(3.5 + Math.sin(seq * 0.05) * 0.5).toFixed(3);
    const camZ = +(Math.cos(angle) * 12.0).toFixed(3);
    const rain = this.generateMatrixRainStream(16, 15, seq);
    const partial = { frameSeq: seq, cameraPosition: [camX, camY, camZ] as const, cameraTarget: [0, 2.0, 0] as const, activeRainColumns: rain, dataLabel: 'SYNTHETIC_CINEMATIC' as const };
    return { ...partial, fingerprint: sha256hex(stableStringify(partial)) };
  }
  renderSequence(startSeq: number, count: number): readonly SequenceFrame[] {
    const out: SequenceFrame[] = []; let prev = 'GENESIS';
    for (let i = 0; i < count; i++) { const f = this.renderFrame(startSeq + i); const chainHash = sha256hex(stableStringify({ prev, fp: f.fingerprint })); out.push({ ...f, chainHash }); prev = chainHash; }
    return out;
  }
}
