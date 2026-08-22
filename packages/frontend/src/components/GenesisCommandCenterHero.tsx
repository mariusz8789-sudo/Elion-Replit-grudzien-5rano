import { useMemo } from 'react';
import { useThreeLoop } from '../core/three/useThreeLoop';
import { GenesisPulseSim } from '../core/three/genesisPulseScene';
import { getLabs } from '../core/registry';
import { MissionStatusBar } from './MissionStatusBar';

/**
 * GENESIS COMMAND CENTER — żywy środek głównego Dashboardu.
 *
 * Podłącza ISTNIEJĄCY silnik renderujący (useThreeLoop + Sim3D, ten sam
 * kontrakt co epidemicCity3D / Einstein / Universe Lab) do strony głównej —
 * dotąd renderer żył wyłącznie na dedykowanych trasach eksperymentów.
 * `GenesisPulseSim` (core/three/genesisPulseScene.ts) to NIE nowy silnik:
 * to jedna, ambientowa scena zbudowana z tych samych prymitywów
 * (createStarfield, quality tiering), z liczbą węzłów = realna liczba
 * laboratoriów w rejestrze. Gdy w przyszłości Dashboard będzie miał dostęp
 * do żywego, aktywnego projektu, ten sam `useThreeLoop` osadzi WŁAŚCIWY
 * Sim3D tego projektu w tym samym miejscu — bez zmiany silnika.
 */
export function GenesisCommandCenterHero() {
  const nodeCount = useMemo(() => getLabs().length, []);
  const sim = useMemo(() => new GenesisPulseSim({ nodeCount }), [nodeCount]);
  const { canvasRef, loading, failed } = useThreeLoop(sim, {}, true);

  return (
    <section className="gx-hero" aria-label="Genesis Command Center">
      <div className="gx-hero-scene">
        {!failed && (
          <canvas ref={canvasRef} className="gx-hero-canvas" aria-hidden="true" />
        )}
        {failed && <div className="gx-hero-fallback" aria-hidden="true" />}
        {loading && !failed && <div className="gx-hero-loading" role="status">Uruchamiam środowisko…</div>}
      </div>
      <div className="gx-hero-overlay">
        <span className="gx-hero-eyebrow">GENESIS OS · COMMAND CENTER</span>
        <h1 className="gx-hero-title">Infrastruktura przyszłej nauki</h1>
        <p className="gx-hero-sub">
          Każdy węzeł to realne laboratorium w rejestrze Genesis. Wybierz eksperyment, uruchom prawdziwy model,
          otrzymaj wynik z pełnym provenance — to samo środowisko renderujące zasila symulacje, Digital Twin i
          wizualizacje wyników w całym Genesis.
        </p>
        <MissionStatusBar />
      </div>
    </section>
  );
}
