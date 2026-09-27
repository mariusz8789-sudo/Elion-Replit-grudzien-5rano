import { GenesisMirrorRuntime, type MirrorFrameSource } from "../src/mirror/mirrorContract.js";
import { FakeCameraFrameSource } from "../src/mirror/cameraSource.js";
import * as PrecisionBay from "../src/precisionBay/index.js";
import * as BioRealLab from "../src/bioRealLab/index.js";
import {
  fromDeviceExecutionMode,
  fromBayMode,
  fromRealLabMode,
  fromRiskClass,
} from "../src/deviceSafety/legacyAdapters.js";
import { GenesisMetaCognitionEngine, type EvidencePort as D141EvidencePort } from "../src/d141/index.js";
import type { MetaEvidenceEvent } from "../src/d141/types.js";
import { TEST_ONLY_HASH_PORT } from "../src/hashReplay/testHash.js";
import type { HashPort } from "../src/hashReplay/hashPort.js";
import { DataRegistry, auditCanonicalOwnership, type ImplementationRef } from "../src/coreHardening/index.js";
import { fromWorldDirectorMode, validateHistoricalClaim } from "../src/historicalEpistemic/epistemicTaxonomy.js";
import { deriveContradiction, type CanonicalEvidenceEventRef } from "../src/bioRealLab/metaAdapter.js";
import { createDemo } from "../src/precisionBay/demo.js";
import { assertNoRealActuation, SafetyViolation } from "../src/precisionBay/safety.js";
import { ok, eq, rejects } from "./testUtils.js";

