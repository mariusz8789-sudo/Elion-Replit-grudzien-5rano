import { t, type Locale } from '../i18n';
import type { HumanDigitalTwinManifest } from './humanLab/types';
import { systemsForOrgan } from './humanLab/anatomyAtlas';
import type { ExperimentSession } from './experimentSession';
import { verifySessionIntegrity } from './experimentSession';
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

export type ScaleLevel = 'body' | 'organ_system' | 'organ' | 'tissue' | 'cell' | 'organelle' | 'molecule' | 'dna' | 'atom';
export const SCALE_LADDER: readonly ScaleLevel[] = ['body', 'organ_system', 'organ', 'tissue', 'cell', 'organelle', 'molecule', 'dna', 'atom'];
/** Order of magnitude per level (metres), for the HUD scale bar. */
export const SCALE_METRES: Readonly<Record<ScaleLevel, number>> = { body: 1, organ_system: 1, organ: 0.1, tissue: 1e-3, cell: 1e-5, organelle: 1e-6, molecule: 1e-9, dna: 1e-10, atom: 1e-11 };
/** Human-readable scale bar text per level. */
export const SCALE_TEXT: Readonly<Record<ScaleLevel, string>> = { body: '1 m', organ_system: '—', organ: '10 cm', tissue: '1 mm', cell: '10 µm', organelle: '1 µm', molecule: '1 nm', dna: '0.1 nm', atom: '0.01 nm' };

export type ExplorerEvidenceMode = 'REAL_IMAGE' | 'REAL_DATASET' | 'RECONSTRUCTED' | 'SIMULATED' | 'ILLUSTRATIVE';
const NON_EVIDENCE: ReadonlySet<ExplorerEvidenceMode> = new Set(['RECONSTRUCTED', 'SIMULATED', 'ILLUSTRATIVE']);

/** The pack's evidence guard: only a real image or dataset may be called a direct observation. */
export function canClaimDirectObservation(mode: ExplorerEvidenceMode): boolean { return !NON_EVIDENCE.has(mode); }
export function explorerTruthLabel(mode: ExplorerEvidenceMode): string { return NON_EVIDENCE.has(mode) ? `${mode}: NOT_DIRECT_OBSERVATION` : mode; }

export interface ExplorerOrgan { readonly organId: string; readonly tissue: 'CARDIAC' | 'NEURAL' | 'LUNG' | 'LIVER' | 'EPITHELIUM'; readonly labelKey: string; readonly keywords: readonly string[]; }

/** Organs the ladder can start from — each one is an ORGAN node of the V3 atlas. */
const EXPLORER_ORGANS_RAW: readonly ExplorerOrgan[] = [
  { organId: 'heart', tissue: 'CARDIAC', labelKey: 'explorer.heart', keywords: ['serc', 'heart', 'corazon', 'القلب'] },
  { organId: 'brain', tissue: 'NEURAL', labelKey: 'explorer.brain', keywords: ['mozg', 'brain', 'cerebro', 'الدماغ'] },
  { organId: 'left-lung', tissue: 'LUNG', labelKey: 'explorer.lungs', keywords: ['pluc', 'lung', 'pulmon', 'الرئ'] },
  { organId: 'liver', tissue: 'LIVER', labelKey: 'explorer.liver', keywords: ['watrob', 'liver', 'higado', 'الكبد'] },
  { organId: 'left-kidney', tissue: 'EPITHELIUM', labelKey: 'explorer.kidneys', keywords: ['nerk', 'kidney', 'rinon', 'الكل'] },
  { organId: 'right-lung', tissue: 'LUNG', labelKey: 'explorer.lungs', keywords: ['prawe pluc', 'right lung'] },
  { organId: 'right-kidney', tissue: 'EPITHELIUM', labelKey: 'explorer.kidneys', keywords: ['prawa nerk', 'right kidney'] },
  { organId: 'stomach', tissue: 'EPITHELIUM', labelKey: 'explorer.stomach', keywords: ['zoladek', 'zoladk', 'stomach', 'estomago', 'المعدة'] },
  { organId: 'liver', tissue: 'LIVER', labelKey: 'explorer.liver', keywords: [] },
  { organId: 'pancreas', tissue: 'EPITHELIUM', labelKey: 'explorer.pancreas', keywords: ['trzustk', 'pancreas', 'البنكرياس'] },
  { organId: 'small-intestine', tissue: 'EPITHELIUM', labelKey: 'explorer.smallIntestine', keywords: ['jelit', 'intestine', 'intestino', 'الأمعاء'] },
];
export const EXPLORER_ORGANS: readonly ExplorerOrgan[] = EXPLORER_ORGANS_RAW.filter((o, i, arr) => arr.findIndex((x) => x.organId === o.organId) === i);

