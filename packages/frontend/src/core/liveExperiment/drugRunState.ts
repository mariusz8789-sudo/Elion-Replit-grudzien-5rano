import { canonicalJson, fnv1a } from '../events/hash';
import type { CampaignCandidate } from '../backend/client';

/**
 * LIVE DRUG RUN — the one read model of a running drug-discovery campaign.
 *
 * A pure projection of what the backend pipeline itself persisted: the append-only campaign events
 * (`GET …/campaigns/:cid/events?after=`) and the stored candidates. It computes nothing scientific,
 * invents no stage and no progress: every field below is either copied from a persisted record or
 * counted from them. The 3D lab, the HUD and the outcome panel all read THIS state, so the scene
 * can only ever show what the engines actually produced — and `stateHash` lets a test prove the scene
 * shows exactly that state.
 */

export interface CampaignEventRecord {
  readonly seq: number;
  readonly id: string;
  readonly generation: number;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
}

export type DrugRunStage = 'WAITING' | 'GENERATING' | 'ADMET' | 'DOCKING' | 'QUANTUM' | 'COMPLETED' | 'CANCELLED';
export type StageName = 'admet' | 'docking' | 'quantum';

export interface StageMeasurement {
  readonly status: 'SELECTED' | 'COMPUTED' | 'PASSED' | 'REJECTED' | 'FAILED' | 'NOT_SELECTED';
  readonly value: number | null;
  readonly unit: string | null;
  readonly runId: string | null;
  readonly reason: string;
  /** ADMET only: headline endpoint predictions copied from the persisted event (MODEL_ESTIMATE). */
  readonly endpoints?: Readonly<Record<string, number>>;
}

/** Docking steps in the order the backend persists them when each one has actually completed. */
export type DockingStep = 'SELECTED' | 'LIGAND_PREPARED' | 'VINA_STARTED' | 'POSE_SCORED' | 'FAILED';

/** The protein the docking stage prepared (RECEPTOR_PREPARED event). */
export interface DockingTarget {
  readonly targetId: string;
  readonly pdbId: string;
  readonly chain: string;
  readonly protein: string;
  readonly receptorPdbqtSha256: string;
  readonly sourceSha256: string;
  readonly receptorAtoms: number;
  readonly center: readonly number[];
  readonly boxSize: readonly number[];
  readonly meekoVersion: string;
}

/** The top Vina pose and the receptor residues lining it, exactly as the persisted Science Run holds them. */
export interface DockedPose {
  readonly runId: string;
  readonly poseSha256: string;
  /** [element, x, y, z] in the receptor (crystal) frame, Å. */
  readonly atoms: readonly (readonly [string, number, number, number])[];
  readonly bonds: readonly (readonly [number, number, number])[];
  readonly pocketResidues: readonly string[];
  /** [element, x, y, z, residueIndex]. */
  readonly pocketAtoms: readonly (readonly [string, number, number, number, number])[];
  readonly engine: string;
}

/** What `liveDrugRun` passes in for a docking run it fetched (`GET …/science-runs/:runId`). */
export interface DockingRunRecord {
  readonly id: string;
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly provenance: Readonly<Record<string, unknown>>;
}

export interface LiveCandidate {
  readonly id: string;
  readonly smiles: string;
  readonly generation: number;
  readonly parentSmiles: string | null;
  readonly transformation: string | null;
  readonly status: 'retained' | 'rejected';
  readonly rejectedReason: string | null;
  readonly pareto: boolean;
  readonly descriptors: Readonly<Record<string, number>>;
  readonly stages: Readonly<Partial<Record<StageName, StageMeasurement>>>;
  readonly modelConflict: boolean;
  /** Latest completed docking step for this candidate, null when it never entered docking. */
  readonly dockingStep: DockingStep | null;
  readonly pose: DockedPose | null;
}

export interface LineageEdge {
  readonly parent: string;
  readonly transformation: string;
  readonly product: string;
  readonly status: 'retained' | 'rejected';
}

