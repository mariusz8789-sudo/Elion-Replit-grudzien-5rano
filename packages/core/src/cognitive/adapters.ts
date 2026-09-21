import {
  CommandBusAdapter,
  EvidenceLedgerAdapter,
  ExperimentFabricAdapter,
  ScienceMemoryAdapter,
  WorldRuntimeAdapter,
  CommandEnvelope,
} from './types.js';
import { GenesisCognitiveCore } from './cognitiveCore.js';

export function createCognitiveCoreAdapters(input: {
  dispatchCommand: (command: CommandEnvelope) => Promise<{ accepted: boolean; result?: unknown; reason?: string }>;
  proposeExperiment: ExperimentFabricAdapter["proposeExperiment"];
  appendEvidence?: EvidenceLedgerAdapter["append"];
  memoryWrite?: ScienceMemoryAdapter["write"];
  memoryRead?: ScienceMemoryAdapter["read"];
  listEntities: WorldRuntimeAdapter["listEntities"];
  listRelations: WorldRuntimeAdapter["listRelations"];
}): {
  commandBus: CommandBusAdapter;
  experimentFabric: ExperimentFabricAdapter;
  evidence?: EvidenceLedgerAdapter;
  scienceMemory?: ScienceMemoryAdapter;
  worldRuntime: WorldRuntimeAdapter;
  attach(core: GenesisCognitiveCore): Promise<void>;
} {
  return {
    commandBus: { dispatch: input.dispatchCommand },
    experimentFabric: { proposeExperiment: input.proposeExperiment },
    evidence: input.appendEvidence ? { append: input.appendEvidence } : undefined,
    scienceMemory: input.memoryWrite && input.memoryRead ? { write: input.memoryWrite, read: input.memoryRead } : undefined,
    worldRuntime: { listEntities: input.listEntities, listRelations: input.listRelations },
    async attach(core) {
      const [entities, relations] = await Promise.all([
        input.listEntities(),
        input.listRelations(),
      ]);
      core.world.replace(entities, relations);
    },
  };
}
