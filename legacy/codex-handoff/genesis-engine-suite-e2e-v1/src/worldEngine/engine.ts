import type { EvidenceLedgerEngine } from "../evidenceReplay/ledger.js";
import type { WorldProposal, WorldRequest } from "./types.js";

export interface WorldAuthorPort {
  propose(request:WorldRequest):Promise<WorldProposal>;
}
export interface CanonicalWorldDirectorPort {
  execute(input:{request:WorldRequest;proposal:WorldProposal}):Promise<{worldId:string;worldGraphRef:string;evidenceRefs:string[]}>;
}

export class WorldAuthorDirectorEngine {
  constructor(
    private readonly author:WorldAuthorPort,
    private readonly director:CanonicalWorldDirectorPort,
    private readonly ledger:EvidenceLedgerEngine
  ){}
  async create(request:WorldRequest){
    const proposal=await this.author.propose(request);
    const issues:string[]=[];
    if(proposal.requestId!==request.id)issues.push("requestId mismatch");
    for(const c of proposal.claims){
      if(c.label==="EVIDENCE_BACKED"&&c.sourceRefs.length===0)issues.push(`evidence-backed claim without source: ${c.feature}`);
    }
    if(issues.length){
      this.ledger.append({streamId:request.id,type:"WORLD_PROPOSAL_REJECTED",epistemicStatus:"SUPPORTED",payload:{issues,proposal}});
      return{status:"REJECTED" as const,issues,proposal};
    }
    this.ledger.append({streamId:request.id,type:"WORLD_PROPOSAL_VALIDATED",epistemicStatus:"SUPPORTED",payload:proposal});
    const execution=await this.director.execute({request,proposal});
    this.ledger.append({streamId:request.id,type:"WORLD_CREATED",epistemicStatus:"SUPPORTED",payload:execution});
    return{status:"EXECUTED" as const,proposal,execution};
  }
}
