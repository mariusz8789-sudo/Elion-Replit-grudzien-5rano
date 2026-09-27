# Status note (C3, before the raw text below)

**C3 did not implement any of what this document describes.** Only the
separate, self-contained "E2E IMPLEMENTATION" vertical slice pasted later in
the same conversation turn (cyberDomainTypes.ts, cyberSyntheticTarget.ts,
cyberTestEngine.ts, cyberEvidenceAdapter.ts, cyberAttackPath.ts,
cyberRemediation.ts, cyberReasoningEngine.ts + tests, now under
`packages/frontend/src/core/cyber/` on this branch) was actually
implemented, fixed, and verified (tsc/eslint/vitest/build all pass) — see
this directory's README for what was done there and why the broader
governance primitives below (contracts/, decisionChain/, attackPath/[this
generic version — a separate one was implemented for the E2E slice],
outcomeVerification/, permission/, attention/, drift/, workers/, conflict/,
observation/, fixtures/, reasoning/[generic version], tests/testVectors.ts)
were not also built now.

The raw text below is preserved verbatim, unedited, exactly as pasted by
the user, for a future session to draw on (e.g. the permission-gate
multi-factor model, or the decision-chain-as-DAG idea) — but none of it
should be copied in as-is without the same real-repo verification pass the
E2E slice went through. It was written without repository access (see the
main README), so — like the original v1/v2 drafts — it invents its own
local mirrors of Genesis primitives in places rather than importing the
real ones.

---

# GENESIS CYBER REASONING ENGINE FOUNDATION — IMPLEMENTACJA

**Nie tworzę dokumentu. Tworzę kod.**

---

## ETAP 1: AUDYT ISTNIEJĄCEGO PAKIETU

| FILE | CURRENT_STATUS | REALITY | BUGS | DUPLICATION | SECURITY_RISK | REQUIRED_CHANGE |
|------|---------------|---------|------|-------------|---------------|-----------------|
| `contracts/provenance.ts` | IMPLEMENTED (claimed) | **FAKE** — local `CyberProvenance` duplicates Genesis canonical `dataProvenance` | `promoteToEvidence()` magicznie zmienia MODEL_GENERATED→REFERENCE | Tworzy konkurencyjny provenance system | Fałszywa promocja modelu do evidence | Rozdzielić DATA PROVENANCE od MODEL ORIGIN. Usunąć `promoteToEvidence` |
| `contracts/cyberTypes.ts` | IMPLEMENTED (claimed) | **PARTIAL** — typy istnieją, ale ID nie są content-addressable | `id: string` bez deterministic hash | Brak | Brak | Dodać `contentHash` obok `entityId` |
| `decisionChain/chainBuilder.ts` | IMPLEMENTED (claimed) | **FAKE** — hash to prosty `charCodeAt` loop, nie SHA-256 | `computeHash()` nie jest cryptographic; brak canonical serialization; brak cycle detection w DAG | Brak | Fałszywe poczucie immutability | Prawdziwy SHA-256, canonical JSON, DAG validation |
| `decisionChain/chainQuery.ts` | IMPLEMENTED | PARTIAL — działa, ale zależy od fake hash | Brak | Brak | Brak | Dostosować do nowego hash |
| `attackPath/attackPathBuilder.ts` | IMPLEMENTED | PARTIAL — counter-based IDs | Brak content hash | Brak | Brak | Content-addressable IDs |
| `attackPath/attackPathVerifier.ts` | IMPLEMENTED | **PARTIAL** — nie rozróżnia coverage vs confidence; edge verification słaby | `confidence` obliczany jako average evidence strength — heurystyka udająca naukę | Brak | Fałszywy confidence | Rozdzielić `verificationCoverage` od `evidenceConfidence`; edge musi mieć verification |
| `outcomeVerification/verifySecurityOutcome.ts` | IMPLEMENTED | **PARTIAL** — `tolerance × 2 = DRIFT` jest arbitralne | Nie rozróżnia typów metryk; nie obsługuje boolean/categorical; outcome contradiction ignorowany | Brak | Fałszywy VERIFIED | Jawny model per metric type |
| `permission/permissionGate.ts` | IMPLEMENTED | **PARTIAL** — prosta hierarchia numeryczna | `isModelBypassAttempt()` to string check; brak mission/target context | Brak | Zbyt prosta polityka | Multi-factor: actor, role, mission, target, action, risk, approvalState |
| `attention/attentionEvaluator.ts` | IMPLEMENTED | **PARTIAL** — EMERGENCY_STOP jako bezpośredni wynik score | Score → EMERGENCY_STOP bez policy layer | Brak | Attention może "wykonywać" akcje | Rozdzielić recommendation od execution authority |
| `drift/driftDetector.ts` | IMPLEMENTED | **PARTIAL** — missing field = automatic critical | Brak field classification | Brak | False critical alerts | Jawna klasyfikacja pól |
| `workers/workerOrchestrator.ts` | ADAPTER (claimed) | **FAKE** — `dispatchTask()` rzuca INTEGRATION_REQUIRED | Cała funkcja jest placeholderem | Brak | Brak | Oznaczyć jako INTEGRATION_REQUIRED, nie ADAPTER |
| `conflict/conflictResolver.ts` | IMPLEMENTED | PARTIAL — działa, ale brak incompatible-prediction detection | Brak | Brak | Brak | Dodać detection incompatible predictions |

**Kluczowe findings:**
1. **Provenance jest zduplikowany** — lokalny `CyberProvenance` konkuruje z Genesis `dataProvenance`
2. **Hash jest fake** — nie SHA-256, nie canonical
3. **MODEL_GENERATED → REFERENCE promocja** — niebezpieczna, musi być usunięta
4. **Attention → EMERGENCY_STOP** — attention nie może wykonywać akcji
5. **Outcome verification** — arbitralna semantyka tolerance
6. **Brak reasoning engine** — cały pakiet to governance substrate, zero cyber reasoning

---

## ETAP 2: NAPRAWIONE KONTRAKTY

### `src/contracts/provenance.ts` — FIXED

```typescript
/**
 * Genesis Cyber Reasoning Engine — Provenance Contract (FIXED)
 *
 * KLUCZOWA ZMIANA:
 * Rozdzielenie DATA PROVENANCE od MODEL ORIGIN.
 *
 * DATA PROVENANCE (canonical Genesis — IMPORTOWAĆ z Core):
 *   SIMULATED | REFERENCE | REAL_EXPERIMENTAL
 *
 * MODEL ORIGIN / CLAIM ORIGIN (nowe, Cyber-specific):
 *   MODEL_GENERATED | HUMAN | SENSOR | SYSTEM | EXTERNAL_SOURCE
 *
 * MODEL_GENERATED NIGDY nie staje się automatycznie EVIDENCE.
 * Usunięto promoteToEvidence().
 */

// ============================================================================
// DATA PROVENANCE — canonical Genesis type
// W repo Genesis: core/dataProvenance.ts
// INTEGRATION_REQUIRED: import { DataProvenance } from 'genesis-core/dataProvenance'
// Poniżej: local mirror dla standalone testów. NIE używać w produkcji.
// ============================================================================

export type DataProvenance =
  | 'SIMULATED'
  | 'REFERENCE'
  | 'REAL_EXPERIMENTAL';

// ============================================================================
// MODEL ORIGIN / CLAIM ORIGIN — Cyber-specific
// Mówi SKĄD pochodzi claim/analiza, nie jaki jest status danych.
// ============================================================================

export type ClaimOrigin =
  | 'MODEL_GENERATED'
  | 'HUMAN'
  | 'SENSOR'
  | 'SYSTEM'
  | 'EXTERNAL_SOURCE';

// ============================================================================
// COMBINED PROVENANCE RECORD
// ============================================================================

export interface ProvenanceRecord {
  /** Canonical Genesis data provenance */
  readonly dataProvenance: DataProvenance;
  /** Who/what generated this claim or analysis */
  readonly claimOrigin: ClaimOrigin;
  /** Source identifier (e.g., sensor ID, model ID, human operator ID) */
  readonly source: string;
  /** When this was recorded */
  readonly recordedAt: string;
  /** Stable identifier for the source */
  readonly stableIdentifier: string;
  /** Self-reported confidence (0-1), null if not applicable */
  readonly confidence: number | null;
  /** Additional notes */
  readonly notes: string | null;
}

export function createProvenance(
  dataProvenance: DataProvenance,
  claimOrigin: ClaimOrigin,
  source: string,
  stableIdentifier: string,
  confidence: number | null = null,
  notes: string | null = null
): ProvenanceRecord {
  return Object.freeze({
    dataProvenance,
    claimOrigin,
    source,
    recordedAt: new Date().toISOString(),
    stableIdentifier,
    confidence,
    notes,
  });
}

// ============================================================================
// ANTI-FABRICATION GUARDS
// ============================================================================

/**
 * MODEL_GENERATED output NIGDY nie jest automatycznie:
 * - Evidence
 * - Reference
 * - Real Experimental
 * - Verified
 *
 * Model claim może zostać TESTED / SUPPORTED / FALSIFIED,
 * ale provenance modelu się nie zmienia.
 */
export function isModelGenerated(p: ProvenanceRecord): boolean {
  return p.claimOrigin === 'MODEL_GENERATED';
}

/**
 * Sprawdza czy provenance może być użyty jako evidence.
 * MODEL_GENERATED NIE może być evidence bez independent verification.
 */
export function canServeAsEvidence(p: ProvenanceRecord): boolean {
  if (p.claimOrigin === 'MODEL_GENERATED') {
    return false; // Model output wymaga independent test/observation
  }
  return p.dataProvenance === 'REFERENCE' || p.dataProvenance === 'REAL_EXPERIMENTAL';
}

/**
 * Sprawdza czy model output próbuje self-reference jako evidence.
 * ANTI-FABRICATION: Model output nie może cytować siebie jako dowód.
 */
export function detectSelfReferencingEvidence(
  claimProvenance: ProvenanceRecord,
  evidenceRefs: readonly string[],
  ownEntityId: string
): boolean {
  if (claimProvenance.claimOrigin !== 'MODEL_GENERATED') {
    return false;
  }
  return evidenceRefs.some((ref) => ref === ownEntityId || ref === claimProvenance.stableIdentifier);
}

/**
 * Walidacja że MODEL_GENERATED nie jest oznaczony jako REAL_EXPERIMENTAL.
 */
export function validateProvenanceConsistency(p: ProvenanceRecord): { valid: boolean; errors: readonly string[] } {
  const errors: string[] = [];

  if (p.claimOrigin === 'MODEL_GENERATED' && p.dataProvenance === 'REAL_EXPERIMENTAL') {
    errors.push('MODEL_GENERATED claim cannot have REAL_EXPERIMENTAL data provenance');
  }

  if (p.confidence !== null && (p.confidence < 0 || p.confidence > 1)) {
    errors.push(`Confidence ${p.confidence} out of range [0, 1]`);
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  });
}
```