export interface StageProgress { readonly done: number; readonly planned: number }

export interface LiveDrugRunState {
  readonly stage: DrugRunStage;
  readonly lastSeq: number;
  readonly generationsCompleted: number;
  readonly maxGenerations: number;
  readonly progress: Readonly<Record<'generation' | StageName, StageProgress>>;
  readonly candidates: readonly LiveCandidate[];
  readonly lineage: readonly LineageEdge[];
  readonly blocked: readonly { readonly stage: string; readonly blocker: string }[];
  readonly stopReason: string | null;
  readonly target: DockingTarget | null;
  /** fnv1a of the canonical JSON of everything above — the identity the scene must reproduce. */
  readonly stateHash: string;
}

const STAGES: readonly StageName[] = ['admet', 'docking', 'quantum'];

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

function measurementFrom(event: CampaignEventRecord): StageMeasurement | null {
  const p = event.payload;
  const reason = str(p.reason) ?? event.type;
  const runId = str(p.runId) ?? str(p.admetRunId);
  if (event.type === 'STAGE_SELECTION') {
    if (reason.startsWith('SELECTED_FOR_')) return { status: 'SELECTED', value: null, unit: null, runId: null, reason };
    if (reason.startsWith('NOT_SELECTED_FOR_')) return { status: 'NOT_SELECTED', value: null, unit: null, runId: null, reason: str(p.why) ? `${reason}: ${str(p.why)}` : reason };
    if (reason.endsWith('_PASSED')) return { status: 'PASSED', value: null, unit: null, runId: null, reason };
    if (reason.endsWith('_REJECTED')) return { status: 'REJECTED', value: num(p.value), unit: null, runId: null, reason };
    return null;
  }
  if (event.type === 'STAGE_RESULT') {
    if (reason.endsWith('_FAILED')) return { status: 'FAILED', value: null, unit: null, runId: null, reason };
    const affinity = num(p.bestAffinityKcalMol);
    if (affinity !== null) return { status: 'COMPUTED', value: affinity, unit: 'kcal/mol', runId, reason };
    const gap = num(p.homoLumoGapEv);
    if (gap !== null) return { status: 'COMPUTED', value: gap, unit: 'eV', runId, reason };
    const endpoints = p.keyEndpoints && typeof p.keyEndpoints === 'object'
      ? Object.fromEntries(Object.entries(p.keyEndpoints as Record<string, unknown>).filter(([, v]) => num(v) !== null).sort(([a], [b]) => (a < b ? -1 : 1)) as [string, number][])
      : null;
    return endpoints ? { status: 'COMPUTED', value: null, unit: null, runId, reason, endpoints } : { status: 'COMPUTED', value: null, unit: null, runId, reason };
  }
  return null;
}

const DOCK_STEP_ORDER: readonly DockingStep[] = ['SELECTED', 'LIGAND_PREPARED', 'VINA_STARTED', 'POSE_SCORED', 'FAILED'];

function targetFrom(p: Readonly<Record<string, unknown>>): DockingTarget | null {
  const targetId = str(p.targetId);
  if (!targetId) return null;
  const vec = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : []);
  return {
    targetId, pdbId: str(p.pdbId) ?? '', chain: str(p.chain) ?? '', protein: str(p.protein) ?? '',
    receptorPdbqtSha256: str(p.receptorPdbqtSha256) ?? '', sourceSha256: str(p.sourceSha256) ?? '',
    receptorAtoms: num(p.receptorAtoms) ?? 0, center: vec(p.center), boxSize: vec(p.boxSize), meekoVersion: str(p.meekoVersion) ?? '',
  };
}

