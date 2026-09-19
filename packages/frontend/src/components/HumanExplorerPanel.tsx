import { useEffect, useMemo, useRef, useState } from 'react';
import { t, getLocale } from '../core/i18n';
import { drawBiologyArtifact } from '../core/three/biologyStationKit';
import type { BiologyArtifact } from '../core/scientificWorlds/biologyRunners';
import type { ExperimentSession } from '../core/scientificWorlds/experimentSession';
import type { AnatomyViewState, HumanDigitalTwinManifest, OrganSystemId } from '../core/scientificWorlds/humanLab/types';
import { VIRTUAL_MICROSCOPE_MAGNIFICATIONS } from '../core/scientificWorlds/humanLab/virtualMicroscope';
import { EXPLORER_ORGANS, SCALE_LADDER, SCALE_TEXT, explorerCommands, explorerPath, explorerTruthLabel, levelLabel, levelOfSession, magnificationCommands, systemCommands, type ExplorerOrgan, type ScaleLevel } from '../core/scientificWorlds/humanExplorer';
import type { WorldCommand } from '../core/scientificWorlds/worldCommand';

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
  readonly manifest: HumanDigitalTwinManifest;
  readonly anatomy: AnatomyViewState;
  readonly artifact: BiologyArtifact | null;
  readonly session: ExperimentSession | null;
  readonly sessions: readonly ExperimentSession[];
  readonly busy: boolean;
  readonly onCommands: (commands: readonly WorldCommand[], label: string, logicalTime: number) => void;
  readonly nextLogicalTime: () => number;
}

const SYSTEM_LABEL_PL: Readonly<Record<OrganSystemId, string>> = { INTEGUMENTARY: 'Skórny', SKELETAL: 'Szkieletowy', MUSCULAR: 'Mięśniowy', NERVOUS: 'Nerwowy', ENDOCRINE: 'Dokrewny', CARDIOVASCULAR: 'Krążenia', LYMPHATIC: 'Limfatyczny', RESPIRATORY: 'Oddechowy', DIGESTIVE: 'Pokarmowy', URINARY: 'Moczowy', REPRODUCTIVE: 'Rozrodczy', IMMUNE: 'Immunologiczny' };
const IMAGE_KINDS: ReadonlySet<BiologyArtifact['kind']> = new Set(['hyperscope', 'histology', 'imaging', 'central-dogma', 'neuro']);

