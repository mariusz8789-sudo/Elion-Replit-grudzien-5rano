/**
 * campaignExport (Stage 7) — CSV / JSON export of a campaign. Exports ONLY verified
 * computations (RDKit descriptors), grounded interpretations (the ranking verdict +
 * its descriptor-grounded reasons / WHY lines) and provenance (engine versions).
 * Never exports unsupported claims — no biological activity, efficacy or toxicity.
 */
import { campaignCandidates, type Campaign } from './campaigns';
import { GROUNDING_VERSION } from './provenance';
import { rankCandidates, decisionTrace, VERDICT_META, type RankedCandidate } from './moleculeComparison';

/**
 * Scientific Snapshot reference (Genesis 2.1, Part 4): identifies EXACTLY which immutable,
 * content-addressed version of the campaign this export was generated from — so a reviewer
 * can look up the same snapshot later and confirm nothing drifted since the export.
 */
export interface ExportSnapshotRef { id: string; createdAt: number; scoringVersion?: string | null; admetVersion?: string | null }
export interface ExportMeta { rdkitVersion: string; generatedAt: number; snapshot?: ExportSnapshotRef | null }

const num = (n: number, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : '');
function csvField(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rankedFor(campaign: Campaign): RankedCandidate[] {
  return rankCandidates(campaignCandidates(campaign));
}

/** CSV — one row per molecule (verified descriptors + verdict + provenance). */
export function campaignToCSV(campaign: Campaign, meta: ExportMeta): string {
  const ranked = rankedFor(campaign);
  const byId = new Map(ranked.map((c) => [c.id, c]));
  const cols = ['rank', 'name', 'smiles', 'status', 'stage', 'score', 'verdict', 'molWt', 'logP', 'tpsa', 'hbd', 'hba', 'lipinskiViolations', 'lipinskiPass', 'structuralAlerts', 'rdkitVersion', 'groundingVersion', 'note'];
  const rows: string[] = [];
  if (meta.snapshot) {
    // A comment-prefixed provenance line, before the header — Excel/Sheets ignore it as a comment
    // once quoted; it exists so a reviewer can trace this exact export back to its source version.
    rows.push(csvField(`# Scientific Snapshot: ${meta.snapshot.id} · zapisana ${new Date(meta.snapshot.createdAt).toISOString()} · scoringVersion=${meta.snapshot.scoringVersion ?? '—'} · admetVersion=${meta.snapshot.admetVersion ?? '—'}`));
  }
  rows.push(cols.join(','));
  for (const m of campaign.molecules) {
    const c = byId.get(m.id);
    const row = [
      c ? c.rank : '', m.name, m.smiles, m.status, m.stage,
      c ? c.scored.score : '', c ? VERDICT_META[c.decision.verdict].label : '',
      m.props ? num(m.props.molWt) : '', m.props ? num(m.props.logP) : '', m.props ? num(m.props.tpsa, 1) : '',
      m.props ? m.props.hbd : '', m.props ? m.props.hba : '', m.props ? m.props.lipinskiViolations : '', m.props ? m.props.lipinskiPass : '',
      (m.alerts ?? []).join('; '),
      m.status === 'ANALYSED' ? meta.rdkitVersion : '', m.status === 'ANALYSED' ? GROUNDING_VERSION : '',
      m.status === 'INVALID' ? (m.invalidReason ?? 'Invalid SMILES') : 'Wymagana walidacja eksperymentalna',
    ];
    rows.push(row.map(csvField).join(','));
  }
  return rows.join('\n');
}

/** JSON — structured, self-describing, with honest limitations baked in. */
export function campaignToJSON(campaign: Campaign, meta: ExportMeta): string {
  const ranked = rankedFor(campaign);
  const byId = new Map(ranked.map((c) => [c.id, c]));
  const payload = {
    schema: 'genesis-campaign-export/1',
    provenance: {
      engine: 'RDKit', rdkitVersion: meta.rdkitVersion, groundingVersion: GROUNDING_VERSION, generatedAt: meta.generatedAt,
      scientificSnapshot: meta.snapshot ?? null,
    },
    campaign: { id: campaign.id, name: campaign.name, description: campaign.description, goal: campaign.goal, owner: campaign.owner, createdAt: campaign.createdAt, status: campaign.status },
    molecules: campaign.molecules.map((m) => {
      const c = byId.get(m.id);
      const trace = c ? decisionTrace(c) : null;
      return {
        name: m.name, smiles: m.smiles, status: m.status, stage: m.stage,
        invalidReason: m.status === 'INVALID' ? (m.invalidReason ?? 'Invalid SMILES') : undefined,
        verifiedComputations: m.props ?? null,
        structuralAlerts: m.alerts ?? [],
        rank: c?.rank ?? null,
        developabilityScore: c?.scored.score ?? null,
        verdict: c ? c.decision.verdict : null,
        groundedInterpretation: trace ? { positives: trace.positives, negatives: trace.negatives, verdictReasons: trace.verdictReasons, groundingStatus: trace.groundingStatus } : null,
        lifecycle: m.timeline,
      };
    }),
    limitations: [
      'Wszystkie wartości to deskryptory obliczeniowe RDKit — bez danych eksperymentalnych.',
      'Score i werdykty to triage rozwojowy, nie predykcja aktywności biologicznej, skuteczności ani toksyczności.',
    ],
    experimentalValidationRequired: true,
  };
  return JSON.stringify(payload, null, 2);
}

/** Trigger a browser download of exported text (no server round-trip). */
export function downloadText(filename: string, mime: string, text: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
