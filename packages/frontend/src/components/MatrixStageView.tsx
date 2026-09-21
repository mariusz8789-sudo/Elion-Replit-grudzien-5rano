import { useEffect, useState } from 'react';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import { formatHudTelemetry, snapshotHoloPath, type ManifoldView, type SystemTelemetryView } from '../core/holoTelemetry';

/**
 * MATRIX — the clean stage view of `#/matrix`.
 *
 * The world (volumetric glyph rain over an obsidian mirror — nothing else) is
 * the full-bleed WebGL backdrop the shell already runs; this component paints
 * NOTHING opaque over it. All it adds is one borderless HUD column on the
 * right: measured telemetry, the manifold geometry of the camera's real path
 * and four controls. The system map that used to fill this route lives at
 * `#/matrix-map`.
 *
 * Every number shown here came from the backend in this session or is not
 * shown at all.
 */

interface Health { readonly commitShort?: string; readonly ok?: boolean }

export function MatrixStageView(): JSX.Element {
  const [sys, setSys] = useState<SystemTelemetryView | null>(null);
  const [manifold, setManifold] = useState<ManifoldView | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.classList.add('route-matrix');
    return () => { if (typeof document !== 'undefined') document.documentElement.classList.remove('route-matrix'); };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    let alive = true;
    const pull = async (): Promise<void> => {
      // Two independent requests: one failing (or timing out under a heavy first frame) must not hide the other.
      try {
        const t = await fetch('/api/system/telemetry', { signal: AbortSignal.timeout(6000) });
        if (alive && t.ok) { const j = (await t.json()) as SystemTelemetryView; if (typeof j.cpuCount === 'number') setSys(j); }
      } catch { /* no backend: the column stays honest and empty */ }
      try {
        const h = await fetch('/api/health', { signal: AbortSignal.timeout(6000) });
        if (alive && h.ok) setHealth((await h.json()) as Health);
      } catch { /* no backend */ }
    };
    const geometry = async (): Promise<void> => {
      const points = snapshotHoloPath();
      if (points.length < 3) return;
      try {
        const r = await fetch('/api/manifold/evaluate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nodeId: 'MATRIX', points }), signal: AbortSignal.timeout(4000) });
        if (!r.ok) return;
        const j = (await r.json()) as { manifold?: ManifoldView };
        if (alive && j.manifold) setManifold(j.manifold);
      } catch { /* no backend */ }
    };
    void pull();
    const retry = window.setTimeout(() => { void pull(); }, 4000);
    const a = window.setInterval(() => { void pull(); }, 15000);
    const b = window.setInterval(() => { void geometry(); }, 12000);
    const first = window.setTimeout(() => { void geometry(); }, 5000);
    return () => { alive = false; window.clearInterval(a); window.clearInterval(b); window.clearTimeout(first); window.clearTimeout(retry); };
  }, []);

  const telemetry = formatHudTelemetry(sys, manifold);

  return (
    <main id="main-content" className="matrix-stage" aria-label="Genesis Matrix">
      <aside className="matrix-stage-hud" aria-label="Matrix HUD">
        <div className="matrix-stage-eyebrow">GENESIS · MATRIX</div>
        <h1 className="matrix-stage-title">Matrix</h1>
        <dl className="matrix-stage-readout">
          <dt>RENDER</dt><dd>WebGL · volumetric glyph rain · obsidian mirror · ACES · double bloom</dd>
          <dt>NODE</dt><dd>{health?.commitShort ? `commit ${health.commitShort}` : '—'}</dd>
          <dt>TELEMETRY</dt><dd>{telemetry !== '' ? telemetry : '— (brak backendu)'}</dd>
          <dt>LABEL</dt><dd>MEASURED (telemetria) · GEOMETRIC_MODEL (M5D) · nic nie zasila Winner Gate</dd>
        </dl>
        <div className="matrix-stage-controls">
          <button type="button" className="matrix-stage-btn" onClick={() => requestOpenScienceChat()}>Zapytaj Genesis →</button>
          <button type="button" className="matrix-stage-btn" onClick={() => { window.location.hash = '#/worlds'; }}>Światy 3D →</button>
          <button type="button" className="matrix-stage-btn" onClick={() => { window.location.hash = '#/research-console'; }}>Konsola badawcza →</button>
          <button type="button" className="matrix-stage-btn" onClick={() => { window.location.hash = '#/matrix-map'; }}>Mapa systemu →</button>
        </div>
      </aside>
    </main>
  );
}

export default MatrixStageView;
