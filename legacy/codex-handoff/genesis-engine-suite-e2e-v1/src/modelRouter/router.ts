import type { EvidenceLedgerEngine } from "../evidenceReplay/ledger.js";
import type { ModelOutput, ModelTask, ProviderDescriptor } from "./types.js";

export interface ModelProvider {
  descriptor: ProviderDescriptor;
  run(task: ModelTask): Promise<unknown>;
}

const COST = {LOW:1,MEDIUM:2,HIGH:3} as const;

export class ModelRouterEngine {
  private readonly providers = new Map<string, ModelProvider>();

  constructor(private readonly ledger: EvidenceLedgerEngine) {}

  register(provider: ModelProvider): void {
    if (this.providers.has(provider.descriptor.id)) throw new Error(`duplicate provider: ${provider.descriptor.id}`);
    this.providers.set(provider.descriptor.id, provider);
  }

  private select(task: ModelTask): ModelProvider {
    const preferred = new Set(task.preferred ?? []);
    const eligible = [...this.providers.values()]
      .filter((p) => p.descriptor.enabled)
      .map((p) => ({p, cap:p.descriptor.capabilities.find((c)=>c.task===task.class)}))
      .filter((x): x is {p:ModelProvider;cap:NonNullable<typeof x.cap>} => Boolean(x.cap))
      .filter((x)=>COST[x.cap.costClass] <= COST[task.maxCostClass])
      .filter((x)=>!task.requireStructured || x.cap.structured)
      .sort((a,b)=>{
        const pref = Number(preferred.has(b.p.descriptor.id))-Number(preferred.has(a.p.descriptor.id));
        return pref || b.cap.quality-a.cap.quality || COST[a.cap.costClass]-COST[b.cap.costClass];
      });
    const first = eligible[0]?.p;
    if (!first) throw new Error(`no provider for ${task.class}`);
    return first;
  }

  async run(task: ModelTask): Promise<ModelOutput> {
    try {
      const provider = this.select(task);
      this.ledger.append({streamId:"model-router",type:"MODEL_ROUTED",epistemicStatus:"KNOWN",payload:{taskId:task.id,providerId:provider.descriptor.id}});
      const output = await provider.run(task);
      const result: ModelOutput = {
        taskId: task.id,
        providerId: provider.descriptor.id,
        model: provider.descriptor.model,
        output,
        verification: "REASONING_ONLY",
        solverEvidenceRefs: []
      };
      this.ledger.append({streamId:"model-router",type:"MODEL_COMPLETED",epistemicStatus:"SUPPORTED",payload:result});
      return result;
    } catch (error) {
      this.ledger.append({streamId:"model-router",type:"MODEL_FAILED",epistemicStatus:"SUPPORTED",payload:{taskId:task.id,error:error instanceof Error?error.message:String(error)}});
      throw error;
    }
  }

  attachSolverVerification(result: ModelOutput, evidenceRefs: string[]): ModelOutput {
    if (evidenceRefs.length === 0) throw new Error("solver verification requires evidence refs");
    return {...result, verification:"VERIFIED_BY_SOLVER", solverEvidenceRefs:[...evidenceRefs]};
  }
}
