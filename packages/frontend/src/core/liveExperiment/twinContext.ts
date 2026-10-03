import type { WorldCommand } from '../scientificWorlds/worldCommand';
import { systemCommands } from '../scientificWorlds/humanExplorer';
import type { DockingTarget, LiveCandidate } from './drugRunState';
import type { LiveDrugRun } from './liveDrugRun';
import { zoneOf } from './drugBenchLayout';
import { targetAnatomy, type TargetAnatomy } from './targetAnatomy';
import { capabilityLabel } from '../capabilityNames';

/**
 * DRUG CANDIDATE ↔ HUMAN DIGITAL TWIN — the one link from a finalist on the bench to the
 * existing human twin, resolved from the canonical run and nothing else.
 *
 * finalist → target (the run's own RECEPTOR_PREPARED record) → documented anatomical
 * association (targetAnatomy.ts) → the twin's own FOCUS_ANATOMY command → a panel that
 * says what each line is: an association, a context, a model's prediction, a measured
 * structure, or not validated at all. Nothing here computes a biological effect, and a
 * missing link resolves to UNRESOLVED with its reason rather than a guessed organ.
 *
 * Identity is checked, never assumed: the candidate named in the route must exist in the
 * run and the target named in the route must be the run's target, or the context is
 * UNRESOLVED (no hand-typed substitution reaches the twin).
 */
export type EpistemicTag = 'TARGET_ASSOCIATION' | 'ANATOMICAL_CONTEXT' | 'MODEL_PREDICTION' | 'REAL_MEASUREMENT' | 'PROVENANCE' | 'NOT_VALIDATED';

export interface TwinContextLine {
  readonly label: string;
  readonly value: string;
  readonly tag: EpistemicTag;
  readonly source?: string;
}

export interface ResolvedTwinContext {
  readonly status: 'RESOLVED';
  readonly campaignId: string | null;
  /** The finalist, exactly as the run holds it; null when the route named only a target. */
  readonly candidate: LiveCandidate | null;
  readonly target: DockingTarget;
  readonly anatomy: TargetAnatomy;
  /** The run's sealed record identity (SESSION record), when the run was sealed in this session. */
  readonly sealed: { readonly recordId: string | null; readonly chainHash: string | null; readonly check: string | null } | null;
  readonly stateHash: string | null;
}

export type UnresolvedReason =
  | 'NO_RUN' | 'NO_TARGET' | 'TARGET_MISMATCH' | 'NO_CANDIDATE' | 'CANDIDATE_NOT_FINALIST' | 'NO_VERIFIED_ANATOMICAL_MAPPING';

export interface UnresolvedTwinContext {
  readonly status: 'UNRESOLVED';
  readonly reason: UnresolvedReason;
  readonly campaignId: string | null;
  readonly candidateId: string | null;
  readonly targetId: string | null;
}

export type TwinContext = ResolvedTwinContext | UnresolvedTwinContext;

export const UNRESOLVED_LABEL = 'UNRESOLVED — NO VERIFIED ANATOMICAL MAPPING';

export const UNRESOLVED_REASON_PL: Readonly<Record<UnresolvedReason, string>> = {
  NO_RUN: 'brak kampanii w tej sesji — uruchom ławkę dokowania, a potem wróć tutaj',
  NO_TARGET: 'kampania nie przygotowała jeszcze receptora (brak RECEPTOR_PREPARED)',
  TARGET_MISMATCH: 'cel w adresie różni się od celu zapisanego w kampanii — odrzucone',
  NO_CANDIDATE: 'kandydat z adresu nie istnieje w tej kampanii — odrzucone',
  CANDIDATE_NOT_FINALIST: 'kandydat nie ma zmierzonego wyniku dokowania — nie jest finalistą',
  NO_VERIFIED_ANATOMICAL_MAPPING: 'brak udokumentowanego powiązania tego celu z narządem lub układem',
};