const LEVEL_KEYWORDS: Readonly<Record<ScaleLevel, readonly string[]>> = {
  // System selection needs the live manifest's semantic edges; it is supplied
  // by the typed UI commands rather than guessed by this context-free parser.
  body: ['cialo', 'body', 'cuerpo', 'جسم'], organ_system: [], organ: ['narzad', 'organ', 'organo', 'عضو'], tissue: ['tkank', 'tissue', 'tejido', 'نسيج'],
  cell: ['komork', 'cell', 'celul', 'خلية'], organelle: ['organell', 'mitochond', 'organelle', 'organulo', 'عضية'], molecule: ['czasteczk', 'molecule', 'molecul', 'atp', 'جزيء'],
  dna: ['dna', 'adn', 'helis', 'helix', 'gen '], atom: ['atom', 'átomo', 'ذرة'],
};

export function levelLabel(level: ScaleLevel, locale: Locale): string {
  const key: Record<ScaleLevel, string> = { body: 'explorer.body', organ_system: 'explorer.systems', organ: 'explorer.organ', tissue: 'explorer.tissue', cell: 'explorer.cell', organelle: 'explorer.organelle', molecule: 'explorer.molecule', dna: 'explorer.dna', atom: 'explorer.atoms' };
  // 'organ' / 'atoms' have no pack translation for es/ar: they fall back to the Polish source label (never a guessed word).
  return t(key[level], locale);
}

export function organById(manifest: HumanDigitalTwinManifest, organId: string): ExplorerOrgan | null {
  const o = EXPLORER_ORGANS.find((e) => e.organId === organId) ?? null;
  return o && manifest.nodes.some((n) => n.id === o.organId && n.kind === 'ORGAN') ? o : null;
}

export interface ExplorerStep { readonly level: ScaleLevel; readonly nodeId: string | null; readonly evidenceMode: ExplorerEvidenceMode; readonly experimentId: string | null; readonly magnification: number | null; }

