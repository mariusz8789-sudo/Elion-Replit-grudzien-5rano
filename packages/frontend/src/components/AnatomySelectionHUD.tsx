import { useEffect, useRef, useState } from 'react';
import { BODY_SYSTEMS, EXPLORE_LAYERS, exploreOrgan, type BodyRegionId, type ExploreState } from '../core/three/anatomyExplore';
import { atlasKindName, bodySystemName, crumbsText, ladderName, layerName, organAbout, organName, organRole, regionName, structureText, tissueName, tx } from '../core/three/explorerText';
import { useLocale } from '../core/i18n';
import type { ExploreHit } from '../core/three/anatomyFocusLayer';
import type { BiologyArtifact } from '../core/scientificWorlds/biologyRunners';
import { EXPLORER_ORGANS } from '../core/scientificWorlds/humanExplorer';
import { anatomyContextOf, discoveryContextFor, epistemicOf, focusLevel, type Availability } from '../core/three/anatomyContext';
import type { CutawayState, SectionAxis } from '../core/three/humanTwinCutaway';
import type { TwinSurfaceMode } from '../core/three/humanTwinMaterials';
import { deleteView, notePlace, readNote, readViews, saveView, writeNote, type SavedView } from '../core/three/anatomyNotebook';

/**
 * ANATOMY SELECTION HUD — the small layer over the body while it is explored: a breadcrumb with Back at
 * the top, the chosen thing's name in a short sheet at the bottom, and the few actions that go deeper.
 * Nothing here covers the human; the names of the organs sit next to the organs themselves.
 */

export type ExploreAction = 'section' | 'microscope' | 'cell' | 'blood' | 'isolate' | 'vessels' | 'nerves' | 'function';
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
  /** "Zrób zdjęcie": a PNG of the current view, or null when the view cannot be captured. */
  readonly onPhoto: () => string | null;
  readonly onRestore: (view: SavedView) => void;
  /** The section plane, moved by the slider under the card while the section is on. */
  readonly section: CutawayState;
  /** LAB_WIDE: the establishing shot across the hall; only the way in is offered. */
  readonly labWide: boolean;
  readonly onApproach: () => void;
  readonly onSectionMove: (next: CutawayState) => void;
}

const SURFACES: readonly (readonly [TwinSurfaceMode, 'surfaceSkin' | 'surfaceXray' | 'surfaceGhost'])[] = [['NORMAL', 'surfaceSkin'], ['XRAY', 'surfaceXray'], ['GHOST', 'surfaceGhost']];

/** What the microscope view beside the body shows, its scale and its status — always a model. */
export function microCaption(artifact: BiologyArtifact, genericSample = false): { title: string; detail: string } | null {
  // An organ without its own tissue model shows a generic slide: say so beside it, never silently.
  const generic = genericSample ? ` · ${tx('genericSample')}` : '';
  if (artifact.kind === 'histology') {
    const tissue = artifact.slide.tissueType;
    return { title: tissue === 'BLOOD' ? tx('bloodUnder') : `${tx('tissue')}: ${tissueName(tissue)}${generic}`, detail: `${tx('scale')} ≈ 1 mm · ${tx('slide')} · ${tx('modelNotPatient')}` };
  }
  if (artifact.kind === 'hyperscope' && artifact.cell) {
    const m = artifact.capture.request.magnification;
    const tissue = artifact.cell.tissueType;
    const what = tissue === 'BLOOD' ? tx('blood') : m >= 500 ? `${tx('cellInside')}${generic}` : `${tx('cell')}: ${tissueName(tissue)}${generic}`;
    return { title: `${what} · ${m}×`, detail: `${tx('scale')} ≈ ${m >= 500 ? '1 µm' : '10 µm'} · ${tx('virtualScope')} · ${tx('modelNotPatient')}` };
  }
  return null;
}

