/**
 * D-081 — EXPERIMENT DAG (E1..E10). The directive's requirement that
 * experiments live "w DAG / research graph. Nie w luźnych skryptach", with
 * every node carrying an input hash, a model version, a rule fingerprint, a
 * result, provenance and replay metadata.
 *
 * ================= HOW THIS DIFFERS FROM discoveryGraph.mjs ================
 *
 * `discoveryGraph.mjs` (P11) is a LINEAGE graph: it answers "where did this
 * molecule come from, and what happened to it" from persisted campaign state.
 * It is not replaced and not duplicated here. THIS module is an EXECUTION
 * graph: it answers "which experiments ran against this candidate, in what
 * order, on what inputs, under which frozen rules, and does re-running them
 * reproduce the same answer". Different question, different artifact; the two
 * are complementary and this one never writes campaign state.
 *
 * ========================= NO NEW SCIENCE HERE ============================
 *
 * Every node delegates to an engine that already exists. This file contributes
 * ordering, hashing, blocking semantics and replay — not chemistry, not a
 * model, not a threshold. The engines arrive as injected `ports` so that (a)
 * the real wiring reuses `rdkitAdapter`, `glp1rEfficacyAdapter`, `giprQsar`,
 * `multiFidelity`, `molecularLiabilities` and `molecularMission::assessNovelty`
 * unmodified, and (b) tests can drive every branch, including the ones the
 * present data situation makes unreachable in production.
 *
 * ===================== BLOCKING, NOT SILENT SKIPPING ======================
 *
 * A node whose dependency did not PASS is recorded `SKIPPED_UPSTREAM_BLOCKED`
 * with the blocking node named. It is never omitted and never counted as a
 * pass. A DAG where half the nodes quietly vanished would read like a shorter
 * successful run instead of a blocked one.
 *
 * ============================== DETERMINISM ===============================
 *
 * `runId` is DERIVED (hash of the graph definition + the candidate input +
 * the port versions), never a timestamp or a random id: two runs on the same
 * inputs under the same engines must produce the same runId, or E10 could
 * never distinguish "reproduced" from "different run". Wall-clock time is
 * available to callers but is deliberately NOT part of any fingerprint.
 */

import { canonicalHash } from '../provenance.mjs';

export const DAG_CONTRACT_VERSION = 'experiment-dag-v1';

export const NODE_STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED',
  SKIPPED_UPSTREAM_BLOCKED: 'SKIPPED_UPSTREAM_BLOCKED',
});

/**
 * The ten experiments, declared with their real dependencies. `decisive`
 * marks a node whose non-PASS blocks any downstream claim about the candidate
 * — it does not mean "important", it means the DAG refuses to conclude.
 */
export const EXPERIMENT_NODES = Object.freeze([
  Object.freeze({ id: 'E1', name: 'structure validity', dependsOn: Object.freeze([]), decisive: true, engine: 'rdkitAdapter.validate' }),
  Object.freeze({ id: 'E2', name: 'GLP-1R predicted activity', dependsOn: Object.freeze(['E1']), decisive: true, engine: 'glp1rEfficacyAdapter' }),
  Object.freeze({ id: 'E3', name: 'GIPR predicted activity', dependsOn: Object.freeze(['E1']), decisive: true, engine: 'giprQsar' }),
  Object.freeze({ id: 'E4', name: 'receptor balance / selectivity', dependsOn: Object.freeze(['E2', 'E3']), decisive: false, engine: 'dualTargetDiscovery' }),
  Object.freeze({ id: 'E5', name: 'ADME / developability proxy', dependsOn: Object.freeze(['E1']), decisive: false, engine: 'multiFidelity.admetToxicityStage' }),
  Object.freeze({ id: 'E6', name: 'liability / toxicity proxies', dependsOn: Object.freeze(['E1']), decisive: true, engine: 'molecularLiabilities + frozen-prediction-thresholds' }),
  Object.freeze({ id: 'E7', name: 'scaffold novelty / prior art', dependsOn: Object.freeze(['E1']), decisive: true, engine: 'molecularMission.assessNovelty' }),
  Object.freeze({ id: 'E8', name: 'robustness under perturbation', dependsOn: Object.freeze(['E2', 'E3']), decisive: false, engine: 'model re-query under perturbed input' }),
  Object.freeze({ id: 'E9', name: 'counterfactual / sensitivity', dependsOn: Object.freeze(['E2', 'E3']), decisive: false, engine: 'model re-query under counterfactual input' }),
  Object.freeze({ id: 'E10', name: 'independent replay', dependsOn: Object.freeze(['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9']), decisive: true, engine: 'this module, re-executed' }),
]);

