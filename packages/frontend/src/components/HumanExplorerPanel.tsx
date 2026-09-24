import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { t, getLocale } from '../core/i18n';
import { drawBiologyArtifact } from '../core/three/biologyStationKit';
import type { BiologyArtifact } from '../core/scientificWorlds/biologyRunners';
import type { ExperimentSession } from '../core/scientificWorlds/experimentSession';
import type { AnatomyViewState, HumanDigitalTwinManifest, OrganSystemId } from '../core/scientificWorlds/humanLab/types';
import { organsInSystem } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { BIOLOGY_WORLD_ID } from '../core/scientificWorlds/biologyLabWorld';
import { VIRTUAL_MICROSCOPE_MAGNIFICATIONS } from '../core/scientificWorlds/humanLab/virtualMicroscope';
import { EXPLORER_ORGANS, SCALE_LADDER, SCALE_TEXT, bloodMagnificationCommands, explorerCommands, explorerPath, explorerTruthLabel, levelLabel, levelOfSession, magnificationCommands, systemCommands, type ExplorerOrgan, type ScaleLevel } from '../core/scientificWorlds/humanExplorer';
import type { WorldCommand } from '../core/scientificWorlds/worldCommand';
import { SECTION_AXIS_LABEL_PL, type CutawayState, type SectionAxis } from '../core/three/humanTwinCutaway';
import type { TwinSurfaceMode } from '../core/three/humanTwinMaterials';
import { HUMAN_VISUAL_QUALITY_PROFILE } from '../core/three/humanMacroMicroLayer';
import { BODYPARTS3D_ATTRIBUTION, type ReferenceAnatomyState } from '../core/three/bodyParts3dPilot';
import { runLungExposureModel, type LungExposure, type LungTimelineYears } from '../labs/experiments/biology-lung-exposure';
import { PREVENTION_STAGES, runPreventionEducation, type PreventionStage, type PreventionTarget, type PreventionTopic } from '../labs/experiments/preventionLabCatalog';
import { HumanExperimentSessionInspector } from './HumanExperimentSessionInspector';
import './HumanExplorerHero.css';

/**
 * HUMAN EXPLORER PANEL (D-130) — the reference UI's four blocks over the
 * existing biology scene, as DOM (no second renderer): the body-systems
 * rail, the organ card (atlas data), the magnification ladder and the
 * macro → micro strip. Every click becomes canonical WorldCommands for the
 * agent (the same bus as the command bar), every image is drawn from the
 * last SEALED session with the same drawer the station screens use, and
 * every level carries its evidence label. Nothing is a stock picture: with
 * no session the microscope shows its empty state.
 */
export interface HumanExplorerPanelProps {
  readonly subjectBounds?: { left: number; right: number; top: number; bottom: number } | null;
  readonly researchControls?: ReactNode;
  readonly manifest: HumanDigitalTwinManifest;
  /** D-131: the live section state, owned by the screen (the V3 anatomy state remains the single source of truth). */
  readonly cutaway: CutawayState;
  readonly onCutaway: (next: CutawayState) => void;
  /** D-131: isolate the selected organ (empty list clears it). */
  readonly isolated: readonly string[];
  readonly onIsolate: (nodeIds: readonly string[]) => void;
  /** What the body is made of — a licensed asset or the proxy. Anatomy stays MODEL either way. */
  readonly twinTier: 'LICENSED_CC0_ASSET' | 'PROXY';
  /** D-131: is the camera framing the twin? Both agent cameras leave the body a distant figure in its chamber. */
  readonly twinCamera: boolean;
  readonly onTwinCamera: (on: boolean) => void;
  /** D-131: how the BODY shell is drawn. X-ray here is a stylised view of a model, never a radiograph. */
  readonly surface: TwinSurfaceMode;
  readonly onSurface: (mode: TwinSurfaceMode) => void;
  readonly anatomy: AnatomyViewState;
  readonly artifact: BiologyArtifact | null;
  readonly session: ExperimentSession | null;
  readonly sessions: readonly ExperimentSession[];
  readonly busy: boolean;
  readonly onCommands: (commands: readonly WorldCommand[], label: string, logicalTime: number) => void;
  readonly nextLogicalTime: () => number;
  /** BodyParts3D pilot: which atlas nodes are drawn from the approved reference atlas (generic, never a patient). */
  readonly referenceAnatomy?: ReferenceAnatomyState;
}

