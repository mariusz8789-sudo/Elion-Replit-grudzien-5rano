import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import type { ExperimentRunner, SessionInputs } from '../experimentSession';
import type { BiologyArtifact } from '../biologyRunners';
import { createBiologyExperimentRunner } from '../biologyRunners';
import type { ChemistryArtifact } from '../chemistryRunners';
import { createChemistryExperimentRunner, isChemistryExperiment } from '../chemistryRunners';
import { createRegenerativeBayExperimentRunner } from './regenerativeMedicineBayEvidenceRunner';
import { isRegenerativeBayExperiment, type RegenerativeBayArtifact } from './regenerativeMedicineBay';

export type CanonicalHumanBiologyArtifact = BiologyArtifact | RegenerativeBayArtifact | ChemistryArtifact;

/**
 * One canonical ExperimentRunner for Human Biology + Biomedical Bay + Chemistry (Wet Lab).
 * The caller replaces its existing createBiologyExperimentRunner(...) call with this factory;
 * there is no second runner at the AgentController boundary. Chemistry's own
 * `ChemistryKnowledgeAdapter` (`@genesis/core/chemistry`) is wired in exactly like the Bay: a
 * third leg on this SAME delegating composite, keyed on its own `experimentId`s.
 */
export function createCanonicalHumanBiologyExperimentRunner(worldId: string, ledger: EvidenceLedger): ExperimentRunner<CanonicalHumanBiologyArtifact> {
  const biology = createBiologyExperimentRunner(worldId, ledger);
  const regenerative = createRegenerativeBayExperimentRunner(worldId, ledger);
  const chemistry = createChemistryExperimentRunner(worldId, ledger);
  return (experimentId, seed, inputs: SessionInputs) => {
    if (isRegenerativeBayExperiment(experimentId)) return regenerative(experimentId, seed, inputs);
    if (isChemistryExperiment(experimentId)) return chemistry(experimentId, seed, inputs);
    return biology(experimentId, seed, inputs);
  };
}