### `src/contracts/identity.ts` — FIXED (content-addressable)

```typescript
/**
 * Genesis Cyber Reasoning Engine — Identity Contract (FIXED)
 *
 * KLUCZOWA ZMIANA:
 * Rozdzielenie entityId (runtime) od contentHash (deterministic).
 *
 * entityId: runtime identifier, może być counter/UUID
 * contentHash: SHA-256 canonical serialization, deterministic
 *
 * Do replay i integrity używaj contentHash.
 */

import { createHash } from 'node:crypto';

export interface EntityIdentity {
  /** Runtime identifier (may be counter, UUID, etc.) */
  readonly entityId: string;
  /** Deterministic content hash (SHA-256 of canonical serialization) */
  readonly contentHash: string;
  /** Timestamp of creation */
  readonly createdAt: string;
}

/**
 * Canonical serialization: sorted keys, no undefined, deterministic.
 */
export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortDeep);

  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v !== undefined) {
      sorted[key] = sortDeep(v);
    }
  }
  return sorted;
}

/**
 * Compute SHA-256 content hash of canonical serialization.
 */
export function computeContentHash(value: unknown): string {
  const canonical = canonicalSerialize(value);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Create entity identity with deterministic content hash.
 */
export function createEntityIdentity(
  entityId: string,
  content: unknown
): EntityIdentity {
  return Object.freeze({
    entityId,
    contentHash: computeContentHash(content),
    createdAt: new Date().toISOString(),
  });
}

/**
 * Verify that content matches its recorded hash.
 */
export function verifyContentHash(
  content: unknown,
  expectedHash: string
): boolean {
  return computeContentHash(content) === expectedHash;
}
```

---

## ETAP 2C/D/E: DECISION CHAIN — FIXED (SHA-256, canonical, DAG, immutable)

### `src/decisionChain/chainTypes.ts`

```typescript
/**
 * Genesis Cyber Reasoning Engine — Decision Chain Types (FIXED)
 *
 * Immutable DAG. Nie chain-of-thought.
 * Tylko audytowalne fakty i eventy.
 */

import type { ProvenanceRecord } from '../contracts/provenance.js';

export type DecisionChainNodeType =
  | 'OBSERVATION'
  | 'HYPOTHESIS'
  | 'PREDICTION'
  | 'TEST'
  | 'EVIDENCE'
  | 'COMPARISON'
  | 'VERDICT'
  | 'DECISION'
  | 'APPROVAL'
  | 'ACTION'
  | 'OUTCOME'
  | 'VERIFICATION'
  | 'MEMORY_UPDATE'
  | 'REPLAY';

export type DecisionChainEdgeType =
  | 'DERIVED_FROM'
  | 'TESTS'
  | 'SUPPORTS'
  | 'CONTRADICTS'
  | 'RESULTS_IN'
  | 'REQUIRES'
  | 'APPROVES'
  | 'EXECUTES'
  | 'VERIFIES'
  | 'REPLAYS';

export type DecisionChainStatus =
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'FINALIZED';

export interface DecisionChainNode {
  readonly nodeId: string;
  readonly nodeType: DecisionChainNodeType;
  readonly timestamp: string;
  readonly actor: string;
  readonly provenance: ProvenanceRecord;
  /** Auditable payload — facts, events, measurements. NOT reasoning. */
  readonly payload: Readonly<Record<string, unknown>>;
  /** SHA-256 hash of: previousHash + nodeType + actor + canonical(payload) + provenance.claimOrigin + timestamp */
  readonly nodeHash: string;
  /** Hash of the previous node in the chain (null for first node) */
  readonly previousHash: string | null;
}

export interface DecisionChainEdge {
  readonly edgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly edgeType: DecisionChainEdgeType;
  readonly timestamp: string;
  readonly evidenceRefs: readonly string[];
}

export interface DecisionChain {
  readonly chainId: string;
  readonly missionId: string;
  readonly createdAt: string;
  readonly nodes: readonly DecisionChainNode[];
  readonly edges: readonly DecisionChainEdge[];
  readonly status: DecisionChainStatus;
  /** Once FINALIZED, no modifications allowed */
  readonly immutable: boolean;
}
```

### `src/decisionChain/chainBuilder.ts` — FIXED

```typescript
/**
 * Genesis Cyber Reasoning Engine — Decision Chain Builder (FIXED)
 *
 * ZMIANY:
 * - Prawdziwy SHA-256 (Node crypto / Web Crypto)
 * - Canonical serialization
 * - Hash obejmuje CAŁY audytowalny node
 * - DAG z wykrywaniem cykli
 * - Po FINALIZE: zero modyfikacji
 */

import { createHash } from 'node:crypto';
import type {
  DecisionChain,
  DecisionChainNode,
  DecisionChainEdge,
  DecisionChainNodeType,
  DecisionChainEdgeType,
  DecisionChainStatus,
} from './chainTypes.js';
import type { ProvenanceRecord } from '../contracts/provenance.js';
import { canonicalSerialize } from '../contracts/identity.js';

let nodeCounter = 0;
let edgeCounter = 0;
let chainCounter = 0;

function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function computeNodeHash(
  previousHash: string | null,
  nodeType: DecisionChainNodeType,
  actor: string,
  payload: Record<string, unknown>,
  claimOrigin: string,
  timestamp: string
): string {
  const canonical = canonicalSerialize({
    previousHash,
    nodeType,
    actor,
    payload,
    claimOrigin,
    timestamp,
  });
  return sha256(canonical);
}

export function createDecisionChain(missionId: string): DecisionChain {
  return Object.freeze({
    chainId: `dc-${++chainCounter}-${Date.now()}`,
    missionId,
    createdAt: new Date().toISOString(),
    nodes: Object.freeze([]),
    edges: Object.freeze([]),
    status: 'IN_PROGRESS' as DecisionChainStatus,
    immutable: false,
  });
}

export function addNodeToChain(
  chain: DecisionChain,
  nodeType: DecisionChainNodeType,
  actor: string,
  provenance: ProvenanceRecord,
  payload: Record<string, unknown>
): DecisionChain {
  assertMutable(chain, 'addNodeToChain');

  const previousHash = chain.nodes.length > 0
    ? chain.nodes[chain.nodes.length - 1]!.nodeHash
    : null;

  const timestamp = new Date().toISOString();
  const nodeId = `dcn-${++nodeCounter}`;

  const nodeHash = computeNodeHash(
    previousHash,
    nodeType,
    actor,
    payload,
    provenance.claimOrigin,
    timestamp
  );

  const node: DecisionChainNode = Object.freeze({
    nodeId,
    nodeType,
    timestamp,
    actor,
    provenance,
    payload: Object.freeze({ ...payload }),
    nodeHash,
    previousHash,
  });

  return Object.freeze({
    ...chain,
    nodes: Object.freeze([...chain.nodes, node]),
  });
}

export function addEdgeToChain(
  chain: DecisionChain,
  fromNodeId: string,
  toNodeId: string,
  edgeType: DecisionChainEdgeType,
  evidenceRefs: readonly string[] = []
): DecisionChain {
  assertMutable(chain, 'addEdgeToChain');

  const fromNode = chain.nodes.find((n) => n.nodeId === fromNodeId);
  const toNode = chain.nodes.find((n) => n.nodeId === toNodeId);

  if (!fromNode) throw new Error(`fromNode ${fromNodeId} not found in chain ${chain.chainId}`);
  if (!toNode) throw new Error(`toNode ${toNodeId} not found in chain ${chain.chainId}`);

  // DAG cycle detection
  if (wouldCreateCycle(chain, fromNodeId, toNodeId)) {
    throw new Error(
      `Adding edge ${fromNodeId} → ${toNodeId} would create a cycle. DecisionChain must be a DAG.`
    );
  }

  const edge: DecisionChainEdge = Object.freeze({
    edgeId: `dce-${++edgeCounter}`,
    fromNodeId,
    toNodeId,
    edgeType,
    timestamp: new Date().toISOString(),
    evidenceRefs: Object.freeze([...evidenceRefs]),
  });

  return Object.freeze({
    ...chain,
    edges: Object.freeze([...chain.edges, edge]),
  });
}

/**
 * Detect if adding edge from→to would create a cycle.
 * BFS/DFS from 'to' to see if 'from' is reachable.
 */
function wouldCreateCycle(
  chain: DecisionChain,
  fromNodeId: string,
  toNodeId: string
): boolean {
  if (fromNodeId === toNodeId) return true;

  const visited = new Set<string>();
  const queue: string[] = [toNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === fromNodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const edge of chain.edges) {
      if (edge.fromNodeId === current && !visited.has(edge.toNodeId)) {
        queue.push(edge.toNodeId);
      }
    }
  }

  return false;
}

export function finalizeChain(
  chain: DecisionChain,
  status: DecisionChainStatus
): DecisionChain {
  assertMutable(chain, 'finalizeChain');

  return Object.freeze({
    ...chain,
    status,
    immutable: true,
  });
}

function assertMutable(chain: DecisionChain, operation: string): void {
  if (chain.immutable) {
    throw new Error(
      `Cannot ${operation}: chain ${chain.chainId} is FINALIZED and immutable. ` +
      `No nodes, edges, status, payload, or hashes can be modified.`
    );
  }
}

export function verifyChainIntegrity(chain: DecisionChain): { valid: boolean; errors: readonly string[] } {
  const errors: string[] = [];

  // Verify hash chain
  for (let i = 0; i < chain.nodes.length; i++) {
    const node = chain.nodes[i]!;
    const expectedPrevHash = i > 0 ? chain.nodes[i - 1]!.nodeHash : null;

    if (node.previousHash !== expectedPrevHash) {
      errors.push(`Node ${node.nodeId}: previousHash mismatch`);
    }

    const recomputedHash = computeNodeHash(
      node.previousHash,
      node.nodeType,
      node.actor,
      node.payload as Record<string, unknown>,
      node.provenance.claimOrigin,
      node.timestamp
    );

    if (node.nodeHash !== recomputedHash) {
      errors.push(`Node ${node.nodeId}: nodeHash mismatch (tampered?)`);
    }
  }

  // Verify DAG (no cycles)
  if (hasCycle(chain)) {
    errors.push('Chain contains a cycle — not a valid DAG');
  }

  // Verify edge references
  const nodeIds = new Set(chain.nodes.map((n) => n.nodeId));
  for (const edge of chain.edges) {
    if (!nodeIds.has(edge.fromNodeId)) {
      errors.push(`Edge ${edge.edgeId}: fromNode ${edge.fromNodeId} not found`);
    }
    if (!nodeIds.has(edge.toNodeId)) {
      errors.push(`Edge ${edge.edgeId}: toNode ${edge.toNodeId} not found`);
    }
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

function hasCycle(chain: DecisionChain): boolean {
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (inStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);

    for (const edge of chain.edges) {
      if (edge.fromNodeId === nodeId) {
        if (dfs(edge.toNodeId)) return true;
      }
    }

    inStack.delete(nodeId);
    return false;
  }

  for (const node of chain.nodes) {
    if (dfs(node.nodeId)) return true;
  }

  return false;
}
```

