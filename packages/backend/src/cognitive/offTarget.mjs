/**
 * Off-Target Prediction (Genesis V3, Phase 1). Production-grade, reproducible off-target liability
 * and toxicity-risk classification computed from REAL ADMET-AI predictions — specifically the Tox21
 * nuclear-receptor + stress-response panels, hERG, the CYP450 enzymes, Pgp, plus mutagenicity /
 * hepatotoxicity / clinical-toxicity / carcinogenicity models. Each panel entry maps to a NAMED human
 * protein/gene, so this is genuine off-target-protein liability prediction, not a fabricated claim.
 *
 * HONESTY: every value is MODEL_INFERRED (a validated ML model), never experimental binding. This is
 * a computational LIABILITY signal, not proof of off-target activity or toxicity. Given no ADMET
 * predictions, the result is BLOCKED_BY_RESOURCES — nothing is invented.
 */
export const OFF_TARGET_VERSION = 'genesis-offtarget/1';
export const RISK = Object.freeze({ LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' });

/** ADMET-AI endpoint → named human off-target protein/gene (the Tox21 + ADMET liability panel). */
export const OFF_TARGET_PANEL = Object.freeze([
  { endpoint: 'hERG', gene: 'KCNH2', protein: 'hERG cardiac potassium channel', category: 'ion_channel', severe: true },
  { endpoint: 'NR-AR', gene: 'AR', protein: 'Androgen receptor', category: 'nuclear_receptor' },
  { endpoint: 'NR-AR-LBD', gene: 'AR', protein: 'Androgen receptor (LBD)', category: 'nuclear_receptor' },
  { endpoint: 'NR-ER', gene: 'ESR1', protein: 'Estrogen receptor α', category: 'nuclear_receptor' },
  { endpoint: 'NR-ER-LBD', gene: 'ESR1', protein: 'Estrogen receptor α (LBD)', category: 'nuclear_receptor' },
  { endpoint: 'NR-AhR', gene: 'AHR', protein: 'Aryl hydrocarbon receptor', category: 'nuclear_receptor' },
  { endpoint: 'NR-Aromatase', gene: 'CYP19A1', protein: 'Aromatase', category: 'enzyme' },
  { endpoint: 'NR-PPAR-gamma', gene: 'PPARG', protein: 'PPAR-γ', category: 'nuclear_receptor' },
  { endpoint: 'SR-ARE', gene: 'NFE2L2', protein: 'Nrf2/ARE oxidative-stress pathway', category: 'stress_response' },
  { endpoint: 'SR-p53', gene: 'TP53', protein: 'p53 DNA-damage pathway', category: 'stress_response' },
  { endpoint: 'SR-MMP', gene: 'MMP', protein: 'Mitochondrial membrane potential', category: 'stress_response' },
  { endpoint: 'CYP1A2_Veith', gene: 'CYP1A2', protein: 'Cytochrome P450 1A2 (inhibition)', category: 'enzyme' },
  { endpoint: 'CYP2C9_Veith', gene: 'CYP2C9', protein: 'Cytochrome P450 2C9 (inhibition)', category: 'enzyme' },
  { endpoint: 'CYP2C19_Veith', gene: 'CYP2C19', protein: 'Cytochrome P450 2C19 (inhibition)', category: 'enzyme' },
  { endpoint: 'CYP2D6_Veith', gene: 'CYP2D6', protein: 'Cytochrome P450 2D6 (inhibition)', category: 'enzyme' },
  { endpoint: 'CYP3A4_Veith', gene: 'CYP3A4', protein: 'Cytochrome P450 3A4 (inhibition)', category: 'enzyme' },
  { endpoint: 'Pgp_Broccatelli', gene: 'ABCB1', protein: 'P-glycoprotein efflux transporter', category: 'transporter' },
]);

/** Toxicity endpoints (organism-level liabilities) with severity weight. */
export const TOX_PANEL = Object.freeze([
  { endpoint: 'hERG', label: 'cardiotoxicity (hERG)', severe: true },
  { endpoint: 'DILI', label: 'drug-induced liver injury', severe: true },
  { endpoint: 'ClinTox', label: 'clinical toxicity failure', severe: true },
  { endpoint: 'AMES', label: 'mutagenicity (Ames)', severe: true },
  { endpoint: 'Carcinogens_Lagunin', label: 'carcinogenicity', severe: true },
  { endpoint: 'Skin_Reaction', label: 'skin sensitisation', severe: false },
]);

const STRONG = 0.7; const WEAK = 0.5;
const prob = (preds, ep) => { const v = preds?.[ep]; return typeof v === 'number' ? v : null; };

/**
 * Predict off-target liability + toxicity risk for one candidate from its ADMET predictions.
 * `predictions` is the ADMET-AI output map { endpoint: probability }. Reproducible + deterministic.
 */
export function predictOffTarget(predictions, { strong = STRONG, weak = WEAK } = {}) {
  if (!predictions || typeof predictions !== 'object') {
    return { status: 'BLOCKED_BY_RESOURCES', version: OFF_TARGET_VERSION, reason: 'no ADMET predictions available — off-target liability requires the ADMET-AI model (never fabricated)' };
  }

  const offTargets = [];
  for (const t of OFF_TARGET_PANEL) {
    const p = prob(predictions, t.endpoint);
    if (p == null) continue;
    const flag = p >= strong ? 'STRONG' : p >= weak ? 'WEAK' : 'NONE';
    offTargets.push({ ...t, probability: +p.toFixed(4), flag, confidence: +Math.min(1, Math.abs(p - 0.5) * 2).toFixed(4) });
  }
  const tox = [];
  for (const t of TOX_PANEL) {
    const p = prob(predictions, t.endpoint);
    if (p == null) continue;
    tox.push({ ...t, probability: +p.toFixed(4), flag: p >= strong ? 'STRONG' : p >= weak ? 'WEAK' : 'NONE', confidence: +Math.min(1, Math.abs(p - 0.5) * 2).toFixed(4) });
  }
  if (offTargets.length === 0 && tox.length === 0) {
    return { status: 'BLOCKED_BY_RESOURCES', version: OFF_TARGET_VERSION, reason: 'ADMET predictions present but contain none of the off-target/tox panel endpoints' };
  }

  const strongOff = offTargets.filter((o) => o.flag === 'STRONG');
  const weakOff = offTargets.filter((o) => o.flag === 'WEAK');
  const strongTox = tox.filter((o) => o.flag === 'STRONG');
  const severeStrongTox = strongTox.filter((o) => o.severe);

  // Selectivity: fraction of the off-target panel NOT flagged active (higher = cleaner).
  const activeOff = offTargets.filter((o) => o.flag !== 'NONE').length;
  const selectivity = offTargets.length ? +(1 - activeOff / offTargets.length).toFixed(4) : null;

  // Deterministic risk classification.
  let risk = RISK.LOW;
  if (severeStrongTox.length >= 1 || strongOff.length >= 4) risk = RISK.HIGH;
  else if (strongOff.length >= 2 || strongTox.length >= 1 || (strongOff.length >= 1 && weakOff.length >= 3)) risk = RISK.MEDIUM;

  // Confidence: mean decision margin of the model across the evaluated panel (0..1).
  const all = [...offTargets, ...tox];
  const confidence = +(all.reduce((s, o) => s + o.confidence, 0) / all.length).toFixed(4);

  const flaggedNames = [...strongOff, ...weakOff].slice(0, 6).map((o) => `${o.protein} (${o.gene}) p=${o.probability}`);
  const toxNames = strongTox.map((o) => `${o.label} p=${o.probability}`);
  const explanation = risk === RISK.LOW
    ? `Low predicted off-target liability: ${strongOff.length} strong / ${weakOff.length} weak off-target hits across ${offTargets.length} human proteins; ${strongTox.length} strong toxicity flags.`
    : `${risk} risk: ${strongOff.length} strong off-target hit(s) [${flaggedNames.join('; ') || 'none'}]${toxNames.length ? `; toxicity: ${toxNames.join('; ')}` : ''}.`;

  return {
    status: 'COMPLETED', version: OFF_TARGET_VERSION, epistemicStatus: 'MODEL_INFERRED',
    risk, confidence, selectivity,
    offTargetHits: { strong: strongOff.length, weak: weakOff.length, panelSize: offTargets.length },
    toxicityFlags: { strong: strongTox.length, severeStrong: severeStrongTox.length, panelSize: tox.length },
    offTargets, toxicity: tox,
    explanation,
    evidence: { source: 'ADMET-AI (Therapeutics Data Commons / Tox21 models)', epistemicStatus: 'MODEL_INFERRED', note: 'Off-target and toxicity probabilities are model predictions, NOT experimental binding or measured toxicity.' },
  };
}
