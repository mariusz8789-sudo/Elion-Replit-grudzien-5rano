import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Wykrywa, czy poziomo przewijalny kontener ma jeszcze treść poza lewą/prawą
 * krawędzią — zasila delikatny gradient-podpowiedź na `.exp-tabs` (patrz
 * LabShell.tsx) zamiast twardej reguły CSS, która pokazywałaby blaknięcie
 * nawet wtedy, gdy WSZYSTKIE zakładki już mieszczą się w widoku.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): { atStart: boolean; atEnd: boolean } {
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });
  const frame = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      const maxScroll = scrollWidth - clientWidth;
      setEdges({
        atStart: scrollLeft <= 1,
        atEnd: maxScroll <= 1 || scrollLeft >= maxScroll - 1,
      });
    };

    const onScroll = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(update);
    };

    update();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [ref]);

  return edges;
}
