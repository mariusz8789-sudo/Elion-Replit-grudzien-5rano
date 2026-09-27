export type CyberScopeMode="REPOSITORY_ONLY"|"SANDBOX_RANGE"|"CI_EPHEMERAL";
export interface CyberScope {
  id:string;
  mode:CyberScopeMode;
  repositoryRefs:string[];
  sandboxIds:string[];
  allowedTargets:string[];
  deniedTargets:string[];
}
export interface CyberFinding {
  id:string;
  title:string;
  severity:"INFO"|"LOW"|"MEDIUM"|"HIGH"|"CRITICAL";
  confidence:"LOW"|"MEDIUM"|"HIGH";
  component:string;
  evidenceRefs:string[];
  status:"OPEN"|"PATCH_PROPOSED"|"RETEST_PASS"|"RETEST_FAIL";
}
export interface CyberCampaignBudget {
  maxHypotheses:number;
  maxAnalyzerRuns:number;
  maxPatchProposals:number;
}