export default function AnatomySelectionHUD({ explore, micro, isolated, sectionOn, busy, surface, onSurface, onBack, onAction, onlySystem, onSystem, peeled, onPeel, search, onFind, onLadder, onMagnify, onPhoto, onRestore, section, onSectionMove, labWide, onApproach }: AnatomySelectionHUDProps): JSX.Element | null {
  useLocale();
  const [panel, setPanel] = useState<'systems' | 'layers' | 'search' | 'save' | null>(null);
  const [query, setQuery] = useState('');
  const [showAbout, setShowAbout] = useState(false);
  const place = notePlace(explore);
  const [note, setNote] = useState(() => readNote(place));
  const [views, setViews] = useState<SavedView[]>(() => readViews());
  const [photo, setPhoto] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  useEffect(() => { setNote(readNote(place)); setSaved(''); setShowAbout(false); }, [place]);
  const organ = exploreOrgan(explore.organId);
  const genericSample = EXPLORER_ORGANS.find((o) => o.organId === exploreOrgan(explore.organId)?.explorerOrganId)?.genericSample === true;
  const caption = micro ? microCaption(micro, genericSample) : null;
  const focus = focusLevel(explore, micro);
  const epistemic = epistemicOf(focus);
  const anatomyCtx = anatomyContextOf(explore, micro);
  const discovery = discoveryContextFor(anatomyCtx);
  const targets: Availability<string> = anatomyCtx.targetIds.length ? { status: 'AVAILABLE', items: anatomyCtx.targetIds, source: 'anatomy' } : { status: 'NOT_YET_AVAILABLE' };
  const avail = (a: Availability<string>): string => a.status === 'AVAILABLE' ? a.items.join(', ') : a.status === 'NOT_YET_MEASURED' ? tx('notYetMeasured') : tx('notYetAvailable');
  const blood = micro?.kind === 'histology' ? micro.slide.tissueType === 'BLOOD' : micro?.kind === 'hyperscope' && micro.cell?.tissueType === 'BLOOD';
  const microLevel: LadderLevel | null = !micro ? null : micro.kind === 'histology' ? 'tissue' : micro.kind === 'central-dogma' ? 'molecule' : micro.kind === 'hyperscope' && micro.capture.request.magnification >= 500 ? 'organelle' : 'cell';
  const crumbs = [...(explore.level === 'BODY' ? [tx('lab')] : []), ...crumbsText(explore), ...(caption ? [blood ? tx('blood') : microLevel ? ladderName(microLevel, tx('microscope')) : tx('microscope')] : [])];
  const structure = explore.structure ? structureText(explore.organId, explore.structure, explore.system) : null;
  const atBody = explore.level === 'BODY';
  const system = BODY_SYSTEMS.find((s) => s.id === onlySystem);
  const title = caption?.title ?? structure?.label ?? (organ ? organName(organ.id) : null) ?? (explore.regionId ? regionName(explore.regionId) : system ? `${tx('systemPrefix')} ${bodySystemName(system.id, system.label).toLowerCase()}` : tx('humanBody'));
  const about = organ ? organAbout(organ.id) ?? undefined : undefined;
  const subtitle = caption ? null : structure && organ ? organName(organ.id) : about?.system ?? (structure && explore.system ? atlasKindName(explore.system) : null);
  const detail = caption?.detail ?? (showAbout && about && !structure ? about.about : null) ?? structure?.detail ?? (organ ? organRole(organ.id) : null)
    ?? (explore.level === 'REGION' ? tx('hintRegion') : tx('hintBody'));
  const microscopeOk = Boolean(organ?.explorerOrganId);
  const ladderOn = microscopeOk && (explore.level === 'ORGAN' || explore.level === 'STRUCTURE') && !blood;
  const currentRung: LadderLevel = microLevel ?? (explore.level === 'BODY' ? 'body' : 'organ');
  const actions: readonly (readonly [ExploreAction, string, boolean])[] = caption
    ? [['blood', tx('blood'), !blood]]
    : atBody ? []
      : explore.level === 'REGION'
        ? [['section', sectionOn ? tx('closeSection') : tx('section'), true], ['blood', tx('blood'), true]]
        : [['microscope', tx('histology'), microscopeOk], ['isolate', isolated ? tx('inBody') : tx('view3d'), microscopeOk], ['section', sectionOn ? tx('closeSection') : tx('section'), true],
          ['vessels', tx('vessels'), true], ['nerves', tx('nerves'), true], ['function', tx('function'), Boolean(about) && !structure], ['blood', tx('blood'), true]];
  const isOn = (id: ExploreAction): boolean => (id === 'section' && sectionOn) || (id === 'isolate' && isolated)
    || (id === 'vessels' && onlySystem === 'circulatory') || (id === 'nerves' && onlySystem === 'nervous') || (id === 'function' && showAbout);
  const act = (id: ExploreAction): void => {
    if (id === 'vessels') { onSystem(onlySystem === 'circulatory' ? null : 'circulatory'); return; }
    if (id === 'nerves') { onSystem(onlySystem === 'nervous' ? null : 'nervous'); return; }
    if (id === 'function') { setShowAbout(!showAbout); return; }
    onAction(id);
  };
  const takePhoto = (): void => {
    const png = onPhoto();
    setPhoto(png);
    setSaved(png ? tx('photoReady') : tx('photoFailed'));
  };
  const keepView = (): void => {
    setViews(saveView({ title: crumbs.join(' › '), explore, onlySystem, peeled }));
    setSaved(tx('viewSaved'));
  };
  const results = panel === 'search' ? search(query) : [];
  const toggle = (id: 'systems' | 'layers' | 'search' | 'save'): void => setPanel(panel === id ? null : id);
  if (labWide) return (
    <div className="ax-hud" data-testid="anatomy-hud" data-level="LAB" data-focus="LAB_WIDE" data-micro="">
      <section className="ax-sheet" aria-live="polite" data-testid="anatomy-sheet">
        <div className="ax-name">
          <strong data-testid="anatomy-name">{tx('labTitle')}</strong>
          <span data-testid="anatomy-detail">{tx('labHint')}</span>
        </div>
        <div className="ax-row"><button type="button" className="ax-act is-primary" onClick={onApproach} data-testid="anatomy-approach">{tx('approach')}</button></div>
      </section>
    </div>
  );
  return (
    <div className="ax-hud" data-testid="anatomy-hud" data-level={explore.level} data-focus={focus} data-micro={micro?.kind ?? ''}>
      {<nav className="ax-crumbs" aria-label={tx('whereAmI')}>
        <button type="button" className="ax-back" onClick={onBack} data-testid="anatomy-back" aria-label={tx('backAria')}>{tx('back')}</button>
        <ol>{crumbs.map((c, i) => <li key={`${c}-${i}`} aria-current={i === crumbs.length - 1 ? 'location' : undefined}>{c}</li>)}</ol>
      </nav>}
      <aside className="ax-rail" aria-label={tx('tools')}>
        <div className="ax-tabs" role="group" aria-label={tx('menu')}>
          <button type="button" className={`ax-tab${panel === 'systems' ? ' is-on' : ''}`} aria-expanded={panel === 'systems'} onClick={() => toggle('systems')} data-testid="anatomy-tab-systems">{tx('systems')}{system ? `: ${bodySystemName(system.id, system.label)}` : ''}</button>
          <button type="button" className={`ax-tab${panel === 'layers' ? ' is-on' : ''}`} aria-expanded={panel === 'layers'} onClick={() => toggle('layers')} data-testid="anatomy-tab-layers">{tx('layers')}{peeled.length ? ` (−${peeled.length})` : ''}</button>
          <button type="button" className={`ax-tab${panel === 'search' ? ' is-on' : ''}`} aria-expanded={panel === 'search'} onClick={() => toggle('search')} data-testid="anatomy-tab-search">{tx('search')}</button>
          <button type="button" className={`ax-tab${panel === 'save' ? ' is-on' : ''}`} aria-expanded={panel === 'save'} onClick={() => toggle('save')} data-testid="anatomy-tab-save">{tx('notes')}</button>
        </div>
        <section className={`ax-pop${panel === 'systems' ? ' is-open' : ''}`} aria-label={tx('bodySystems')} data-panel="systems">
          <h3>{tx('bodySystems')}</h3>
          <button type="button" className={`ax-item${onlySystem === null ? ' is-on' : ''}`} onClick={() => onSystem(null)} data-testid="anatomy-system-all">{tx('wholeBody')}</button>
          {BODY_SYSTEMS.map((s) => <button key={s.id} type="button" className={`ax-item${onlySystem === s.id ? ' is-on' : ''}`} aria-pressed={onlySystem === s.id} onClick={() => onSystem(onlySystem === s.id ? null : s.id)} data-testid={`anatomy-system-${s.id}`}>{bodySystemName(s.id, s.label)}</button>)}
        </section>
        <section className={`ax-pop${panel === 'layers' ? ' is-open' : ''}`} aria-label={tx('layers')} data-panel="layers">
          <h3>{tx('layers')}</h3>
          <p className="ax-note">{tx('layersNote')}</p>
          {EXPLORE_LAYERS.map((l) => <button key={l.id} type="button" className={`ax-item${peeled.includes(l.id) ? ' is-off' : ' is-on'}`} aria-pressed={!peeled.includes(l.id)} onClick={() => onPeel(l.id)} data-testid={`anatomy-layer-${l.id}`}>{`${peeled.includes(l.id) ? tx('show') : tx('remove')}: ${layerName(l.id, l.label)}`}</button>)}
          <h3>{tx('view')}</h3>
          <span className="ax-surfaces" role="group" aria-label={tx('view')}>
            {SURFACES.map(([mode, key]) => <button key={mode} type="button" className={`ax-surf${surface === mode ? ' is-on' : ''}`} aria-pressed={surface === mode} onClick={() => onSurface(mode)} data-testid={`anatomy-surface-${mode.toLowerCase()}`}>{tx(key)}</button>)}
          </span>
        </section>
        <section className={`ax-pop${panel === 'search' ? ' is-open' : ''}`} aria-label={tx('searchTitle')} data-panel="search">
          <h3>{tx('searchTitle')}</h3>
          <input type="search" className="ax-search" placeholder={tx('searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={tx('searchTitle')} data-testid="anatomy-search" />
          <ul className="ax-results">{results.map((r) => <li key={r.name}><button type="button" className="ax-item" onClick={() => { onFind(r); setPanel(null); setQuery(''); }} data-testid="anatomy-result">{r.label}<small>{atlasKindName(r.system)} · {regionName(r.regionId)}</small></button></li>)}</ul>
          {panel === 'search' && query.trim().length >= 2 && results.length === 0 && <p className="ax-note">{tx('nothingFound')}</p>}
        </section>
        <section className={`ax-pop${panel === 'save' ? ' is-open' : ''}`} aria-label={tx('notes')} data-panel="save">
          <h3>{tx('addNote')}</h3>
          <textarea className="ax-note-input" rows={3} placeholder={`${tx('notePlaceholder')}: ${title}`} value={note} onChange={(e) => setNote(e.target.value)} aria-label={tx('addNote')} data-testid="anatomy-note" />
          <span className="ax-surfaces">
            <button type="button" className="ax-surf" onClick={() => setSaved(writeNote(place, note) ? tx('noteSaved') : tx('cannotSave'))} data-testid="anatomy-note-save">{tx('saveNote')}</button>
            <button type="button" className="ax-surf" onClick={keepView} data-testid="anatomy-view-save">{tx('saveView')}</button>
            <button type="button" className="ax-surf" onClick={takePhoto} data-testid="anatomy-photo">{tx('takePhoto')}</button>
          </span>
          {saved && <p className="ax-note" role="status" data-testid="anatomy-saved">{saved}</p>}
          {photo && <a className="ax-photo" href={photo} download={`genesis-${title.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.png`} data-testid="anatomy-photo-link"><img src={photo} alt={title} />{tx('downloadPhoto')}</a>}
          {views.length > 0 && <><h3>{tx('savedViews')}</h3>
            <ul className="ax-results">{views.map((v) => <li key={v.id} className="ax-view">
              <button type="button" className="ax-item" onClick={() => { onRestore(v); setPanel(null); }} data-testid="anatomy-view">{v.title}<small>{new Date(v.savedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</small></button>
              <button type="button" className="ax-x" aria-label={`${tx('deleteView')}: ${v.title}`} onClick={() => setViews(deleteView(v.id))}>×</button>
            </li>)}</ul></>}
        </section>
      </aside>
      {ladderOn && <nav className="ax-ladder" aria-label={tx('macroToMicro')} data-testid="anatomy-ladder">
        {LADDER.map(([level, label, scale]) => <button key={level} type="button" className={`ax-rung${currentRung === level ? ' is-on' : ''}`} aria-current={currentRung === level ? 'step' : undefined} disabled={busy} onClick={() => onLadder(level)} data-testid={`anatomy-rung-${level}`}><strong>{ladderName(level, label)}</strong><small>{scale}</small></button>)}
      </nav>}
      <section className="ax-sheet" aria-live="polite" data-testid="anatomy-sheet">
        <div className="ax-name">
          <strong data-testid="anatomy-name">{title}<b className="ax-epi" data-epistemic={epistemic} data-testid="anatomy-epistemic">{tx(`epi${epistemic}`)}</b></strong>
          {subtitle && <em data-testid="anatomy-system">{subtitle}</em>}
          {detail && <span data-testid="anatomy-detail">{detail}</span>}
        </div>
        {(actions.length > 0 || micro?.kind === 'hyperscope') && <div className="ax-row">
          {micro?.kind === 'hyperscope' && MAGNIFICATIONS.map((m) => <button key={m} type="button" className={`ax-act${micro.capture.request.magnification === m ? ' is-on' : ''}`} disabled={busy} onClick={() => onMagnify(m)} data-testid={`anatomy-mag-${m}`}>{m}×</button>)}
          {actions.filter(([, , ok]) => ok).map(([id, label]) => (
            <button key={id} type="button" className={`ax-act${id === 'microscope' ? ' is-primary' : ''}${isOn(id) ? ' is-on' : ''}`} aria-pressed={isOn(id)} disabled={busy && (id === 'microscope' || id === 'blood' || id === 'isolate')} onClick={() => act(id)} data-testid={`anatomy-${id}`}>{busy && id === 'microscope' ? tx('working') : label}</button>
          ))}
        </div>}
        {sectionOn && <div className="ax-section" data-testid="anatomy-section-controls">
          <span className="ax-surfaces" role="group" aria-label={tx('section')}>
            {(['SAGITTAL', 'CORONAL', 'AXIAL'] as const satisfies readonly SectionAxis[]).map((a) => <button key={a} type="button" className={`ax-surf${section.axis === a ? ' is-on' : ''}`} aria-pressed={section.axis === a} onClick={() => onSectionMove({ ...section, axis: a })} data-testid={`anatomy-axis-${a.toLowerCase()}`}>{tx(`axis${a}`)}</button>)}
          </span>
          <label className="ax-slider">{tx('sectionWhere')}
            <input type="range" min={0.05} max={0.95} step={0.01} value={section.position} onChange={(e) => onSectionMove({ ...section, position: Number(e.target.value) })} data-testid="anatomy-section-slider" />
          </label>
        </div>}
        {(focus !== 'BODY' && focus !== 'REGION') && <details className="ax-discovery" data-testid="anatomy-discovery">
          <summary>{tx('toDrug')}</summary>
          <dl>
            {([['dTargets', targets], ['dCandidates', discovery.candidateIds], ['dPredictions', discovery.predictions], ['dExperiments', discovery.experimentIds], ['dMeasurements', discovery.measurementIds]] as const).map(([k, a]) => <div key={k}><dt>{tx(k)}</dt><dd data-status={a.status}>{avail(a)}</dd></div>)}
          </dl>
          <p className="ax-note">{tx('toDrugNote')}</p>
        </details>}
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
