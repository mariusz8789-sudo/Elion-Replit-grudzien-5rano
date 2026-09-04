import { useEffect, useMemo, useState } from 'react';
import { useThreeLoop } from '../core/three/useThreeLoop';
import { GenesisPulseSim } from '../core/three/genesisPulseScene';
import { listGenesisScenes } from '../core/three/sceneRegistry';
import { getLabs } from '../core/registry';
import { getVisitedCount } from '../core/discoveryLog';
import { listRouterModels } from '../core/experimentFabric';

/**
 * GENESIS COMMAND CENTER — przestrzenne środowisko wejściowe platformy.
 *
 * Renderer NIE jest tu dekoracją: `GenesisPulseSim` jest montowany przez ten
 * sam `useThreeLoop`, co każda inna scena 3D Genesis, a konstelacja jest
 * zbudowana z REALNYCH laboratoriów rejestru (kolor węzła = `lab.accent`).
 * Wszystkie liczby w overlayach pochodzą z prawdziwych źródeł
 * (`core/registry`, `core/discoveryLog`, `experimentFabric` router,
 * `GET /api/health`) — żadnych wymyślonych metryk.
 */

type Health = 'checking' | 'ready' | 'no-key' | 'offline';

export function GenesisCommandCenterHero() {
  const labs = useMemo(() => getLabs(), []);
  const sim = useMemo(
    () => new GenesisPulseSim({ nodes: labs.map((l) => ({ id: l.id, accent: l.accent })) }),
    [labs],
  );
  const { canvasRef, loading, failed } = useThreeLoop(sim, {}, true);

  const [health, setHealth] = useState<Health>('checking');
  const { visited, totalLabs } = getVisitedCount();
  const modelCount = useMemo(() => listRouterModels().length, []);
  const runnableScenes = useMemo(() => listGenesisScenes().filter((s) => s.status === 'AVAILABLE').length, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => r.json())
      .then((d: { ai?: string }) => { if (!cancelled) setHealth(d.ai === 'ready' ? 'ready' : 'no-key'); })
      .catch(() => { if (!cancelled) setHealth('offline'); });
    return () => { cancelled = true; };
  }, []);

  const healthLabel = health === 'checking' ? 'sprawdzanie' : health === 'ready' ? 'online' : health === 'no-key' ? 'brak klucza' : 'offline';
  const healthTone = health === 'ready' ? 'ok' : health === 'checking' ? 'idle' : 'warn';

  return (
    <section className="gx-stage" aria-label="Genesis Command Center">
      <div className="gx-stage-scene">
        {!failed && <canvas ref={canvasRef} className="gx-stage-canvas" aria-hidden="true" />}
        {failed && <div className="gx-stage-fallback" aria-hidden="true" />}
        {loading && !failed && <div className="gx-stage-loading" role="status">inicjalizacja środowiska</div>}
      </div>

      <div className="gx-stage-vignette" aria-hidden="true" />

      {/* Górna listwa telemetrii — realny stan systemu. */}
      <div className="gx-stage-top">
        <span className="gx-eyebrow">GENESIS OS · COMMAND CENTER</span>
        <div className="gx-telemetry">
          <span className={`gx-dot ${healthTone}`} aria-hidden="true" />
          <span className="gx-telemetry-item">AI <b>{healthLabel}</b></span>
          <span className="gx-telemetry-sep" aria-hidden="true" />
          <span className="gx-telemetry-item">NARRATOR <b>aktywny</b></span>
        </div>
      </div>

      {/* Tytuł + realne wskaźniki, zakotwiczone nisko nad sceną. */}
      <div className="gx-stage-lede">
        <h1 className="gx-display">Infrastruktura przyszłej nauki</h1>
        <p className="gx-lede-sub">
          Każdy świecący węzeł to realne laboratorium w rejestrze Genesis. Opisz pytanie, zatwierdź plan,
          uruchom prawdziwy model — a wynik wróci z pełnym pochodzeniem i odtwarzalnością.
        </p>
        <div className="gx-cta-row">
          <button className="gx-btn primary" onClick={() => { window.location.hash = '#/pilot'; }}>
            Uruchom eksperyment
          </button>
          <button className="gx-btn" onClick={() => { window.location.hash = '#/city3d'; }}>
            Otwórz żywy świat
          </button>
        </div>
      </div>

      {/* Prawa kolumna — realne liczby, nie ozdoby. */}
      <aside className="gx-stage-metrics" aria-label="Stan platformy">
        <Metric label="Laboratoria" value={labs.length} note="rejestr modułów" />
        <Metric label="Modele" value={modelCount} note="adaptery Fabric" />
        <Metric label="Światy" value={runnableScenes} note="sceny dostępne" />
        <Metric label="Zwiedzone" value={`${visited}/${totalLabs}`} note="twój postęp" />
      </aside>
    </section>
  );
}

function Metric({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div className="gx-metric">
      <span className="gx-metric-label">{label}</span>
      <span className="gx-metric-value">{value}</span>
      <span className="gx-metric-note">{note}</span>
    </div>
  );
}