export async function runCoreModuleTests(): Promise<{ passed: number; total: number; label: string }> {
let passed = 0;

// ===== 1. Mirror consolidation =====
{
  class FakeFrames implements MirrorFrameSource {
    async requestConsent(): Promise<boolean> { return true; }
    async start(): Promise<void> {}
    async nextFrame() {
      return { id: "f1", capturedAt: "2026-01-01T00:00:00Z", width: 640, height: 480, source: "FAKE_DEVICE" as const };
    }
    async stop(): Promise<void> {}
  }
  const mirror = new GenesisMirrorRuntime(new FakeFrames());
  await mirror.begin();
  eq(mirror.snapshot().state, "TWIN_READY", "mirror ready");
  eq(mirror.snapshot().label, "EXPERIMENTAL", "mirror label");
  mirror.divergence("test-drift");
  eq(mirror.snapshot().state, "DIVERGENCE_MODE", "mirror divergence");
  mirror.resync();
  eq(mirror.snapshot().state, "TWIN_READY", "mirror resync");
  mirror.capture();
  mirror.replay();
  eq(mirror.snapshot().state, "REPLAY", "mirror replay");
  await mirror.close();
  eq(mirror.snapshot().state, "MIRROR_IDLE", "mirror close");
  passed++;
}
{
  // Structural proof of consolidation: neither precisionBay nor bioRealLab re-declare a Mirror.
  ok(!("GenesisMirrorRuntime" in PrecisionBay), "precisionBay must not re-declare GenesisMirrorRuntime");
  ok(!("MirrorState" in PrecisionBay), "precisionBay must not re-declare MirrorState");
  ok(!("GenesisMirrorRuntime" in BioRealLab), "bioRealLab must not re-declare GenesisMirrorRuntime");
  passed++;
}
{
  const consentDenied = new FakeCameraFrameSource(false);
  const mirror = new GenesisMirrorRuntime(consentDenied);
  await mirror.begin();
  eq(mirror.snapshot().state, "ERROR", "mirror denied consent -> ERROR");
  passed++;
}

// ===== 2. Device-mode taxonomy unification =====
{
  const sim = fromDeviceExecutionMode("SIMULATED");
  ok(sim.kind === "MAPPED" && sim.result.mode === "SIMULATION" && sim.result.deviceActuationBlocked === true, "D-140 SIMULATED maps to SIMULATION");
  const liveControlled = fromDeviceExecutionMode("LIVE_CONTROLLED");
  eq(liveControlled.kind, "UNMAPPABLE_REQUIRES_HUMAN_REVIEW", "D-140 LIVE_CONTROLLED must be unmappable, never silently safe");
  const hil = fromDeviceExecutionMode("HARDWARE_IN_LOOP");
  eq(hil.kind, "UNMAPPABLE_REQUIRES_HUMAN_REVIEW", "D-140 HARDWARE_IN_LOOP must be unmappable");
  passed++;
}
{
  const shadow = fromBayMode("DEVICE_SHADOW_MODE");
  ok(shadow.kind === "MAPPED" && shadow.result.mode === "SHADOW", "D-142 DEVICE_SHADOW_MODE maps to SHADOW");
  const rehearsal = fromBayMode("DIGITAL_TWIN_REHEARSAL");
  ok(rehearsal.kind === "MAPPED" && rehearsal.result.mode === "REHEARSAL", "D-142 DIGITAL_TWIN_REHEARSAL maps to REHEARSAL");
  passed++;
}
{
  const readOnly = fromRealLabMode("READ_ONLY_TELEMETRY");
  ok(readOnly.kind === "MAPPED" && readOnly.result.mode === "READ_ONLY_TELEMETRY", "bio-real-lab READ_ONLY_TELEMETRY maps identically");
  passed++;
}
{
  const actuation = fromRiskClass("DEVICE_ACTUATION");
  eq(actuation.kind, "UNMAPPABLE_REQUIRES_HUMAN_REVIEW", "core-hardening DEVICE_ACTUATION must be unmappable");
  const readOnly = fromRiskClass("READ_ONLY");
  ok(readOnly.kind === "MAPPED" && readOnly.result.mode === "READ_ONLY_TELEMETRY", "core-hardening READ_ONLY maps to READ_ONLY_TELEMETRY");
  passed++;
}

// ===== 3. D-141 fixes: auto-CONTRADICTED, real emission, META_OBSERVATION_RECORDED, broadened guard, optional memory =====
{
  const events: MetaEvidenceEvent[] = [];
  const evidence: D141EvidencePort = { async append(e) { events.push(e); } };
  const engine = new GenesisMetaCognitionEngine({ evidence }); // no memory dep supplied on purpose

  await engine.recordClaim({
    claimId: "c1", subject: "planet:mars", predicate: "hasWater", value: true, state: "SUPPORTED",
    confidence: 0.9, provenance: [{ sourceId: "s1" }],
  });
  await engine.recordClaim({
    claimId: "c2", subject: "planet:mars", predicate: "hasWater", value: false, state: "SUPPORTED",
    confidence: 0.9, provenance: [{ sourceId: "s2" }],
  });

  ok(events.some((e) => e.type === "META_CONTRADICTION_DETECTED"), "META_CONTRADICTION_DETECTED must actually be emitted");
  const c1 = engine.getClaim("c1")!;
  eq(c1.state, "SUPPORTED", "original claim.state must never be overwritten");
  eq(c1.derivedState, "CONTRADICTED", "derivedState must reflect the active contradiction");

  // Re-adding an already-known contradiction must not re-emit (dedup by contradiction id).
  const before = events.filter((e) => e.type === "META_CONTRADICTION_DETECTED").length;
  await engine.recordClaim({
    claimId: "c3", subject: "unrelated", predicate: "x", value: 1, state: "KNOWN",
    provenance: [{ sourceId: "s3" }],
  });
  const after = events.filter((e) => e.type === "META_CONTRADICTION_DETECTED").length;
  eq(after, before, "unrelated claim must not re-emit the existing contradiction");
  passed++;
}
{
  const events: MetaEvidenceEvent[] = [];
  const evidence: D141EvidencePort = { async append(e) { events.push(e); } };
  const engine = new GenesisMetaCognitionEngine({ evidence });
  await engine.recordObservation({ observationId: "o1", target: "temp", observed: 20, provenance: [] });
  ok(events.some((e) => e.type === "META_OBSERVATION_RECORDED"), "every observation must emit META_OBSERVATION_RECORDED even with no matching prediction");
  passed++;
}
{
  const events: MetaEvidenceEvent[] = [];
  const evidence: D141EvidencePort = { async append(e) { events.push(e); } };
  const engine = new GenesisMetaCognitionEngine({ evidence });
  await rejects(
    () => engine.recordDecision({
      traceId: "t1", decision: "proceed with experiment", inputs: [],
      evidenceRefs: [], assumptions: ["the system is not conscious, just careful"],
      rejectedAlternatives: [], uncertaintyNotes: [],
    }),
    /consciousness\/sentience/,
    "broadened guard must screen assumptions[], not just decision"
  );
  passed++;
}
{
  const evidence: D141EvidencePort = { async append() {} };
  const engine = new GenesisMetaCognitionEngine({ evidence }); // memory omitted entirely
  ok(engine.memorySnapshot() === undefined, "memory must be optional and absent by default, never a required second source of truth");
  passed++;
}

// ===== 4. Replay/hash adapter =====
{
  const a = TEST_ONLY_HASH_PORT.fingerprint({ x: 1, y: [1, 2, 3] });
  const b = TEST_ONLY_HASH_PORT.fingerprint({ y: [1, 2, 3], x: 1 });
  eq(a, b, "hash port must be key-order independent (canonical JSON)");
  passed++;
}
{
  let calls = 0;
  const spyHash: HashPort = { fingerprint(v) { calls += 1; return TEST_ONLY_HASH_PORT.fingerprint(v); } };
  const registry = new DataRegistry(spyHash);
  registry.register({ id: "d1", provider: "p", version: "1", license: "CC0", transformations: [], qualityNotes: [], epistemicClass: "MEASURED" });
  registry.fingerprint();
  ok(calls > 0, "DataRegistry must delegate fingerprinting to the injected HashPort, not a private implementation");
  passed++;
}

// ===== 5. D-142 recordApproval() safety fix =====
{
  const { controller } = createDemo("approval-after-stop");
  await controller.emergencyStop("test");
  await rejects(
    () => controller.recordApproval({ id: "a1", actorId: "u1", role: "reviewer", scope: ["x"], approvedAt: new Date().toISOString() }, ["x"]),
    /Emergency stop/,
    "recordApproval must now be blocked by an active emergency stop (V1 bug: it was the only method missing this guard)"
  );
  passed++;
}
{
  // Regression: the rest of the D-142 flow still behaves as in V1.
  const { controller, evidence } = createDemo("regression");
  const obs = await controller.observe({
    kind: "synthetic", value: 1, epistemicStatus: "SIMULATED",
    provenance: [{ sourceId: "fixture", sourceKind: "SYNTHETIC", epistemicStatus: "SIMULATED" }],
  });
  await controller.localize("research target");
  const opts = await controller.propose();
  eq(opts.length, 1, "option count");
  const sim = await controller.simulate(opts[0]!.id);
  const cmp = await controller.compare(sim.runId, [obs.id]);
  eq(cmp.status, "MATCH", "comparison");
  await controller.complete();
  eq(controller.snapshot().stage, "COMPLETE", "complete stage");
  ok(evidence.events.some((x) => x.type === "D142_SESSION_COMPLETED"), "completion evidence");
  passed++;
}
{
  const { controller } = createDemo("shadow", true);
  const snap = await controller.connectShadow();
  eq(snap.connected, true, "shadow connect");
  ok(snap.capabilities.every((x) => x.readOnly), "shadow must be read-only");
  passed++;
}
{
  let threw = false;
  try { assertNoRealActuation(); } catch (e) { threw = e instanceof SafetyViolation; }
  ok(threw, "real actuation must remain blocked");
  passed++;
}

// ===== 6. Architecture duplicate self-check (Codex-usable tool, exercised here) =====
{
  const roles: ImplementationRef["role"][] = [
    "WORLD_GRAPH", "WORLD_GENERATOR", "TEMPORAL_ENGINE", "EVIDENCE_LEDGER", "SOLVER_ROUTER",
    "KERNEL_PROVIDER_REGISTRY", "COMMAND_EVENT_INFRA", "HUMAN_DIGITAL_TWIN", "EXPERIMENT_SESSION", "PROVENANCE_REPLAY",
  ];
  const clean = roles.map((role) => ({ role, symbol: role, path: `/${role}`, productionReachable: true, sourceOfTruth: true }));
  eq(auditCanonicalOwnership(clean).length, 0, "clean ownership set must have zero issues");

  const duplicated = [...clean, { role: "WORLD_GRAPH" as const, symbol: "SecondWorldGraph", path: "/duplicate", productionReachable: true, sourceOfTruth: true }];
  const issues = auditCanonicalOwnership(duplicated);
  ok(issues.some((i) => i.role === "WORLD_GRAPH" && i.severity === "ERROR"), "a second WORLD_GRAPH source-of-truth must be flagged ERROR");
  passed++;
}

// ===== 7. Historical epistemic reconciliation =====
{
  eq(fromWorldDirectorMode("SCIENTIFIC"), "SIMULATED", "World Director SCIENTIFIC -> SIMULATED");
  eq(fromWorldDirectorMode("HISTORICAL_RECONSTRUCTION"), "INFERRED", "World Director HISTORICAL_RECONSTRUCTION -> INFERRED");
  eq(fromWorldDirectorMode("CINEMATIC"), "CINEMATIC", "World Director CINEMATIC -> CINEMATIC");
  const issues = validateHistoricalClaim({ entityId: "e1", label: "EVIDENCE_BACKED", sourceRefs: [] });
  ok(issues.length > 0, "EVIDENCE_BACKED with no sources must be flagged by the single canonical validator");
  passed++;
}

// ===== 8. bio-real-lab metaAdapter: epistemic-weighted contradiction (fix area, correctness) =====
{
  const weak: CanonicalEvidenceEventRef = { eventId: "w1", type: "x", epistemicStatus: "SPECULATIVE", provenanceRefs: [] };
  const strongPos: CanonicalEvidenceEventRef = { eventId: "p1", type: "x", epistemicStatus: "SUPPORTED", provenanceRefs: [] };
  const strongNeg: CanonicalEvidenceEventRef = { eventId: "n1", type: "x", epistemicStatus: "SUPPORTED", provenanceRefs: [] };

  const weakVsStrong = deriveContradiction([weak], [strongNeg]);
  eq(weakVsStrong.status, "SUPPORTED", "a SPECULATIVE ref against a SUPPORTED ref must not be reported as CONTRADICTED (V1 bug)");

  const strongVsStrong = deriveContradiction([strongPos], [strongNeg]);
  eq(strongVsStrong.status, "CONTRADICTED", "two load-bearing (SUPPORTED) opposing refs must still be CONTRADICTED");
  passed++;
}

const TOTAL = 20;
if (passed !== TOTAL) throw new Error(`FAIL: expected ${TOTAL} passing blocks in coreModules, got ${passed}`);
return { passed, total: TOTAL, label: "core (mirror/deviceSafety/d141/precisionBay/bioRealLab/coreHardening/historicalEpistemic)" };
}