/** Copies the top pose out of a fetched docking Science Run; null unless every part is present. */
export function poseFromRun(run: DockingRunRecord): DockedPose | null {
  const o = run.outputs;
  const pose = o.pose as { atoms?: unknown; bonds?: unknown } | undefined;
  const pocket = o.pocket as { residues?: unknown; atoms?: unknown } | undefined;
  const sha = str(o.poseSha256);
  if (!pose || !Array.isArray(pose.atoms) || !Array.isArray(pose.bonds) || !sha) return null;
  const atoms = (pose.atoms as unknown[]).filter((a): a is [string, number, number, number] => Array.isArray(a) && a.length >= 4)
    .map((a) => [String(a[0]), Number(a[1]), Number(a[2]), Number(a[3])] as const);
  const bonds = (pose.bonds as unknown[]).filter((b): b is [number, number, number] => Array.isArray(b) && b.length >= 3)
    .map((b) => [Number(b[0]), Number(b[1]), Number(b[2])] as const);
  const pocketAtoms = Array.isArray(pocket?.atoms)
    ? (pocket!.atoms as unknown[]).filter((a): a is [string, number, number, number, number] => Array.isArray(a) && a.length >= 5)
      .map((a) => [String(a[0]), Number(a[1]), Number(a[2]), Number(a[3]), Number(a[4])] as const)
    : [];
  const pocketResidues = Array.isArray(pocket?.residues) ? (pocket!.residues as unknown[]).map(String) : [];
  const engine = str((run.provenance as { engine?: unknown }).engine) ?? 'AutoDock Vina';
  return { runId: run.id, poseSha256: sha, atoms, bonds, pocketResidues, pocketAtoms, engine };
}

/** Later facts win, but a measurement never falls back to a mere selection. */
function merge(previous: StageMeasurement | undefined, next: StageMeasurement): StageMeasurement {
  if (!previous) return next;
  if (previous.status === 'COMPUTED' && (next.status === 'SELECTED' || next.status === 'NOT_SELECTED')) return previous;
  if (previous.status === 'COMPUTED' && (next.status === 'PASSED' || next.status === 'REJECTED')) return { ...previous, status: next.status, reason: next.reason };
  return next;
}