const SYSTEM_LABEL_PL: Readonly<Record<OrganSystemId, string>> = { INTEGUMENTARY: 'Skórny', SKELETAL: 'Szkieletowy', MUSCULAR: 'Mięśniowy', NERVOUS: 'Nerwowy', ENDOCRINE: 'Dokrewny', CARDIOVASCULAR: 'Krążenia', LYMPHATIC: 'Limfatyczny', RESPIRATORY: 'Oddechowy', DIGESTIVE: 'Pokarmowy', URINARY: 'Moczowy', REPRODUCTIVE: 'Rozrodczy', IMMUNE: 'Immunologiczny' };
/** D-131: the four body-shell presentations. `RTG (model)` names itself a model so the chip can never read as a radiograph. */
const SURFACE_MODES: readonly (readonly [TwinSurfaceMode, string])[] = [['NORMAL', 'Skóra'], ['TRANSLUCENT', 'Prześwit'], ['XRAY', 'RTG (model)'], ['GHOST', 'Duch']];
const IMAGE_KINDS: ReadonlySet<BiologyArtifact['kind']> = new Set(['hyperscope', 'histology', 'imaging', 'central-dogma', 'neuro']);
const PREVENTION_TOPICS: readonly PreventionTopic[] = ['cigarette', 'vaping', 'alcohol', 'cannabis', 'harmful-drugs'];
const PREVENTION_TARGETS: readonly PreventionTarget[] = ['lungs', 'heart', 'brain', 'liver', 'whole-body'];
const PREVENTION_TARGET_LABEL_PL: Readonly<Record<PreventionTarget, string>> = { lungs: 'płuca', heart: 'serce', brain: 'mózg', liver: 'wątroba', 'whole-body': 'organizm' };

