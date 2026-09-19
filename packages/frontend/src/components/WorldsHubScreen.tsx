import type React from 'react';
import { WorldPreviewCanvas } from './holo/WorldPreviewCanvas';
import type { PreviewKind } from './holo/worldPreviews';

/**
 * GENESIS SCIENTIFIC WORLDS — the one door to every 3D world that already
 * exists (D-118). Each card names the research purpose of the world, what in
 * it is REAL (a running model, pinned data, measured series) and what is a
 * VISUALISATION. Only routes `App.tsx` really resolves are listed; nothing
 * here is a placeholder for a world that does not run.
 */

export interface WorldEntry {
  readonly id: string;
  readonly hash: string;
  readonly glyph: string;
  readonly title: string;
  readonly domain: string;
  readonly purpose: string;
  readonly real: string;
  readonly visual: string;
  readonly featured?: true;
  /** Procedural preview drawn on the card (a visualisation, never model state). */
  readonly preview: PreviewKind;
}

export const WORLDS: readonly WorldEntry[] = [
  {
    id: 'scientific-worlds', preview: 'vessel', hash: '#/scientific-worlds', glyph: '⛑', title: 'Agent w laboratorium', domain: 'Scientific Worlds', featured: true,
    purpose: 'Napisz polecenie — agent w kombinezonie idzie do stanowiska, obsługuje konsolę i wykonuje prawdziwy eksperyment; patrzysz przez wizjer.',
    real: 'Jedna sesja na eksperyment: wejścia, silnik, wyniki, hash treści, odcisk replay i wpis w EvidenceLedger; replay MATCH/DRIFT.',
    visual: 'Laboratorium z zestawów Genesis Graphics, rig humanoida w kombinezonie, kamera w hełmie; HUD w strefach bezpiecznych.',
  },
  {
    id: 'city3d', preview: 'city', hash: '#/city3d', glyph: '◫', title: 'Miasto epidemiologiczne', domain: 'Epidemiology World', featured: true,
    purpose: 'Jak interwencja (izolacja, zamknięcie szkół) zmienia dynamikę zakażeń w mieście.',
    real: 'Agentowy model epidemii dzień po dniu, hotspoty, obłożenie szpitala, fingerprint przebiegu.',
    visual: 'Miasto WebGL, humanoidy, światła — scena pokazuje stan modelu, nie liczy go.',
  },
  {
    id: 'lab-3d', preview: 'vessel', hash: '#/lab-3d', glyph: '⌬', title: 'Wirtualne laboratorium', domain: 'Virtual Lab', featured: true,
    purpose: 'Hipoteza → eksperyment → obserwacja → dowód → wynik, z kamerą naukową prowadzoną przez zdarzenia.',
    real: 'Scenario Engine: realny przebieg, porównanie A/B, replay z fingerprintem.',
    visual: 'Hala laboratoryjna, naczynie reakcyjne, ujęcia kamery.',
  },
  {
    id: 'molecule', preview: 'molecule', hash: '#/molecule', glyph: '⬡', title: 'Molecule World', domain: 'Molecular World', featured: true,
    purpose: 'Cząsteczka jako obiekt badawczy: geometria, wiązania, właściwości, porównanie z referencją.',
    real: 'Geometria i wiązania z RDKit (MODEL_ESTIMATE), deskryptory z realnych silników.',
    visual: 'Atomy i wiązania 3D z poświatą — model obliczeniowy, nie pomiar.',
  },
  {
    id: 'discovery-hall', preview: 'hall', hash: '#/discovery-hall', glyph: '◈', title: 'Discovery Hall', domain: 'Winner Gate', featured: true,
    purpose: 'Jedno realne odkrycie opowiedziane w laboratorium: kustodia → G2 → bramka → Winner Record.',
    real: 'Prawdziwy przebieg LOWER-HARM wykonany przy wejściu; każda liczba z tego przebiegu.',
    visual: 'Ujęcia kamery i scena laboratorium.',
  },
  {
    id: 'scientific-city', preview: 'city', hash: '#/scientific-city', glyph: '▦', title: 'Scientific City', domain: 'Infrastructure World',
    purpose: 'Pompa, woda i szpital w jednym mieście — sprzężenia między domenami.',
    real: 'Realne modele pompy i obłożenia szpitala połączone w jeden przebieg.',
    visual: 'Miasto i infrastruktura 3D.',
  },
  {
    id: 'cell-lab', preview: 'cells', hash: '#/cell-lab', glyph: '◌', title: 'Virtual Cell Lab', domain: 'Biology World',
    purpose: 'Kontrola vs terapia: dwie hodowle komórkowe pod działaniem substancji.',
    real: 'Solwer cyklu komórkowego G1/S/G2M (RK4), pełna prowieniencja.',
    visual: 'Hodowle i kolonie 3D.',
  },
  {
    id: 'genesis-world', preview: 'terrain', hash: '#/genesis-world', glyph: '◍', title: 'World Engine', domain: 'Environment World',
    purpose: 'Świat obserwowany w czasie: pożar, osuwisko, kontrfaktyczne odgałęzienia.',
    real: 'Zdarzenia świata z realnych modeli, forki i przewijanie ticków.',
    visual: 'Teren, budynki, pogoda 3D.',
  },
  {
    id: 'timeline', preview: 'cosmos', hash: '#/timeline', glyph: '◠', title: 'Discovery Timeline', domain: 'Cosmos World',
    purpose: 'Od Wielkiego Wybuchu do dalekiej przyszłości — jedna ciągła podróż z narratorem.',
    real: 'Skale czasu i wielkości z modeli fizycznych.',
    visual: 'Sceny epok i przejścia kamery.',
  },
];

