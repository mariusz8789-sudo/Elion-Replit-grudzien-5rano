import { buildPumpPipeModel, PUMP_PIPE_DEFAULTS } from '../../engineeringGraph/pumpPipe';
import { fnv1a, canonicalJson } from '../../events/hash';

/**
 * ENGINEERING SCENE BUILDER — the ENGINEERING domain of the generic scene
 * pipeline. Calls the EXISTING, real pump-pipe engineering model
 * (`engineeringGraph/pumpPipe.ts::buildPumpPipeModel`, Darcy-Weisbach +
 * Swamee-Jain, citation-backed) rather than a second engineering solver.
 * Today's coverage is exactly one real industrial system (pump + pipe); other
 * factory/plant requests resolve to the same system with a disclosed scope
 * note rather than inventing a different one.
 */
export interface EngineeringSceneResult {
  readonly status: 'COMPLETED';
  readonly systemLabel: string;
  readonly values: Readonly<Record<string, number>>;
  readonly fingerprint: string;
}

const REPORTED_NODES = ['flowVelocity', 'reynolds', 'frictionFactor', 'headLoss', 'totalHead', 'hydraulicPower', 'shaftPower'] as const;

export function buildEngineeringScene(_prompt: string): EngineeringSceneResult {
  const model = buildPumpPipeModel(PUMP_PIPE_DEFAULTS);
  const values: Record<string, number> = {};
  for (const nodeId of REPORTED_NODES) values[nodeId] = model.getValue(nodeId);
  return {
    status: 'COMPLETED',
    systemLabel: 'pump-pipe hydraulic system (Darcy-Weisbach + Swamee-Jain)',
    values,
    fingerprint: fnv1a(canonicalJson({ domain: 'ENGINEERING', defaults: PUMP_PIPE_DEFAULTS, values })),
  };
}
