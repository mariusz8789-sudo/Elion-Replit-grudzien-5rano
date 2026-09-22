import { runCoreModuleTests } from "./coreModules.js";
import { runNewModuleTests } from "./newModules.js";

const results = await Promise.all([runCoreModuleTests(), runNewModuleTests()]);
let totalPassed = 0;
let totalCount = 0;
for (const r of results) {
  console.log(`  [${r.label}] ${r.passed}/${r.total} PASS`);
  totalPassed += r.passed;
  totalCount += r.total;
}
console.log(`GENESIS-INTEGRATION-MEGA-PACK-V2 tests: ${totalPassed}/${totalCount} PASS`);