export const DAG_FINGERPRINT = canonicalHash(EXPERIMENT_NODES.map((n) => [n.id, n.dependsOn, n.decisive])).slice(0, 16);

const PORT_FOR = Object.freeze({
  E1: 'structureValidity', E2: 'glp1rActivity', E3: 'giprActivity', E4: 'receptorBalance',
  E5: 'admet', E6: 'liabilities', E7: 'novelty', E8: 'robustness', E9: 'counterfactual',
});

/**
 * A port result is normalized into a node record. A port that throws is a
 * BLOCKED node carrying the error — never an exception that aborts the graph
 * and never a silently passing node.
 */
function executeNode(node, port, input, candidate) {
  if (typeof port !== 'function') {
    return { status: NODE_STATUS.BLOCKED, code: 'PORT_NOT_WIRED', result: null, reasons: [`no port supplied for ${node.id} (${node.engine})`], modelVersion: null, ruleFingerprint: null, provenance: [] };
  }
  let raw;
  try {
    raw = port(candidate, input);
  } catch (err) {
    return { status: NODE_STATUS.BLOCKED, code: 'PORT_THREW', result: null, reasons: [String(err?.message ?? err).slice(0, 200)], modelVersion: null, ruleFingerprint: null, provenance: [] };
  }
  const status = raw?.status && Object.values(NODE_STATUS).includes(raw.status)
    ? raw.status
    : (raw?.ok === true ? NODE_STATUS.PASS : NODE_STATUS.BLOCKED);
  return {
    status,
    code: raw?.code ?? (status === NODE_STATUS.PASS ? 'OK' : 'UNSPECIFIED'),
    result: raw?.result ?? null,
    reasons: Object.freeze([...(raw?.reasons ?? [])]),
    modelVersion: raw?.modelVersion ?? null,
    ruleFingerprint: raw?.ruleFingerprint ?? null,
    provenance: Object.freeze([...(raw?.provenance ?? [])]),
  };
}

/**
 * Runs E1..E9 against one candidate, then E10 by re-running E1..E9 through the
 * same ports and comparing the per-node fingerprints.
 *
 * `ports` maps the names in PORT_FOR to functions. An unwired port is a
 * BLOCKED node, which is the honest reading of "this experiment did not run",
 * as opposed to quietly treating it as passed.
 */
