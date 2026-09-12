import { useEffect, useRef } from 'react';
import { listExperiments } from '../core/scienceMemory';
import { kindsOf } from './GenesisMatrixHub';

/**
 * MATRIX DATA STREAM — Genesis's background layer: a living computational
 * fabric, not a screensaver.
 *
 * The difference is the content. A film-style Matrix rain is random glyphs.
 * This streams ONLY real tokens from the running system — actual Science
 * Memory record ids, the kinds those records honestly carry, per-kind counts,
 * epistemic status, evidence pack and chain ids, the live record count, the
 * current route, the real elapsed tick. There is no filler, because filler is
 * exactly what turns a system layer into a screensaver, and a busy-looking
 * background over an empty system would be the same lie as a seeded
 * dashboard. An empty store produces a genuinely sparse stream that says
 * `MEM::0 / STATE::EMPTY / AWAITING::FIRST_RUN`. A quiet system looks quiet.
 *
 * WHERE IT IS SUPPRESSED: every screen whose own content IS the visual — the
 * 3D labs, the city renderers, the concept film. Those already paint the
 * whole viewport; a data stream behind them is invisible at best and a
 * framerate tax at worst. `SUPPRESSED_ROUTES` is that list.
 *
 * COST: it draws at ~12fps onto a half-resolution canvas with
 * `pointer-events: none`, pauses entirely when the tab is hidden, and does
 * not run at all under `prefers-reduced-motion`. It is decoration, and
 * decoration does not get to compete with the solvers for frame budget.
 */

/**
 * Routes that own their own full-viewport visual; ANY decorative background
 * layer stays off on these — a data stream behind a 3D scene is invisible at
 * best and a framerate tax at worst.
 *
 * Exported (not private to this file) so a second background layer never has
 * to re-derive or hand-copy this list: `liveMatrix/LiveMatrixBackground.tsx`
 * has no router awareness by design (see its own boundary doc — a decorative
 * canvas component takes props, it does not read `window.location`), so
 * whatever mounts it conditionally (an App-level wrapper) is the correct,
 * ONE place to call `isSuppressed(window.location.hash)` — reusing this exact
 * list rather than a second one that could silently drift from it.
 */
export const SUPPRESSED_ROUTES: readonly string[] = [
  '#/city3d', '#/city', '#/scientific-city', '#/first-person-lab', '#/lab-3d',
  '#/molecule', '#/cell-lab', '#/character', '#/concept', '#/investor-demo',
  '#/hf-slice', '#/reality', '#/prebuild', '#/timeline',
];

export function isSuppressed(hash: string): boolean {
  const normalized = hash || '#/';
  return SUPPRESSED_ROUTES.some((r) => normalized === r || normalized.startsWith(`${r}?`))
    || normalized.startsWith('#/lab/');
}

/**
 * The stream carries ONLY real tokens. There is no random-glyph filler:
 * filler is what makes a background a screensaver, and a screensaver over an
 * empty system implies activity that is not happening. Every string below is
 * read from the running application — record ids, the kinds those records
 * honestly carry, their epistemic status, evidence pack ids, the live record
 * count, the current route, and the real elapsed tick.
 *
 * When Science Memory is empty the stream is genuinely sparse and says so
 * (`MEM::0`, `STATE::EMPTY`). A quiet system looks quiet. That is the point.
 */
