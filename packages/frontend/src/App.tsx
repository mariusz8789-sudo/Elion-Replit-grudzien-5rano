import { useEffect, useState } from 'react';
import './labs/index';
import { getLab, getLabs } from './core/registry';
import { LabShell } from './components/LabShell';
import { ScaleJourney } from './components/ScaleJourney';

/**
 * Genesis OS — powłoka aplikacji.
 * Nawigacja przez hash (#/lab/quantum), więc wstecz/dalej i odświeżenie
 * działają natywnie na telefonie bez zewnętrznego routera.
 */

function labIdFromHash(): string | null {
  const m = window.location.hash.match(/^#\/lab\/([\w-]+)/);
  return m ? m[1] : null;
}

export default function App() {
  const [labId, setLabId] = useState<string | null>(labIdFromHash);

  useEffect(() => {
    const onHash = () => setLabId(labIdFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const lab = labId ? getLab(labId) : undefined;

  if (lab) {
    const View = lab.CustomView;
    return (
      <div className="app">
        <header className="topbar">
          <button className="back" aria-label="Wróć do laboratoriów" onClick={() => { window.location.hash = ''; }}>
            ←
          </button>
          <div className="titles">
            <h1>{lab.icon} {lab.name}</h1>
            <p className="tagline">{lab.tagline}</p>
          </div>
        </header>
        {View ? <View lab={lab} /> : <LabShell key={lab.id} lab={lab} />}
      </div>
    );
  }

  return (
    <div className="app">
      <main className="home">
        <ScaleJourney />
        <div className="section-label">Laboratoria · {getLabs().length} modułów</div>
        <div className="labs-grid">
          {getLabs().map((l) => (
            <button
              key={l.id}
              className="lab-card"
              style={{ ['--accent' as string]: l.accent }}
              onClick={() => { window.location.hash = `#/lab/${l.id}`; }}
            >
              <span className="icon" aria-hidden="true">{l.icon}</span>
              <span className="name">{l.name}</span>
              <span className="desc">{l.tagline}</span>
            </button>
          ))}
        </div>
        <p className="footer-note">
          Genesis OS · Etap 0 — fundament. Każda symulacja nosi etykietę uczciwości naukowej:
          hipotezy nigdy nie udają faktów.
        </p>
      </main>
    </div>
  );
}
