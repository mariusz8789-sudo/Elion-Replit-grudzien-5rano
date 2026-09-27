/**
 * campaignStats (Stage 7) — campaign dashboard numbers, computed ONLY from verified
 * descriptors and the Stage 6 ranking. No biological / efficacy / toxicity predictions;
 * every figure is a count or an average of information Genesis already computed.
 */
import type { Campaign } from './campaigns';
import { GROUNDING_VERSION } from './provenance';
import { type RankedCandidate, type Verdict } from './moleculeComparison';

export interface DescriptorAverages { molWt: number; logP: number; tpsa: number; hbd: number; hba: number; count: number }

export interface CampaignSummary {
  total: number;
  analysed: number;
  invalid: number;
  pending: number;
  progress: number; // 0..1 over (analysed+invalid)/total
  verdictCounts: Record<Verdict, number>;
  topCandidates: RankedCandidate[];
  needsValidation: RankedCandidate[];
  rejected: RankedCandidate[];
  averages: DescriptorAverages | null;
  grounding: { withAlerts: number; groundingVersion: string; note: string };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function campaignSummary(campaign: Campaign, ranked: RankedCandidate[]): CampaignSummary {
  const total = campaign.molecules.length;
  const analysed = campaign.molecules.filter((m) => m.status === 'ANALYSED').length;
  const invalid = campaign.molecules.filter((m) => m.status === 'INVALID').length;
  const pending = campaign.molecules.filter((m) => m.status === 'PENDING').length;

  const verdictCounts: Record<Verdict, number> = { CONTINUE: 0, NEEDS_EXPERIMENTS: 0, HIGH_UNCERTAINTY: 0, REJECT: 0 };
  for (const c of ranked) verdictCounts[c.decision.verdict] += 1;

  const averages: DescriptorAverages | null = ranked.length ? {
    molWt: mean(ranked.map((c) => c.props.molWt)),
    logP: mean(ranked.map((c) => c.props.logP)),
    tpsa: mean(ranked.map((c) => c.props.tpsa)),
    hbd: mean(ranked.map((c) => c.props.hbd)),
    hba: mean(ranked.map((c) => c.props.hba)),
    count: ranked.length,
  } : null;

  return {
    total, analysed, invalid, pending,
    progress: total ? (analysed + invalid) / total : 0,
    verdictCounts,
    topCandidates: ranked.filter((c) => c.decision.verdict === 'CONTINUE'),
    needsValidation: ranked.filter((c) => c.decision.verdict === 'NEEDS_EXPERIMENTS' || c.decision.verdict === 'HIGH_UNCERTAINTY'),
    rejected: ranked.filter((c) => c.decision.verdict === 'REJECT'),
    averages,
    grounding: {
      withAlerts: ranked.filter((c) => c.alerts.length > 0).length,
      groundingVersion: GROUNDING_VERSION,
      note: 'Wartości zweryfikowane przez RDKit; werdykty ugruntowane regułami. Bez predykcji biologicznych, skuteczności ani toksyczności.',
    },
  };
}
