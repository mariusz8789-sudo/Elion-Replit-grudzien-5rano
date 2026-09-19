import { t, type Locale } from '../i18n';
import type { HumanDigitalTwinManifest } from './humanLab/types';
import type { CommandParameterValue, WorldCommand } from './worldCommand';
import { fnv1a } from '../events/hash';

/**
 * HUMAN EXPLORER — the macro → micro ladder on the canonical stack.
 *
 * The delivered pack describes a click-through BODY → ORGAN → TISSUE → CELL →
 * ORGANELLE → MOLECULE with a microscope beside it. Here the ladder is bound
 * to what already exists: the V3 anatomy atlas (organ ids), the V3 visual
 * modes (the twin's display), and the canonical experiments the agent runs
 * (histology-slide for TISSUE, hyperscope-capture at 100× / 500× for CELL /
 * ORGANELLE, central-dogma at the compute wall for MOLECULE). Every level
 * carries the evidence label the pack demands: a zoom is a MODEL view — it
 * never becomes an observation. Labels come from the canonical i18n (pack
 * vocabulary for es/ar); node ids, experiment ids and hashes are the same in
 * every locale.
 */

export type ScaleLevel = 'body' | 'organ' | 'tissue' | 'cell' | 'organelle' | 'molecule';
export const SCALE_LADDER: readonly ScaleLevel[] = ['body', 'organ', 'tissue', 'cell', 'organelle', 'molecule'];
/** Order of magnitude per level (metres), for the HUD scale bar. */
export const SCALE_METRES: Readonly<Record<ScaleLevel, number>> = { body: 1, organ: 0.1, tissue: 1e-3, cell: 1e-5, organelle: 1e-6, molecule: 1e-9 };

export type ExplorerEvidenceMode = 'REAL_IMAGE' | 'REAL_DATASET' | 'RECONSTRUCTED' | 'SIMULATED' | 'ILLUSTRATIVE';
const NON_EVIDENCE: ReadonlySet<ExplorerEvidenceMode> = new Set(['RECONSTRUCTED', 'SIMULATED', 'ILLUSTRATIVE']);

/** The pack's evidence guard: only a real image or dataset may be called a direct observation. */
export function canClaimDirectObservation(mode: ExplorerEvidenceMode): boolean { return !NON_EVIDENCE.has(mode); }
export function explorerTruthLabel(mode: ExplorerEvidenceMode): string { return NON_EVIDENCE.has(mode) ? `${mode}: NOT_DIRECT_OBSERVATION` : mode; }

export interface ExplorerOrgan { readonly organId: string; readonly tissue: 'CARDIAC' | 'NEURAL' | 'LUNG' | 'LIVER' | 'EPITHELIUM'; readonly labelKey: string; readonly keywords: readonly string[]; }

/** Organs the ladder can start from — each one is an ORGAN node of the V3 atlas. */
export const EXPLORER_ORGANS: readonly ExplorerOrgan[] = [
  { organId: 'heart', tissue: 'CARDIAC', labelKey: 'explorer.heart', keywords: ['serc', 'heart', 'corazon', 'القلب'] },
  { organId: 'brain', tissue: 'NEURAL', labelKey: 'explorer.brain', keywords: ['mozg', 'brain', 'cerebro', 'الدماغ'] },
  { organId: 'left-lung', tissue: 'LUNG', labelKey: 'explorer.lungs', keywords: ['pluc', 'lung', 'pulmon', 'الرئ'] },
  { organId: 'liver', tissue: 'LIVER', labelKey: 'explorer.liver', keywords: ['watrob', 'liver', 'higado', 'الكبد'] },
  { organId: 'left-kidney', tissue: 'EPITHELIUM', labelKey: 'explorer.kidneys', keywords: ['nerk', 'kidney', 'rinon', 'الكل'] },
];

const LEVEL_KEYWORDS: Readonly<Record<ScaleLevel, readonly string[]>> = {
  body: ['cialo', 'body', 'cuerpo', 'جسم'], organ: ['narzad', 'organ', 'organo', 'عضو'], tissue: ['tkank', 'tissue', 'tejido', 'نسيج'],
  cell: ['komork', 'cell', 'celul', 'خلية'], organelle: ['organell', 'mitochond', 'organelle', 'organulo', 'عضية'], molecule: ['czasteczk', 'molecule', 'molecul', 'dna', 'atp', 'جزيء'],
};

export function levelLabel(level: ScaleLevel, locale: Locale): string {
  const key: Record<ScaleLevel, string> = { body: 'explorer.body', organ: 'explorer.organ', tissue: 'explorer.tissue', cell: 'explorer.cell', organelle: 'explorer.organelle', molecule: 'explorer.molecule' };
  // 'organ' has no pack translation: the key falls back visibly (never a guessed word).
  return t(key[level], locale);
}

