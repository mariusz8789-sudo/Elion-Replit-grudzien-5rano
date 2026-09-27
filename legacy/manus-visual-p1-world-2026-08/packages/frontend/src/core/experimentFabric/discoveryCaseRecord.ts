/**
 * GENESIS DISCOVERY CASE RECORD
 *
 * A serializable, replayable envelope for artifacts that already exist in the
 * Discovery Loop. It does not execute a model, retrieve a source, generate a
 * hypothesis, choose a parameter, approve a protocol or maintain another
 * provenance store.
 */

import { canonicalJson, fnv1a } from '../events/hash';
import type { DiscoveryAnalysis } from './discovery';
import type { GenesisResearchPacket } from './researchPacket';
import type { NextExperimentSelection } from './scientificNextExperiment';
import type { ScientificHypothesisCandidate } from './scientificHypothesisCandidate';
import type { ScientificEvidenceChain } from './scientificDiscovery';

export const DISCOVERY_CASE_RECORD_VERSION = '1.0.0';

export type DiscoveryCaseStatus = 'READY_FOR_REVIEW' | 'INCOMPLETE_CANDIDATE' | 'BLOCKED_ARTIFACT_MISMATCH';

export interface DiscoveryCaseRecordInput {
  research: GenesisResearchPacket;
  evidence: ScientificEvidenceChain;
  analysis: DiscoveryAnalysis;
  candidate: ScientificHypothesisCandidate;
  /** Optional deterministic selection of an already preregistered next protocol. */
  nextSelection?: NextExperimentSelection;
}

export interface DiscoveryCaseRecord {
  contractVersion: string;
  caseId: string;
  status: DiscoveryCaseStatus;
  research: GenesisResearchPacket;
  evidence: ScientificEvidenceChain;
  analysis: DiscoveryAnalysis;
  candidate: ScientificHypothesisCandidate;
  nextSelection?: NextExperimentSelection;
  provenance: {
    researchPacketFingerprint: string;
    evidenceFingerprint: string;
    candidateFingerprint: string;
    nextSelectionFingerprint?: string;
  };
  caseFingerprint: string;
  blockingReasons: readonly string[];
  disclaimer: string;
}

function researchCoversEvidenceDomain(research: GenesisResearchPacket, domainId: string): boolean {
  return research.corpusSources.some((source) => source.domainId === domainId)
    || research.supplementalSources.some((source) => source.domainId === domainId);
}

function mismatchReasons(input: DiscoveryCaseRecordInput): readonly string[] {
  const { research, evidence, analysis, candidate, nextSelection } = input;
  const reasons: string[] = [];
  const hypothesis = evidence.design.hypothesis;
  if (research.status !== 'RETRIEVED') reasons.push('Research Packet nie zawiera żadnego zarejestrowanego źródła; nie może stanowić source-bound wejścia case record.');
  if (!researchCoversEvidenceDomain(research, hypothesis.domainId)) reasons.push('Research Packet nie obejmuje domeny Evidence Chain.');
  if (evidence.createdFromRealRunsOnly !== true) reasons.push('Evidence Chain nie jest oznaczony jako utworzony wyłącznie z realnych runów.');
  if (analysis.modelId !== hypothesis.modelId || analysis.outputKey !== evidence.design.primaryMetric) reasons.push('DiscoveryAnalysis nie pasuje do modelu lub primary metric Evidence Chain.');
  if (
    candidate.evidenceId !== evidence.evidenceId
    || candidate.evidenceProvenanceFingerprint !== evidence.provenanceFingerprint
    || candidate.modelId !== hypothesis.modelId
    || candidate.domainId !== hypothesis.domainId
  ) reasons.push('Hypothesis candidate nie pochodzi z tego samego Evidence Chain.');
  if (nextSelection !== undefined) {
    if (nextSelection.evidenceId !== evidence.evidenceId || nextSelection.evidenceProvenanceFingerprint !== evidence.provenanceFingerprint) {
      reasons.push('Next protocol selection nie pochodzi z tego samego Evidence Chain.');
    }
    if (
      nextSelection.selectedDesign !== undefined
      && (nextSelection.selectedDesign.hypothesis.modelId !== hypothesis.modelId || nextSelection.selectedDesign.hypothesis.domainId !== hypothesis.domainId)
    ) reasons.push('Wybrany next protocol nie jest zgodny z domeną lub modelem Evidence Chain.');
  }
  return reasons;
}

/**
 * Creates an immutable case record from compatible, existing artifacts. A
 * blocked or incomplete candidate remains visible but cannot be misrepresented
 * as review-ready.
 */
export function createDiscoveryCaseRecord(input: DiscoveryCaseRecordInput): DiscoveryCaseRecord {
  const blockingReasons = mismatchReasons(input);
  const status: DiscoveryCaseStatus = blockingReasons.length > 0
    ? 'BLOCKED_ARTIFACT_MISMATCH'
    : input.candidate.status === 'CANDIDATE_READY'
      ? 'READY_FOR_REVIEW'
      : 'INCOMPLETE_CANDIDATE';
  const provenance = {
    researchPacketFingerprint: input.research.packetFingerprint,
    evidenceFingerprint: input.evidence.provenanceFingerprint,
    candidateFingerprint: input.candidate.selectionFingerprint,
    ...(input.nextSelection === undefined ? {} : { nextSelectionFingerprint: input.nextSelection.selectionFingerprint }),
  };
  const caseFingerprint = `discovery_case_${fnv1a(canonicalJson({
    version: DISCOVERY_CASE_RECORD_VERSION,
    status,
    provenance,
    analysis: {
      modelId: input.analysis.modelId,
      parameterKey: input.analysis.parameterKey,
      outputKey: input.analysis.outputKey,
      findings: input.analysis.findings,
    },
    blockingReasons,
  }))}`;
  return {
    contractVersion: DISCOVERY_CASE_RECORD_VERSION,
    caseId: caseFingerprint,
    status,
    research: input.research,
    evidence: input.evidence,
    analysis: input.analysis,
    candidate: input.candidate,
    ...(input.nextSelection === undefined ? {} : { nextSelection: input.nextSelection }),
    provenance,
    caseFingerprint,
    blockingReasons,
    disclaimer: 'Discovery Case Record jest serializowalnym indeksem już istniejących artefaktów. Nie jest zatwierdzeniem hipotezy, odkryciem, wynikiem nowego execution ani automatyczną zgodą na next protocol. Każdy follow-up nadal wymaga niezależnego scientific review, prerejestracji i realnego execution.',
  };
}

export function serializeDiscoveryCaseRecord(record: DiscoveryCaseRecord): string {
  return canonicalJson(record);
}

/** Deterministic replay rebuilds the envelope only; it never re-executes a model. */
export function replayDiscoveryCaseRecord(input: DiscoveryCaseRecordInput): DiscoveryCaseRecord {
  return createDiscoveryCaseRecord(input);
}
