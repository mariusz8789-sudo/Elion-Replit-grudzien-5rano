/**
 * sampleProject (Genesis · first-user experience) — a one-click, ready-to-run example so a
 * first-time scientist never faces a blank page. It creates real research projects seeded
 * with real, well-known molecules, added as PENDING — the user then runs the SAME real RDKit
 * pipeline everyone else uses. Nothing here fabricates a computed result: no descriptor value
 * is pre-filled and nothing is labelled "Verified" that RDKit did not actually compute. The
 * sample is a starting point, not fake data.
 *
 * Reuses the existing campaign store (core/campaigns) and cloud write-through
 * (core/campaignSync) — no new persistence, no new API.
 */
import { saveCampaign, type Campaign, type CampaignMolecule } from './campaigns';
import { pushCampaign } from './campaignSync';
import { getToken } from './backend/session';

function pending(id: string, name: string, smiles: string, now: number): CampaignMolecule {
  return { id, name, smiles, status: 'PENDING', stage: 'NEW', timeline: [{ at: now, from: null, to: 'NEW' }] };
}

/**
 * Two illustrative projects with real molecules (SMILES only — no pre-computed properties).
 * Deterministic ids so loading twice UPSERTS rather than duplicating. `now` is injected for
 * testability.
 */
export function buildSampleCampaigns(userId: string, ownerEmail: string, now: number): Campaign[] {
  const analgesics: CampaignMolecule[] = [
    pending('sample-mol-aspirin', 'Aspirin', 'CC(=O)Oc1ccccc1C(=O)O', now),
    pending('sample-mol-ibuprofen', 'Ibuprofen', 'CC(C)Cc1ccc(cc1)C(C)C(=O)O', now),
    pending('sample-mol-paracetamol', 'Paracetamol', 'CC(=O)Nc1ccc(O)cc1', now),
    pending('sample-mol-naproxen', 'Naproxen', 'COc1ccc2cc(ccc2c1)C(C)C(=O)O', now),
    pending('sample-mol-diclofenac', 'Diclofenac', 'O=C(O)Cc1ccccc1Nc1c(Cl)cccc1Cl', now),
  ];
  const fragments: CampaignMolecule[] = [
    pending('sample-mol-caffeine', 'Caffeine', 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', now),
    pending('sample-mol-adenine', 'Adenine', 'Nc1ncnc2[nH]cnc12', now),
    pending('sample-mol-purine', 'Purine', 'c1ncc2[nH]cnc2n1', now),
  ];

  return [
    {
      id: 'sample-analgesic-triage', ownerId: userId,
      name: 'Analgesic candidate triage (sample)',
      description: 'Example project. Real molecules, ready to analyse — run the analysis to compute real RDKit descriptors and rank them.',
      goal: 'Identify the most developable analgesic candidate.',
      owner: ownerEmail, createdAt: now, status: 'ACTIVE', molecules: analgesics,
    },
    {
      id: 'sample-fragment-screen', ownerId: userId,
      name: 'Purine fragment screen (sample)',
      description: 'Example project with small purine-like fragments, ready to analyse.',
      goal: 'Compare small fragments on physicochemical developability.',
      owner: ownerEmail, createdAt: now - 60_000, status: 'ACTIVE', molecules: fragments,
    },
  ];
}

/**
 * Create the sample projects for the signed-in user: save locally (offline-first) and
 * write through to the cloud so they appear in the Command Center portfolio. Returns the
 * id of the first project (to navigate the user straight into it). Cloud push is
 * best-effort — the projects still exist locally if offline.
 */
export async function loadSampleProject(userId: string, ownerEmail: string): Promise<string> {
  const campaigns = buildSampleCampaigns(userId, ownerEmail, Date.now());
  const token = getToken();
  for (const c of campaigns) {
    saveCampaign(c);
    if (token) { try { await pushCampaign(token, c); } catch { /* offline → local only */ } }
  }
  return campaigns[0].id;
}
