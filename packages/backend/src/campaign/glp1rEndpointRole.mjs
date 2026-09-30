/**
 * GLP-1R endpoint role classification (D-145).
 *
 * Says what a GLP-1R assay MEASURES, from its transcribed ChEMBL description.
 * It is descriptive, not a selection policy: it never decides which rows a
 * campaign may use. Each campaign declares that in its own preregistration.
 *
 * Scope note: the Gs/cAMP distinction below is what a GLP-1R AGONIST question
 * needs. It is not a rule for other targets.
 *
 * Rules are frozen in campaign/glp1r-d145-endpoint-role-prereg.json. The two
 * that matter most:
 *   - an EC50 is never by itself evidence of agonism;
 *   - anything not unambiguously one role is UNKNOWN, never a guess.
 */

export const ENDPOINT_ROLES = Object.freeze(['FUNCTIONAL_AGONISM', 'OTHER_FUNCTIONAL', 'BINDING_AFFINITY', 'UNKNOWN']);

const CAMP_READOUT = /\bcamp\b|cyclic amp|adenosine 3['’,][\s,]*5['’]-?\s*(?:cyclic\s*)?monophosphate/i;
const REPORTER_DRIVEN_BY_CAMP = /(luciferase|reporter gene|cre[- ]luc)/i;
const AGONIST_STATED = /\bagonist(ic)?\b|\bagonism\b/i;
const NON_CAMP_TRANSDUCER = /beta[- ]arrestin|β-arrestin|arrestin|internali[sz]ation|calcium mobili[sz]ation|calcium flux|\bca2\+/i;
const ALLOSTERIC = /allosteric|\bpam\b|\bnam\b|potentiation/i;
const ANTAGONIST = /antagonist|inhibition of .*(agonist|glp-?1)[- ]induced/i;
const BINDING = /displacement of|competition binding|radioligand|saturation binding|\bbinding affinity\b|\[125i\]|\[3h\](?!camp)/i;
/** A description that names neither a readout nor a mechanism — e.g. "Potency measured using recombinant human GLP-1 receptor expressed in BHK cells". */
const BARE_POTENCY = /^(potency|effective concentration|activity)\b/i;

const HUMAN_STATED = /\bhuman\b|\bhGLP-?1R\b/i;
const ORIGIN_UNKNOWN = /unknown origin/i;
const HETEROLOGOUS = /\b(CHO|CHO-K1|HEK ?293|BHK|COS7|COS-7|9-3-H|Flp-?In)\b/i;

/**
 * @param {{record: {assayType?: string, description?: string, bao?: string, format?: string}|null, actionType?: string}} input
 * @returns {{role: string, reason: string, evidence: string, speciesStated: boolean, heterologousSystem: boolean, source: string}}
 */
export function classifyAssayRole({ record, actionType = '' } = {}) {
  if (!record || !record.description || !record.description.trim()) {
    return {
      role: 'UNKNOWN',
      reason: 'BLOCKED_BY_DATA_ACCESS',
      evidence: 'no assay description is available offline and ChEMBL is not reachable from this environment',
      speciesStated: false,
      heterologousSystem: false,
      source: 'none',
    };
  }

  const d = record.description;
  const quote = d.length > 220 ? `${d.slice(0, 220)}…` : d;
  const base = {
    evidence: quote,
    speciesStated: HUMAN_STATED.test(d) && !ORIGIN_UNKNOWN.test(d),
    heterologousSystem: HETEROLOGOUS.test(d),
    source: 'data/transcription/glp1r-a3',
  };

  const saysAgonist = AGONIST_STATED.test(d) || /^AGONIST$/i.test(actionType.trim());
  const camp = CAMP_READOUT.test(d) || (REPORTER_DRIVEN_BY_CAMP.test(d) && CAMP_READOUT.test(d));
  const nonCamp = NON_CAMP_TRANSDUCER.test(d);
  const allosteric = ALLOSTERIC.test(d);
  const antagonist = ANTAGONIST.test(d);
  const binding = BINDING.test(d);

  // Conflicting signals are never resolved by preference order.
  if (binding && camp) return { ...base, role: 'UNKNOWN', reason: 'CONFLICTING_SIGNALS', };
  if (binding) return { ...base, role: 'BINDING_AFFINITY', reason: 'BINDING_READOUT_NAMED' };
  if (allosteric) return { ...base, role: 'OTHER_FUNCTIONAL', reason: 'ALLOSTERIC_MODULATION_NOT_AGONISM' };
  if (antagonist) return { ...base, role: 'OTHER_FUNCTIONAL', reason: 'ANTAGONISM_NOT_AGONISM' };
  if (nonCamp && !camp) return { ...base, role: 'OTHER_FUNCTIONAL', reason: 'FUNCTIONAL_BUT_NOT_CAMP_ARM' };
  if (saysAgonist && camp) return { ...base, role: 'FUNCTIONAL_AGONISM', reason: 'AGONISM_STATED_AND_CAMP_READOUT_NAMED' };
  if (camp && !saysAgonist) return { ...base, role: 'UNKNOWN', reason: 'CAMP_READOUT_BUT_AGONISM_NOT_STATED' };
  if (saysAgonist && !camp) return { ...base, role: 'UNKNOWN', reason: 'AGONISM_STATED_BUT_NO_READOUT_NAMED' };
  if (BARE_POTENCY.test(d.trim())) return { ...base, role: 'UNKNOWN', reason: 'NO_READOUT_AND_NO_MECHANISM_NAMED' };
  return { ...base, role: 'UNKNOWN', reason: 'UNCLASSIFIABLE_UNDER_FROZEN_RULES' };
}
