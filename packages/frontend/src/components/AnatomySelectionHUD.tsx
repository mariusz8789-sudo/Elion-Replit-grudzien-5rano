import { useEffect, useRef, useState } from 'react';
import { BODY_SYSTEMS, EXPLORE_LAYERS, SYSTEM_PL, exploreCrumbs, exploreOrgan, REGION_LABEL, structureLabel, type BodyRegionId, type ExploreState } from '../core/three/anatomyExplore';
import type { ExploreHit } from '../core/three/anatomyFocusLayer';
import type { BiologyArtifact } from '../core/scientificWorlds/biologyRunners';
import type { TwinSurfaceMode } from '../core/three/humanTwinMaterials';

/**
 * ANATOMY SELECTION HUD — the small layer over the body while it is explored: a breadcrumb with Back at
 * the top, the chosen thing's name in a short sheet at the bottom, and the few actions that go deeper.
 * Nothing here covers the human; the names of the organs sit next to the organs themselves.
 */

export type ExploreAction = 'section' | 'microscope' | 'cell' | 'blood' | 'isolate';
/** The macro → micro ladder of the reference (Ciało 1 m … DNA 0,1 nm); each rung runs the existing instrument. */
export type LadderLevel = 'body' | 'organ' | 'tissue' | 'cell' | 'organelle' | 'molecule' | 'dna';
export const LADDER: readonly (readonly [LadderLevel, string, string])[] = [
  ['body', 'Ciało', '1 m'], ['organ', 'Narząd', '10 cm'], ['tissue', 'Tkanka', '1 mm'], ['cell', 'Komórka', '10 µm'],
  ['organelle', 'Organellum', '1 µm'], ['molecule', 'Cząsteczka', '1 nm'], ['dna', 'DNA', '0,1 nm'],
];
export const MAGNIFICATIONS: readonly number[] = [5, 25, 100, 500, 1000];

export interface StructureResult { readonly name: string; readonly label: string; readonly system: string; readonly regionId: BodyRegionId }

export interface AnatomySelectionHUDProps {
  readonly explore: ExploreState;
  /** The tissue / cell / blood view beside the body, when a microscope step has sealed. */
  readonly micro: BiologyArtifact | null;
  readonly isolated: boolean;
  readonly sectionOn: boolean;
  readonly busy: boolean;
  readonly surface: TwinSurfaceMode;
  readonly onSurface: (mode: TwinSurfaceMode) => void;
  readonly onBack: () => void;
  readonly onAction: (action: ExploreAction) => void;
  /** Left menu of the reference: one body system alone, peeled layers, search of every structure. */
  readonly onlySystem: string | null;
  readonly onSystem: (id: string | null) => void;
  readonly peeled: readonly string[];
  readonly onPeel: (layerId: string) => void;
  readonly search: (query: string) => readonly StructureResult[];
  readonly onFind: (result: StructureResult) => void;
  readonly onLadder: (level: LadderLevel) => void;
  readonly onMagnify: (magnification: number) => void;
}

const SURFACES: readonly (readonly [TwinSurfaceMode, string])[] = [['NORMAL', 'Skóra'], ['XRAY', 'RTG'], ['GHOST', 'Duch']];
const TISSUE_PL: Readonly<Record<string, string>> = {
  CARDIAC: 'mięsień sercowy', NEURAL: 'tkanka nerwowa', LUNG: 'pęcherzyki płucne', LIVER: 'zraziki wątroby',
  EPITHELIUM: 'nabłonek', BLOOD: 'krew · rozmaz referencyjny',
};

