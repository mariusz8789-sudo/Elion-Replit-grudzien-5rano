import { useEffect, useRef, useState } from 'react';
import { realityEngine } from '../core/reality/RealityEngine';

/**
 * Persystentny canvas Reality Navigatora — montowany DOKŁADNIE RAZ w
 * App.tsx, POZA warunkowym drzewem tras (patrz App.tsx), więc React nigdy
 * go nie odmontowuje przy zmianie trasy. `active` steruje WYŁĄCZNIE
 * widocznością (display:none) — sam WebGL-owy renderer/scena/kamera żyją
 * w core/reality/RealityEngine.ts niezależnie od tego, czy trasa jest
 * aktualnie 'reality' czy nie. To jest dosłowna realizacja "canvas, który
 * przetrwa przejścia między labami/workspace'ami": wejdź do Reality
 * Navigatora, ustaw scenę, przejdź do dowolnego laboratorium i wróć —
 * kamera i stan sceny są dokładnie tam, gdzie je zostawiono.
 */
export function RealityCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    realityEngine.mount(canvas).catch((err) => {
      console.error('Nie udało się uruchomić silnika Reality Navigatora:', err);
      setFailed(true);
    });
  }, []);

  useEffect(() => {
    if (active) realityEngine.resize();
  }, [active]);

  if (failed) return null;

  return (
    <canvas
      ref={canvasRef}
      className="reality-canvas"
      style={{ display: active ? 'block' : 'none' }}
      aria-hidden={!active}
    />
  );
}
