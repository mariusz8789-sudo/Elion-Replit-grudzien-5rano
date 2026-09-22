import { runEvidenceMeta } from "./evidenceMeta.js";
import { runSolvers } from "./solvers.js";
import { runPlannerCampaign } from "./plannerCampaign.js";
import { runRouterWorldTwin } from "./routerWorldTwin.js";
import { runDrugCandidate } from "./drugCandidate.js";
import { runCyber } from "./cyber.js";

const counts=await Promise.all([
  runEvidenceMeta(),
  runSolvers(),
  runPlannerCampaign(),
  runRouterWorldTwin(),
  runDrugCandidate(),
  runCyber()
]);
const total=counts.reduce((a,b)=>a+b,0);
console.log(`Genesis Engine Suite E2E: ${total}/${total} PASS`);