---

## ETAP 3: ATTACK PATH VERIFICATION — FIXED

### `src/attackPath/attackPathTypes.ts` — FIXED

```typescript
/**
 * Genesis Cyber Reasoning Engine — Attack Path Types (FIXED)
 *
 * ZMIANY:
 * - Rozdzielenie verificationCoverage od evidenceConfidence
 * - Edge ma verification status, evidence refs, provenance, testability
 * - Required path semantics: relacje, kolejność, osiągalność, spójność
 */

import type { ProvenanceRecord } from '../contracts/provenance.js';

export type NodeVerificationStatus =
  | 'UNVERIFIED'
  | 'SUPPORTED'
  | 'FALSIFIED'
  | 'BLOCKED';

export type AttackPathStatus =
  | 'UNVERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'VERIFIED'
  | 'FALSIFIED'
  | 'BLOCKED'
  | 'INCONCLUSIVE';

export type AttackPathNodeType =
  | 'INITIAL_ACCESS'
  | 'EXECUTION'
  | 'PERSISTENCE'
  | 'PRIVILEGE_ESCALATION'
  | 'DEFENSE_EVASION'
  | 'CREDENTIAL_ACCESS'
  | 'DISCOVERY'
  | 'LATERAL_MOVEMENT'
  | 'COLLECTION'
  | 'COMMAND_AND_CONTROL'
  | 'EXFILTRATION'
  | 'IMPACT';

export interface AttackPathNode {
  readonly nodeId: string;
  readonly nodeType: AttackPathNodeType;
  readonly description: string;
  readonly provenance: ProvenanceRecord;
  readonly evidenceRefs: readonly string[];
  readonly verificationStatus: NodeVerificationStatus;
  /** Is this node required for the path to be considered complete? */
  readonly required: boolean;
  readonly timestamp: string;
}

export interface AttackPathEdge {
  readonly edgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly relationship: string;
  readonly provenance: ProvenanceRecord;
  readonly evidenceRefs: readonly string[];
  readonly verificationStatus: NodeVerificationStatus;
  /** Is this edge required for path validity? */
  readonly required: boolean;
  /** Can this edge be tested? */
  readonly testable: boolean;
  readonly timestamp: string;
}

export interface AttackPath {
  readonly pathId: string;
  readonly nodes: readonly AttackPathNode[];
  readonly edges: readonly AttackPathEdge[];
  readonly overallStatus: AttackPathStatus;
  readonly provenance: ProvenanceRecord;
  readonly timestamp: string;
}

/**
 * FIXED: Rozdzielenie coverage od confidence.
 *
 * verificationCoverage: jaki % wymaganych nodes/edges jest zweryfikowany (0-1)
 * evidenceConfidence: jak silny jest evidence dla zweryfikowanych elementów (0-1 lub null)
 *
 * NIE wolno utożsamiać coverage z confidence.
 * Coverage = 1.0 nie oznacza confidence = 1.0.
 */
export interface AttackPathVerificationResult {
  readonly pathId: string;
  readonly overallStatus: AttackPathStatus;
  readonly verificationCoverage: number; // 0-1: fraction of required elements verified
  readonly evidenceConfidence: number | null; // 0-1 or null if cannot be computed
  readonly verifiedRequiredNodes: number;
  readonly totalRequiredNodes: number;
  readonly verifiedRequiredEdges: number;
  readonly totalRequiredEdges: number;
  readonly unverifiedNodes: readonly string[];
  readonly falsifiedNodes: readonly string[];
  readonly blockedNodes: readonly string[];
  readonly unverifiedEdges: readonly string[];
  readonly canBeMarkedVerified: boolean;
  readonly reason: string;
  readonly reachabilityValid: boolean;
  readonly orderingConsistent: boolean;
  readonly graphCoherent: boolean;
}
```

### `src/attackPath/attackPathVerifier.ts` — FIXED

