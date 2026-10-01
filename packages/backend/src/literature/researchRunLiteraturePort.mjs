import { searchLiterature } from './literatureService.mjs';
import { LITERATURE_RETRIEVAL_STATUS } from './literatureContracts.mjs';
import {
  CLAIM_EVIDENCE_RELATIONSHIP,
  proposeClaimEvidenceLink,
  unknownClaimEvidenceLink,
} from './claimEvidenceLink.mjs';

export const RESEARCH_RUN_LITERATURE_PORT_VERSION = 'research-run-literature-port@1';
const STR = (value, max) => typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : null;

function validateRequest(request) {
  const researchRunId = STR(request?.researchRunId, 300);
  const claimId = STR(request?.claimId, 300);
  const claim = STR(request?.claim, 4_000);
  const query = STR(request?.query, 1_000) ?? claim;
  if (!researchRunId || !claimId || !claim || !query) {
    return { ok: false, error: 'INVALID_RESEARCH_RUN_LITERATURE_REQUEST' };
  }
  return { ok: true, value: { researchRunId, claimId, claim, query, limit: request?.limit } };
}

function accessBlockers(results) {
  return results.connectors
    .filter((connector) => ![LITERATURE_RETRIEVAL_STATUS.AVAILABLE, LITERATURE_RETRIEVAL_STATUS.METADATA_ONLY, LITERATURE_RETRIEVAL_STATUS.NOT_FOUND].includes(connector.status))
    .map((connector) => ({
      sourceProvider: connector.connectorId,
      status: connector.status,
      failureCode: connector.failureCode ?? null,
      message: connector.message ?? null,
    }));
}

export function createResearchRunLiteraturePort(dependencies = {}) {
  const search = dependencies.search ?? searchLiterature;
  const linker = dependencies.linker ?? null;
  return Object.freeze({
    contractVersion: RESEARCH_RUN_LITERATURE_PORT_VERSION,
    async findForClaim(request, options = {}) {
      const validated = validateRequest(request);
      if (!validated.ok) {
        return {
          contractVersion: RESEARCH_RUN_LITERATURE_PORT_VERSION,
          status: 'NO_ACCESS',
          researchRunId: request?.researchRunId ?? null,
          claimId: request?.claimId ?? null,
          sources: [], links: [], support: [], contradictions: [],
          missingEvidence: ['A valid researchRunId, claimId and claim are required.'],
          accessBlockers: [{ sourceProvider: null, status: 'NO_ACCESS', failureCode: validated.error, message: null }],
        };
      }
      const input = validated.value;
      let literature;
      try {
        literature = await search({ text: input.query, limit: input.limit }, options);
      } catch {
        literature = { status: LITERATURE_RETRIEVAL_STATUS.BLOCKED_BY_NETWORK, sources: [], connectors: [{ connectorId: 'LITERATURE_SERVICE', status: LITERATURE_RETRIEVAL_STATUS.BLOCKED_BY_NETWORK, failureCode: 'LITERATURE_SERVICE_FAILURE' }] };
      }
      const sources = Array.isArray(literature.sources) ? literature.sources : [];
      const admittedSourceIds = new Set(sources.map((source) => source.sourceId));
      let links = sources.map((source) => unknownClaimEvidenceLink(input.claimId, source.sourceId)).filter(Boolean);
      let linkerBlocker = null;
      if (linker && sources.length > 0) {
        let proposed;
        try {
          proposed = await linker({ researchRunId: input.researchRunId, claimId: input.claimId, claim: input.claim, sources });
        } catch {
          proposed = [];
          linkerBlocker = {
            sourceProvider: 'CLAIM_EVIDENCE_LINKER',
            status: LITERATURE_RETRIEVAL_STATUS.NO_ACCESS,
            failureCode: 'CLAIM_EVIDENCE_LINKER_FAILURE',
            message: 'Claim-to-source extraction failed; retrieved sources remain available with UNKNOWN relationships.',
          };
        }
        const validatedLinks = (Array.isArray(proposed) ? proposed : [])
          .map((link) => proposeClaimEvidenceLink({ ...link, claimId: input.claimId }, admittedSourceIds))
          .filter(Boolean);
        if (validatedLinks.length > 0) links = validatedLinks;
      }
      const support = links.filter((link) => link.relationship === CLAIM_EVIDENCE_RELATIONSHIP.SUPPORTS);
      const contradictions = links.filter((link) => link.relationship === CLAIM_EVIDENCE_RELATIONSHIP.CONTRADICTS);
      const missingEvidence = [];
      if (sources.length === 0) missingEvidence.push('No source metadata was retrieved for this claim.');
      if (support.length === 0) missingEvidence.push('No source is yet linked as supporting this claim.');
      if (contradictions.length === 0) missingEvidence.push('No contradictory source has yet been identified.');
      if (links.some((link) => link.relationship !== CLAIM_EVIDENCE_RELATIONSHIP.UNKNOWN)) {
        missingEvidence.push('Claim-to-source relationships are proposals until separately reviewed and admitted by the canonical Evidence workflow.');
      }
      return {
        contractVersion: RESEARCH_RUN_LITERATURE_PORT_VERSION,
        status: literature.status,
        researchRunId: input.researchRunId,
        claimId: input.claimId,
        sources,
        links,
        support,
        contradictions,
        missingEvidence,
        accessBlockers: [
          ...accessBlockers({ connectors: Array.isArray(literature.connectors) ? literature.connectors : [] }),
          ...(linkerBlocker ? [linkerBlocker] : []),
        ],
      };
    },
  });
}
