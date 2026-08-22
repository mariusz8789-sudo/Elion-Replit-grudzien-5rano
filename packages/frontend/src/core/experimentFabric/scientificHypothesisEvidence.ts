/**
 * GENESIS SCIENTIFIC HYPOTHESIS EVIDENCE
 *
 * Deterministic, source-bound references for preregistered hypotheses.
 *
 * This module resolves only records already versioned in the Knowledge Registry
 * or Supplemental Knowledge Registry. It deliberately does not search the web,
 * synthesize a citation, infer a scientific statement, change model capability,
 * or calculate a result.
 */

import { getKnowledgeDomain } from '../knowledge/registry';
import { getSupplementalKnowledge } from '../knowledge/supplementalRegistry';
import type {
  HypothesisKnowledgeReference,
  HypothesisKnowledgeReferenceInput,
} from './scientificDiscovery';

export const SCIENTIFIC_HYPOTHESIS_EVIDENCE_VERSION = '1.0.0';

const MAX_SUPPLEMENTAL_REFERENCES = 8;

function uniqueStableIds(ids: readonly string[]): readonly string[] {
  const unique = new Set<string>();
  for (const id of ids) {
    if (!id || id.trim().length === 0) throw new Error('Supplemental knowledge reference id cannot be empty.');
    unique.add(id);
  }
  return [...unique].sort((left, right) => left.localeCompare(right));
}

/**
 * Resolves source-bound references that are admissible as rationale for a
 * hypothesis about one registered model. A cited record must be in the same
 * domain and explicitly list the target model; scenario assumptions and
 * fictional references are never admissible as scientific rationale.
 */
export function resolveHypothesisKnowledgeReferences(
  input: HypothesisKnowledgeReferenceInput,
): readonly HypothesisKnowledgeReference[] {
  const domain = getKnowledgeDomain(input.domainId);
  if (!domain) throw new Error(`Knowledge domain '${input.domainId}' is not registered.`);

  const ids = uniqueStableIds(input.supplementalKnowledgeIds ?? []);
  if (ids.length > MAX_SUPPLEMENTAL_REFERENCES) {
    throw new Error(`A hypothesis can cite at most ${MAX_SUPPLEMENTAL_REFERENCES} supplemental knowledge records.`);
  }

  const references: HypothesisKnowledgeReference[] = [{
    referenceId: `corpus:${domain.sourceFile}`,
    kind: 'knowledge-corpus',
    domainId: domain.id,
    title: domain.title,
    epistemicStatus: 'CORPUS_REFERENCE',
    source: {
      title: domain.sourceFile,
      locator: `knowledge/${domain.sourceFile}`,
      retrievedAt: null,
    },
    statement: 'Domena i jej założenia są zdefiniowane w wersjonowanym Knowledge Registry Genesis.',
    limitation: domain.assumptions[0] ?? 'Zakres domeny jest ograniczony przez zarejestrowany model.',
  }];

  for (const id of ids) {
    const record = getSupplementalKnowledge(id);
    if (!record) throw new Error(`Supplemental knowledge record '${id}' is not registered.`);
    if (record.domainId !== input.domainId) {
      throw new Error(`Supplemental knowledge record '${id}' belongs to '${record.domainId}', not '${input.domainId}'.`);
    }
    if (!record.realModelIds.includes(input.modelId)) {
      throw new Error(`Supplemental knowledge record '${id}' is not registered as rationale for model '${input.modelId}'.`);
    }
    if (record.epistemicStatus === 'SCENARIO_ASSUMPTION' || record.epistemicStatus === 'FICTIONAL_REFERENCE') {
      throw new Error(`Supplemental knowledge record '${id}' has epistemic status '${record.epistemicStatus}' and cannot support a scientific hypothesis.`);
    }
    references.push({
      referenceId: `supplemental:${record.id}`,
      kind: 'supplemental-knowledge',
      domainId: record.domainId,
      title: record.title,
      epistemicStatus: record.epistemicStatus,
      source: {
        title: record.source.title,
        locator: record.source.url,
        retrievedAt: record.source.retrievedAt,
      },
      statement: record.statement,
      limitation: record.limitation,
    });
  }

  return references;
}
