import { useEffect, useState } from 'react';
import { getLabs } from '../core/registry';
import { getVisitedCount } from '../core/discoveryLog';

/**
 * Pasek statusu misji — estetyka centrum kontroli, ale WYŁĄCZNIE realne
 * dane: liczba laboratoriów z rejestru, żywy status backendu AI
 * (GET /api/health, ten sam endpoint co w discovery.tsx), postęp
 * eksploracji z Dziennika Odkryć. Zero wymyślonych liczb.
 *
 * Wydzielony z App.tsx, żeby Genesis Command Center (Dashboard) mógł go
 * reużyć bez drugiej implementacji tego samego statusu.
 */
export function MissionStatusBar() {
  const [aiStatus, setAiStatus] = useState<'checking' | 'ready' | 'no-key' | 'offline'>('checking');
  const { visited, totalLabs } = getVisitedCount();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => r.json())
      .then((d: { ai?: string }) => {
        if (!cancelled) setAiStatus(d.ai === 'ready' ? 'ready' : 'no-key');
      })
      .catch(() => {
        if (!cancelled) setAiStatus('offline');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const aiLabel =
    aiStatus === 'checking' ? 'sprawdzanie…' : aiStatus === 'ready' ? 'online' : aiStatus === 'no-key' ? 'brak klucza' : 'offline';

  return (
    <div className="mission-bar" role="status" aria-label="Status systemu Genesis OS">
      <span className="mdot on" aria-hidden="true" />
      <span>NARRATOR: <strong>zawsze aktywny</strong></span>
      <span className="msep">·</span>
      <span className={`mdot ${aiStatus === 'ready' ? 'on' : aiStatus === 'checking' ? '' : 'warn'}`} aria-hidden="true" />
      <span>AI: <strong>{aiLabel}</strong></span>
      <span className="msep">·</span>
      <span>LABORATORIA: <strong>{getLabs().length}</strong></span>
      <span className="msep">·</span>
      <span>ODWIEDZONE: <strong>{visited}/{totalLabs}</strong></span>
    </div>
  );
}