export function projectDrugRun(input: {
  readonly events: readonly CampaignEventRecord[];
  readonly candidates: readonly CampaignCandidate[];
  readonly maxGenerations: number;
  /** Whether a campaign job (run or heavy stage) is still executing; a finished run reads COMPLETED. */
  readonly jobRunning?: boolean;
  /** Docking Science Runs fetched by id from the STAGE_RESULT events (carry the real pose). */
  readonly dockingRuns?: readonly DockingRunRecord[];
}): LiveDrugRunState {
  const events = [...input.events].sort((a, b) => a.seq - b.seq);
  const stageByCandidate = new Map<string, Partial<Record<StageName, StageMeasurement>>>();
  const conflicts = new Set<string>();
  const blocked: { stage: string; blocker: string }[] = [];
  let generationsCompleted = 0;
  let stopReason: string | null = null;
  let lastStage: DrugRunStage = events.length ? 'GENERATING' : 'WAITING';
  let target: DockingTarget | null = null;
  const dockSteps = new Map<string, DockingStep>();
  const advance = (id: string, step: DockingStep) => {
    const prev = dockSteps.get(id);
    if (!prev || DOCK_STEP_ORDER.indexOf(step) > DOCK_STEP_ORDER.indexOf(prev)) dockSteps.set(id, step);
  };

  for (const e of events) {
    if (e.type === 'GENERATION_COMPLETED') generationsCompleted = Math.max(generationsCompleted, e.generation);
    else if (e.type === 'STOPPING_CONDITION_REACHED') {
      stopReason = str(e.payload.stopReason) ?? 'STOPPED';
      lastStage = stopReason === 'CANCELLED_BY_USER' ? 'CANCELLED' : 'COMPLETED';
    } else if (e.type === 'STAGE_BLOCKED') blocked.push({ stage: str(e.payload.stage) ?? 'unknown', blocker: str(e.payload.blocker) ?? 'BLOCKED' });
    else if (e.type === 'MODEL_CONFLICT') { const id = str(e.payload.candidateId); if (id) conflicts.add(id); }
    else if (e.type === 'STAGE_PROGRESS' && e.payload.stage === 'docking') {
      const step = str(e.payload.step);
      const id = str(e.payload.candidateId);
      if (step === 'RECEPTOR_PREPARED') target = targetFrom(e.payload);
      else if (id && (step === 'LIGAND_PREPARED' || step === 'VINA_STARTED')) advance(id, step);
      lastStage = 'DOCKING';
    } else if (e.type === 'STAGE_SELECTION' || e.type === 'STAGE_RESULT') {
      const stage = str(e.payload.stage) as StageName | null;
      const id = str(e.payload.candidateId);
      const m = measurementFrom(e);
      if (!stage || !STAGES.includes(stage) || !id || !m) continue;
      if (stage === 'docking') advance(id, m.status === 'SELECTED' ? 'SELECTED' : m.status === 'FAILED' ? 'FAILED' : m.status === 'COMPUTED' ? 'POSE_SCORED' : 'SELECTED');
      const bucket = stageByCandidate.get(id) ?? {};
      bucket[stage] = merge(bucket[stage], m);
      stageByCandidate.set(id, bucket);
      lastStage = stage === 'admet' ? 'ADMET' : stage === 'docking' ? 'DOCKING' : 'QUANTUM';
    }
  }

  const poses = new Map<string, DockedPose>();
  for (const run of [...(input.dockingRuns ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const pose = poseFromRun(run);
    if (pose) poses.set(run.id, pose);
  }
  const candidates: LiveCandidate[] = [...input.candidates]
    .sort((a, b) => a.generation - b.generation || (a.canonicalSmiles < b.canonicalSmiles ? -1 : a.canonicalSmiles > b.canonicalSmiles ? 1 : 0))
    .map((c) => ({
      id: c.id,
      smiles: c.canonicalSmiles,
      generation: c.generation,
      parentSmiles: c.parentSmiles,
      transformation: c.transformation,
      status: c.status === 'retained' ? 'retained' : 'rejected',
      rejectedReason: c.rejectedReason,
      pareto: c.pareto,
      descriptors: c.descriptors,
      stages: stageByCandidate.get(c.id) ?? {},
      modelConflict: conflicts.has(c.id),
      dockingStep: stageByCandidate.get(c.id)?.docking?.status === 'NOT_SELECTED' ? null : (dockSteps.get(c.id) ?? null),
      pose: (() => { const runId = stageByCandidate.get(c.id)?.docking?.runId; return runId ? poses.get(runId) ?? null : null; })(),
    }));

  const lineage: LineageEdge[] = candidates
    .filter((c) => c.parentSmiles && c.transformation)
    .map((c) => ({ parent: c.parentSmiles!, transformation: c.transformation!, product: c.smiles, status: c.status }));

  const progress = {
    generation: { done: generationsCompleted, planned: input.maxGenerations },
    ...Object.fromEntries(STAGES.map((stage) => {
      const ms = [...stageByCandidate.values()].map((b) => b[stage]).filter((m): m is StageMeasurement => Boolean(m) && m!.status !== 'NOT_SELECTED');
      return [stage, { done: ms.filter((m) => m.status !== 'SELECTED').length, planned: ms.length }];
    })),
  } as Record<'generation' | StageName, StageProgress>;

  // Heavy-stage events arrive after the campaign's own stop event; once no job runs, the run is over.
  const stage: DrugRunStage = input.jobRunning === false && stopReason
    ? (stopReason === 'CANCELLED_BY_USER' ? 'CANCELLED' : 'COMPLETED')
    : lastStage;
  const body = {
    stage,
    lastSeq: events.length ? events[events.length - 1]!.seq : 0,
    generationsCompleted,
    maxGenerations: input.maxGenerations,
    progress,
    candidates,
    lineage,
    blocked,
    stopReason,
    target,
  };
  return { ...body, stateHash: fnv1a(canonicalJson(body)) };
}
