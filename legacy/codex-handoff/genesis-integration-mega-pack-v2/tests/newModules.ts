import { ok, eq, rejects } from "./testUtils.js";

// ===== Provider Router =====
import {
  DefaultGenesisRoutingPolicy,
  GenesisModelRouter,
  attachSolverVerification,
  type ModelProvider,
  type ModelResult,
  type ModelTask,
  type ProviderDescriptor,
  type RoutingEvidencePort,
} from "../src/providerRouter/index.js";

// ===== Astra World Author =====
import {
  WorldAuthorOrchestrator,
  makeCernLikeRequest,
  type AssetCatalogPort,
  type CanonicalWorldDirectorPort,
  type CanonicalWorldSpecValidatorPort,
  type ClockPort as AstraClockPort,
  type EvidencePort as AstraEvidencePort,
  type WorldAuthorProposal,
  type WorldAuthorProvider,
} from "../src/astraWorldAuthor/index.js";

// ===== Cyber Scientist =====
import {
  GenesisCyberScientist,
  DefensiveRemediationLoop,
  rankAbstractAttackPaths,
  type CyberCampaignDeps,
  type SecurityCampaignBudget,
  type SecurityCampaignState,
} from "../src/cyberScientist/index.js";

// ===== Drug Discovery =====
import {
  runCandidatePipeline,
  MultiFidelityCampaign,
  GENESIS_PREREGISTERED_DEFAULTS,
  type CandidateEvidencePort,
  type CandidateIdentityGuardPort,
  type CandidateRecord,
  type MolecularEnginePort,
} from "../src/drugDiscovery/index.js";

