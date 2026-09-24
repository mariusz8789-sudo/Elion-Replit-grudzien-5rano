export type LungExposure = 'healthy' | 'cigarette' | 'vaping' | 'cannabis';
export type LungTimelineYears = 1 | 5 | 10;
export type LungEffect = 'BASELINE' | 'POTENTIALLY_INCREASED' | 'INCREASED' | 'NOT_QUANTIFIED';

export interface LungExposureResult {
  exposure: LungExposure;
  years: LungTimelineYears;
  classification: 'EDUCATIONAL_SIMULATION';
  epistemicLabel: 'MODEL';
  clinicalUse: 'NOT_CLINICAL_DIAGNOSIS';
  evidenceStrength: 'REFERENCE_BASELINE' | 'STRONG_ASSOCIATION' | 'PARTIAL_LONG_TERM_EVIDENCE';
  inflammation: LungEffect;
  airwayNarrowing: LungEffect;
  mucusBurden: LungEffect;
  alveolarDamage: LungEffect;
  reducedCapacity: LungEffect;
  /** Rendering intensity only. It is not a probability, diagnosis or lung-function measurement. */
  visualSeverity: number;
  caveat: string;
  sources: readonly string[];
}

const SOURCES = {
  cigarette: 'https://www.cdc.gov/tobacco/hcp/patient-care-settings/respiratory.html',
  vaping: 'https://www.cdc.gov/tobacco/e-cigarettes/health-effects.html',
  cannabis: 'https://www.cdc.gov/cannabis/health-effects/lung-health.html',
} as const;

export function runLungExposureModel(exposure: LungExposure, years: LungTimelineYears): LungExposureResult {
  const stage = years === 1 ? 0.45 : years === 5 ? 0.72 : 1;
  const common = { exposure, years, classification: 'EDUCATIONAL_SIMULATION' as const, epistemicLabel: 'MODEL' as const, clinicalUse: 'NOT_CLINICAL_DIAGNOSIS' as const };
  if (exposure === 'healthy') return { ...common, evidenceStrength: 'REFERENCE_BASELINE', inflammation: 'BASELINE', airwayNarrowing: 'BASELINE', mucusBurden: 'BASELINE', alveolarDamage: 'BASELINE', reducedCapacity: 'BASELINE', visualSeverity: 0, caveat: 'Reference comparison only; it does not represent a patient.', sources: [] };
  if (exposure === 'cigarette') return { ...common, evidenceStrength: 'STRONG_ASSOCIATION', inflammation: 'INCREASED', airwayNarrowing: 'INCREASED', mucusBurden: 'INCREASED', alveolarDamage: 'INCREASED', reducedCapacity: 'INCREASED', visualSeverity: +(0.86 * stage).toFixed(2), caveat: 'Qualitative education model. Timeline does not predict an individual outcome.', sources: [SOURCES.cigarette] };
  if (exposure === 'vaping') return { ...common, evidenceStrength: 'PARTIAL_LONG_TERM_EVIDENCE', inflammation: 'POTENTIALLY_INCREASED', airwayNarrowing: 'POTENTIALLY_INCREASED', mucusBurden: 'POTENTIALLY_INCREASED', alveolarDamage: 'NOT_QUANTIFIED', reducedCapacity: 'NOT_QUANTIFIED', visualSeverity: +(0.54 * stage).toFixed(2), caveat: 'Long-term effects are still under study; this visualization must not imply a measured 1/5/10-year progression.', sources: [SOURCES.vaping] };
  return { ...common, evidenceStrength: 'PARTIAL_LONG_TERM_EVIDENCE', inflammation: 'INCREASED', airwayNarrowing: 'INCREASED', mucusBurden: 'INCREASED', alveolarDamage: 'NOT_QUANTIFIED', reducedCapacity: 'NOT_QUANTIFIED', visualSeverity: +(0.62 * stage).toFixed(2), caveat: 'Smoking cannabis is associated with cough, mucus and bronchitis; evidence is insufficient here to quantify COPD, emphysema or cancer progression.', sources: [SOURCES.cannabis] };
}
