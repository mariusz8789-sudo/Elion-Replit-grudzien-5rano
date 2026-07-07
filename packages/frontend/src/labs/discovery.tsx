import { useState } from 'react';
import type { LabDefinition } from '../core/types';
import { HONESTY_LABELS } from '../core/types';
import { getLabs } from '../core/registry';

/**
 * AI Discovery Lab — centrum warstwy AI platformy.
 * Etap 0: pokazuje architekturę Narratora, proponuje eksperymenty do
 * wykonania w innych laboratoriach i odpowiada na pytania z kuratorowanej
 * bazy. Etap 1: podpięcie LLM przez backend proxy (interfejs providera już
 * istnieje w narrator/engine.ts).
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
    a: 'Narrator nie czeka na pytania — czyta na żywo parametry i statystyki symulacji, liczy z nich realne wielkości fizyczne (γ, promień Schwarzschilda, aktywność izotopu) i układa z nich wyjaśnienie tego, co masz przed oczami. W Etapie 0 robi to deterministyczny silnik — szybki, offline i bez halucynacji. W Etapie 1 dojdzie warstwa LLM do pytań otwartych.',
  },
  {
    q: 'Skąd wiadomo, co jest nauką, a co hipotezą?',
    a: 'Każde laboratorium nosi etykietę: DOKŁADNE WZORY (np. dylatacja czasu), MODEL UPROSZCZONY (np. ekspansja bez promieniowania), MODEL EDUKACYJNY (np. powłoki Bohra) albo HIPOTEZA (np. multiwersum, rój Dysona). Ta granica jest twardą zasadą platformy: hipotezy nigdy nie udają faktów.',
  },
  {
    q: 'Czy symulacje są naukowo dokładne?',
    a: 'Tam, gdzie to możliwe na telefonie — tak (prawo rozpadu, wzory STW, rozkład interferencyjny). Tam, gdzie pełna fizyka wymaga superkomputera (ewolucja galaktyk, chromodynamika), pokazujemy uczciwie oznaczone uproszczenia i piszemy w nocie, co dokładnie pominęliśmy.',
  },
  {
    q: 'Co będzie umiał AI Scientist w kolejnych etapach?',
    a: 'Etap 1: odpowiedzi na pytania otwarte w kontekście bieżącej symulacji (LLM przez backend). Etap 2: porównywanie scenariuszy zapisanych przez użytkownika i raporty z eksperymentów. Dalej: proponowanie kierunków badań — zawsze jako sugestie z niepewnością, nigdy jako "odkrycia".',
  },
];

function DiscoveryView({ lab }: { lab: LabDefinition }) {
  const [open, setOpen] = useState<number | null>(0);
  const [expIdx, setExpIdx] = useState(() => Math.floor(Math.random() * EXPERIMENTS.length));
  const labs = getLabs();
  const exp = EXPERIMENTS[expIdx];
  const expLab = labs.find((l) => l.id === exp.lab);

  return (
    <div className="lab-view" style={{ ['--accent' as string]: lab.accent }}>
      <div className="honesty-row">
        <span className={`honesty ${lab.honesty}`}>{HONESTY_LABELS[lab.honesty]}</span>
        <span className="honesty-note">{lab.honestyNote}</span>
      </div>

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
          <div className="q">Provider: lokalny silnik narracji v0 — aktywny</div>
          <div className="a">
            Interfejs LLM (backend proxy z kluczem API) jest zaprojektowany i czeka na Etap 1 — podmiana providera
            nie wymaga zmian w żadnym laboratorium. Narracja we wszystkich laboratoriach liczy się na Twoim
            urządzeniu, działa offline i nie wysyła żadnych danych.
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
    'Narracja w Etapie 0 pochodzi z deterministycznego silnika liczącego realne wielkości fizyczne z parametrów symulacji — bez modelu językowego, więc bez halucynacji. Warstwa LLM dojdzie w Etapie 1 i będzie wyraźnie oznaczana.',
  params: [],
  narrate: () => [],
  CustomView: DiscoveryView,
  roadmap: [
    'LLM w kontekście bieżącej symulacji — pytania otwarte (Etap 1)',
    'Raporty z eksperymentów i porównywanie scenariuszy (Etap 2)',
    'Sugestie kierunków badań z szacowaną niepewnością (Etap 3)',
  ],
};