export function WorldsHubScreen(): React.ReactElement {
  const featured = WORLDS.filter((w) => w.featured);
  const rest = WORLDS.filter((w) => !w.featured);
  return (
    <main id="main-content" tabIndex={-1} className="worlds" data-testid="worlds-hub">
      <header className="worlds-head">
        <span className="gx-eyebrow">Genesis Scientific Worlds</span>
        <h1 className="worlds-title">Światy, w których każdy element coś pokazuje</h1>
        <p className="worlds-lede">
          Każdy świat ma konkretny cel badawczy. Scena 3D wizualizuje stan realnego modelu — nigdy go nie udaje.
          Na każdej karcie widać, co jest <b>realne</b>, a co jest <b>wizualizacją</b>.
        </p>
      </header>
      <section className="worlds-grid worlds-grid-featured" aria-label="Główne światy">
        {featured.map((w) => <WorldCard key={w.id} world={w} />)}
      </section>
      <h2 className="section-label">Pozostałe światy</h2>
      <section className="worlds-grid" aria-label="Pozostałe światy">
        {rest.map((w) => <WorldCard key={w.id} world={w} />)}
      </section>
    </main>
  );
}

function WorldCard({ world }: { readonly world: WorldEntry }): React.ReactElement {
  return (
    <a className={`world-card${world.featured ? ' world-card-featured' : ''}`} href={world.hash} data-testid={`world-${world.id}`}>
      <span className="world-card-preview" aria-hidden="true">
        <WorldPreviewCanvas kind={world.preview} />
        <i className="world-card-preview-tag">podgląd proceduralny</i>
      </span>
      <span className="world-card-glyph" aria-hidden="true">{world.glyph}</span>
      <span className="world-card-domain">{world.domain}</span>
      <span className="world-card-title">{world.title}</span>
      <span className="world-card-purpose">{world.purpose}</span>
      <span className="world-card-facts">
        <span className="world-card-fact"><i className="gx-status real">REAL</i>{world.real}</span>
        <span className="world-card-fact"><i className="gx-status visual">WIZUALIZACJA</i>{world.visual}</span>
      </span>
      <span className="world-card-cta">Wejdź →</span>
    </a>
  );
}
