/**
 * campaigns (Stage 7) — Research Campaigns store. A campaign is a molecular research
 * project: metadata + a list of molecules, each carrying its VERIFIED descriptors
 * (stored once, never recomputed) and a lifecycle timeline. Persisted per-user in
 * localStorage via the existing storage.ts — same pattern as assistantHistory, no new
 * backend, no duplicate project system. Resume works within the browser (results are
 * stored); there is no persistent crash recovery of in-flight runs.
 */
import { readJSON, writeJSON } from './storage';
import type { MoleculeProps } from './moleculeInterpretation';
import type { Candidate } from './moleculeComparison';

const KEY = 'campaigns/v1';

export type CampaignStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type MoleculeStatus = 'PENDING' | 'ANALYSED' | 'INVALID';
export type MoleculeStage = 'NEW' | 'ANALYSED' | 'COMPARED' | 'SELECTED' | 'NEEDS_VALIDATION' | 'REJECTED' | 'ARCHIVED';

export interface Transition { at: number; from: MoleculeStage | null; to: MoleculeStage; note?: string }

export interface CampaignMolecule {
  id: string;
  name: string;
  smiles: string;
  status: MoleculeStatus;
  stage: MoleculeStage;
  invalidReason?: string;
  props?: MoleculeProps;   // verified RDKit descriptors — stored once, never recomputed
  alerts?: string[];
  analysedAt?: number;
  timeline: Transition[];
}

export interface Campaign {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  goal: string;
  owner: string;
  createdAt: number;
  status: CampaignStatus;
  molecules: CampaignMolecule[];
}

export const STAGE_LABEL: Record<MoleculeStage, string> = {
  NEW: 'Nowa', ANALYSED: 'Przeanalizowana', COMPARED: 'Porównana', SELECTED: 'Wybrana',
  NEEDS_VALIDATION: 'Do walidacji', REJECTED: 'Odrzucona', ARCHIVED: 'Zarchiwizowana',
};

function newId(prefix: string): string {
  const rnd = Math.floor((Date.now() % 1e6) + Math.random() * 1e6).toString(36);
  return `${prefix}_${Date.now().toString(36)}_${rnd}`;
}

function readAll(): Campaign[] {
  const raw = readJSON<Campaign[] | null>(KEY, null);
  return Array.isArray(raw) ? raw.filter((c) => c && typeof c.id === 'string') : [];
}
function writeAll(all: Campaign[]): void { writeJSON(KEY, all.slice(0, 100)); }

export function listCampaigns(ownerId: string): Campaign[] {
  return readAll().filter((c) => c.ownerId === ownerId).sort((a, b) => b.createdAt - a.createdAt);
}
export function getCampaign(ownerId: string, id: string): Campaign | null {
  return readAll().find((c) => c.ownerId === ownerId && c.id === id) ?? null;
}

export function createCampaign(input: { ownerId: string; name: string; description: string; goal: string; owner: string }): Campaign {
  const all = readAll();
  const campaign: Campaign = {
    id: newId('camp'), ownerId: input.ownerId, name: input.name.trim() || 'Kampania',
    description: input.description.trim(), goal: input.goal.trim(), owner: input.owner,
    createdAt: Date.now(), status: 'ACTIVE', molecules: [],
  };
  all.unshift(campaign);
  writeAll(all);
  return campaign;
}

/** Persist a whole campaign (upsert). Used by the runner to save incremental results. */
export function saveCampaign(campaign: Campaign): void {
  const all = readAll();
  const i = all.findIndex((c) => c.id === campaign.id && c.ownerId === campaign.ownerId);
  if (i >= 0) all[i] = campaign; else all.unshift(campaign);
  writeAll(all);
}

export function deleteCampaign(ownerId: string, id: string): void {
  writeAll(readAll().filter((c) => !(c.ownerId === ownerId && c.id === id)));
}

/** Add molecules (deduped by SMILES within the campaign). Returns the updated campaign. */
export function addMolecules(campaign: Campaign, entries: { name: string; smiles: string }[]): Campaign {
  const seen = new Set(campaign.molecules.map((m) => m.smiles));
  const now = Date.now();
  const fresh: CampaignMolecule[] = [];
  for (const e of entries) {
    if (!e.smiles || seen.has(e.smiles)) continue; // dedupe against existing AND within this batch
    seen.add(e.smiles);
    fresh.push({ id: newId('mol'), name: e.name || e.smiles, smiles: e.smiles, status: 'PENDING', stage: 'NEW', timeline: [{ at: now, from: null, to: 'NEW' }] });
  }
  return { ...campaign, molecules: [...campaign.molecules, ...fresh] };
}

/** Transition a molecule to a new lifecycle stage, recording the timeline entry. */
export function transitionMolecule(campaign: Campaign, moleculeId: string, to: MoleculeStage, note?: string): Campaign {
  return {
    ...campaign,
    molecules: campaign.molecules.map((m) => {
      if (m.id !== moleculeId || m.stage === to) return m;
      return { ...m, stage: to, timeline: [...m.timeline, { at: Date.now(), from: m.stage, to, note }] };
    }),
  };
}

/** Mark a molecule analysed with its verified descriptors (stored once, never recomputed). */
export function markAnalysed(campaign: Campaign, id: string, props: MoleculeProps, alerts: string[]): Campaign {
  const now = Date.now();
  return {
    ...campaign,
    molecules: campaign.molecules.map((m) => {
      if (m.id !== id) return m;
      const advanced = m.stage === 'NEW';
      return {
        ...m, status: 'ANALYSED', props, alerts, analysedAt: now,
        stage: advanced ? 'ANALYSED' : m.stage,
        timeline: advanced ? [...m.timeline, { at: now, from: 'NEW', to: 'ANALYSED' }] : m.timeline,
      };
    }),
  };
}

/** Mark a molecule as Invalid SMILES with its validation error — excluded from ranking. */
export function markInvalid(campaign: Campaign, id: string, reason: string): Campaign {
  return { ...campaign, molecules: campaign.molecules.map((m) => (m.id === id ? { ...m, status: 'INVALID', invalidReason: reason } : m)) };
}

/** Advance every analysed-but-not-yet-compared molecule to COMPARED after a ranking pass. */
export function markCompared(campaign: Campaign): Campaign {
  const now = Date.now();
  return {
    ...campaign,
    molecules: campaign.molecules.map((m) => (m.status === 'ANALYSED' && m.stage === 'ANALYSED'
      ? { ...m, stage: 'COMPARED', timeline: [...m.timeline, { at: now, from: 'ANALYSED', to: 'COMPARED' }] }
      : m)),
  };
}

/** Molecules still needing analysis (PENDING) — the resume set. */
export function pendingMolecules(campaign: Campaign): CampaignMolecule[] {
  return campaign.molecules.filter((m) => m.status === 'PENDING');
}

/** Analysed molecules as engine Candidates — reuses stored descriptors, never recomputes. */
export function campaignCandidates(campaign: Campaign): Candidate[] {
  return campaign.molecules
    .filter((m): m is CampaignMolecule & { props: MoleculeProps } => m.status === 'ANALYSED' && !!m.props)
    .map((m) => ({ id: m.id, name: m.name, smiles: m.smiles, props: m.props, alerts: m.alerts ?? [] }));
}