export interface TwinContextRequest {
  readonly targetId: string | null;
  readonly campaignId: string | null;
  readonly candidateId: string | null;
}

/** Resolve the route's request against the canonical run. Pure; the only inputs are the run and the request. */
export function resolveTwinContext(run: LiveDrugRun | null, request: TwinContextRequest): TwinContext {
  const { targetId, campaignId, candidateId } = request;
  const unresolved = (reason: UnresolvedReason): UnresolvedTwinContext => ({ status: 'UNRESOLVED', reason, campaignId, candidateId, targetId });

  if (!campaignId && !candidateId) {
    // Target only (no campaign named): the association is still documented or it is not.
    if (!targetId) return unresolved('NO_TARGET');
    const anatomy = targetAnatomy(targetId);
    if (!anatomy) return unresolved('NO_VERIFIED_ANATOMICAL_MAPPING');
    const target: DockingTarget = { targetId, pdbId: '', chain: '', protein: anatomy.protein, receptorPdbqtSha256: '', sourceSha256: '', receptorAtoms: 0, center: [], boxSize: [], meekoVersion: '' };
    return { status: 'RESOLVED', campaignId: null, candidate: null, target, anatomy, sealed: null, stateHash: null };
  }

  if (!run || (campaignId && run.campaignId !== campaignId)) return unresolved('NO_RUN');
  const target = run.state.target;
  if (!target) return unresolved('NO_TARGET');
  if (targetId && targetId !== target.targetId) return unresolved('TARGET_MISMATCH');
  if (!candidateId) return unresolved('NO_CANDIDATE');
  const candidate = run.state.candidates.find((c) => c.id === candidateId) ?? null;
  if (!candidate) return unresolved('NO_CANDIDATE');
  if (zoneOf(candidate) !== 'FINALIST') return unresolved('CANDIDATE_NOT_FINALIST');
  const anatomy = targetAnatomy(target.targetId);
  if (!anatomy) return unresolved('NO_VERIFIED_ANATOMICAL_MAPPING');
  const sealed = run.sealed ? { recordId: run.sealed.recordId, chainHash: run.sealed.chainHash, check: run.sealed.check } : null;
  return { status: 'RESOLVED', campaignId: run.campaignId, candidate, target, anatomy, sealed, stateHash: run.state.stateHash };
}

/** `#/human-biology-lab?target=…&campaign=…&candidate=…` — the twin reads exactly these three ids. */
export function twinContextRoute(request: TwinContextRequest): string {
  const query = new URLSearchParams();
  if (request.targetId) query.set('target', request.targetId);
  if (request.campaignId) query.set('campaign', request.campaignId);
  if (request.candidateId) query.set('candidate', request.candidateId);
  return `#/human-biology-lab?${query.toString()}`;
}

export function twinContextRequestFrom(query: URLSearchParams): TwinContextRequest | null {
  const targetId = query.get('target');
  const campaignId = query.get('campaign');
  const candidateId = query.get('candidate');
  if (!targetId && !campaignId && !candidateId) return null;
  return { targetId, campaignId, candidateId };
}

/** The twin's own systems-rail command for the documented system: camera and highlight follow it, nothing new is drawn. */
export function twinContextCommands(context: TwinContext, logicalTime: number): readonly WorldCommand[] {
  if (context.status !== 'RESOLVED') return [];
  const who = context.candidate ? `finalista ${context.candidate.smiles}` : context.anatomy.protein;
  const label = `Human Digital Twin: ${who} → ${context.anatomy.protein} → układ ${context.anatomy.system.toLowerCase()}`;
  return systemCommands(context.anatomy.system, label, logicalTime);
}

const kcal = (v: number): string => `${v.toFixed(2)} kcal/mol`;