```typescript
/**
 * Genesis Cyber Reasoning Engine — Attack Path Verifier (FIXED)
 *
 * KLUCZOWE ZASADY:
 * - ANY REQUIRED NODE = FALSIFIED → ATTACK PATH = FALSIFIED
 * - ANY REQUIRED NODE = BLOCKED → ATTACK PATH = BLOCKED
 * - ANY REQUIRED NODE/EDGE = UNVERIFIED → NOT VERIFIED
 * - VERIFIED tylko gdy wszystkie wymagane node + edge są SUPPORTED
 * - Coverage ≠ Confidence
 */

import type {
  AttackPath,
  AttackPathVerificationResult,
  AttackPathStatus,
} from './attackPathTypes.js';

export function verifyAttackPath(path: AttackPath): AttackPathVerificationResult {
  const requiredNodes = path.nodes.filter((n) => n.required);
  const requiredEdges = path.edges.filter((e) => e.required);

  const verifiedReqNodes = requiredNodes.filter((n) => n.verificationStatus === 'SUPPORTED');
  const falsifiedReqNodes = requiredNodes.filter((n) => n.verificationStatus === 'FALSIFIED');
  const blockedReqNodes = requiredNodes.filter((n) => n.verificationStatus === 'BLOCKED');
  const unverifiedReqNodes = requiredNodes.filter((n) => n.verificationStatus === 'UNVERIFIED');

  const verifiedReqEdges = requiredEdges.filter((e) => e.verificationStatus === 'SUPPORTED');
  const unverifiedReqEdges = requiredEdges.filter((e) => e.verificationStatus === 'UNVERIFIED');
  const falsifiedReqEdges = requiredEdges.filter((e) => e.verificationStatus === 'FALSIFIED');
  const blockedReqEdges = requiredEdges.filter((e) => e.verificationStatus === 'BLOCKED');

  // Coverage: fraction of required elements that are verified (SUPPORTED)
  const totalRequired = requiredNodes.length + requiredEdges.length;
  const totalVerified = verifiedReqNodes.length + verifiedReqEdges.length;
  const verificationCoverage = totalRequired > 0 ? totalVerified / totalRequired : 0;

  // Evidence confidence: average strength of evidence for verified elements
  // NULL if cannot be computed
  let evidenceConfidence: number | null = null;
  const verifiedWithEvidence = [
    ...verifiedReqNodes.filter((n) => n.evidenceRefs.length > 0),
    ...verifiedReqEdges.filter((e) => e.evidenceRefs.length > 0),
  ];
  if (verifiedWithEvidence.length > 0) {
    // Confidence is based on evidence presence, not fabricated
    evidenceConfidence = verifiedWithEvidence.length / (verifiedReqNodes.length + verifiedReqEdges.length || 1);
  }

  // Determine overall status
  let overallStatus: AttackPathStatus;
  let reason: string;

  if (falsifiedReqNodes.length > 0 || falsifiedReqEdges.length > 0) {
    overallStatus = 'FALSIFIED';
    reason = `Required elements falsified: ${[...falsifiedReqNodes.map((n) => n.nodeId), ...falsifiedReqEdges.map((e) => e.edgeId)].join(', ')}`;
  } else if (blockedReqNodes.length > 0 || blockedReqEdges.length > 0) {
    overallStatus = 'BLOCKED';
    reason = `Required elements blocked: ${[...blockedReqNodes.map((n) => n.nodeId), ...blockedReqEdges.map((e) => e.edgeId)].join(', ')}`;
  } else if (unverifiedReqNodes.length > 0 || unverifiedReqEdges.length > 0) {
    overallStatus = 'UNVERIFIED';
    reason = `Required elements unverified: ${[...unverifiedReqNodes.map((n) => n.nodeId), ...unverifiedReqEdges.map((e) => e.edgeId)].join(', ')}`;
  } else if (totalRequired > 0 && totalVerified === totalRequired) {
    overallStatus = 'VERIFIED';
    reason = 'All required nodes and edges are SUPPORTED.';
  } else if (totalRequired === 0) {
    overallStatus = 'INCONCLUSIVE';
    reason = 'No required elements defined.';
  } else {
    overallStatus = 'PARTIALLY_VERIFIED';
    reason = 'Some required elements verified, but not all.';
  }

  // Check reachability: can we traverse from first node to last node?
  const reachabilityValid = checkReachability(path);

  // Check ordering: do edges respect temporal/causal order?
  const orderingConsistent = checkOrdering(path);

  // Check graph coherence: is this a single connected hypothesis?
  const graphCoherent = checkCoherence(path);

  const canBeMarkedVerified =
    overallStatus === 'VERIFIED' &&
    reachabilityValid &&
    orderingConsistent &&
    graphCoherent;

  return Object.freeze({
    pathId: path.pathId,
    overallStatus,
    verificationCoverage: Math.round(verificationCoverage * 1000) / 1000,
    evidenceConfidence,
    verifiedRequiredNodes: verifiedReqNodes.length,
    totalRequiredNodes: requiredNodes.length,
    verifiedRequiredEdges: verifiedReqEdges.length,
    totalRequiredEdges: requiredEdges.length,
    unverifiedNodes: Object.freeze(unverifiedReqNodes.map((n) => n.nodeId)),
    falsifiedNodes: Object.freeze(falsifiedReqNodes.map((n) => n.nodeId)),
    blockedNodes: Object.freeze(blockedReqNodes.map((n) => n.nodeId)),
    unverifiedEdges: Object.freeze(unverifiedReqEdges.map((e) => e.edgeId)),
    canBeMarkedVerified,
    reason,
    reachabilityValid,
    orderingConsistent,
    graphCoherent,
  });
}

function checkReachability(path: AttackPath): boolean {
  if (path.nodes.length <= 1) return true;

  const firstNode = path.nodes[0];
  const lastNode = path.nodes[path.nodes.length - 1];
  if (!firstNode || !lastNode) return false;

  const visited = new Set<string>();
  const queue = [firstNode.nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === lastNode.nodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const edge of path.edges) {
      if (edge.fromNodeId === current && !visited.has(edge.toNodeId)) {
        queue.push(edge.toNodeId);
      }
    }
  }

  return false;
}

function checkOrdering(path: AttackPath): boolean {
  // Simple check: edges should go from earlier to later nodes in the path
  const nodeOrder = new Map(path.nodes.map((n, i) => [n.nodeId, i]));

  for (const edge of path.edges) {
    const fromIdx = nodeOrder.get(edge.fromNodeId);
    const toIdx = nodeOrder.get(edge.toNodeId);
    if (fromIdx !== undefined && toIdx !== undefined && fromIdx >= toIdx) {
      return false; // Backward edge
    }
  }

  return true;
}

function checkCoherence(path: AttackPath): boolean {
  if (path.nodes.length === 0) return true;

  // Check that all nodes are reachable from the first node
  const firstNode = path.nodes[0];
  if (!firstNode) return true;

  const visited = new Set<string>();
  const queue = [firstNode.nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const edge of path.edges) {
      if (edge.fromNodeId === current) {
        queue.push(edge.toNodeId);
      }
    }
  }

  return visited.size === path.nodes.length;
}
```

---

## ETAP 4: OUTCOME VERIFICATION — FIXED

### `src/outcomeVerification/verifySecurityOutcome.ts` — FIXED