export function runExperimentDag(candidate, ports = {}, { replay = true } = {}) {
  const inputHash = canonicalHash({ candidate, dag: DAG_FINGERPRINT }).slice(0, 16);
  const portVersions = Object.fromEntries(Object.entries(PORT_FOR).map(([id, name]) => [id, typeof ports[name] === 'function' ? (ports[name].portVersion ?? 'unversioned') : 'unwired']));
  const runId = canonicalHash({ inputHash, portVersions, contract: DAG_CONTRACT_VERSION }).slice(0, 16);

  const byId = new Map();
  const nodes = [];

  for (const node of EXPERIMENT_NODES) {
    if (node.id === 'E10') continue;
    const blockingDep = node.dependsOn.find((d) => byId.get(d)?.status !== NODE_STATUS.PASS);
    if (blockingDep) {
      const rec = Object.freeze({
        nodeId: node.id, name: node.name, engine: node.engine, decisive: node.decisive,
        status: NODE_STATUS.SKIPPED_UPSTREAM_BLOCKED, code: `BLOCKED_BY_${blockingDep}`,
        result: null, reasons: Object.freeze([`${blockingDep} did not PASS (${byId.get(blockingDep)?.code ?? 'missing'}), so ${node.id} was not run and is NOT counted as passing`]),
        modelVersion: null, ruleFingerprint: null, provenance: Object.freeze([]),
        inputHash, runId,
        nodeFingerprint: canonicalHash({ nodeId: node.id, status: NODE_STATUS.SKIPPED_UPSTREAM_BLOCKED, blockingDep }).slice(0, 16),
      });
      byId.set(node.id, rec); nodes.push(rec); continue;
    }
    const upstream = Object.fromEntries(node.dependsOn.map((d) => [d, byId.get(d)?.result ?? null]));
    const exec = executeNode(node, ports[PORT_FOR[node.id]], upstream, candidate);
    const rec = Object.freeze({
      nodeId: node.id, name: node.name, engine: node.engine, decisive: node.decisive,
      ...exec, inputHash, runId,
      nodeFingerprint: canonicalHash({ nodeId: node.id, status: exec.status, code: exec.code, result: exec.result, modelVersion: exec.modelVersion, ruleFingerprint: exec.ruleFingerprint }).slice(0, 16),
    });
    byId.set(node.id, rec); nodes.push(rec);
  }

  // E10 — independent replay. Re-runs the same graph through the same ports and
  // compares node fingerprints. A port that is not a pure function of its input
  // fails here, which is the point: non-determinism is a finding, not a nuisance.
  let replayNode;
  if (!replay) {
    replayNode = Object.freeze({
      nodeId: 'E10', name: 'independent replay', engine: 'this module, re-executed', decisive: true,
      status: NODE_STATUS.BLOCKED, code: 'REPLAY_NOT_REQUESTED', result: null,
      reasons: Object.freeze(['replay was explicitly disabled by the caller; the run therefore carries no reproducibility evidence']),
      modelVersion: null, ruleFingerprint: null, provenance: Object.freeze([]), inputHash, runId,
      nodeFingerprint: canonicalHash({ nodeId: 'E10', status: NODE_STATUS.BLOCKED }).slice(0, 16),
    });
  } else {
    const second = runExperimentDag(candidate, ports, { replay: false });
    const mismatches = nodes.filter((n, i) => n.nodeFingerprint !== second.nodes[i]?.nodeFingerprint).map((n) => n.nodeId);
    const sameRunId = second.runId === runId;
    const ok = mismatches.length === 0 && sameRunId;
    replayNode = Object.freeze({
      nodeId: 'E10', name: 'independent replay', engine: 'this module, re-executed', decisive: true,
      status: ok ? NODE_STATUS.PASS : NODE_STATUS.FAIL,
      code: ok ? 'REPRODUCED' : 'REPLAY_MISMATCH',
      result: Object.freeze({ mismatches: Object.freeze(mismatches), sameRunId }),
      reasons: Object.freeze(ok ? [] : [`node(s) ${mismatches.join(', ') || '(none)'} differed on replay; runId ${sameRunId ? 'matched' : 'differed'}`]),
      modelVersion: DAG_CONTRACT_VERSION, ruleFingerprint: DAG_FINGERPRINT, provenance: Object.freeze(['experimentDag.mjs re-execution']),
      inputHash, runId,
      nodeFingerprint: canonicalHash({ nodeId: 'E10', ok, mismatches }).slice(0, 16),
    });
  }
  nodes.push(replayNode);

  const decisiveFailures = nodes.filter((n) => n.decisive && n.status !== NODE_STATUS.PASS);
  return Object.freeze({
    contractVersion: DAG_CONTRACT_VERSION,
    dagFingerprint: DAG_FINGERPRINT,
    runId, inputHash,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(EXPERIMENT_NODES.flatMap((n) => n.dependsOn.map((d) => Object.freeze({ from: d, to: n.id })))),
    decisiveFailures: Object.freeze(decisiveFailures.map((n) => Object.freeze({ nodeId: n.nodeId, status: n.status, code: n.code, reason: n.reasons[0] ?? null }))),
    complete: decisiveFailures.length === 0,
    graphFingerprint: canonicalHash(nodes.map((n) => [n.nodeId, n.nodeFingerprint])).slice(0, 16),
  });
}

/** Two DAG runs compared node by node — the artifact a reviewer diffs when asking "is this the same run?". */
export function compareDagRuns(a, b) {
  const mismatches = a.nodes
    .map((n, i) => (n.nodeFingerprint === b.nodes[i]?.nodeFingerprint ? null : { nodeId: n.nodeId, left: n.nodeFingerprint, right: b.nodes[i]?.nodeFingerprint ?? null }))
    .filter(Boolean);
  return Object.freeze({
    verdict: mismatches.length === 0 && a.graphFingerprint === b.graphFingerprint ? 'MATCH' : 'MISMATCH',
    mismatches: Object.freeze(mismatches),
  });
}