function systemTokens(tick: number): string[] {
  let records: ReturnType<typeof listExperiments> = [];
  try { records = listExperiments(); } catch { /* no DOM / no storage: stay empty */ }

  const route = (typeof window !== 'undefined' ? window.location.hash : '') || '#/';
  const tokens: string[] = [
    `MEM::${records.length}`,
    `ROUTE::${route.replace('#/', '').toUpperCase() || 'HOME'}`,
    `T+${String(tick).padStart(5, '0')}`,
  ];
  if (records.length === 0) {
    tokens.push('STATE::EMPTY', 'AWAITING::FIRST_RUN');
    return tokens;
  }

  const kindCounts = new Map<string, number>();
  for (const record of records) for (const kind of kindsOf(record)) kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  for (const [kind, count] of kindCounts) tokens.push(`${kind}::${count}`);

  for (const record of records.slice(0, 32)) {
    tokens.push(record.id.toUpperCase().slice(0, 16));
    if (record.evidencePackId) tokens.push(`PACK::${record.evidencePackId.toUpperCase().slice(0, 10)}`);
    if (record.evidenceChainId) tokens.push(`CHAIN::${record.evidenceChainId.toUpperCase().slice(0, 10)}`);
    if (record.epistemicStatus) tokens.push(record.epistemicStatus);
    if (record.realExperimentVerification) tokens.push('VERIFIED::REAL_MEASUREMENT');
  }
  return tokens;
}

export function MatrixDataStream(): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const SCALE = 0.5;          // half-resolution: this is background, not content
    const FRAME_MS = 1000 / 12; // ~12fps is plenty for a drifting fabric
    const COL_WIDTH = 92;
    const ROW_HEIGHT = 15;

    let columns: { y: number; speed: number; text: string[] }[] = [];
    let tokens = systemTokens(0);
    let raf = 0;
    let last = 0;
    let tick = 0;
    let suppressed = isSuppressed(window.location.hash);

    // Every cell is a real token. Which token appears where is arbitrary —
    // that is layout, not content — but nothing is ever invented.
    const pick = (): string => (tokens.length === 0 ? '' : tokens[Math.floor(Math.random() * tokens.length)]);

    const resize = (): void => {
      canvas.width = Math.floor(window.innerWidth * SCALE);
      canvas.height = Math.floor(window.innerHeight * SCALE);
      const count = Math.max(1, Math.floor(canvas.width / COL_WIDTH));
      columns = Array.from({ length: count }, () => ({
        y: Math.random() * canvas.height,
        speed: 0.25 + Math.random() * 0.7,
        text: Array.from({ length: Math.ceil(canvas.height / ROW_HEIGHT) + 2 }, pick),
      }));
    };

    const draw = (now: number): void => {
      raf = window.requestAnimationFrame(draw);
      if (suppressed || document.hidden) return;
      if (now - last < FRAME_MS) return;
      last = now;
      tick += 1;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '10px ui-monospace, "SF Mono", Menlo, monospace';
      ctx.textBaseline = 'top';

      for (let c = 0; c < columns.length; c++) {
        const col = columns[c];
        col.y += col.speed;
        if (col.y > canvas.height) { col.y = -ROW_HEIGHT * 3; col.text = col.text.map(pick); }
        for (let r = 0; r < col.text.length; r++) {
          const y = col.y + r * ROW_HEIGHT - canvas.height;
          if (y < -ROW_HEIGHT || y > canvas.height) continue;
          // Head of the column is brightest and cyan; the tail fades out.
          const depth = r / col.text.length;
          const alpha = Math.max(0, 0.16 * (1 - depth));
          ctx.fillStyle = r === col.text.length - 1
            ? `rgba(92, 214, 232, ${alpha + 0.2})`
            : `rgba(160, 190, 230, ${alpha})`;
          ctx.fillText(col.text[r], c * COL_WIDTH + 6, y);
        }
      }

      // Refresh the real-token pool occasionally so new runs appear in the
      // fabric without re-reading the store on every frame.
      if (tick % 120 === 0) tokens = systemTokens(tick);
    };

    const onHashChange = (): void => {
      suppressed = isSuppressed(window.location.hash);
      if (canvas) canvas.style.opacity = suppressed ? '0' : '1';
      if (suppressed && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      tokens = systemTokens(tick);
    };

    resize();
    onHashChange();
    window.addEventListener('resize', resize);
    window.addEventListener('hashchange', onHashChange);
    raf = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="matrix-datastream" aria-hidden="true" />;
}

export default MatrixDataStream;