/** The path a click walks: every level down to `target`, each with its evidence mode and the canonical experiment behind it. */
export function explorerPath(organ: ExplorerOrgan, target: ScaleLevel, manifest?: HumanDigitalTwinManifest): readonly ExplorerStep[] {
  const idx = SCALE_LADDER.indexOf(target);
  return SCALE_LADDER.slice(0, idx + 1).map((level) => {
    switch (level) {
      case 'body': return { level, nodeId: 'body', evidenceMode: 'ILLUSTRATIVE', experimentId: null, magnification: null };
      case 'organ_system': return { level, nodeId: manifest ? systemsForOrgan(manifest, organ.organId)[0]?.id ?? null : null, evidenceMode: 'ILLUSTRATIVE', experimentId: null, magnification: null };
      case 'organ': return { level, nodeId: organ.organId, evidenceMode: 'RECONSTRUCTED', experimentId: null, magnification: null };
      case 'tissue': return { level, nodeId: `${organ.organId}:tissue`, evidenceMode: 'SIMULATED', experimentId: 'histology-slide', magnification: 40 };
      case 'cell': return { level, nodeId: `${organ.organId}:cell`, evidenceMode: 'SIMULATED', experimentId: 'hyperscope-capture', magnification: 100 };
      case 'organelle': return { level, nodeId: `${organ.organId}:organelle`, evidenceMode: 'SIMULATED', experimentId: 'hyperscope-capture', magnification: 500 };
      case 'molecule': return { level, nodeId: `${organ.organId}:molecule`, evidenceMode: 'SIMULATED', experimentId: 'central-dogma', magnification: null };
      case 'dna': return { level, nodeId: `${organ.organId}:dna`, evidenceMode: 'SIMULATED', experimentId: 'central-dogma', magnification: null };
      // Atoms: no instrument in the lab models this scale — the rung is shown, labelled, and runs nothing.
      case 'atom': return { level, nodeId: `${organ.organId}:atom`, evidenceMode: 'ILLUSTRATIVE', experimentId: null, magnification: null };
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

export interface ExplorerCommandContext {
  readonly manifest: HumanDigitalTwinManifest;
  readonly selectedNodeId: string;
  readonly sessions: readonly ExperimentSession[];
  readonly worldId: string;
  readonly seed: number;
}

/** The explorer path as canonical WorldCommands. Only intact, matching sealed prerequisites may be reused. */
export function explorerCommands(organ: ExplorerOrgan, level: ScaleLevel, text: string, logicalTime: number, context?: ExplorerCommandContext): readonly WorldCommand[] {
  const id = (i: number): string => `cmd-${fnv1a(`${text}|${logicalTime}|explorer|${i}`)}`;
  if (level === 'atom') return []; // No production instrument supports this rung.
  if (level === 'organ_system') {
    const system = context && systemsForOrgan(context.manifest, organ.organId)[0]?.system;
    return system ? systemCommands(system, text, logicalTime) : [];
  }
  const out: WorldCommand[] = [];
  const needsFocus = level === 'body' || level === 'organ' || context?.selectedNodeId !== organ.organId;
  if (needsFocus) out.push(
    { commandId: id(0), text, intent: 'NAVIGATE', targetEntityId: 'station:human-study', requestedAtLogicalTime: logicalTime },
    { commandId: id(1), text, intent: 'INTERACT', targetEntityId: 'station:human-study', parameters: { action: 'FOCUS_ANATOMY', focus: level === 'body' ? 'body' : organ.organId, mode: level === 'body' ? 'NORMAL' : organ.organId === 'brain' ? 'BRAIN' : 'ORGANS' }, requestedAtLogicalTime: logicalTime },
  );
  // A new rung executes its own instrument. It need not repeat already sealed prerequisites
  // or walk back to the anatomy table when the selected canonical organ has not changed.
  const seen = new Set<string>();
  const steps = explorerPath(organ, level, context?.manifest).filter((s) => s.experimentId && !seen.has(`${s.experimentId}:${s.magnification ?? ''}`) && seen.add(`${s.experimentId}:${s.magnification ?? ''}`));
  steps.forEach((s, i) => {
    const station = s.experimentId === 'histology-slide' ? 'station:histology' : s.experimentId === 'central-dogma' ? 'station:compute' : 'station:microscopy';
    const parameters: Record<string, CommandParameterValue> = { organId: organ.organId, tissue: organ.tissue,
      ...(s.experimentId === 'histology-slide' ? { stage: 'slide' } : s.experimentId === 'hyperscope-capture' ? { magnification: s.magnification ?? 100 } : { explorerLevel: level === 'dna' ? 'dna' : 'molecule' }),
    };
    const prerequisite = s !== steps.at(-1);
    const reusable = prerequisite && context?.sessions.some((session) => session.worldId === context.worldId && session.seed === context.seed
      && session.stationId === station && session.experimentId === s.experimentId && session.evidenceHashes.length > 0
      && Object.entries(parameters).every(([key, value]) => session.inputs[key] === value) && verifySessionIntegrity(session));
    if (reusable) return;
    out.push({ commandId: id(2 + i), text, intent: 'RUN_EXPERIMENT', targetEntityId: station, parameters, requestedAtLogicalTime: logicalTime });
  });
  out.push({ commandId: id(99), text, intent: 'INSPECT', parameters: { provenance: true, result: true }, requestedAtLogicalTime: logicalTime });
  return out;
}

/** The Hyperscope at one magnification on the selected organ's tissue (the magnification ladder of the explorer UI). */
export function magnificationCommands(organ: ExplorerOrgan, magnification: number, text: string, logicalTime: number): readonly WorldCommand[] {
  const id = (i: number): string => `cmd-${fnv1a(`${text}|${logicalTime}|magnification|${i}`)}`;
  return [
    { commandId: id(0), text, intent: 'NAVIGATE', targetEntityId: 'station:microscopy', requestedAtLogicalTime: logicalTime },
    { commandId: id(1), text, intent: 'RUN_EXPERIMENT', targetEntityId: 'station:microscopy', parameters: { magnification, tissue: organ.tissue, organId: organ.organId }, requestedAtLogicalTime: logicalTime },
    { commandId: id(2), text, intent: 'INSPECT', parameters: { provenance: true, result: true }, requestedAtLogicalTime: logicalTime },
  ];
}

/** A reference blood smear in the existing Hyperscope. This is a generated educational
 * specimen, never a patient sample or diagnostic measurement. */
export function bloodMagnificationCommands(magnification: number, text: string, logicalTime: number): readonly WorldCommand[] {
  const id = (i: number): string => `cmd-${fnv1a(`${text}|${logicalTime}|blood-magnification|${i}`)}`;
  return [
    { commandId: id(0), text, intent: 'NAVIGATE', targetEntityId: 'station:microscopy', requestedAtLogicalTime: logicalTime },
    { commandId: id(1), text, intent: 'RUN_EXPERIMENT', targetEntityId: 'station:microscopy', parameters: { magnification, tissue: 'BLOOD', specimenKind: 'REFERENCE_BLOOD_SMEAR' }, requestedAtLogicalTime: logicalTime },
    { commandId: id(2), text, intent: 'INSPECT', parameters: { provenance: true, result: true }, requestedAtLogicalTime: logicalTime },
  ];
}

/** The twin's display mode for a body system (the systems rail) — the V3 visual modes, through the anatomy table's interaction. */
export function systemDisplayMode(system: string): 'XRAY' | 'VASCULAR' | 'NERVOUS' | 'ORGANS' {
  return system === 'SKELETAL' ? 'XRAY' : system === 'CARDIOVASCULAR' || system === 'LYMPHATIC' ? 'VASCULAR' : system === 'NERVOUS' ? 'NERVOUS' : 'ORGANS';
}
export function systemCommands(system: string, text: string, logicalTime: number): readonly WorldCommand[] {
  const id = (i: number): string => `cmd-${fnv1a(`${text}|${logicalTime}|system|${i}`)}`;
  return [
    { commandId: id(0), text, intent: 'NAVIGATE', targetEntityId: 'station:human-study', requestedAtLogicalTime: logicalTime },
    { commandId: id(1), text, intent: 'INTERACT', targetEntityId: 'station:human-study', parameters: { action: 'FOCUS_ANATOMY', focus: `system:${system.toLowerCase()}`, mode: systemDisplayMode(system) }, requestedAtLogicalTime: logicalTime },
    { commandId: id(2), text, intent: 'INSPECT', parameters: { provenance: true, result: true }, requestedAtLogicalTime: logicalTime },
  ];
}

/** Which rung the last sealed session reached (for the HUD): the instrument and magnification decide, never a guess. */
export function levelOfSession(experimentId: string | null, magnification: number | null, organSelected: boolean, requestedLevel?: unknown): ScaleLevel {
  if (experimentId === 'central-dogma') return requestedLevel === 'dna' ? 'dna' : 'molecule';
  if (experimentId === 'hyperscope-capture') return (magnification ?? 0) >= 500 ? 'organelle' : (magnification ?? 0) >= 100 ? 'cell' : 'organ';
  if (experimentId === 'histology-slide') return 'tissue';
  return organSelected ? 'organ' : 'body';
}