/** What the microscope view beside the body shows, its scale and its status — always a model. */
export function microCaption(artifact: BiologyArtifact): { title: string; detail: string } | null {
  if (artifact.kind === 'histology') {
    const tissue = artifact.slide.tissueType;
    return { title: tissue === 'BLOOD' ? 'Krew pod mikroskopem' : `Tkanka: ${TISSUE_PL[tissue] ?? tissue.toLowerCase()}`, detail: 'skala ≈ 1 mm · preparat histologiczny · MODEL, nie zdjęcie pacjenta' };
  }
  if (artifact.kind === 'hyperscope' && artifact.cell) {
    const m = artifact.capture.request.magnification;
    const tissue = artifact.cell.tissueType;
    const what = tissue === 'BLOOD' ? 'Krew' : m >= 500 ? 'Wnętrze komórki' : `Komórka: ${TISSUE_PL[tissue] ?? tissue.toLowerCase()}`;
    return { title: `${what} · ${m}×`, detail: `skala ≈ ${m >= 500 ? '1 µm' : '10 µm'} · mikroskop wirtualny · MODEL, nie zdjęcie pacjenta` };
  }
  return null;
}

export default function AnatomySelectionHUD({ explore, micro, isolated, sectionOn, busy, surface, onSurface, onBack, onAction, onlySystem, onSystem, peeled, onPeel, search, onFind, onLadder, onMagnify }: AnatomySelectionHUDProps): JSX.Element | null {
  const [panel, setPanel] = useState<'systems' | 'layers' | 'search' | null>(null);
  const [query, setQuery] = useState('');
  const organ = exploreOrgan(explore.organId);
  const caption = micro ? microCaption(micro) : null;
  const blood = micro?.kind === 'histology' ? micro.slide.tissueType === 'BLOOD' : micro?.kind === 'hyperscope' && micro.cell?.tissueType === 'BLOOD';
  const microLevel: LadderLevel | null = !micro ? null : micro.kind === 'histology' ? 'tissue' : micro.kind === 'central-dogma' ? 'molecule' : micro.kind === 'hyperscope' && micro.capture.request.magnification >= 500 ? 'organelle' : 'cell';
  const crumbs = [...exploreCrumbs(explore), ...(caption ? [blood ? 'Krew' : LADDER.find(([l]) => l === microLevel)?.[1] ?? 'Mikroskop'] : [])];
  const structure = explore.structure ? structureLabel(explore.organId, explore.structure, explore.system) : null;
  const atBody = explore.level === 'BODY';
  const system = BODY_SYSTEMS.find((s) => s.id === onlySystem);
  const title = caption?.title ?? structure?.label ?? organ?.label ?? (explore.regionId ? REGION_LABEL[explore.regionId] : system ? `Układ ${system.label.toLowerCase()}` : 'Ciało człowieka');
  const detail = caption?.detail ?? structure?.detail ?? organ?.role
    ?? (explore.level === 'REGION' ? 'Dotknij narządu, mięśnia, kości albo nazwy. Warstwy zdejmują to, co leży na wierzchu.' : 'Dotknij części ciała albo wybierz układ. Każdą strukturę można też wyszukać.');
  const microscopeOk = Boolean(organ?.explorerOrganId);
  const ladderOn = microscopeOk && (explore.level === 'ORGAN' || explore.level === 'STRUCTURE') && !blood;
  const currentRung: LadderLevel = microLevel ?? (explore.level === 'BODY' ? 'body' : 'organ');
  const actions: readonly (readonly [ExploreAction, string, boolean])[] = caption
    ? [['blood', 'Krew', !blood]]
    : atBody ? []
      : explore.level === 'REGION'
        ? [['section', sectionOn ? 'Zamknij przekrój' : 'Przekrój', true], ['blood', 'Krew', true]]
        : [['microscope', 'Mikroskop', microscopeOk], ['section', sectionOn ? 'Zamknij przekrój' : 'Przekrój', true], ['isolate', isolated ? 'W ciele' : 'Osobno', microscopeOk], ['blood', 'Krew', true]];
  const results = panel === 'search' ? search(query) : [];
  const toggle = (id: 'systems' | 'layers' | 'search'): void => setPanel(panel === id ? null : id);
  return (
    <div className="ax-hud" data-testid="anatomy-hud" data-level={explore.level} data-micro={micro?.kind ?? ''}>
      {!atBody && <nav className="ax-crumbs" aria-label="Gdzie jesteś">
        <button type="button" className="ax-back" onClick={onBack} data-testid="anatomy-back" aria-label="Wstecz o jeden poziom">‹ Wstecz</button>
        <ol>{crumbs.map((c, i) => <li key={`${c}-${i}`} aria-current={i === crumbs.length - 1 ? 'location' : undefined}>{c}</li>)}</ol>
      </nav>}
      <aside className="ax-rail" aria-label="Narzędzia anatomii">
        <div className="ax-tabs" role="group" aria-label="Menu anatomii">
          <button type="button" className={`ax-tab${panel === 'systems' ? ' is-on' : ''}`} aria-expanded={panel === 'systems'} onClick={() => toggle('systems')} data-testid="anatomy-tab-systems">Układy{system ? `: ${system.label}` : ''}</button>
          <button type="button" className={`ax-tab${panel === 'layers' ? ' is-on' : ''}`} aria-expanded={panel === 'layers'} onClick={() => toggle('layers')} data-testid="anatomy-tab-layers">Warstwy{peeled.length ? ` (−${peeled.length})` : ''}</button>
          <button type="button" className={`ax-tab${panel === 'search' ? ' is-on' : ''}`} aria-expanded={panel === 'search'} onClick={() => toggle('search')} data-testid="anatomy-tab-search">Szukaj</button>
        </div>
        <section className={`ax-pop${panel === 'systems' ? ' is-open' : ''}`} aria-label="Układy ciała" data-panel="systems">
          <h3>Układy ciała</h3>
          <button type="button" className={`ax-item${onlySystem === null ? ' is-on' : ''}`} onClick={() => onSystem(null)} data-testid="anatomy-system-all">Całe ciało</button>
          {BODY_SYSTEMS.map((s) => <button key={s.id} type="button" className={`ax-item${onlySystem === s.id ? ' is-on' : ''}`} aria-pressed={onlySystem === s.id} onClick={() => onSystem(onlySystem === s.id ? null : s.id)} data-testid={`anatomy-system-${s.id}`}>{s.label}</button>)}
        </section>
        <section className={`ax-pop${panel === 'layers' ? ' is-open' : ''}`} aria-label="Warstwy" data-panel="layers">
          <h3>Warstwy</h3>
          <p className="ax-note">Zdejmij warstwę, żeby zobaczyć, co leży pod nią.</p>
          {EXPLORE_LAYERS.map((l) => <button key={l.id} type="button" className={`ax-item${peeled.includes(l.id) ? ' is-off' : ' is-on'}`} aria-pressed={!peeled.includes(l.id)} onClick={() => onPeel(l.id)} data-testid={`anatomy-layer-${l.id}`}>{peeled.includes(l.id) ? `Pokaż: ${l.label.toLowerCase()}` : `Zdejmij: ${l.label.toLowerCase()}`}</button>)}
          <h3>Widok</h3>
          <span className="ax-surfaces" role="group" aria-label="Widok ciała">
            {SURFACES.map(([mode, label]) => <button key={mode} type="button" className={`ax-surf${surface === mode ? ' is-on' : ''}`} aria-pressed={surface === mode} onClick={() => onSurface(mode)} data-testid={`anatomy-surface-${mode.toLowerCase()}`}>{label}</button>)}
          </span>
        </section>
        <section className={`ax-pop${panel === 'search' ? ' is-open' : ''}`} aria-label="Wyszukaj strukturę" data-panel="search">
          <h3>Wyszukaj strukturę</h3>
          <input type="search" className="ax-search" placeholder="np. łydka, kość udowa, aorta…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Szukaj struktury" data-testid="anatomy-search" />
          <ul className="ax-results">{results.map((r) => <li key={r.name}><button type="button" className="ax-item" onClick={() => { onFind(r); setPanel(null); setQuery(''); }} data-testid="anatomy-result">{r.label}<small>{SYSTEM_PL[r.system] ?? r.system} · {REGION_LABEL[r.regionId]}</small></button></li>)}</ul>
          {panel === 'search' && query.trim().length >= 2 && results.length === 0 && <p className="ax-note">Nic nie znaleziono.</p>}
        </section>
      </aside>
      {ladderOn && <nav className="ax-ladder" aria-label="Od makro do mikro" data-testid="anatomy-ladder">
        {LADDER.map(([level, label, scale]) => <button key={level} type="button" className={`ax-rung${currentRung === level ? ' is-on' : ''}`} aria-current={currentRung === level ? 'step' : undefined} disabled={busy} onClick={() => onLadder(level)} data-testid={`anatomy-rung-${level}`}><strong>{label}</strong><small>{scale}</small></button>)}
      </nav>}
      <section className="ax-sheet" aria-live="polite" data-testid="anatomy-sheet">
        <div className="ax-name">
          <strong data-testid="anatomy-name">{title}</strong>
          {detail && <span data-testid="anatomy-detail">{detail}</span>}
        </div>
        {(actions.length > 0 || micro?.kind === 'hyperscope') && <div className="ax-row">
          {micro?.kind === 'hyperscope' && MAGNIFICATIONS.map((m) => <button key={m} type="button" className={`ax-act${micro.capture.request.magnification === m ? ' is-on' : ''}`} disabled={busy} onClick={() => onMagnify(m)} data-testid={`anatomy-mag-${m}`}>{m}×</button>)}
          {actions.filter(([, , ok]) => ok).map(([id, label]) => (
            <button key={id} type="button" className={`ax-act${id === 'microscope' ? ' is-primary' : ''}${(id === 'section' && sectionOn) || (id === 'isolate' && isolated) ? ' is-on' : ''}`} disabled={busy && id !== 'section'} onClick={() => onAction(id)} data-testid={`anatomy-${id}`}>{busy && id === 'microscope' ? 'Trwa…' : label}</button>
          ))}
        </div>}
      </section>
    </div>
  );
}