```typescript
/**
 * Genesis Cyber Reasoning Engine — Outcome Verification (FIXED)
 *
 * USUNIĘTO: "tolerance × 2 = DRIFT"
 * DODANO: Jawny model per metric type
 *
 * Metric types:
 * - numeric: tolerance-based comparison
 * - boolean: exact match
 * - categorical/string: exact match
 * - missing metric: INSUFFICIENT_DATA
 * - unexpected metric: flagged
 *
 * Outcome semantics:
 * - expectedOutcome != actualOutcome → NOT VERIFIED regardless of metric match
 */

export type MetricType = 'numeric' | 'boolean' | 'categorical';

export interface MetricDefinition {
  readonly name: string;
  readonly type: MetricType;
  readonly tolerance?: number; // for numeric only
  readonly critical?: boolean;
}

export type OutcomeVerdict =
  | 'VERIFIED'
  | 'DRIFT'
  | 'FAILED'
  | 'INSUFFICIENT_DATA'
  | 'BLOCKED';

export interface OutcomeVerificationInput {
  readonly predictionId: string;
  readonly actionId: string;
  readonly expectedOutcome: string;
  readonly actualOutcome: string | null;
  readonly expectedMetrics: Record<string, unknown>;
  readonly actualMetrics: Record<string, unknown> | null;
  readonly metricDefinitions: readonly MetricDefinition[];
}

export interface MetricComparison {
  readonly metricName: string;
  readonly metricType: MetricType;
  readonly expectedValue: unknown;
  readonly actualValue: unknown;
  readonly verdict: 'MATCH' | 'DRIFT' | 'MISMATCH' | 'MISSING' | 'UNEXPECTED' | 'TYPE_MISMATCH';
  readonly deviation: number | null;
  readonly critical: boolean;
}

export interface OutcomeVerificationResult {
  readonly predictionId: string;
  readonly actionId: string;
  readonly verdict: OutcomeVerdict;
  readonly expectedOutcome: string;
  readonly actualOutcome: string | null;
  readonly outcomeSemanticsMatch: boolean;
  readonly metricComparisons: readonly MetricComparison[];
  readonly criticalMetricFailures: readonly string[];
  readonly analysis: string;
  readonly requiresReinvestigation: boolean;
  readonly nextSteps: readonly string[];
}

export function verifySecurityOutcome(
  input: OutcomeVerificationInput
): OutcomeVerificationResult {
  const {
    predictionId,
    actionId,
    expectedOutcome,
    actualOutcome,
    expectedMetrics,
    actualMetrics,
    metricDefinitions,
  } = input;

  // Case 1: No actual data
  if (actualOutcome === null || actualMetrics === null) {
    return Object.freeze({
      predictionId,
      actionId,
      verdict: 'INSUFFICIENT_DATA' as OutcomeVerdict,
      expectedOutcome,
      actualOutcome: null,
      outcomeSemanticsMatch: false,
      metricComparisons: Object.freeze([]),
      criticalMetricFailures: Object.freeze([]),
      analysis: 'No actual outcome data available.',
      requiresReinvestigation: true,
      nextSteps: Object.freeze(['Collect actual outcome data']),
    });
  }

  // Case 2: Check outcome semantics FIRST
  const outcomeSemanticsMatch = expectedOutcome.trim().toLowerCase() === actualOutcome.trim().toLowerCase();

  // Case 3: Compare metrics per type
  const metricComparisons: MetricComparison[] = [];
  const criticalMetricFailures: string[] = [];

  for (const def of metricDefinitions) {
    const expectedVal = expectedMetrics[def.name];
    const actualVal = actualMetrics[def.name];

    if (actualVal === undefined) {
      metricComparisons.push(Object.freeze({
        metricName: def.name,
        metricType: def.type,
        expectedValue: expectedVal,
        actualValue: null,
        verdict: 'MISSING' as const,
        deviation: null,
        critical: def.critical ?? false,
      }));
      if (def.critical) criticalMetricFailures.push(def.name);
      continue;
    }

    switch (def.type) {
      case 'numeric': {
        const exp = Number(expectedVal);
        const act = Number(actualVal);
        if (isNaN(exp) || isNaN(act)) {
          metricComparisons.push(Object.freeze({
            metricName: def.name, metricType: def.type,
            expectedValue: expectedVal, actualValue: actualVal,
            verdict: 'TYPE_MISMATCH' as const, deviation: null,
            critical: def.critical ?? false,
          }));
          if (def.critical) criticalMetricFailures.push(def.name);
          break;
        }
        const tolerance = def.tolerance ?? 0.01;
        const deviation = exp !== 0 ? Math.abs(act - exp) / Math.abs(exp) : Math.abs(act - exp);
        const verdict = deviation <= tolerance ? 'MATCH' : deviation <= tolerance * 3 ? 'DRIFT' : 'MISMATCH';
        metricComparisons.push(Object.freeze({
          metricName: def.name, metricType: def.type,
          expectedValue: exp, actualValue: act,
          verdict, deviation: Math.round(deviation * 10000) / 10000,
          critical: def.critical ?? false,
        }));
        if (verdict === 'MISMATCH' && def.critical) criticalMetricFailures.push(def.name);
        break;
      }
      case 'boolean': {
        const match = Boolean(expectedVal) === Boolean(actualVal);
        metricComparisons.push(Object.freeze({
          metricName: def.name, metricType: def.type,
          expectedValue: expectedVal, actualValue: actualVal,
          verdict: match ? 'MATCH' as const : 'MISMATCH' as const,
          deviation: null, critical: def.critical ?? false,
        }));
        if (!match && def.critical) criticalMetricFailures.push(def.name);
        break;
      }
      case 'categorical': {
        const match = String(expectedVal) === String(actualVal);
        metricComparisons.push(Object.freeze({
          metricName: def.name, metricType: def.type,
          expectedValue: expectedVal, actualValue: actualVal,
          verdict: match ? 'MATCH' as const : 'MISMATCH' as const,
          deviation: null, critical: def.critical ?? false,
        }));
        if (!match && def.critical) criticalMetricFailures.push(def.name);
        break;
      }
    }
  }

  // Check for unexpected metrics
  for (const key of Object.keys(actualMetrics)) {
    if (!metricDefinitions.some((d) => d.name === key)) {
      metricComparisons.push(Object.freeze({
        metricName: key, metricType: 'categorical' as MetricType,
        expectedValue: null, actualValue: actualMetrics[key],
        verdict: 'UNEXPECTED' as const, deviation: null, critical: false,
      }));
    }
  }

  // Determine verdict
  let verdict: OutcomeVerdict;
  let analysis: string;
  let requiresReinvestigation: boolean;
  let nextSteps: readonly string[];

  const hasMismatches = metricComparisons.some((m) => m.verdict === 'MISMATCH');
  const hasDrift = metricComparisons.some((m) => m.verdict === 'DRIFT');
  const hasMissing = metricComparisons.some((m) => m.verdict === 'MISSING');
  const hasTypeMismatch = metricComparisons.some((m) => m.verdict === 'TYPE_MISMATCH');
  const allMatch = metricComparisons.every((m) => m.verdict === 'MATCH');

  // CRITICAL: outcome semantics contradiction overrides metric match
  if (!outcomeSemanticsMatch) {
    verdict = 'FAILED';
    analysis = `Outcome semantics contradiction: expected "${expectedOutcome}", got "${actualOutcome}". ` +
      `Metric match does NOT override outcome contradiction.`;
    requiresReinvestigation = true;
    nextSteps = Object.freeze([
      'Re-investigate: outcome contradicts prediction',
      'Do NOT mark as VERIFIED',
      'Check for confounding factors',
    ]);
  } else if (criticalMetricFailures.length > 0 || hasTypeMismatch) {
    verdict = 'FAILED';
    analysis = `Critical metric failures: ${criticalMetricFailures.join(', ')}. ` +
      (hasTypeMismatch ? 'Type mismatches detected.' : '');
    requiresReinvestigation = true;
    nextSteps = Object.freeze(['Investigate critical metric failures', 'Re-run tests']);
  } else if (hasMismatches) {
    verdict = 'FAILED';
    analysis = 'Metric mismatches detected.';
    requiresReinvestigation = true;
    nextSteps = Object.freeze(['Investigate mismatches', 'Re-evaluate prediction']);
  } else if (hasDrift) {
    verdict = 'DRIFT';
    analysis = 'Metric drift detected. Outcome direction correct but magnitude differs.';
    requiresReinvestigation = true;
    nextSteps = Object.freeze(['Investigate drift cause', 'Consider tolerance adjustment']);
  } else if (hasMissing) {
    verdict = 'INSUFFICIENT_DATA';
    analysis = 'Missing metrics prevent full verification.';
    requiresReinvestigation = true;
    nextSteps = Object.freeze(['Collect missing metrics']);
  } else if (allMatch && outcomeSemanticsMatch) {
    verdict = 'VERIFIED';
    analysis = 'All metrics match and outcome semantics consistent.';
    requiresReinvestigation = false;
    nextSteps = Object.freeze(['Record verification', 'Update confidence']);
  } else {
    verdict = 'INSUFFICIENT_DATA';
    analysis = 'Partial data available.';
    requiresReinvestigation = true;
    nextSteps = Object.freeze(['Collect additional data']);
  }

  return Object.freeze({
    predictionId,
    actionId,
    verdict,
    expectedOutcome,
    actualOutcome,
    outcomeSemanticsMatch,
    metricComparisons: Object.freeze(metricComparisons),
    criticalMetricFailures: Object.freeze(criticalMetricFailures),
    analysis,
    requiresReinvestigation,
    nextSteps,
  });
}
```

---

## ETAP 5: PROVENANCE / MODEL OUTPUT — FIXED

Usunięto `promoteToEvidence()`. Dodano anti-fabrication test:

### `src/contracts/antiFabrication.ts` — NEW

```typescript
/**
 * Genesis Cyber Reasoning Engine — Anti-Fabrication Guards
 *
 * MODEL_GENERATED NIGDY automatycznie:
 * - Evidence
 * - Reference
 * - Real Experimental
 * - Verified
 *
 * Model claim może zostać TESTED / SUPPORTED / FALSIFIED,
 * ale provenance modelu się nie zmienia.
 */

import type { ProvenanceRecord } from './provenance.js';

export interface AntiFabricationCheck {
  readonly passed: boolean;
  readonly violations: readonly string[];
}

/**
 * Check 1: MODEL_GENERATED output nie może self-reference jako evidence.
 */
export function checkSelfReferencingEvidence(
  claimProvenance: ProvenanceRecord,
  evidenceRefs: readonly string[],
  ownEntityId: string
): AntiFabricationCheck {
  const violations: string[] = [];

  if (claimProvenance.claimOrigin === 'MODEL_GENERATED') {
    for (const ref of evidenceRefs) {
      if (ref === ownEntityId || ref === claimProvenance.stableIdentifier) {
        violations.push(
          `MODEL_GENERATED entity ${ownEntityId} attempts to self-reference as evidence (ref: ${ref}). REJECTED.`
        );
      }
    }
  }

  return Object.freeze({ passed: violations.length === 0, violations: Object.freeze(violations) });
}

/**
 * Check 2: MODEL_GENERATED nie może być oznaczony jako REAL_EXPERIMENTAL.
 */
export function checkProvenanceEscalation(
  provenance: ProvenanceRecord
): AntiFabricationCheck {
  const violations: string[] = [];

  if (provenance.claimOrigin === 'MODEL_GENERATED' && provenance.dataProvenance === 'REAL_EXPERIMENTAL') {
    violations.push('MODEL_GENERATED claim cannot have REAL_EXPERIMENTAL data provenance');
  }

  if (provenance.claimOrigin === 'MODEL_GENERATED' && provenance.dataProvenance === 'REFERENCE') {
    violations.push('MODEL_GENERATED claim cannot be promoted to REFERENCE without independent verification');
  }

  return Object.freeze({ passed: violations.length === 0, violations: Object.freeze(violations) });
}

/**
 * Check 3: Model claim bez independent verification pozostaje UNVERIFIED.
 */
export function checkUnsupportedExternalClaim(
  provenance: ProvenanceRecord,
  hasIndependentEvidence: boolean
): AntiFabricationCheck {
  const violations: string[] = [];

  if (provenance.claimOrigin === 'MODEL_GENERATED' && !hasIndependentEvidence) {
    violations.push('MODEL_GENERATED claim without independent evidence remains UNVERIFIED');
  }

  return Object.freeze({ passed: violations.length === 0, violations: Object.freeze(violations) });
}

/**
 * Run all anti-fabrication checks.
 */
export function runAntiFabricationChecks(
  provenance: ProvenanceRecord,
  evidenceRefs: readonly string[],
  ownEntityId: string,
  hasIndependentEvidence: boolean
): AntiFabricationCheck {
  const checks = [
    checkSelfReferencingEvidence(provenance, evidenceRefs, ownEntityId),
    checkProvenanceEscalation(provenance),
    checkUnsupportedExternalClaim(provenance, hasIndependentEvidence),
  ];

  const allViolations = checks.flatMap((c) => [...c.violations]);

  return Object.freeze({
    passed: allViolations.length === 0,
    violations: Object.freeze(allViolations),
  });
}
```

---

## ETAP 6: CONFLICT RESOLUTION — FIXED

### `src/conflict/conflictResolver.ts` — FIXED