/** Every line the panel shows, each with the kind of knowledge it is. Order: identity, association, context, models, provenance, boundary. */
export function twinContextLines(context: ResolvedTwinContext): readonly TwinContextLine[] {
  const lines: TwinContextLine[] = [];
  const c = context.candidate;
  if (c) lines.push({ label: 'Finalista', value: `${c.smiles} (G${c.generation}, id ${c.id})`, tag: 'PROVENANCE', source: 'rekord kampanii' });
  lines.push({
    label: 'Cel białkowy',
    value: context.target.pdbId ? `${context.target.protein} · PDB ${context.target.pdbId}, łańcuch ${context.target.chain}` : context.target.protein,
    tag: 'REAL_MEASUREMENT',
    source: context.target.pdbId ? `struktura krystaliczna PDB ${context.target.pdbId}; receptor sha256 ${context.target.receptorPdbqtSha256.slice(0, 12)}…` : 'tabela referencyjna celów',
  });
  lines.push({ label: 'Powiązanie z celem', value: context.anatomy.protein, tag: 'TARGET_ASSOCIATION', source: context.anatomy.basis });
  lines.push({
    label: 'Kontekst anatomiczny',
    value: `${context.anatomy.sitePl} · układ: ${context.anatomy.system}${context.anatomy.alsoSystems.length ? ` (także ${context.anatomy.alsoSystems.join(', ')})` : ''}`,
    tag: 'ANATOMICAL_CONTEXT',
    source: context.anatomy.basis,
  });
  if (c?.stages.docking) {
    const d = c.stages.docking;
    lines.push({ label: capabilityLabel('interaction-modeling', 'pl'), value: d.value != null ? kcal(d.value) : d.status, tag: 'MODEL_PREDICTION', source: d.runId ? `science run ${d.runId}` : d.reason });
  }
  if (c?.pose) lines.push({ label: 'Poza w kieszeni', value: `${c.pose.atoms.length} atomów · reszty ${c.pose.pocketResidues.slice(0, 5).join(', ')}${c.pose.pocketResidues.length > 5 ? '…' : ''}`, tag: 'MODEL_PREDICTION', source: `${c.pose.engine}; poza sha256 ${c.pose.poseSha256.slice(0, 12)}…` });
  if (c?.stages.admet) {
    const a = c.stages.admet;
    const endpoints = a.endpoints ? Object.entries(a.endpoints).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ') : null;
    lines.push({ label: 'ADMET', value: endpoints ? `${a.status} · ${endpoints}` : a.status, tag: 'MODEL_PREDICTION', source: a.runId ? `science run ${a.runId}` : a.reason });
  }
  if (c?.stages.quantum?.value != null) lines.push({ label: capabilityLabel('quantum-chemistry', 'pl'), value: `${c.stages.quantum.value.toFixed(2)} eV`, tag: 'MODEL_PREDICTION', source: c.stages.quantum.runId ?? c.stages.quantum.reason });
  if (context.sealed) lines.push({ label: 'Replay / zapieczętowany rekord', value: `${context.sealed.recordId ?? 'brak id'} · łańcuch ${context.sealed.chainHash?.slice(0, 12) ?? '—'}… · sprawdzenie ${context.sealed.check ?? '—'}`, tag: 'PROVENANCE', source: 'pamięć naukowa serwera' });
  if (context.stateHash) lines.push({ label: 'Odcisk stanu kampanii', value: context.stateHash, tag: 'PROVENANCE', source: 'fnv1a kanonicznego stanu' });
  lines.push({ label: 'Efekt leku w tym narządzie', value: 'nie policzony — Genesis nie twierdzi, że lek tu działa', tag: 'NOT_VALIDATED' });
  return lines;
}

export const EPISTEMIC_TAG_PL: Readonly<Record<EpistemicTag, string>> = {
  TARGET_ASSOCIATION: 'powiązanie z celem',
  ANATOMICAL_CONTEXT: 'kontekst anatomiczny (atlas referencyjny)',
  MODEL_PREDICTION: 'przewidywanie modelu',
  REAL_MEASUREMENT: 'zmierzona struktura',
  PROVENANCE: 'pochodzenie',
  NOT_VALIDATED: 'niezweryfikowane',
};