export default function HumanExplorerPanel({ manifest, anatomy, artifact, session, sessions, busy, onCommands, nextLogicalTime, cutaway, onCutaway, isolated, onIsolate, twinTier, twinCamera, onTwinCamera, surface, onSurface, researchControls, subjectBounds, referenceAnatomy }: HumanExplorerPanelProps): JSX.Element {
  const locale = getLocale();
  const initialQuery = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const initialBlood = initialQuery.get('specimen') === 'blood';
  const initialLungSimulation = initialQuery.get('simulation') === 'lung-exposure';
  const initialPreventionSimulation = initialQuery.get('simulation') === 'prevention-lab';
  const initialExposure = (['healthy', 'cigarette', 'vaping', 'cannabis'].includes(initialQuery.get('exposure') ?? '') ? initialQuery.get('exposure') : 'cigarette') as LungExposure;
  const initialYears = ([1, 5, 10].includes(Number(initialQuery.get('years'))) ? Number(initialQuery.get('years')) : 1) as LungTimelineYears;
  const initialPreventionTopic = (PREVENTION_TOPICS.includes(initialQuery.get('topic') as PreventionTopic) ? initialQuery.get('topic') : 'cigarette') as PreventionTopic;
  const initialPreventionTarget = (PREVENTION_TARGETS.includes(initialQuery.get('target') as PreventionTarget) ? initialQuery.get('target') : 'lungs') as PreventionTarget;
  const initialPreventionStage = (PREVENTION_STAGES.includes(initialQuery.get('stage') as PreventionStage) ? initialQuery.get('stage') : 'short-term') as PreventionStage;
  const [lungSimulation, setLungSimulation] = useState(initialLungSimulation);
  const [lungExposure, setLungExposure] = useState<LungExposure>(initialExposure);
  const [lungYears, setLungYears] = useState<LungTimelineYears>(initialYears);
  const [preventionSimulation, setPreventionSimulation] = useState(initialPreventionSimulation);
  const [preventionTopic, setPreventionTopic] = useState<PreventionTopic>(initialPreventionTopic);
  const [preventionTarget, setPreventionTarget] = useState<PreventionTarget>(initialPreventionTarget);
  const [preventionStage, setPreventionStage] = useState<PreventionStage>(initialPreventionStage);
  const [inspectorOpen, setInspectorOpen] = useState(initialBlood);
  const [peek, setPeek] = useState<'closed' | 'hover' | 'pinned'>('closed');
  const [search, setSearch] = useState('');
  const heroRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent | KeyboardEvent): void => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof PointerEvent && (event.target as Element)?.closest('.human-context, .human-subject-target')) return;
      setPeek('closed');
    };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss); };
  }, []);
  const [activeTab, setActiveTab] = useState<'explore' | 'microscope' | 'section' | 'research'>(initialBlood ? 'microscope' : 'explore');
  const [microscopeSpecimen, setMicroscopeSpecimen] = useState<'selected-tissue' | 'blood'>(initialBlood ? 'blood' : 'selected-tissue');
  const organs = useMemo(() => manifest.nodes.filter((n) => n.kind === 'ORGAN'), [manifest]);
  const [system, setSystem] = useState<OrganSystemId | null>(null);
  const [organId, setOrganId] = useState<string>(() => (anatomy.selectedNodeId && organs.some((o) => o.id === anatomy.selectedNodeId) ? anatomy.selectedNodeId : 'heart'));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (anatomy.selectedNodeId && organs.some((o) => o.id === anatomy.selectedNodeId)) setOrganId(anatomy.selectedNodeId); }, [anatomy.selectedNodeId, organs]);
  useEffect(() => {
    const syncFromRoute = (event?: Event): void => {
      const routeHash = event instanceof CustomEvent && typeof event.detail === 'string' ? event.detail : window.location.hash;
      const query = new URLSearchParams(routeHash.split('?')[1] ?? '');
      const exposure = query.get('exposure');
      const years = Number(query.get('years'));
      const topic = query.get('topic') as PreventionTopic;
      const target = query.get('target') as PreventionTarget;
      const stage = query.get('stage') as PreventionStage;
      setLungSimulation(query.get('simulation') === 'lung-exposure');
      setPreventionSimulation(query.get('simulation') === 'prevention-lab');
      if (['healthy', 'cigarette', 'vaping', 'cannabis'].includes(exposure ?? '')) setLungExposure(exposure as LungExposure);
      if ([1, 5, 10].includes(years)) setLungYears(years as LungTimelineYears);
      if (PREVENTION_TOPICS.includes(topic)) setPreventionTopic(topic);
      if (PREVENTION_TARGETS.includes(target)) setPreventionTarget(target);
      if (PREVENTION_STAGES.includes(stage)) setPreventionStage(stage);
    };
    window.addEventListener('hashchange', syncFromRoute);
    window.addEventListener('genesis-product-route', syncFromRoute);
    return () => {
      window.removeEventListener('hashchange', syncFromRoute);
      window.removeEventListener('genesis-product-route', syncFromRoute);
    };
  }, []);
  const selectedNode = manifest.nodes.find((node) => node.id === anatomy.selectedNodeId);
  useEffect(() => { setSystem(selectedNode?.kind === 'SYSTEM' ? selectedNode.system ?? null : null); }, [selectedNode]);

  const organ = organs.find((o) => o.id === organId) ?? organs[0];
  const explorer: ExplorerOrgan | undefined = EXPLORER_ORGANS.find((e) => e.organId === organ?.id);
  const visibleOrgans = (system ? organsInSystem(manifest, `system:${system.toLowerCase()}`) : organs).filter(o => `${o.label} ${o.latinLabel}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const magnification = session?.experimentId === 'hyperscope-capture' && typeof session.outputs.magnification === 'number' ? session.outputs.magnification : null;
  const level: ScaleLevel = selectedNode?.kind === 'BODY' ? 'body' : selectedNode?.kind === 'SYSTEM' ? 'organ_system'
    : levelOfSession(session?.experimentId ?? null, magnification, selectedNode?.kind === 'ORGAN', session?.inputs.explorerLevel);
  const path = explorer ? explorerPath(explorer, level, manifest) : [];
  const evidenceMode = path.at(-1)?.evidenceMode ?? 'ILLUSTRATIVE';
  const imageSession = artifact && session ? session : null;
  const referenceNodes = referenceAnatomy?.nodes ?? {};
  const reference = organ ? referenceNodes[organ.id] ?? null : null;
  const referenceShown = Object.keys(referenceNodes).length > 0;
  const lungModel = lungSimulation ? runLungExposureModel(lungExposure, lungYears) : null;
  const preventionModel = preventionSimulation ? runPreventionEducation(preventionTopic, preventionTarget, preventionStage) : null;
  const setLungTimeline = (years: LungTimelineYears): void => {
    setLungYears(years);
    const [path, query = ''] = window.location.hash.split('?');
    const next = new URLSearchParams(query); next.set('years', String(years)); next.set('exposure', lungExposure);
    window.history.replaceState(null, '', `${path}?${next.toString()}`);
  };
  const setPreventionTimeline = (stage: PreventionStage): void => {
    setPreventionStage(stage);
    const [path, query = ''] = window.location.hash.split('?');
    const next = new URLSearchParams(query); next.set('stage', stage);
    window.history.replaceState(null, '', `${path}?${next.toString()}`);
  };

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (artifact && IMAGE_KINDS.has(artifact.kind)) drawBiologyArtifact({ ctx, canvas, texture: { needsUpdate: false } }, artifact, manifest);
  }, [artifact, manifest]);

  const run = (commands: readonly WorldCommand[], label: string): void => { onCommands(commands, label, commands[0]?.requestedAtLogicalTime ?? 0); };
  const zoom = (target: ScaleLevel): void => {
    if (!explorer) return;
    const lt = nextLogicalTime(); const label = `${t('explorer.zoom', locale)}: ${t(explorer.labelKey, locale)} → ${levelLabel(target, locale)}`;
    run(explorerCommands(explorer, target, label, lt, { manifest, selectedNodeId: anatomy.selectedNodeId, sessions, worldId: BIOLOGY_WORLD_ID, seed: 7 }), label);
  };
  const magnify = (m: number): void => {
    if (!explorer && microscopeSpecimen !== 'blood') return;
    const lt = nextLogicalTime();
    const label = microscopeSpecimen === 'blood' ? `Mikroskop ${m}× · krew (model referencyjny)` : `${t('explorer.hyperscope', locale)} ${m}× · ${t(explorer!.labelKey, locale)}`;
    run(microscopeSpecimen === 'blood' ? bloodMagnificationCommands(m, label, lt) : magnificationCommands(explorer!, m, label, lt), label);
  };
  const pickSystem = (s: OrganSystemId): void => { const lt = nextLogicalTime(); const label = `${t('explorer.systems', locale)}: ${SYSTEM_LABEL_PL[s]}`; run(systemCommands(s, label, lt), label); };

  return (
    <section ref={heroRef} className={`sw-hud sw-hud-explorer human-hero${inspectorOpen ? ' has-inspector' : peek !== 'closed' ? ' has-context' : ''}`} aria-label="Human Explorer" data-testid="sw-explorer" data-level={level} data-selected-node={anatomy.selectedNodeId} data-evidence-mode={evidenceMode} data-visual-quality={HUMAN_VISUAL_QUALITY_PROFILE.tier} data-anatomical-precision={HUMAN_VISUAL_QUALITY_PROFILE.anatomicalPrecision}>
      {subjectBounds && !inspectorOpen && <button type="button" className="human-subject-target" data-testid="human-subject-target" data-subject-bounds={JSON.stringify(subjectBounds)} style={{ left: `clamp(8px, ${subjectBounds.right - (heroRef.current?.offsetLeft ?? 0) + 10}px, calc(100% - 46px))`, top: `clamp(240px, ${(subjectBounds.top + subjectBounds.bottom) / 2}px, calc(100% - 200px))` }} aria-label={`Informacje o modelu: ${level === 'body' ? 'ciało człowieka' : organ?.label}`} aria-expanded={peek !== 'closed'} onPointerEnter={event => { if (event.pointerType === 'mouse' && peek !== 'pinned') setPeek('hover'); }} onPointerLeave={() => { if (peek === 'hover') setPeek('closed'); }} onFocus={() => { if (peek !== 'pinned') setPeek('hover'); }} onBlur={() => { if (peek === 'hover') setPeek('closed'); }} onClick={() => setPeek(peek === 'pinned' ? 'closed' : 'pinned')}>+</button>}
      {peek !== 'closed' && !inspectorOpen && <aside className={`human-context${subjectBounds && subjectBounds.right > (heroRef.current?.parentElement?.clientWidth ?? 1440) - 300 ? ' is-left' : ''}`} data-testid="human-context" aria-label="Wybrany model">
        <button type="button" className="human-context-close" aria-label="Zamknij informacje" onClick={() => setPeek('closed')}>×</button>
        <strong>{level === 'body' ? 'Ciało człowieka' : organ?.label}</strong>
        <span>{level === 'body' ? 'Anatomia' : organ?.system ? SYSTEM_LABEL_PL[organ.system] : 'Struktura'} · {SCALE_TEXT[level]}</span>
        {reference && level !== 'body'
          ? <small data-testid="human-context-reference">REFERENCE_ATLAS · BodyParts3D {reference.fmaId} · model ogólny, nie pacjent</small>
          : <small>ILLUSTRATIVE_MODEL · geometria poglądowa</small>}
        <button type="button" className="human-context-action" onClick={() => { setInspectorOpen(true); setActiveTab('explore'); setPeek('closed'); }}>Otwórz instrumenty →</button>
      </aside>}
      <div className="human-hero-heading">
        <span className="human-eyebrow">GENESIS / HUMAN EXPLORER</span>
        <h1>{level === 'body' ? 'Człowiek.' : levelLabel(level, locale)}</h1>
        <p>{level === 'body' ? 'Od całego ciała do jego najmniejszych struktur.' : `${organ?.label ?? 'Anatomia'} · ${SCALE_TEXT[level]}`}</p>
        <span className="human-model-label">Model edukacyjny · bez danych pacjenta</span>
        {referenceShown && <span className="human-model-label human-reference-attribution" data-testid="bp3d-attribution" data-status={referenceAnatomy?.status} data-lod={referenceAnatomy?.lod ?? ''} data-nodes={Object.keys(referenceNodes).sort().join(',')} data-diagnostics={JSON.stringify(referenceAnatomy?.diagnostics ?? [])}>{BODYPARTS3D_ATTRIBUTION}</span>}
      </div>
      {lungModel && <aside className="human-lung-compare" data-testid="human-lung-exposure" data-exposure={lungExposure} data-years={lungYears}>
        <header><span>MODEL</span><span>EDUCATIONAL SIMULATION</span><span>NOT CLINICAL DIAGNOSIS</span></header>
        <h2>Zdrowe płuca <b>vs</b> {lungExposure === 'cigarette' ? 'palenie papierosów' : lungExposure === 'vaping' ? 'e-papierosy' : lungExposure === 'cannabis' ? 'palenie marihuany' : 'punkt odniesienia'}</h2>
        <div className="human-lung-panels" aria-label="Porównanie płuc">
          <div className="human-lung-panel is-healthy"><i aria-hidden="true">◖ ◗</i><strong>Zdrowe</strong><small>referencyjny model</small></div>
          <div className="human-lung-panel is-exposed" style={{ '--lung-impact': lungModel.visualSeverity } as CSSProperties}><i aria-hidden="true">◖ ◗</i><strong>Ekspozycja</strong><small>{lungModel.evidenceStrength.replaceAll('_', ' ')}</small></div>
        </div>
        <div className="human-lung-timeline" role="group" aria-label="Oś czasu prezentacji">{([1, 5, 10] as const).map(years => <button key={years} type="button" aria-pressed={lungYears === years} onClick={() => setLungTimeline(years)}>{years} {years === 1 ? 'rok' : 'lat'}</button>)}</div>
        <dl><div><dt>Zapalenie</dt><dd>{lungModel.inflammation}</dd></div><div><dt>Drogi oddechowe</dt><dd>{lungModel.airwayNarrowing}</dd></div><div><dt>Śluz</dt><dd>{lungModel.mucusBurden}</dd></div><div><dt>Pęcherzyki / pojemność</dt><dd>{lungModel.alveolarDamage} / {lungModel.reducedCapacity}</dd></div></dl>
        <p>{lungModel.caveat}</p>
      </aside>}
      {preventionModel && <aside className="human-lung-compare human-prevention-card" data-testid="school-prevention-lab" data-topic={preventionTopic} data-target={preventionModel.target} data-stage={preventionStage}>
        <header><span>EDUCATIONAL MODEL</span><span>SIMULATION</span><span>NOT MEDICAL DIAGNOSIS</span></header>
        <h2>{preventionModel.topicLabel} <b>→</b> {PREVENTION_TARGET_LABEL_PL[preventionModel.target]}</h2>
        <p className="human-prevention-lead">{preventionModel.explanation}</p>
        <div className="human-lung-timeline human-prevention-timeline" role="group" aria-label="Etap edukacyjny">{PREVENTION_STAGES.map(stage => <button key={stage} type="button" aria-pressed={preventionStage === stage} onClick={() => setPreventionTimeline(stage)}>{stage === 'immediate' ? 'Od razu' : stage === 'short-term' ? 'Krótko' : stage === 'repeated-use' ? 'Powtarzanie' : 'Długi czas'}</button>)}</div>
        <dl><div><dt>Co pokazujemy</dt><dd>{preventionModel.stageExplanation}</dd></div><div><dt>Stan wiedzy</dt><dd>{preventionModel.evidenceLabel.replaceAll('_', ' ')}</dd></div><div><dt>Następny krok</dt><dd>{preventionModel.nextSteps.split(' | ')[0]}</dd></div></dl>
        <p className="human-prevention-warning">{preventionModel.warning}</p>
      </aside>}
      <div className="human-hero-tools" aria-label="Widok modelu">
        {SURFACE_MODES.filter(([mode]) => mode !== 'TRANSLUCENT').map(([mode, label]) => <button key={mode} type="button" className={`sw-chip${surface === mode ? ' is-on' : ''}`} aria-pressed={surface === mode} onClick={() => onSurface(mode)} disabled={busy} data-testid={`human-mode-${mode.toLowerCase()}`}>{label}</button>)}
        <button type="button" className="sw-chip human-inspector-toggle" aria-expanded={inspectorOpen} aria-controls="human-inspector" onClick={() => setInspectorOpen(!inspectorOpen)} data-testid="human-inspector-toggle">{inspectorOpen ? 'Zamknij ×' : 'Instrumenty +'}</button>
      </div>
      <nav className="human-hero-path" aria-label="Od ciała do komórki">
        {(['body', 'organ', 'tissue', 'cell'] as const).map((target, index) => <button key={target} type="button" aria-current={level === target ? 'step' : undefined} onClick={() => { onTwinCamera(true); zoom(target); }} disabled={busy || !explorer} data-testid={`human-hero-${target}`}><span>0{index + 1}</span><strong>{levelLabel(target, locale)}</strong></button>)}
      </nav>
      <div className="human-hero-action"><button type="button" className="sw-btn sw-btn-primary" disabled={busy || !explorer} onClick={() => { onTwinCamera(true); zoom(level === 'body' ? 'organ' : level === 'organ' ? 'tissue' : level === 'tissue' ? 'cell' : 'body'); }}>{busy ? 'Trwa wykonanie…' : level === 'body' ? `Poznaj ${organ?.label ?? 'narząd'} →` : level === 'organ' ? 'Zobacz tkankę →' : level === 'tissue' ? 'Zobacz komórkę →' : 'Wróć do ciała'}</button></div>
      <div id="human-inspector" className="human-inspector" hidden={!inspectorOpen} data-testid="human-inspector" onKeyDown={(event) => { if (event.key === 'Escape') setInspectorOpen(false); }}>
      <h2>Instrumenty Human Explorer</h2>
      <div className="human-inspector-tabs" role="tablist" aria-label="Narzędzia eksploracji">
        {([['explore', 'Odkrywaj'], ['microscope', 'Mikroskop'], ['section', 'Przekrój'], ['research', 'Badania']] as const).map(([tab, label]) => (
          <button key={tab} type="button" role="tab" id={`human-tab-${tab}`} aria-controls={`human-panel-${tab}`} aria-selected={activeTab === tab} tabIndex={activeTab === tab ? 0 : -1} data-testid={`human-tab-${tab}`} onClick={() => setActiveTab(tab)} onKeyDown={(event) => {
            const tabs = ['explore', 'microscope', 'section', 'research'] as const;
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault(); const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 3)) % 4];
            setActiveTab(next); document.getElementById(`human-tab-${next}`)?.focus();
          }}>{label}</button>
        ))}
      </div>
      <div className="human-tab" id="human-panel-explore" role="tabpanel" aria-labelledby="human-tab-explore" hidden={activeTab !== 'explore'}>
        <p className="human-instrument-note">Wybierz strukturę i skalę. Każdy poziom korzysta z istniejącego modelu.</p>
        <details className="human-selector"><summary>Układ <strong>{system ? SYSTEM_LABEL_PL[system] : 'Wszystkie'}</strong></summary>
        <nav className="sw-ex-systems" aria-label={t('explorer.systemsRail', locale)}>
          <div className="sw-ex-title">{t('explorer.systemsRail', locale)}</div>
          {manifest.supportedSystems.map((s) => (
            <button key={s} type="button" className={`sw-chip sw-ex-system${system === s ? ' is-on' : ''}`} onClick={() => pickSystem(s)} disabled={busy} data-testid={`sw-explorer-system-${s.toLowerCase()}`}>{SYSTEM_LABEL_PL[s]}</button>
          ))}
        </nav>
        </details>
        <details className="human-selector" open><summary>Narząd <strong>{organ?.label ?? '—'}</strong></summary>
          <input className="human-organ-search" type="search" aria-label="Szukaj narządu" placeholder="Szukaj narządu…" value={search} onChange={event => setSearch(event.target.value)} />
          <div className="sw-ex-organ-list" role="listbox" aria-label={t('explorer.organ', locale)}>
            {visibleOrgans.map((o) => (
              <button key={o.id} type="button" role="option" aria-selected={o.id === organ?.id} className={`sw-chip sw-ex-organ-chip${o.id === organ?.id ? ' is-on' : ''}`} onClick={() => { setOrganId(o.id); const e = EXPLORER_ORGANS.find((x) => x.organId === o.id); if (e) { const lt = nextLogicalTime(); const label = `${t('explorer.organ', locale)}: ${o.label}`; run(explorerCommands(e, 'organ', label, lt), label); } }} disabled={busy} data-testid={`sw-explorer-organ-${o.id}`}>{o.label}</button>
            ))}
          </div>

        </details>
      <div className="sw-ex-strip" role="group" aria-label={t('explorer.macroToMicro', locale)}>
        <div className="sw-ex-title">{t('explorer.macroToMicro', locale)}</div>
        <ol className="sw-ex-rungs">
          {SCALE_LADDER.map((l) => {
            const step = explorer ? explorerPath(explorer, l, manifest).at(-1) : null;
            const runnable = !!explorer && (l === 'body' || l === 'organ' || (l === 'organ_system' && !!step?.nodeId) || !!step?.experimentId);
            return (
              <li key={l} className={`sw-ex-rung${l === level ? ' is-on' : ''}`}>
                <button type="button" className="sw-ex-rung-btn" onClick={() => zoom(l)} disabled={busy || !runnable} title={l === 'atom' ? t('explorer.notModeled', locale) : step ? explorerTruthLabel(step.evidenceMode) : ''} data-testid={`sw-explorer-rung-${l}`}>
                  <span className="sw-ex-rung-name">{levelLabel(l, locale)}</span>
                  <span className="sw-ex-rung-scale cw-mono">{SCALE_TEXT[l]}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      </div>
      <div className="human-tab" id="human-panel-microscope" role="tabpanel" aria-labelledby="human-tab-microscope" hidden={activeTab !== 'microscope'}>
        <div className="human-readout"><span>HYPERSCOPE / {microscopeSpecimen === 'blood' ? 'KREW REFERENCYJNA' : 'TKANKA NARZĄDU'}</span><output data-testid="human-magnification-readout">{magnification ? `${magnification}×` : 'Wybierz powiększenie'}</output></div>
        <p className="human-instrument-note">Wybierz preparat i powiększenie. To model edukacyjny bez próbki pacjenta i bez diagnozy.</p>
        <div className="sw-ex-scope" data-testid="sw-explorer-scope" data-capture={imageSession?.sessionId ?? ''}>
          <div className="human-specimen-picker" role="group" aria-label="Preparat mikroskopowy">
            <button type="button" className={`sw-chip${microscopeSpecimen === 'selected-tissue' ? ' is-on' : ''}`} aria-pressed={microscopeSpecimen === 'selected-tissue'} onClick={() => setMicroscopeSpecimen('selected-tissue')} disabled={!explorer || busy} data-testid="human-specimen-tissue">Tkanka: {organ?.label ?? 'narząd'}</button>
            <button type="button" className={`sw-chip${microscopeSpecimen === 'blood' ? ' is-on' : ''}`} aria-pressed={microscopeSpecimen === 'blood'} onClick={() => setMicroscopeSpecimen('blood')} disabled={busy} data-testid="human-specimen-blood">Krew</button>
          </div>
          <div className="sw-ex-title">{t('explorer.hyperscope', locale)} · {t('explorer.magnification', locale)}</div>
          <div className="sw-ex-mags">
            {VIRTUAL_MICROSCOPE_MAGNIFICATIONS.map((m) => (
              <button key={m} type="button" className={`sw-chip${magnification === m ? ' is-on' : ''}`} onClick={() => magnify(m)} disabled={busy || (!explorer && microscopeSpecimen !== 'blood')} aria-pressed={magnification === m} data-testid={`sw-explorer-mag-${m}`}>{m}×</button>
            ))}
          </div>
          <canvas ref={canvasRef} className="sw-ex-canvas" width={512} height={288} aria-label="Microscope field" />
          {imageSession
            ? <p className="sw-faint cw-mono" data-testid="sw-explorer-capture">{imageSession.experimentId} · {imageSession.epistemicStatus} · {imageSession.contentHash.slice(0, 16)}…</p>
            : <p className="sw-faint" data-testid="sw-explorer-empty">{t('explorer.noCapture', locale)}</p>}
          {microscopeSpecimen === 'blood' && <p className="human-instrument-note" data-testid="human-blood-scope-note">Model pokazuje erytrocyty bez jąder, leukocyt i płytki krwi. Nie przedstawia wyniku morfologii ani obrazu pacjenta.</p>}

        </div>

      </div>
      <div className="human-tab" id="human-panel-section" role="tabpanel" aria-labelledby="human-tab-section" hidden={activeTab !== 'section'}>
          <div className="sw-ex-section" data-testid="sw-explorer-section" data-cutaway={cutaway.enabled ? 'on' : 'off'}>
            <div className="sw-ex-title">{t('explorer.section', locale)}</div>
            <div className="sw-ex-mags">
              <button type="button" className={`sw-chip${cutaway.enabled ? ' is-on' : ''}`} onClick={() => onCutaway({ ...cutaway, enabled: !cutaway.enabled })} disabled={busy} aria-pressed={cutaway.enabled} data-testid="sw-explorer-cut-toggle">{t('explorer.cutaway', locale)}</button>
              {(['SAGITTAL', 'CORONAL', 'AXIAL'] as const).map((axis: SectionAxis) => (
                <button key={axis} type="button" className={`sw-chip${cutaway.axis === axis ? ' is-on' : ''}`} onClick={() => onCutaway({ ...cutaway, axis, enabled: true })} disabled={busy} aria-pressed={cutaway.axis === axis} title={SECTION_AXIS_LABEL_PL[axis]} data-testid={`sw-explorer-axis-${axis.toLowerCase()}`}>{SECTION_AXIS_LABEL_PL[axis].split(' ')[0]}</button>
              ))}
              <button type="button" className={`sw-chip${cutaway.flipped ? ' is-on' : ''}`} onClick={() => onCutaway({ ...cutaway, flipped: !cutaway.flipped, enabled: true })} disabled={busy} aria-pressed={cutaway.flipped} aria-label="Odwróć stronę przekroju" data-testid="sw-explorer-cut-flip">Odwróć ↔</button>
            </div>
            <div className="human-depth-instrument">
            <label htmlFor="human-section-depth">Położenie płaszczyzny <output data-testid="human-depth-readout">{Math.round(cutaway.position * 100)}%</output></label>
            <input id="human-section-depth" className="sw-ex-slider" type="range" min={0} max={1} step={0.01} value={cutaway.position} disabled={busy || !cutaway.enabled}
              onChange={(e) => onCutaway({ ...cutaway, position: Number(e.target.value) })} aria-label={t('explorer.section', locale)} aria-valuetext={`${Math.round(cutaway.position * 100)}% zakresu modelu`} data-testid="sw-explorer-cut-position" />
            <div className="human-depth-ticks"><span>0%</span><span>Środek · 50%</span><span>100%</span></div>
            <p className="human-instrument-note">{SECTION_AXIS_LABEL_PL[cutaway.axis]} · {cutaway.flipped ? 'odwrócona strona' : 'standardowa strona'}</p>
            </div>
            <div className="sw-ex-mags">
              <button type="button" className={`sw-chip${isolated.length ? ' is-on' : ''}`} onClick={() => onIsolate(isolated.length ? [] : organ ? [organ.id] : [])} disabled={busy || !organ} aria-pressed={isolated.length > 0} data-testid="sw-explorer-isolate">{isolated.length ? t('explorer.showAll', locale) : t('explorer.isolate', locale)}</button>
              {/* Both agent cameras follow the suited agent, which leaves the twin a distant figure inside its
                  chamber. This one frames the body itself — the only way to actually READ a section or an
                  isolated organ. It is a camera, not a claim: no label, session or evidence changes with it. */}
              <button type="button" className={`sw-chip${twinCamera ? ' is-on' : ''}`} onClick={() => onTwinCamera(!twinCamera)} data-testid="sw-explorer-twin-camera">{t('explorer.twinCamera', locale)}</button>
            </div>
            {/* The body shell's presentation. The "X-ray" is a fresnel shell over a licensed 3D model —
                a stylised view that lets the atlas volumes read through the skin. It is NOT a radiograph,
                and it upgrades no epistemic status: the anatomy under it stays MODEL. */}
            <div className="sw-ex-mags" data-testid="sw-explorer-surface" data-surface={surface}>
              {SURFACE_MODES.map(([mode, label]) => (
                <button key={mode} type="button" className={`sw-chip${surface === mode ? ' is-on' : ''}`} onClick={() => onSurface(mode)} disabled={busy} aria-pressed={surface === mode} data-testid={`sw-explorer-surface-${mode.toLowerCase()}`}>{label}</button>
              ))}
            </div>
            <p className="sw-faint" data-testid="sw-explorer-section-note">{t('explorer.sectionNote', locale)}</p>
          </div>

      </div>
      <div className="human-tab" id="human-panel-research" role="tabpanel" aria-labelledby="human-tab-research" hidden={activeTab !== 'research'}>
      <header className="sw-ex-head">
        <span className="sw-badge" data-testid="sw-explorer-tier" title="Cinematic procedural presentation; geometry remains an illustrative scientific model.">{t('explorer.humanExplorer', locale).toUpperCase()} · {twinTier === 'LICENSED_CC0_ASSET' ? 'CC0' : 'PROXY'} · {t('explorer.anatomyModel', locale)}</span>
        <span className="sw-badge sw-ex-scale" data-testid="sw-explorer-scale">{t('explorer.scale', locale)}: {levelLabel(level, locale)} · {SCALE_TEXT[level]}</span>
        <span className={`sw-badge sw-ex-mode sw-ex-mode-${evidenceMode.toLowerCase()}`} data-testid="sw-explorer-evidence">{explorerTruthLabel(evidenceMode)}</span>
      </header>          {organ && (
            <dl className="sw-ex-card">
              <dt>{organ.label}</dt><dd className="sw-faint">{organ.latinLabel ?? '—'} · {organ.system ? SYSTEM_LABEL_PL[organ.system] : '—'}</dd>
              <dt>{t('explorer.scale', locale)}</dt><dd className="cw-mono">{organ.scaleMeters} m · {organ.dimensionsMeters.x}×{organ.dimensionsMeters.y}×{organ.dimensionsMeters.z} m</dd>
              <dt>{t('explorer.evidence', locale)}</dt><dd className="cw-mono">{organ.epistemic} · {manifest.clinicalUse}</dd>
              <dt>Confidence / resolution</dt><dd className="cw-mono" data-testid="sw-explorer-source-metadata" title={organ.representation.provenance.description}>{organ.representation.confidence.status} / {organ.representation.resolution.status}</dd>
              <dt>Provenance</dt><dd className="cw-mono" data-testid="sw-explorer-provenance">{organ.representation.provenance.source}</dd>
              <dt>Observation</dt><dd data-testid="sw-explorer-observation-status">No validated subject observation attached · illustrative generic model</dd>
              {reference && <>
                <dt>Geometria</dt><dd className="cw-mono" data-testid="sw-explorer-reference" data-fma={reference.fmaId} data-bp={reference.representationId} data-lod={reference.lod}>{reference.source} · {reference.fmaId} · {reference.representationId} · {reference.elementCount} FJ · {reference.lod} · {reference.triangles.toLocaleString('pl-PL')} Δ</dd>
                <dt>Zakres</dt><dd data-testid="sw-explorer-reference-scope">Ogólny model referencyjny (jedno ciało atlasu) · nie pacjent · nie do diagnozy · tkanki i komórki pozostają MODELEM</dd>
                <dt>Licencja</dt><dd className="sw-faint">{reference.attribution}</dd>
              </>}
            </dl>
          )}

        <HumanExperimentSessionInspector session={session} />
        {researchControls}
      </div>
      </div>
    </section>
  );
}
