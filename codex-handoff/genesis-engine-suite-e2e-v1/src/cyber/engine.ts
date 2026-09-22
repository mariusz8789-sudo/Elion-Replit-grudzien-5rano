import type { EvidenceLedgerEngine } from "../evidenceReplay/ledger.js";
import type { CyberCampaignBudget, CyberFinding, CyberScope } from "./types.js";

export interface RepoInventoryPort {
  inventory(scope:CyberScope):Promise<{components:string[];entrypoints:string[];dependencies:string[]}>;
}
export interface ThreatModelPort {
  hypotheses(input:{scope:CyberScope;components:string[]}):Promise<Array<{id:string;title:string;component:string}>>;
}
export interface DefensiveAnalyzerPort {
  id:string;
  supports(h:{id:string;title:string;component:string}):boolean;
  analyze(input:{scope:CyberScope;hypothesis:{id:string;title:string;component:string}}):Promise<{finding?:CyberFinding;evidenceRefs:string[]}>;
}
export interface PatchPort {
  propose(finding:CyberFinding):Promise<{patchId:string;summary:string;requiresApproval:true}>;
}
export interface ApprovalPort {
  approved(input:{scopeId:string;patchId:string}):Promise<boolean>;
}
export interface RetestPort {
  retest(input:{scope:CyberScope;finding:CyberFinding;patchId:string}):Promise<{pass:boolean;evidenceRefs:string[]}>;
}

function assertScope(scope:CyberScope){
  if(!scope.id.trim())throw new Error("scope id required");
  if(scope.mode==="REPOSITORY_ONLY"&&scope.allowedTargets.length)throw new Error("repository-only scope cannot contain network targets");
  const denied=new Set(scope.deniedTargets);
  for(const t of scope.allowedTargets)if(denied.has(t))throw new Error(`target both allowed and denied: ${t}`);
}

export class GenesisCyberScientistEngine {
  constructor(
    private readonly inventory:RepoInventoryPort,
    private readonly threat:ThreatModelPort,
    private readonly analyzers:DefensiveAnalyzerPort[],
    private readonly patches:PatchPort,
    private readonly approvals:ApprovalPort,
    private readonly retest:RetestPort,
    private readonly ledger:EvidenceLedgerEngine
  ){}

  async run(scope:CyberScope,budget:CyberCampaignBudget){
    assertScope(scope);
    const inv=await this.inventory.inventory(scope);
    const hypotheses=(await this.threat.hypotheses({scope,components:inv.components})).slice(0,budget.maxHypotheses);
    const findings:CyberFinding[]=[];
    let analyzerRuns=0;
    let patchProposals=0;

    for(const h of hypotheses){
      if(analyzerRuns>=budget.maxAnalyzerRuns)break;
      const analyzer=this.analyzers.find((a)=>a.supports(h));
      if(!analyzer)continue;
      const r=await analyzer.analyze({scope,hypothesis:h});
      analyzerRuns++;
      this.ledger.append({streamId:scope.id,type:"CYBER_ANALYZER_RUN",epistemicStatus:"SUPPORTED",payload:{analyzerId:analyzer.id,hypothesis:h,evidenceRefs:r.evidenceRefs}});
      if(!r.finding)continue;
      let finding=r.finding;
      findings.push(finding);
      this.ledger.append({streamId:scope.id,type:"CYBER_FINDING_RECORDED",epistemicStatus:"SUPPORTED",payload:finding});

      if(patchProposals>=budget.maxPatchProposals)continue;
      const patch=await this.patches.propose(finding);
      patchProposals++;
      finding={...finding,status:"PATCH_PROPOSED"};
      const approved=await this.approvals.approved({scopeId:scope.id,patchId:patch.patchId});
      if(!approved)continue;
      const rr=await this.retest.retest({scope,finding,patchId:patch.patchId});
      finding={...finding,status:rr.pass?"RETEST_PASS":"RETEST_FAIL",evidenceRefs:[...finding.evidenceRefs,...rr.evidenceRefs]};
      findings[findings.length-1]=finding;
      this.ledger.append({streamId:scope.id,type:"CYBER_RETEST_COMPLETED",epistemicStatus:"SUPPORTED",payload:{findingId:finding.id,patchId:patch.patchId,pass:rr.pass,evidenceRefs:rr.evidenceRefs}});
    }
    return{scopeId:scope.id,findings,analyzerRuns,patchProposals,label:"AUTHORIZED_DEFENSIVE_RESEARCH_ONLY" as const};
  }
}