```typescript
/**
 * Genesis Cyber Reasoning Engine — Conflict Resolver (FIXED)
 *
 * NIE używamy:
 * - majority vote
 * - model confidence vote
 * - count of models
 * - string difference
 *
 * Conflict = mutually incompatible claims OR incompatible predictions
 * OR contradictory evidence.
 *
 * Resolution przez discriminating test, nie głosowanie.
 */

export interface Claim {
  readonly claimId: string;
  readonly sourceId: string;
  readonly statement: string;
  readonly prediction: string | null;
  readonly assumptions: readonly string[];
  readonly falsifier: string | null;
}

export interface Conflict {
  readonly conflictId: string;
  readonly claims: readonly Claim[];
  readonly conflictType: 'INCOMPATIBLE_CLAIMS' | 'INCOMPATIBLE_PREDICTIONS' | 'CONTRADICTORY_EVIDENCE';
  readonly conflictPoint: string;
  readonly timestamp: string;
}

export interface DiscriminatingTest {
  readonly testId: string;
  readonly conflictId: string;
  readonly description: string;
  readonly expectedOutcomes: Readonly<Record<string, string>>;
  readonly status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'BLOCKED';
}

export interface DiscriminatingTestResult {
  readonly testId: string;
  readonly outcome: string;
  readonly supportsClaims: readonly string[];
  readonly contradictsClaims: readonly string[];
  readonly inconclusiveClaims: readonly string[];
}

export type ConflictResolutionType =
  | 'RESOLVED_SINGLE_CLAIM'
  | 'RESOLVED_MULTIPLE_CLAIMS'
  | 'COMPETING_CLAIMS_UNRESOLVED'
  | 'NO_SURVIVING_CLAIM'
  | 'BLOCKED';

export interface ConflictResolution {
  readonly conflictId: string;
  readonly resolution: ConflictResolutionType;
  readonly supportedClaims: readonly string[];
  readonly falsifiedClaims: readonly string[];
  readonly inconclusiveClaims: readonly string[];
  readonly reasoning: string;
  readonly timestamp: string;
}

let conflictCounter = 0;

/**
 * Detect conflict between claims.
 *
 * Conflict istnieje gdy:
 * - Mutually incompatible claims (nie mogą oba być prawdziwe)
 * - Incompatible predictions (przewidują różne wyniki dla tego samego eksperymentu)
 * - Contradictory evidence
 *
 * BRAK konfliktu gdy:
 * - 2 claims z tym samym prediction
 * - Distinct compatible claims (nie wykluczają się)
 */
export function detectConflict(claims: readonly Claim[]): Conflict | null {
  if (claims.length < 2) return null;

  // Check for incompatible predictions
  const predictions = claims
    .filter((c) => c.prediction !== null)
    .map((c) => ({ claimId: c.claimId, prediction: c.prediction! }));

  const uniquePredictions = new Set(predictions.map((p) => p.prediction));

  if (uniquePredictions.size > 1) {
    // Multiple different predictions = conflict
    return Object.freeze({
      conflictId: `conflict-${++conflictCounter}`,
      claims: Object.freeze([...claims]),
      conflictType: 'INCOMPATIBLE_PREDICTIONS' as const,
      conflictPoint: `Incompatible predictions: ${[...uniquePredictions].join(' vs ')}`,
      timestamp: new Date().toISOString(),
    });
  }

  // Check for mutually exclusive claims via assumptions
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i]!;
      const b = claims[j]!;

      // Simple incompatibility check: one claim's falsifier matches other's statement
      if (a.falsifier && b.statement.toLowerCase().includes(a.falsifier.toLowerCase())) {
        return Object.freeze({
          conflictId: `conflict-${++conflictCounter}`,
          claims: Object.freeze([...claims]),
          conflictType: 'INCOMPATIBLE_CLAIMS' as const,
          conflictPoint: `Claim ${a.claimId} falsifier contradicts claim ${b.claimId}`,
          timestamp: new Date().toISOString(),
        });
      }
      if (b.falsifier && a.statement.toLowerCase().includes(b.falsifier.toLowerCase())) {
        return Object.freeze({
          conflictId: `conflict-${++conflictCounter}`,
          claims: Object.freeze([...claims]),
          conflictType: 'INCOMPATIBLE_CLAIMS' as const,
          conflictPoint: `Claim ${b.claimId} falsifier contradicts claim ${a.claimId}`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // Same predictions, no contradictions = no conflict
  return null;
}

/**
 * Resolve conflict via discriminating test result.
 * NIE majority vote.
 */
export function resolveConflict(
  conflict: Conflict,
  testResult: DiscriminatingTestResult
): ConflictResolution {
  const { supportsClaims, contradictsClaims, inconclusiveClaims } = testResult;

  let resolution: ConflictResolutionType;
  let reasoning: string;

  if (contradictsClaims.length === conflict.claims.length) {
    // ALL claims falsified
    resolution = 'NO_SURVIVING_CLAIM';
    reasoning = 'All claims were falsified by the discriminating test. No surviving claim.';
  } else if (supportsClaims.length === 1 && contradictsClaims.length === conflict.claims.length - 1) {
    resolution = 'RESOLVED_SINGLE_CLAIM';
    reasoning = `One claim supported, others falsified. Winner: ${supportsClaims[0]}`;
  } else if (supportsClaims.length > 1) {
    resolution = 'RESOLVED_MULTIPLE_CLAIMS';
    reasoning = `Multiple claims supported: ${supportsClaims.join(', ')}. May need further discrimination.`;
  } else if (inconclusiveClaims.length > 0) {
    resolution = 'COMPETING_CLAIMS_UNRESOLVED';
    reasoning = `Data does not discriminate. Inconclusive: ${inconclusiveClaims.join(', ')}. Additional test required.`;
  } else if (supportsClaims.length === 0 && contradictsClaims.length === 0) {
    resolution = 'BLOCKED';
    reasoning = 'Test produced no actionable result.';
  } else {
    resolution = 'COMPETING_CLAIMS_UNRESOLVED';
    reasoning = 'Unable to resolve with available evidence.';
  }

  return Object.freeze({
    conflictId: conflict.conflictId,
    resolution,
    supportedClaims: Object.freeze([...supportsClaims]),
    falsifiedClaims: Object.freeze([...contradictsClaims]),
    inconclusiveClaims: Object.freeze([...inconclusiveClaims]),
    reasoning,
    timestamp: new Date().toISOString(),
  });
}
```

---

## ETAP 7: PERMISSION / EXECUTION BOUNDARY — FIXED

### `src/permission/permissionGate.ts` — FIXED

```typescript
/**
 * Genesis Cyber Reasoning Engine — Permission Gate (FIXED)
 *
 * OBOWIĄZOWE ROZDZIELENIE:
 * Attention ≠ Permission ≠ Execution
 *
 * Attention może: LOG, QUEUE, NOTIFY, WARN, ESCALATE, REQUEST_APPROVAL
 * Attention NIE może: STOP, EXECUTE, EMERGENCY_STOP
 *
 * Execution przechodzi przez:
 * Decision → Policy → Permission → Approval → Execution Boundary → Action
 *
 * Multi-factor: actor, role, mission, target, action, risk, approvalState
 */

export type ActionLevel =
  | 'OBSERVE' | 'ANALYZE' | 'SIMULATE' | 'RECOMMEND'
  | 'REQUEST_APPROVAL' | 'EXECUTE' | 'STOP' | 'EMERGENCY_STOP';

export type OperatorRole =
  | 'VIEWER' | 'ANALYST' | 'OPERATOR' | 'SUPERVISOR' | 'DIRECTOR' | 'SYSTEM';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type PermissionDecision = 'ALLOWED' | 'DENIED' | 'PENDING_APPROVAL' | 'BLOCKED';

export interface PermissionRequest {
  readonly requestId: string;
  readonly timestamp: string;
  readonly actor: string;
  readonly role: OperatorRole;
  readonly missionId: string;
  readonly target: string;
  readonly action: ActionLevel;
  readonly riskLevel: RiskLevel;
  readonly evidenceRefs: readonly string[];
  readonly justification: string;
}

export interface PermissionResult {
  readonly requestId: string;
  readonly decision: PermissionDecision;
  readonly requiredApprovers: readonly OperatorRole[];
  readonly reason: string;
  readonly approvedBy: string | null;
  readonly expiresAt: string | null;
}

// Multi-factor permission matrix
const ROLE_CAPABILITIES: Readonly<Record<OperatorRole, readonly ActionLevel[]>> = Object.freeze({
  VIEWER: Object.freeze(['OBSERVE']),
  ANALYST: Object.freeze(['OBSERVE', 'ANALYZE', 'SIMULATE']),
  OPERATOR: Object.freeze(['OBSERVE', 'ANALYZE', 'SIMULATE', 'RECOMMEND', 'REQUEST_APPROVAL']),
  SUPERVISOR: Object.freeze(['OBSERVE', 'ANALYZE', 'SIMULATE', 'RECOMMEND', 'REQUEST_APPROVAL', 'EXECUTE', 'STOP']),
  DIRECTOR: Object.freeze(['OBSERVE', 'ANALYZE', 'SIMULATE', 'RECOMMEND', 'REQUEST_APPROVAL', 'EXECUTE', 'STOP', 'EMERGENCY_STOP']),
  SYSTEM: Object.freeze(['OBSERVE', 'ANALYZE', 'SIMULATE', 'RECOMMEND', 'REQUEST_APPROVAL', 'EXECUTE', 'STOP', 'EMERGENCY_STOP']),
});

const RISK_APPROVAL: Readonly<Record<RiskLevel, readonly OperatorRole[]>> = Object.freeze({
  LOW: Object.freeze([]),
  MEDIUM: Object.freeze(['OPERATOR']),
  HIGH: Object.freeze(['SUPERVISOR']),
  CRITICAL: Object.freeze(['SUPERVISOR', 'DIRECTOR']),
});

export function checkPermission(request: PermissionRequest): PermissionResult {
  const { role, action, riskLevel } = request;

  // Check 1: Does role allow this action level?
  const allowedActions = ROLE_CAPABILITIES[role];
  if (!allowedActions.includes(action)) {
    return Object.freeze({
      requestId: request.requestId,
      decision: 'DENIED' as PermissionDecision,
      requiredApprovers: Object.freeze([]),
      reason: `Role ${role} does not permit action ${action}. Allowed: ${allowedActions.join(', ')}`,
      approvedBy: null,
      expiresAt: null,
    });
  }

  // Check 2: Model output cannot EXECUTE
  if (request.actor.startsWith('model:') && (action === 'EXECUTE' || action === 'STOP' || action === 'EMERGENCY_STOP')) {
    return Object.freeze({
      requestId: request.requestId,
      decision: 'BLOCKED' as PermissionDecision,
      requiredApprovers: Object.freeze([]),
      reason: `Model output (${request.actor}) cannot directly ${action}. Must go through human approval.`,
      approvedBy: null,
      expiresAt: null,
    });
  }

  // Check 3: Risk-based approval
  const requiredApprovers = RISK_APPROVAL[riskLevel];

  if (requiredApprovers.length === 0) {
    return Object.freeze({
      requestId: request.requestId,
      decision: 'ALLOWED' as PermissionDecision,
      requiredApprovers: Object.freeze([]),
      reason: `Action ${action} with risk ${riskLevel} allowed for role ${role}.`,
      approvedBy: request.actor,
      expiresAt: null,
    });
  }

  // Check 4: Is actor's role sufficient for this risk level?
  if (requiredApprovers.includes(role)) {
    return Object.freeze({
      requestId: request.requestId,
      decision: 'ALLOWED' as PermissionDecision,
      requiredApprovers: Object.freeze([...requiredApprovers]),
      reason: `Role ${role} authorized for risk ${riskLevel}.`,
      approvedBy: request.actor,
      expiresAt: null,
    });
  }

  // Requires approval from higher role
  return Object.freeze({
    requestId: request.requestId,
    decision: 'PENDING_APPROVAL' as PermissionDecision,
    requiredApprovers: Object.freeze([...requiredApprovers]),
    reason: `Action ${action} with risk ${riskLevel} requires approval from: ${requiredApprovers.join(', ')}.`,
    approvedBy: null,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
}
```

