import { useEffect, useRef, useState } from 'react';
import { exploreCrumbs, exploreOrgan, REGION_LABEL, structureLabel, type ExploreState } from '../core/three/anatomyExplore';
import type { ExploreHit } from '../core/three/anatomyFocusLayer';
import type { BiologyArtifact } from '../core/scientificWorlds/biologyRunners';
import type { TwinSurfaceMode } from '../core/three/humanTwinMaterials';

/**
 * ANATOMY SELECTION HUD — the small layer over the body while it is explored: a breadcrumb with Back at
 * the top, the chosen thing's name in a short sheet at the bottom, and the few actions that go deeper.
 * Nothing here covers the human; the names of the organs sit next to the organs themselves.
 */

export type ExploreAction = 'section' | 'microscope' | 'cell' | 'blood' | 'isolate';

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

export default function AnatomySelectionHUD({ explore, micro, isolated, sectionOn, busy, surface, onSurface, onBack, onAction }: AnatomySelectionHUDProps): JSX.Element | null {
  const organ = exploreOrgan(explore.organId);
  const caption = micro ? microCaption(micro) : null;
  const blood = micro?.kind === 'histology' ? micro.slide.tissueType === 'BLOOD' : micro?.kind === 'hyperscope' && micro.cell?.tissueType === 'BLOOD';
  const crumbs = [...exploreCrumbs(explore), ...(caption ? [blood ? 'Krew' : micro?.kind === 'histology' ? 'Tkanka' : 'Komórka'] : [])];
  const structure = explore.structure ? structureLabel(explore.organId, explore.structure) : null;
  const title = caption?.title ?? structure?.label ?? organ?.label ?? (explore.regionId ? REGION_LABEL[explore.regionId] : 'Ciało');
  const detail = caption?.detail ?? structure?.detail ?? organ?.role
    ?? (explore.level === 'REGION' ? 'Dotknij narządu albo jego nazwy.' : null);
  const microscopeOk = Boolean(organ?.explorerOrganId);
  const actions: readonly (readonly [ExploreAction, string, boolean])[] = caption
    ? [['cell', micro?.kind === 'histology' ? 'Komórka' : 'Bliżej', micro?.kind !== 'hyperscope' || (micro.capture.request.magnification < 500)], ['blood', 'Krew', true]]
    : explore.level === 'REGION'
      ? [['section', sectionOn ? 'Zamknij przekrój' : 'Przekrój', true], ['blood', 'Krew', true]]
      : [['microscope', 'Mikroskop', microscopeOk], ['section', sectionOn ? 'Zamknij przekrój' : 'Przekrój', true], ['isolate', isolated ? 'W ciele' : 'Osobno', microscopeOk], ['blood', 'Krew', true]];
  return (
    <div className="ax-hud" data-testid="anatomy-hud" data-level={explore.level} data-micro={micro?.kind ?? ''}>
      <nav className="ax-crumbs" aria-label="Gdzie jesteś">
        <button type="button" className="ax-back" onClick={onBack} data-testid="anatomy-back" aria-label="Wstecz o jeden poziom">‹ Wstecz</button>
        <ol>{crumbs.map((c, i) => <li key={`${c}-${i}`} aria-current={i === crumbs.length - 1 ? 'location' : undefined}>{c}</li>)}</ol>
      </nav>
      <section className="ax-sheet" aria-live="polite" data-testid="anatomy-sheet">
        <div className="ax-name">
          <strong data-testid="anatomy-name">{title}</strong>
          {detail && <span data-testid="anatomy-detail">{detail}</span>}
        </div>
        <div className="ax-row">
          {actions.filter(([, , ok]) => ok).map(([id, label]) => (
            <button key={id} type="button" className={`ax-act${id === 'microscope' || id === 'cell' ? ' is-primary' : ''}${(id === 'section' && sectionOn) || (id === 'isolate' && isolated) ? ' is-on' : ''}`} disabled={busy && id !== 'section'} onClick={() => onAction(id)} data-testid={`anatomy-${id}`}>{busy && (id === 'microscope' || id === 'cell') ? 'Trwa…' : label}</button>
          ))}
          {!caption && <span className="ax-surfaces" role="group" aria-label="Widok ciała">
            {SURFACES.map(([mode, label]) => <button key={mode} type="button" className={`ax-surf${surface === mode ? ' is-on' : ''}`} aria-pressed={surface === mode} onClick={() => onSurface(mode)} data-testid={`anatomy-surface-${mode.toLowerCase()}`}>{label}</button>)}
          </span>}
        </div>
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