export default function HumanExplorerPanel({ manifest, anatomy, artifact, session, sessions, busy, onCommands, nextLogicalTime }: HumanExplorerPanelProps): JSX.Element {
  const locale = getLocale();
  const organs = useMemo(() => manifest.nodes.filter((n) => n.kind === 'ORGAN'), [manifest]);
  const [system, setSystem] = useState<OrganSystemId | null>(null);
  const [organId, setOrganId] = useState<string>(() => (anatomy.selectedNodeId && organs.some((o) => o.id === anatomy.selectedNodeId) ? anatomy.selectedNodeId : 'heart'));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (anatomy.selectedNodeId && organs.some((o) => o.id === anatomy.selectedNodeId)) setOrganId(anatomy.selectedNodeId); }, [anatomy.selectedNodeId, organs]);

  const organ = organs.find((o) => o.id === organId) ?? organs[0];
  const explorer: ExplorerOrgan | undefined = EXPLORER_ORGANS.find((e) => e.organId === organ?.id);
  const visibleOrgans = system ? organs.filter((o) => o.system === system) : organs;
  const magnification = session?.experimentId === 'hyperscope-capture' && typeof session.outputs.magnification === 'number' ? session.outputs.magnification : null;
  const level: ScaleLevel = levelOfSession(session?.experimentId ?? null, magnification, anatomy.selectedNodeId !== manifest.rootNodeId);
  const path = explorer ? explorerPath(explorer, level) : [];
  const evidenceMode = path.at(-1)?.evidenceMode ?? 'ILLUSTRATIVE';
  const imageSession = [...sessions].reverse().find((s) => s.experimentId === 'hyperscope-capture' || s.experimentId === 'histology-slide' || s.experimentId === 'imaging-frame' || s.experimentId === 'central-dogma') ?? null;

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
    run(explorerCommands(explorer, target, label, lt), label);
  };
  const magnify = (m: number): void => { if (!explorer) return; const lt = nextLogicalTime(); const label = `${t('explorer.hyperscope', locale)} ${m}× · ${t(explorer.labelKey, locale)}`; run(magnificationCommands(explorer, m, label, lt), label); };
  const pickSystem = (s: OrganSystemId): void => { setSystem((cur) => (cur === s ? null : s)); const lt = nextLogicalTime(); const label = `${t('explorer.systems', locale)}: ${SYSTEM_LABEL_PL[s]}`; run(systemCommands(s, label, lt), label); };

  return (
    <section className="sw-hud sw-hud-explorer" aria-label="Human Explorer" data-testid="sw-explorer" data-level={level} data-evidence-mode={evidenceMode}>
      <header className="sw-ex-head">
        <span className="sw-badge">{t('explorer.humanExplorer', locale).toUpperCase()} · MODEL</span>
        <span className="sw-badge sw-ex-scale" data-testid="sw-explorer-scale">{t('explorer.scale', locale)}: {levelLabel(level, locale)} · {SCALE_TEXT[level]}</span>
        <span className={`sw-badge sw-ex-mode sw-ex-mode-${evidenceMode.toLowerCase()}`} data-testid="sw-explorer-evidence">{explorerTruthLabel(evidenceMode)}</span>
      </header>
      <div className="sw-ex-body">
        <nav className="sw-ex-systems" aria-label={t('explorer.systemsRail', locale)}>
          <div className="sw-ex-title">{t('explorer.systemsRail', locale)}</div>
          {manifest.supportedSystems.map((s) => (
            <button key={s} type="button" className={`sw-chip sw-ex-system${system === s ? ' is-on' : ''}`} onClick={() => pickSystem(s)} disabled={busy} data-testid={`sw-explorer-system-${s.toLowerCase()}`}>{SYSTEM_LABEL_PL[s]}</button>
          ))}
        </nav>
        <div className="sw-ex-organ" data-testid="sw-explorer-organ" data-organ={organ?.id}>
          <div className="sw-ex-organ-list" role="listbox" aria-label={t('explorer.organ', locale)}>
            {visibleOrgans.map((o) => (
              <button key={o.id} type="button" role="option" aria-selected={o.id === organ?.id} className={`sw-chip sw-ex-organ-chip${o.id === organ?.id ? ' is-on' : ''}`} onClick={() => { setOrganId(o.id); const e = EXPLORER_ORGANS.find((x) => x.organId === o.id); if (e) { const lt = nextLogicalTime(); const label = `${t('explorer.organ', locale)}: ${o.label}`; run(explorerCommands(e, 'organ', label, lt), label); } }} disabled={busy} data-testid={`sw-explorer-organ-${o.id}`}>{o.label}</button>
            ))}
          </div>
          {organ && (
            <dl className="sw-ex-card">
              <dt>{organ.label}</dt><dd className="sw-faint">{organ.latinLabel ?? '—'} · {organ.system ? SYSTEM_LABEL_PL[organ.system] : '—'}</dd>
              <dt>{t('explorer.scale', locale)}</dt><dd className="cw-mono">{organ.scaleMeters} m · {organ.dimensionsMeters.x}×{organ.dimensionsMeters.y}×{organ.dimensionsMeters.z} m</dd>
              <dt>{t('explorer.evidence', locale)}</dt><dd className="cw-mono">{organ.epistemic} · {manifest.clinicalUse}</dd>
            </dl>
          )}
        </div>
        <div className="sw-ex-scope" data-testid="sw-explorer-scope" data-capture={imageSession?.sessionId ?? ''}>
          <div className="sw-ex-title">{t('explorer.hyperscope', locale)} · {t('explorer.magnification', locale)}</div>
          <div className="sw-ex-mags">
            {VIRTUAL_MICROSCOPE_MAGNIFICATIONS.map((m) => (
              <button key={m} type="button" className={`sw-chip${magnification === m ? ' is-on' : ''}`} onClick={() => magnify(m)} disabled={busy || !explorer} data-testid={`sw-explorer-mag-${m}`}>{m}×</button>
            ))}
          </div>
          <canvas ref={canvasRef} className="sw-ex-canvas" width={512} height={288} aria-label="Microscope field" />
          {imageSession
            ? <p className="sw-faint cw-mono" data-testid="sw-explorer-capture">{imageSession.experimentId} · {imageSession.epistemicStatus} · {imageSession.contentHash.slice(0, 16)}…</p>
            : <p className="sw-faint" data-testid="sw-explorer-empty">{t('explorer.noCapture', locale)}</p>}
        </div>
      </div>
      <div className="sw-ex-strip" role="group" aria-label={t('explorer.macroToMicro', locale)}>
        <div className="sw-ex-title">{t('explorer.macroToMicro', locale)}</div>
        <ol className="sw-ex-rungs">
          {SCALE_LADDER.map((l) => {
            const step = explorer ? explorerPath(explorer, l).at(-1) : null;
            const runnable = l !== 'body' && !!explorer && (l === 'organ' || !!step?.experimentId);
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
    </section>
  );
}