export function organById(manifest: HumanDigitalTwinManifest, organId: string): ExplorerOrgan | null {
  const o = EXPLORER_ORGANS.find((e) => e.organId === organId) ?? null;
  return o && manifest.nodes.some((n) => n.id === o.organId && n.kind === 'ORGAN') ? o : null;
}

export interface ExplorerStep { readonly level: ScaleLevel; readonly nodeId: string; readonly evidenceMode: ExplorerEvidenceMode; readonly experimentId: string | null; readonly magnification: number | null; }

/** The path a click walks: every level down to `target`, each with its evidence mode and the canonical experiment behind it. */
export function explorerPath(organ: ExplorerOrgan, target: ScaleLevel): readonly ExplorerStep[] {
  const idx = SCALE_LADDER.indexOf(target);
  return SCALE_LADDER.slice(0, idx + 1).map((level) => {
    switch (level) {
      case 'body': return { level, nodeId: 'body', evidenceMode: 'ILLUSTRATIVE', experimentId: null, magnification: null };
      case 'organ': return { level, nodeId: organ.organId, evidenceMode: 'RECONSTRUCTED', experimentId: null, magnification: null };
      case 'tissue': return { level, nodeId: `${organ.organId}:tissue`, evidenceMode: 'SIMULATED', experimentId: 'histology-slide', magnification: 40 };
      case 'cell': return { level, nodeId: `${organ.organId}:cell`, evidenceMode: 'SIMULATED', experimentId: 'hyperscope-capture', magnification: 100 };
      case 'organelle': return { level, nodeId: `${organ.organId}:organelle`, evidenceMode: 'SIMULATED', experimentId: 'hyperscope-capture', magnification: 500 };
      case 'molecule': return { level, nodeId: `${organ.organId}:molecule`, evidenceMode: 'SIMULATED', experimentId: 'central-dogma', magnification: null };
    }
  });
}

/** Parse "przybliż do komórki serca" / "zoom to the heart cell" / "acércate a la célula del corazón" into (organ, level). */
export function parseExplorerZoom(text: string): { readonly organ: ExplorerOrgan; readonly level: ScaleLevel } | null {
  const norm = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  if (!/(przybliz|zoom|powieksz do|acerca|zbliż|zbliz|تكبير|قرّب|قرب)/.test(norm) && !/(przybliz|zoom|acerca|تكبير)/.test(text.toLowerCase())) return null;
  const organ = EXPLORER_ORGANS.find((o) => o.keywords.some((k) => norm.includes(k) || text.includes(k)));
  const level = [...SCALE_LADDER].reverse().find((l) => LEVEL_KEYWORDS[l].some((k) => norm.includes(k) || text.includes(k)));
  if (!organ || !level || level === 'body') return null;
  return { organ, level };
}

/** The explorer path as canonical WorldCommands for the biology lab (the agent does the walking; sessions carry the evidence). */
export function explorerCommands(organ: ExplorerOrgan, level: ScaleLevel, text: string, logicalTime: number): readonly WorldCommand[] {
  const id = (i: number): string => `cmd-${fnv1a(`${text}|${logicalTime}|explorer|${i}`)}`;
  const out: WorldCommand[] = [
    { commandId: id(0), text, intent: 'NAVIGATE', targetEntityId: 'station:human-study', requestedAtLogicalTime: logicalTime },
    { commandId: id(1), text, intent: 'INTERACT', targetEntityId: 'station:human-study', parameters: { action: 'FOCUS_ANATOMY', focus: organ.organId, mode: organ.organId === 'brain' ? 'BRAIN' : 'ORGANS' }, requestedAtLogicalTime: logicalTime },
  ];
  const steps = explorerPath(organ, level).filter((s) => s.experimentId);
  steps.forEach((s, i) => {
    const station = s.experimentId === 'histology-slide' ? 'station:histology' : s.experimentId === 'central-dogma' ? 'station:compute' : 'station:microscopy';
    const parameters: Record<string, CommandParameterValue> = s.experimentId === 'histology-slide' ? { tissue: organ.tissue, stage: 'slide' } : s.experimentId === 'hyperscope-capture' ? { magnification: s.magnification ?? 100, tissue: organ.tissue } : {};
    out.push({ commandId: id(2 + i), text, intent: 'RUN_EXPERIMENT', targetEntityId: station, parameters, requestedAtLogicalTime: logicalTime });
  });
  out.push({ commandId: id(99), text, intent: 'INSPECT', parameters: { provenance: true, result: true }, requestedAtLogicalTime: logicalTime });
  return out;
}