export async function runNewModuleTests(): Promise<{ passed: number; total: number; label: string }> {
let passed = 0;

// --- Provider Router ---
{
  const descriptor: ProviderDescriptor = {
    id: "claude", kind: "ANTHROPIC", model: "claude-x",
    capabilities: [{ task: "CYBER_SCIENTIST_REASONING", quality: 5, costClass: "MEDIUM", supportsTools: true, supportsStructuredOutput: true }],
    enabled: true, tags: []
  };
  const policy = new DefaultGenesisRoutingPolicy();
  const decision = policy.select(
    { taskId: "t1", class: "CYBER_SCIENTIST_REASONING", instructions: "x", input: {}, requireStructuredOutput: false, maxCostClass: "MEDIUM" },
    [descriptor]
  );
  eq(decision.selectedProviderId, "claude", "CYBER_SCIENTIST_REASONING task class must be routable (naming-gap fix)");
  passed++;
}
{
  const result: ModelResult = { taskId: "t", providerId: "p", model: "m", output: "x", resultKind: "REASONING_ONLY", evidenceRefs: [] };
  await rejects(async () => attachSolverVerification(result, ""), /solverEvidenceRef is required/, "attachSolverVerification must reject an empty solverEvidenceRef");
  const verified = attachSolverVerification(result, "docking-run:42");
  eq(verified.resultKind, "VERIFIED_BY_SOLVER", "attachSolverVerification must upgrade resultKind");
  eq(verified.solverEvidenceRef, "docking-run:42", "attachSolverVerification must record the solver evidence ref");
  passed++;
}
{
  const events: { type: string; payload: unknown }[] = [];
  const evidence: RoutingEvidencePort = { append: (e) => { events.push(e); } };
  const router = new GenesisModelRouter(new DefaultGenesisRoutingPolicy(), evidence);
  await rejects(
    () => router.run({ taskId: "t2", class: "WORLD_AUTHOR", instructions: "x", input: {}, requireStructuredOutput: false, maxCostClass: "LOW" }),
    /No eligible provider/,
    "router.run must still throw with no providers registered"
  );
  ok(events.some((e) => e.type === "MODEL_FAILED"), "no-eligible-provider path must now emit MODEL_FAILED evidence (V1 gap fix)");
  passed++;
}
{
  const events: { type: string }[] = [];
  const evidence: RoutingEvidencePort = { append: (e) => { events.push(e); } };
  const router = new GenesisModelRouter(new DefaultGenesisRoutingPolicy(), evidence);
  const descriptor: ProviderDescriptor = {
    id: "rogue", kind: "OTHER", model: "m",
    capabilities: [{ task: "DRUG_CANDIDATE_RESEARCH", quality: 5, costClass: "LOW", supportsTools: false, supportsStructuredOutput: false }],
    enabled: true, tags: []
  };
  const rogueProvider: ModelProvider = {
    descriptor,
    async run(task: ModelTask): Promise<ModelResult> {
      return { taskId: task.taskId, providerId: "rogue", model: "m", output: "fabricated efficacy result", resultKind: "VERIFIED_BY_SOLVER", evidenceRefs: [] };
    }
  };
  router.register(rogueProvider);
  await rejects(
    () => router.run({ taskId: "t3", class: "DRUG_CANDIDATE_RESEARCH", instructions: "x", input: {}, requireStructuredOutput: false, maxCostClass: "LOW" }),
    /must not self-report resultKind/,
    "a provider self-reporting VERIFIED_BY_SOLVER for a reasoning-only task class must be rejected (solver-guardrail fix)"
  );
  passed++;
}

// --- Astra World Author ---
function fixtureProposal(requestId: string): WorldAuthorProposal {
  return {
    schemaVersion: "1", requestId, title: "CERN-like complex", summary: "s",
    canonicalSpecPatch: { title: "t", worldKind: "CERN_LIKE_RESEARCH_COMPLEX", environment: {}, population: {}, navigation: ["WALK"], capabilityRequests: [], metadata: {} },
    layout: [], assets: [], proceduralTasks: [],
    lighting: { environment: "e", keyLight: "k", fillLight: "f", practicalLights: [], exposureNotes: [], materialNotes: [] },
    variants: [], historicalClaims: [], warnings: []
  };
}
{
  const author: WorldAuthorProvider = { async author(req) { return fixtureProposal(req.requestId); } };
  const canonicalValidator: CanonicalWorldSpecValidatorPort = { async validateProposal() { return { valid: true, issues: [] }; } };
  const assetCatalog: AssetCatalogPort = { async search() { return []; } };
  const worldDirector: CanonicalWorldDirectorPort = { async execute() { return { worldId: "w1", worldGraphRef: {}, evidenceRefs: [] }; } };
  const events: { type: string }[] = [];
  const evidence: AstraEvidencePort = { append: (e) => { events.push(e); } };
  const clock: AstraClockPort = { nowIso: () => "2026-01-01T00:00:00Z" };
  const orch = new WorldAuthorOrchestrator({ author, canonicalValidator, assetCatalog, worldDirector, evidence, clock });
  const result = await orch.run(makeCernLikeRequest("req1"));
  eq(result.status, "EXECUTED", "Astra orchestrator happy path must reach EXECUTED");
  ok(events.length >= 5, "Astra orchestrator must emit >=5 evidence events");
  passed++;
}
{
  const badProposal = { ...fixtureProposal("req2"), historicalClaims: [{ entityOrFeature: "x", label: "EVIDENCE_BACKED" as const, rationale: "", sourceRefs: [] }] };
  const author: WorldAuthorProvider = { async author(req) { return { ...badProposal, requestId: req.requestId }; } };
  const canonicalValidator: CanonicalWorldSpecValidatorPort = { async validateProposal() { return { valid: true, issues: [] }; } };
  const assetCatalog: AssetCatalogPort = { async search() { return []; } };
  let executeCalled = false;
  const worldDirector: CanonicalWorldDirectorPort = { async execute() { executeCalled = true; return { worldId: "w", worldGraphRef: {}, evidenceRefs: [] }; } };
  const evidence: AstraEvidencePort = { append() {} };
  const clock: AstraClockPort = { nowIso: () => "2026-01-01T00:00:00Z" };
  const orch = new WorldAuthorOrchestrator({ author, canonicalValidator, assetCatalog, worldDirector, evidence, clock });
  const result = await orch.run(makeCernLikeRequest("req2"));
  eq(result.status, "REJECTED", "EVIDENCE_BACKED claim with no sourceRefs must be rejected (canonical taxonomy reuse working)");
  eq(executeCalled, false, "worldDirector.execute must never run on a rejected proposal");
  passed++;
}

// --- Cyber Scientist ---
{
  const evidence: { events: string[] } = { events: [] };
  const deps: CyberCampaignDeps = {
    inventory: { async inventory() { return { components: ["svc-a"], entrypoints: [], dependencies: [], configFiles: [] }; } },
    threatModel: { async propose() { return [{ id: "h1", title: "t", description: "d", affectedComponents: [], expectedIndicators: [], priority: 1, status: "OPEN", evidenceRefs: [] }]; } },
    analyzers: [{
      id: "a1", kind: "STATIC_ANALYSIS",
      supports: () => true,
      async run() { return { evidence: [{ id: "e1", kind: "STATIC_ANALYSIS", source: "fixture" }], finding: { id: "f1", title: "t", description: "d", severity: "LOW", confidence: "HIGH", affectedComponents: [], evidenceRefs: ["e1"], reproducibility: "REPRODUCIBLE" }, hypothesisStatus: "SUPPORTED" }; }
    }],
    matrix: { record() {} },
    evidence: { append: (e) => { evidence.events.push(e.type); } },
    reports: { publish() {} }
  };
  const state: SecurityCampaignState = { campaignId: "c1", scope: { scopeId: "s1", mode: "REPOSITORY_ONLY", repositoryRefs: ["."], sandboxIds: [], allowNetworkTargets: [], denyNetworkTargets: [] }, hypotheses: [], findings: [], analyzerRuns: 0, patchProposals: 0, status: "RUNNING" };
  const budget: SecurityCampaignBudget = { maxAnalyzerRuns: 5, maxHypotheses: 5, maxPatchProposals: 1 };
  const report = await new GenesisCyberScientist(deps).run(state, budget);
  eq(report.findings.length, 1, "campaign happy path must record exactly 1 finding");
  passed++;
}
{
  const events: string[] = [];
  const loop = new DefensiveRemediationLoop({
    patches: { async propose() { return { patchId: "p1", summary: "s", diffRef: "d", requiresApproval: true }; } },
    approvals: { async approved() { return true; } },
    retest: { async retest() { return { status: "PASS", evidence: [] }; } },
    evidence: { append: (e) => { events.push(e.type); } }
  });
  const finding = { id: "f1", title: "t", description: "d", severity: "LOW" as const, confidence: "HIGH" as const, affectedComponents: [], evidenceRefs: [], reproducibility: "REPRODUCIBLE" as const };
  const scope = { scopeId: "s1", mode: "REPOSITORY_ONLY" as const, repositoryRefs: ["."], sandboxIds: [], allowNetworkTargets: [], denyNetworkTargets: [] };
  const state: SecurityCampaignState = { campaignId: "c2", scope, hypotheses: [], findings: [], analyzerRuns: 0, patchProposals: 0, status: "RUNNING" };
  const budget: SecurityCampaignBudget = { maxAnalyzerRuns: 5, maxHypotheses: 5, maxPatchProposals: 1 };
  const first = await loop.fixRetest({ campaignId: "c2", finding, scope, state, budget });
  eq(first.approved, true, "first patch proposal within budget must proceed");
  eq(state.patchProposals, 1, "state.patchProposals must actually increment (V1 gap fix)");
  const second = await loop.fixRetest({ campaignId: "c2", finding, scope, state, budget });
  eq(second.blocked, true, "a second patch proposal beyond maxPatchProposals must now be blocked (V1 gap fix)");
  ok(events.includes("CYBER_PATCH_BUDGET_EXCEEDED"), "budget-exceeded path must emit CYBER_PATCH_BUDGET_EXCEEDED evidence");
  passed++;
}
{
  const nodes = [{ id: "a", type: "ASSET" as const }, { id: "b", type: "SERVICE" as const }];
  const edges = [{ from: "a", to: "b", relation: "calls", riskWeight: 2 }];
  const paths = rankAbstractAttackPaths(nodes, edges, "a", 2);
  ok(paths.length > 0 && paths[0]!.label === "ABSTRACT_SANDBOX_SIMULATION", "attack-path ranking must produce abstract-labeled results");
  passed++;
}

// --- Drug Discovery ---
function fixtureCandidate(id: string): CandidateRecord {
  return {
    identity: { candidateId: id, canonicalSmiles: "CCO", provenance: [{ source: "fixture", sourceId: "s1" }] },
    status: "INGESTED", evidence: [], safetySignals: [], compute: [], objectiveVector: {}, rationale: []
  };
}
{
  const candidate = fixtureCandidate("cand-blocked");
  const guard: CandidateIdentityGuardPort = { async verify() { return { valid: false, reasons: ["name does not match canonical label"] }; } };
  const evidence: CandidateEvidencePort = { append() {} };
  const result = await runCandidatePipeline(candidate, { identityGuard: guard, engines: [], evidence }, GENESIS_PREREGISTERED_DEFAULTS);
  eq(result.finalStatus, "BLOCKED", "identity guard rejection must BLOCK the candidate (V1 gap: guard port was never called)");
  eq(candidate.status, "BLOCKED", "candidate.status must actually be assigned (V1 gap: status was never written anywhere)");
  passed++;
}
{
  const candidate = fixtureCandidate("cand-conflict");
  // Exactly one conflict reference (not >=2), so this exercises evidenceGate's
  // conflicting path without also tripping falsifyCandidate's separate
  // ">=2 direct conflicts" rule -- those are two different thresholds by design.
  candidate.evidence = [
    { id: "e1", candidateId: candidate.identity.candidateId, class: "EXPERIMENTAL_PRECLINICAL", strength: 0.9, independentSourceId: "src1", supports: [], conflicts: ["e2"], provenance: [] },
    { id: "e2", candidateId: candidate.identity.candidateId, class: "EXPERIMENTAL_PRECLINICAL", strength: 0.9, independentSourceId: "src2", supports: [], conflicts: [], provenance: [] }
  ];
  const guard: CandidateIdentityGuardPort = { async verify() { return { valid: true, reasons: [] }; } };
  const evidence: CandidateEvidencePort = { append() {} };
  const result = await runCandidatePipeline(candidate, { identityGuard: guard, engines: [], evidence }, GENESIS_PREREGISTERED_DEFAULTS);
  eq(result.finalStatus, "CONFLICTING_EVIDENCE", "conflicting evidence must reach the distinct CONFLICTING_EVIDENCE status, not generic REJECTED (V1 gap fix)");
  passed++;
}
{
  const candidate = fixtureCandidate("cand-unbound");
  const evidence: CandidateEvidencePort = { append() {} };
  // No CHEAP engine registered at all -- distinct from "engine bound but unavailable".
  const campaign = new MultiFidelityCampaign([], evidence);
  const results = await campaign.run(candidate, 1);
  eq(results.length, 1, "an unbound stage must still produce a ComputeResult");
  eq(results[0]!.status, "BLOCKED", "an unbound stage must produce an explicit BLOCKED result, not silently skip (V1 gap fix)");
  passed++;
}
{
  const candidate = fixtureCandidate("cand-priority");
  candidate.evidence = [
    { id: "e1", candidateId: candidate.identity.candidateId, class: "EXPERIMENTAL_PRECLINICAL", strength: 0.9, independentSourceId: "src1", supports: [], conflicts: [], provenance: [] },
    { id: "e2", candidateId: candidate.identity.candidateId, class: "COMPUTATIONAL_MODEL", strength: 0.9, independentSourceId: "src2", supports: [], conflicts: [], provenance: [] }
  ];
  const guard: CandidateIdentityGuardPort = { async verify() { return { valid: true, reasons: [] }; } };
  const evidence: CandidateEvidencePort = { append() {} };
  const engines: MolecularEnginePort[] = (["CHEAP", "DOCKING", "QM", "ADMET"] as const).map((stage) => ({
    id: `eng-${stage}`, stage,
    async available() { return true; },
    async run(c) { return { candidateId: c.identity.candidateId, engineId: `eng-${stage}`, stage, status: "COMPLETED" as const, outputs: {}, provenance: [] }; }
  }));
  const result = await runCandidatePipeline(candidate, { identityGuard: guard, engines, evidence }, GENESIS_PREREGISTERED_DEFAULTS);
  eq(result.finalStatus, "RESEARCH_PRIORITY", "a well-evidenced, fully-computed, conflict-free candidate must reach RESEARCH_PRIORITY via the real wired pipeline (V1 gap: no orchestrating pipeline existed at all)");
  ok(result.score !== undefined && result.score.label === "RESEARCH_PRIORITY_NOT_EFFICACY", "score must carry the non-efficacy label");
  passed++;
}

const TOTAL = 13;
if (passed !== TOTAL) throw new Error(`FAIL: expected ${TOTAL} passing blocks in newModules, got ${passed}`);
return { passed, total: TOTAL, label: "new (providerRouter/astraWorldAuthor/cyberScientist/drugDiscovery)" };
}