interface PlacedLabel { key: string; text: string; hit: ExploreHit; x: number; y: number }

/** Names next to the organs, following them on screen; a tap on a name selects it like a tap on the organ. */
export function AnatomyLabels({ read, onPick }: { readonly read: () => PlacedLabel[]; readonly onPick: (hit: ExploreHit) => void }): JSX.Element {
  const [labels, setLabels] = useState<PlacedLabel[]>([]);
  const last = useRef('');
  useEffect(() => {
    let raf = 0; let frame = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      if (frame++ % 3) return;
      const placed = spread(read());
      const key = placed.map((l) => `${l.key}:${Math.round(l.x)}:${Math.round(l.y)}`).join('|');
      if (key !== last.current) { last.current = key; setLabels(placed); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [read]);
  return (
    <div className="ax-labels" data-testid="anatomy-labels">
      {labels.map((l) => (
        <button key={l.key} type="button" className="ax-label" style={{ left: l.x, top: l.y }} onClick={() => onPick(l.hit)} data-testid={`anatomy-label-${l.key}`}><i aria-hidden="true" />{l.text}</button>
      ))}
    </div>
  );
}

/** Keeps names from sitting on top of each other: a later name that would overlap moves down a row. */
function spread(labels: PlacedLabel[]): PlacedLabel[] {
  const out: PlacedLabel[] = [];
  for (const l of [...labels].sort((a, b) => a.y - b.y)) {
    let y = l.y;
    for (const o of out) if (Math.abs(o.x - l.x) < 110 && Math.abs(o.y - y) < 26) y = o.y + 26;
    out.push({ ...l, y });
  }
  return out;
}