---

## ETAP 8: ATTENTION INTELLIGENCE — FIXED

### `src/attention/attentionEvaluator.ts` — FIXED

```typescript
/**
 * Genesis Cyber Reasoning Engine — Attention Evaluator (FIXED)
 *
 * Attention ocenia: "czy człowiek powinien zostać przerwany?"
 * NIE: "czy system ma wykonać działanie?"
 *
 * Scoring jest JAWNIE HEURYSTYCZNY.
 * NIE jest certyfikowaną polityką bezpieczeństwa.
 * EMERGENCY_STOP NIE jest bezpośrednią konsekwencją score.
 *
 * Output: attentionRecommendation + decisionAuthority
 */

export interface AttentionFactors {
  readonly severity: number;
  readonly urgency: number;
  readonly impact: number;
  readonly confidence: number;
  readonly novelty: number;
  readonly timeSensitivity: number;
  readonly costOfSilence: number;
  readonly operatorWorkload: number;
  readonly reversibility: number;
  readonly ignoredHistory: number;
}

export type AttentionRecommendation =
  | 'NO_INTERRUPT' | 'LOG' | 'QUEUE' | 'NOTIFY'
  | 'WARN' | 'REQUEST_APPROVAL' | 'ESCALATE';

export type DecisionAuthority =
  | 'ATTENTION_LAYER'
  | 'PERMISSION_LAYER'
  | 'EXECUTION_LAYER'
  | 'HUMAN_OPERATOR';

export interface AttentionEvaluationResult {
  readonly recommendation: AttentionRecommendation;
  readonly decisionAuthority: DecisionAuthority;
  readonly factors: AttentionFactors;
  readonly interruptValue: number;
  readonly suppressValue: number;
  readonly netValue: number;
  readonly reason: string;
  readonly isHeuristic: true; // ALWAYS true — jawne oznaczenie
  readonly timestamp: string;
}

export function evaluateAttention(factors: AttentionFactors): AttentionEvaluationResult {
  const interruptValue =
    factors.severity * 0.20 +
    factors.urgency * 0.15 +
    factors.impact * 0.15 +
    factors.timeSensitivity * 0.15 +
    factors.costOfSilence * 0.15 +
    factors.confidence * 0.10 +
    (1 - factors.reversibility) * 0.10;

  const suppressValue =
    factors.operatorWorkload * 0.25 +
    (1 - factors.novelty) * 0.15 +
    factors.reversibility * 0.15 +
    (factors.ignoredHistory > 2 ? 0.25 : 0) +
    (factors.confidence < 0.3 ? 0.20 : 0);

  const netValue = interruptValue - suppressValue;

  let recommendation: AttentionRecommendation;
  let decisionAuthority: DecisionAuthority;
  let reason: string;

  if (netValue >= 0.60) {
    recommendation = 'ESCALATE';
    decisionAuthority = 'EXECUTION_LAYER';
    reason = 'High interrupt value. Escalation recommended. Execution decision belongs to EXECUTION_LAYER, not attention.';
  } else if (netValue >= 0.45) {
    recommendation = 'REQUEST_APPROVAL';
    decisionAuthority = 'PERMISSION_LAYER';
    reason = 'Moderate-high interrupt value. Approval recommended. Decision belongs to PERMISSION_LAYER.';
  } else if (netValue >= 0.30) {
    recommendation = 'WARN';
    decisionAuthority = 'ATTENTION_LAYER';
    reason = 'Moderate interrupt value. Warning issued.';
  } else if (netValue >= 0.20) {
    recommendation = 'NOTIFY';
    decisionAuthority = 'ATTENTION_LAYER';
    reason = 'Low-moderate interrupt value. Notification issued.';
  } else if (netValue >= 0.10) {
    recommendation = 'QUEUE';
    decisionAuthority = 'ATTENTION_LAYER';
    reason = 'Low interrupt value. Queued for next pause.';
  } else if (netValue >= 0.0) {
    recommendation = 'LOG';
    decisionAuthority = 'ATTENTION_LAYER';
    reason = 'Very low interrupt value. Logged only.';
  } else {
    recommendation = 'NO_INTERRUPT';
    decisionAuthority = 'ATTENTION_LAYER';
    reason = 'Negative interrupt value. No interruption.';
  }

  return Object.freeze({
    recommendation,
    decisionAuthority,
    factors,
    interruptValue: Math.round(interruptValue * 100) / 100,
    suppressValue: Math.round(suppressValue * 100) / 100,
    netValue: Math.round(netValue * 100) / 100,
    reason,
    isHeuristic: true as const,
    timestamp: new Date().toISOString(),
  });
}
```

---

## ETAP 9: SECURITY DRIFT — FIXED

### `src/drift/driftDetector.ts` — FIXED

