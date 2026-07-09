import { useEffect, useState } from 'react';
import type { LabDefinition } from '../core/types';
import { getLabs } from '../core/registry';
import { HonestyBadge } from '../components/HonestyBadge';

/**
 * AI Discovery Lab — centrum warstwy AI platformy.
 * Pokazuje architekturę Narratora, proponuje eksperymenty do wykonania
 * w innych laboratoriach, odpowiada na pytania z kuratorowanej bazy i
 * raportuje żywy status backendu LLM (GET /api/health) — bez zgadywania.
 */

const EXPERIMENTS = [
  { lab: 'quantum', text: 'Włącz detektor przy szczelinach w Quantum Lab i patrz, jak znika interferencja — a potem wyłącz go i policz, ile cząstek potrzeba, by prążki wróciły.' },
  { lab: 'universe', text: 'W Universe Lab ustaw Ω_Λ = 0 i porównaj tempo ekspansji z wszechświatem takim jak nasz (Ω_Λ = 0,69).' },
  { lab: 'spacetime', text: 'W Space-Time Lab rozpędź zegar do 99% c i sprawdź, o ile lat młodszy wróci bliźniak z 20-letniej podróży.' },
  { lab: 'multiverse', text: 'W Multiverse Lab osłab oddziaływanie silne poniżej 0,91× — zobacz wszechświat, w którym nigdy nie powstał węgiel.' },
  { lab: 'nuclear', text: 'W Nuclear Lab porównaj jod-131 z uranem-238: ta sama krzywa, skale czasu różne o 11 rzędów wielkości.' },
  { lab: 'einstein', text: 'W Einstein Lab przełącz metrykę na Kerra i obserwuj, jak rotacja czarnej dziury zawija tory fotonów.' },
];

const QA = [
  {
    q: 'Czym różni się Narrator AI od chatbota?',
    a: 'Narrator nie czeka na pytania — czyta na żywo parametry i statystyki symulacji, liczy z nich realne wielkości fizyczne (γ, promień Schwarzschilda, aktywność izotopu) i układa z nich wyjaśnienie tego, co masz przed oczami. Ten silnik jest deterministyczny — szybki, offline i bez halucynacji — i działa zawsze. Osobno, w polu „Zapytaj AI" każdego laboratorium, możesz zadać pytanie otwarte — trafia ono do modelu językowego przez backend, wyłącznie w kontekście tego, co widzisz.',
  },
  {
    q: 'Skąd wiadomo, co jest nauką, a co hipotezą?',
    a: 'Każde laboratorium nosi etykietę: DOKŁADNE WZORY (np. dylatacja czasu), MODEL UPROSZCZONY (np. ekspansja bez promieniowania), MODEL EDUKACYJNY (np. powłoki Bohra) albo HIPOTEZA (np. multiwersum, rój Dysona). Ta granica jest twardą zasadą platformy: hipotezy nigdy nie udają faktów.',
  },
  {
    q: 'Czy symulacje są naukowo dokładne?',
    a: 'Tam, gdzie to możliwe na telefonie — tak (prawo rozpadu, wzory STW, rozkład interferencyjny, korelacje splątania). Tam, gdzie pełna fizyka wymaga superkomputera (ewolucja galaktyk, chromodynamika), pokazujemy uczciwie oznaczone uproszczenia i piszemy w nocie, co dokładnie pominęliśmy.',
  },
  {
    q: 'Dlaczego "Zapytaj AI" czasem nie odpowiada?',
    a: 'Backend wymaga klucza API modelu językowego (ustawianego przez operatora wdrożenia, nie przez Ciebie). Bez niego pole grzecznie informuje, że AI jest niedostępne — reszta aplikacji, łącznie z Narratorem, działa dalej bez zmian. Nic nigdy nie udaje odpowiedzi, której nie ma.',
  },
];

function DiscoveryView({ lab }: { lab: LabDefinition }) {
  const [open, setOpen] = useState<number | null>(0);
  const [expIdx, setExpIdx] = useState(() => Math.floor(Math.random() * EXPERIMENTS.length));
  const [aiStatus, setAiStatus] = useState<'checking' | 'ready' | 'no-key' | 'offline'>('checking');
  const labs = getLabs();
  const exp = EXPERIMENTS[expIdx];
  const expLab = labs.find((l) => l.id === exp.lab);

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

  return (
    <div className="lab-view" style={{ ['--accent' as string]: lab.accent }}>
      <HonestyBadge level={lab.honesty} note={lab.honestyNote} />

      <section className="narrator" aria-label="Propozycja eksperymentu">
        <div className="narrator-head">
          <span className="dot" aria-hidden="true" />
          <span className="label">Proponowany eksperyment</span>
        </div>
        <div className="narrator-blocks">
          <div className="nblock">
            <div className="ntitle">{expLab ? `${expLab.icon} ${expLab.name}` : 'Eksperyment'}</div>
            <div className="nbody">{exp.text}</div>
          </div>
          <button
            className="chip-btn"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setExpIdx((i) => (i + 1) % EXPERIMENTS.length)}
          >
            ↻ Zaproponuj inny
          </button>
        </div>
      </section>

      <div className="section-label">Jak działa warstwa AI</div>
      <div className="qa-list">
        {QA.map((item, i) => (
          <button key={i} className="qa-item" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <div className="q">{item.q}</div>
            {open === i && <div className="a">{item.a}</div>}
          </button>
        ))}
      </div>

      <div className="section-label">Status warstwy AI</div>
      <div className="qa-list">
        <div className="qa-item" role="status">
          <div className="q">
            Narrator deterministyczny: zawsze aktywny · Model językowy:{' '}
            {aiStatus === 'checking' && 'sprawdzanie…'}
            {aiStatus === 'ready' && '✓ połączony'}
            {aiStatus === 'no-key' && 'brak klucza API (operator nie skonfigurował)'}
            {aiStatus === 'offline' && 'backend nieosiągalny'}
          </div>
          <div className="a">
            Narracja we wszystkich laboratoriach liczy się na Twoim urządzeniu, działa offline i nie wysyła
            żadnych danych. Pole „Zapytaj AI" wymaga backendu z kluczem modelu — jeśli go nie widzisz aktywnego
            powyżej, reszta platformy działa bez żadnych ograniczeń.
          </div>
        </div>
      </div>
    </div>
  );
}

export const discoveryLab: LabDefinition = {
  id: 'discovery',
  name: 'AI Discovery Lab',
  tagline: 'Narrator AI: wyjaśnia, proponuje eksperymenty, prowadzi',
  icon: '🧠',
  accent: '#5cd6e8',
  honesty: 'exact',
  honestyNote:
    'Narracja bazowa pochodzi z deterministycznego silnika liczącego realne wielkości fizyczne z parametrów symulacji — bez modelu językowego, więc bez halucynacji. Odpowiedzi modelu językowego (pole „Zapytaj AI") są wyraźnie oznaczone osobno i widoczne tylko, gdy backend ma skonfigurowany klucz.',
  params: [],
  narrate: () => [],
  CustomView: DiscoveryView,
};