```typescript
/**
 * Genesis Cyber Reasoning Engine — Security Drift Detector (FIXED)
 *
 * Rozróżnienie:
 * - numeric drift
 * - categorical drift
 * - missing field
 * - unexpected field
 * - critical field drift
 *
 * Missing field NIE jest automatycznie critical,
 * chyba że field classification tak mówi.
 */

export type FieldType = 'numeric' | 'boolean' | 'categorical' | 'critical';

export interface FieldDefinition {
  readonly name: string;
  readonly type: FieldType;
  readonly critical: boolean;
  readonly tolerance?: number;
}

export type DriftType = 'NO_DRIFT' | 'DRIFT' | 'CRITICAL_DRIFT' | 'INSUFFICIENT_DATA';

export interface DriftDeviation {
  readonly fieldName: string;
  readonly fieldType: FieldType;
  readonly expectedValue: unknown;
  readonly observedValue: unknown;
  readonly deviationType: 'NUMERIC_DEVIATION' | 'CATEGORICAL_CHANGE' | 'MISSING_FIELD' | 'UNEXPECTED_FIELD' | 'TYPE_MISMATCH';
  readonly deviationMagnitude: number | null;
  readonly critical: boolean;
}

export interface SecurityDriftResult {
  readonly assetId: string;
  readonly driftType: DriftType;
  readonly severity: number;
  readonly deviations: readonly DriftDeviation[];
  readonly criticalDeviations: readonly string[];
  readonly analysis: string;
  readonly timestamp: string;
}

export function detectSecurityDrift(
  assetId: string,
  expectedState: Record<string, unknown>,
  observedState: Record<string, unknown>,
  fieldDefinitions: readonly FieldDefinition[],
  tolerance: number = 0.1
): SecurityDriftResult {
  const deviations: DriftDeviation[] = [];
  const criticalDeviations: string[] = [];

  for (const def of fieldDefinitions) {
    const expectedVal = expectedState[def.name];
    const observedVal = observedState[def.name];

    // Missing field
    if (observedVal === undefined) {
      deviations.push(Object.freeze({
        fieldName: def.name,
        fieldType: def.type,
        expectedValue: expectedVal,
        observedValue: null,
        deviationType: 'MISSING_FIELD' as const,
        deviationMagnitude: null,
        critical: def.critical,
      }));
      if (def.critical) criticalDeviations.push(def.name);
      continue;
    }

    switch (def.type) {
      case 'numeric':
      case 'critical': {
        const exp = Number(expectedVal);
        const obs = Number(observedVal);
        if (isNaN(exp) || isNaN(obs)) {
          deviations.push(Object.freeze({
            fieldName: def.name, fieldType: def.type,
            expectedValue: expectedVal, observedValue: observedVal,
            deviationType: 'TYPE_MISMATCH' as const,
            deviationMagnitude: null, critical: def.critical,
          }));
          if (def.critical) criticalDeviations.push(def.name);
          break;
        }
        const dev = exp !== 0 ? Math.abs(obs - exp) / Math.abs(exp) : Math.abs(obs - exp);
        const fieldTolerance = def.tolerance ?? tolerance;
        if (dev > fieldTolerance) {
          deviations.push(Object.freeze({
            fieldName: def.name, fieldType: def.type,
            expectedValue: exp, observedValue: obs,
            deviationType: 'NUMERIC_DEVIATION' as const,
            deviationMagnitude: Math.round(dev * 10000) / 10000,
            critical: def.critical,
          }));
          if (def.critical) criticalDeviations.push(def.name);
        }
        break;
      }
      case 'boolean':
      case 'categorical': {
        if (String(expectedVal) !== String(observedVal)) {
          deviations.push(Object.freeze({
            fieldName: def.name, fieldType: def.type,
            expectedValue: expectedVal, observedValue: observedVal,
            deviationType: 'CATEGORICAL_CHANGE' as const,
            deviationMagnitude: null, critical: def.critical,
          }));
          if (def.critical) criticalDeviations.push(def.name);
        }
        break;
      }
    }
  }

  // Unexpected fields
  for (const key of Object.keys(observedState)) {
    if (!fieldDefinitions.some((d) => d.name === key)) {
      deviations.push(Object.freeze({
        fieldName: key, fieldType: 'categorical' as FieldType,
        expectedValue: null, observedValue: observedState[key],
        deviationType: 'UNEXPECTED_FIELD' as const,
        deviationMagnitude: null, critical: false,
      }));
    }
  }

  // Determine drift type
  let driftType: DriftType;
  let severity: number;
  let analysis: string;

  if (deviations.length === 0) {
    driftType = 'NO_DRIFT';
    severity = 0;
    analysis = 'No drift detected.';
  } else if (criticalDeviations.length > 0) {
    driftType = 'CRITICAL_DRIFT';
    severity = Math.min(1, 0.5 + criticalDeviations.length * 0.2);
    analysis = `Critical drift: ${criticalDeviations.join(', ')}`;
  } else if (deviations.some((d) => d.deviationType === 'MISSING_FIELD')) {
    driftType = 'DRIFT';
    severity = Math.min(1, deviations.length * 0.15);
    analysis = `Drift with missing fields: ${deviations.filter((d) => d.deviationType === 'MISSING_FIELD').map((d) => d.fieldName).join(', ')}`;
  } else {
    driftType = 'DRIFT';
    severity = Math.min(1, deviations.length * 0.1);
    analysis = `Drift detected: ${deviations.length} deviations.`;
  }

  return Object.freeze({
    assetId,
    driftType,
    severity: Math.round(severity * 100) / 100,
    deviations: Object.freeze(deviations),
    criticalDeviations: Object.freeze(criticalDeviations),
    analysis,
    timestamp: new Date().toISOString(),
  });
}
```

---

## ETAP 10: STALE OBSERVATION + REPLAY BRIDGE

### `src/observation/staleObservation.ts` — NEW

```typescript
/**
 * Genesis Cyber Reasoning Engine — Stale Observation Detection
 */

export interface StaleObservationConfig {
  readonly observedAt: string | null;
  readonly ingestedAt: string | null;
  readonly freshnessDeadline: string | null;
  readonly staleAfterMs: number | null;
}

export type StalenessVerdict = 'FRESH' | 'STALE' | 'EXPIRED' | 'UNKNOWN' | 'INVALID_TIMESTAMP';

export interface StalenessResult {
  readonly verdict: StalenessVerdict;
  readonly ageMs: number | null;
  readonly reason: string;
}

export function isObservationStale(config: StaleObservationConfig): StalenessResult {
  const now = Date.now();

  if (config.observedAt === null) {
    return Object.freeze({ verdict: 'UNKNOWN' as StalenessVerdict, ageMs: null, reason: 'No observedAt timestamp' });
  }

  const observedTime = new Date(config.observedAt).getTime();
  if (isNaN(observedTime)) {
    return Object.freeze({ verdict: 'INVALID_TIMESTAMP' as StalenessVerdict, ageMs: null, reason: `Invalid observedAt: ${config.observedAt}` });
  }

  const ageMs = now - observedTime;

  if (config.freshnessDeadline !== null) {
    const deadlineTime = new Date(config.freshnessDeadline).getTime();
    if (isNaN(deadlineTime)) {
      return Object.freeze({ verdict: 'INVALID_TIMESTAMP' as StalenessVerdict, ageMs, reason: `Invalid freshnessDeadline: ${config.freshnessDeadline}` });
    }
    if (now > deadlineTime) {
      return Object.freeze({ verdict: 'EXPIRED' as StalenessVerdict, ageMs, reason: 'Past freshness deadline' });
    }
  }

  if (config.staleAfterMs !== null && ageMs > config.staleAfterMs) {
    return Object.freeze({ verdict: 'STALE' as StalenessVerdict, ageMs, reason: `Age ${ageMs}ms exceeds staleAfterMs ${config.staleAfterMs}ms` });
  }

  return Object.freeze({ verdict: 'FRESH' as StalenessVerdict, ageMs, reason: 'Observation is fresh' });
}
```

### `src/observation/replayBridge.ts` — NEW (ADAPTER)

```typescript
/**
 * Genesis Cyber Reasoning Engine — Replay Bridge
 *
 * INTEGRATION_REQUIRED: Podłączenie do istniejącego Genesis Replay Engine.
 * NIE tworzymy drugiego Replay Engine.
 *
 * W repo Genesis: matrixFoundation/replayVerdict.ts
 * Istniejący słownik: MATCH | DRIFT | BLOCKED | NOT_REPRODUCIBLE
 */

export type ReplayVerdict = 'MATCH' | 'DRIFT' | 'BLOCKED' | 'NOT_REPRODUCIBLE';

export type ReplayComparisonType =
  | 'IDENTICAL'
  | 'EXPECTED_NONDETERMINISM'
  | 'DRIFT'
  | 'BLOCKED';

export interface ReplayComparisonInput {
  readonly originalRunId: string;
  readonly originalFingerprint: string;
  readonly replayFingerprint: string;
  readonly deterministic: boolean;
}

export interface ReplayComparisonResult {
  readonly comparisonType: ReplayComparisonType;
  readonly verdict: ReplayVerdict;
  readonly reason: string;
}

/**
 * INTEGRATION_REQUIRED:
 * Ta funkcja powinna wywoływać istniejący Genesis replay mechanism.
 * Poniżej: standalone implementacja porównania fingerprintów.
 */
export function compareReplay(input: ReplayComparisonInput): ReplayComparisonResult {
  if (input.originalFingerprint === input.replayFingerprint) {
    return Object.freeze({
      comparisonType: 'IDENTICAL' as ReplayComparisonType,
      verdict: 'MATCH' as ReplayVerdict,
      reason: 'Replay fingerprint identical to original.',
    });
  }

  if (!input.deterministic) {
    return Object.freeze({
      comparisonType: 'EXPECTED_NONDETERMINISM' as ReplayComparisonType,
      verdict: 'DRIFT' as ReplayVerdict,
      reason: 'Non-deterministic execution. Drift expected.',
    });
  }

  return Object.freeze({
    comparisonType: 'DRIFT' as ReplayComparisonType,
    verdict: 'DRIFT' as ReplayVerdict,
    reason: 'Deterministic execution produced different fingerprint. Drift detected.',
  });
}
```

---

## ETAP 11-15: GENESIS CYBER REASONING ENGINE — VERTICAL SLICE

(This "toy vulnerable app + reasoning engine" vertical slice from the raw
paste is what C3 actually implemented separately — see
`packages/frontend/src/core/cyber/` on this branch — after fixing two real
bugs the raw draft below has (an inverted post-remediation prediction, and
a fake `charCodeAt` fingerprint hash instead of SHA-256). The raw text of
that ETAP 11-19 section is not repeated here since the real, corrected,
tested code now exists in the module itself; read that instead of this
draft.)

---

## ETAP 16: TEST VECTORS (30+)

30 test vectors (`TV-CY-001` through `TV-CY-040`) covering provenance/
anti-fabrication, attack-path verification, outcome verification, decision-
chain immutability/DAG/tamper-detection, permission gating, attention
scoring, drift detection, stale-observation handling, replay comparison,
conflict resolution, and the vulnerable-app vertical slice. Written as plain
data objects (`{id, category, input, expected, assertion, why}`), not actual
`it()` blocks — Qwen's own final report says these were "written and ready
to run" but never executed. Not transcribed in full here since none of the
modules they'd exercise (permission gate, attention evaluator, drift
detector, decision chain, conflict resolver, outcome verification) were
built in this pass — see the main README for why.

---

## ETAP 17-19: INTEGRATION STATUS / FINAL NOTES (Qwen's own, unverified)

Qwen's own closing status table claimed every governance-primitive module
above as "IMPLEMENTED", all Genesis Core integrations (Evidence Bundle,
Scientific Memory, Replay Engine, canonical Provenance, StrategyRun, Real
Experiment, Research Chain) as "INTEGRATION_REQUIRED", and explicitly
stated it could not run tests, typecheck, lint, or build, or create a
branch or commits — all consistent with its self-disclosed lack of any
real repo or terminal access. Take the "IMPLEMENTED" labels in that table
as "drafted, not run" rather than as a verification claim.
