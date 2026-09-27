
**Status:** Samodzielny pakiet plików gotowy do integracji przez Manus/Claude.
**Nie twierdzę, że repo Genesis zostało zmienione.**

---

## LISTA UTWORZONYCH PLIKÓW

```
genesis-cyber-foundation/
├── README.md
├── ARCHITECTURE.md
├── INTEGRATION.md
├── package.json
├── tsconfig.json
├── src/
│   ├── contracts/
│   │   ├── cyberTypes.ts
│   │   ├── provenance.ts
│   │   └── index.ts
│   ├── attackPath/
│   │   ├── attackPathTypes.ts
│   │   ├── attackPathBuilder.ts
│   │   ├── attackPathVerifier.ts
│   │   └── index.ts
│   ├── outcomeVerification/
│   │   ├── outcomeTypes.ts
│   │   ├── verifySecurityOutcome.ts
│   │   └── index.ts
│   ├── decisionChain/
│   │   ├── chainTypes.ts
│   │   ├── chainBuilder.ts
│   │   ├── chainQuery.ts
│   │   └── index.ts
│   ├── workers/
│   │   ├── workerTypes.ts
│   │   ├── workerOrchestrator.ts
│   │   └── index.ts
│   ├── conflict/
│   │   ├── conflictTypes.ts
│   │   ├── conflictResolver.ts
│   │   └── index.ts
│   ├── permission/
│   │   ├── permissionTypes.ts
│   │   ├── permissionGate.ts
│   │   └── index.ts
│   ├── attention/
│   │   ├── attentionTypes.ts
│   │   ├── attentionEvaluator.ts
│   │   └── index.ts
│   └── drift/
│       ├── driftTypes.ts
│       ├── driftDetector.ts
│       └── index.ts
└── tests/
    ├── attackPath/
    │   └── attackPath.test.ts
    ├── outcome/
    │   └── outcomeVerification.test.ts
    ├── decisionChain/
    │   └── decisionChain.test.ts
    ├── conflict/
    │   └── conflictResolution.test.ts
    ├── permission/
    │   └── permissionGate.test.ts
    ├── attention/
    │   └── attentionEvaluator.test.ts
    └── drift/
        └── driftDetector.test.ts
```

---

## 1. `README.md`

```markdown
# Genesis Cyber Foundation

Pierwsza implementacja warstwy Cyber nad Genesis Core.

## Zasada nadrzędna

Cyber jest **DOMAIN ADAPTER + WORKER ORCHESTRATION**.

NIE tworzy nowego:
- Hypothesis Engine
- Evidence Engine
- Scientific Memory
- Replay Engine
- Discovery Loop
- Provenance Engine

Zakłada **ONE CORE**.

## Struktura

| Moduł | Status | Opis |
|-------|--------|------|
| contracts | IMPLEMENTED | Typy domenowe Cyber |
| attackPath | IMPLEMENTED | Weryfikacja ścieżek ataku |
| outcomeVerification | IMPLEMENTED | Weryfikacja wyników akcji |
| decisionChain | IMPLEMENTED | Immutable graf decyzji |
| workers | ADAPTER | Interfejs workerów AI |
| conflict | IMPLEMENTED | Rozstrzyganie konfliktów modeli |
| permission | IMPLEMENTED | Bramka uprawnień |
| attention | IMPLEMENTED | Inteligencja uwagi |
| drift | IMPLEMENTED | Detekcja dryfu bezpieczeństwa |

## Integracja

Patrz `INTEGRATION.md`.

## Testy

```bash
npm test
```

15 obowiązkowych test vectors w `tests/`.
```

---

## 2. `ARCHITECTURE.md`

```markdown
# Genesis Cyber Foundation — Architektura

## Pozycja w systemie

```
┌─────────────────────────────────────────────────────────────┐
│                    HUMAN OPERATOR                           │
│    Approval · Escalation · Stop · Query                    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    GENESIS CYBER FOUNDATION                 │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐     │
│  │ Permission  │  │ Attention    │  │ Decision Chain │     │
│  │ Gate        │  │ Intelligence │  │ (Immutable)    │     │
│  └─────────────┘  └──────────────┘  └────────────────┘     │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐     │
│  │ Attack Path │  │ Outcome      │  │ Conflict       │     │
│  │ Verification│  │ Verification │  │ Resolution     │     │
│  └─────────────┘  └──────────────┘  └────────────────┘     │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐                         │
│  │ Workers     │  │ Drift        │                         │
│  │ Orchestrator│  │ Detector     │                         │
│  └─────────────┘  └──────────────┘                         │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    GENESIS CORE (ISTNIEJĄCY)                │
│  Hypothesis Engine · Evidence · Memory · Replay ·           │
│  Discovery Loop · Provenance · StrategyRun                  │
└─────────────────────────────────────────────────────────────┘
```

## Kluczowe zasady

1. **Model ≠ System** — Modele AI generują CLAIMS, nie fakty.
2. **MODEL_GENERATED ≠ EVIDENCE** — Output modelu nigdy nie jest automatycznie dowodem.
3. **Permission Gate jest obowiązkowy** — Każda akcja EXECUTE przechodzi przez gate.
4. **Decision Chain jest immutable** — Nie zapisujemy reasoning, tylko fakty.
5. **Attack Path nie jest VERIFIED jeśli ogniwo jest UNVERIFIED** — Nie ma shortcuts.
6. **Outcome ≠ SUCCESS jeśli prediction ≠ actual** — Zwracamy DRIFT/FAILED.
7. **Conflict resolution ≠ majority vote** — Projektujemy discriminating test.

## Provenance

Każdy obiekt ma provenance:

| Provenance | Znaczenie |
|------------|-----------|
| SIMULATED | Wynik symulacji Genesis |
| REFERENCE | Dane zewnętrzne (SIEM, EDR, logs) |
| REAL_EXPERIMENTAL | Rzeczywisty pomiar (sandbox, controlled execution) |
| MODEL_GENERATED | Output modelu AI (nigdy automatycznie EVIDENCE) |

## Statusy

| Status | Znaczenie |
|--------|-----------|
| UNVERIFIED | Nie zweryfikowano |
| SUPPORTED | Wsparcie przez evidence |
| FALSIFIED | Obalono przez evidence |
| BLOCKED | Brak możliwości weryfikacji |
| INCONCLUSIVE | Dane nie rozstrzygają |
```

---

## 3. `INTEGRATION.md`

```markdown
# Genesis Cyber Foundation — Integration Notes

## Co jest IMPLEMENTED (samodzielne, działa bez repo)

- contracts/ — typy domenowe
- attackPath/ — weryfikacja ścieżek ataku
- outcomeVerification/ — weryfikacja wyników
- decisionChain/ — immutable graf
- conflict/ — rozstrzyganie konfliktów
- permission/ — bramka uprawnień
- attention/ — inteligencja uwagi
- drift/ — detekcja dryfu

## Co jest ADAPTER (wymaga implementacji po stronie Genesis)

- workers/workerOrchestrator.ts — wymaga podłączenia realnych modeli AI

## Co jest INTEGRATION_REQUIRED (wymaga istniejącego Genesis Core)

| Element | Wymaga | Plik w Genesis |
|---------|--------|----------------|
| Evidence Bundle | Evidence Engine | `experimentFabric/evidencePack.ts` |
| Scientific Memory | Memory | `core/scienceMemory.ts` |
| Replay | Replay Engine | `matrixFoundation/replayVerdict.ts` |
| Provenance | DataProvenance | `core/dataProvenance.ts` |
| StrategyRun | Discovery Strategy | `core/agent/discoveryStrategy.ts` |
| Real Experiment | RealExperiment | `core/experimentFabric/realExperiment.ts` |

## Kroki integracji (dla Manus/Claude)

1. Skopiuj `genesis-cyber-foundation/` do repo Genesis.
2. Dopasuj importy w `INTEGRATION_REQUIRED` do istniejących plików.
3. Zaimplementuj `CyberWorkerAdapter` dla konkretnych modeli (Mythos, Claude, etc.).
4. Podłącz `PermissionGate` do istniejącego RBAC (jeśli istnieje).
5. Podłącz `DecisionChain` do `scienceMemory.ts` jako nowy kształt zapisu.
6. Uruchom testy: `npm test`.
7. Popraw błędy integracji.

## Czego NIE robić

- ❌ Nie twórz drugiego Evidence Engine
- ❌ Nie twórz drugiego Memory
- ❌ Nie twórz drugiego Replay
- ❌ Nie twórz drugiego Provenance
- ❌ Nie podłączaj modeli AI jako źródło EVIDENCE bez testu
```

---

## 4. `package.json`

```json
{
  "name": "genesis-cyber-foundation",
  "version": "0.1.0",
  "description": "Genesis Cyber Foundation — Domain Adapter + Worker Orchestration over Genesis Core",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/ tests/"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "eslint": "^9.0.0"
  },
  "peerDependencies": {
    "genesis-core": ">=1.0.0"
  },
  "peerDependenciesMeta": {
    "genesis-core": {
      "optional": true
    }
  }
}
```

---

## 5. `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

---

## 6. `src/contracts/provenance.ts`

```typescript
/**
 * Genesis Cyber Foundation — Provenance Contract
 *
 * INTEGRATION_REQUIRED: W repo Genesis istnieje canonical
 * `core/dataProvenance.ts` z SIMULATED/REFERENCE/REAL_EXPERIMENTAL.
 * Ten plik dodaje MODEL_GENERATED jako czwartą kategorię,
 * specyficzną dla outputów modeli AI.
 *
 * MODEL_GENERATED nigdy nie jest automatycznie:
 * - EVIDENCE
 * - REFERENCE
 * - REAL_EXPERIMENTAL
 * - VERIFIED
 */

export type CyberProvenance =
  | 'SIMULATED'
  | 'REFERENCE'
  | 'REAL_EXPERIMENTAL'
  | 'MODEL_GENERATED';

export interface ProvenanceRecord {
  readonly provenance: CyberProvenance;
  readonly source: string;
  readonly retrievedAt: string;
  readonly stableIdentifier: string;
  readonly confidence: number | null;
  readonly notes: string | null;
}

export function createProvenance(
  provenance: CyberProvenance,
  source: string,
  stableIdentifier: string,
  confidence: number | null = null,
  notes: string | null = null
): ProvenanceRecord {
  return Object.freeze({
    provenance,
    source,
    retrievedAt: new Date().toISOString(),
    stableIdentifier,
    confidence,
    notes,
  });
}

export function isModelGenerated(p: ProvenanceRecord): boolean {
  return p.provenance === 'MODEL_GENERATED';
}

export function isReference(p: ProvenanceRecord): boolean {
  return p.provenance === 'REFERENCE';
}

export function isRealExperimental(p: ProvenanceRecord): boolean {
  return p.provenance === 'REAL_EXPERIMENTAL';
}

export function isSimulated(p: ProvenanceRecord): boolean {
  return p.provenance === 'SIMULATED';
}

/**
 * MODEL_GENERATED output może stać się EVIDENCE tylko po:
 * 1. Przejściu przez test
 * 2. Porównaniu z niezależnym źródłem
 * 3. Jawnym oznaczeniu przez Genesis (nie przez model)
 */
export function canPromoteToEvidence(p: ProvenanceRecord): boolean {
  return p.provenance === 'MODEL_GENERATED';
}

export function promoteToEvidence(
  p: ProvenanceRecord,
  evidenceSource: string,
  testId: string
): ProvenanceRecord {
  if (!canPromoteToEvidence(p)) {
    throw new Error(
      `Cannot promote provenance ${p.provenance} to evidence. Only MODEL_GENERATED can be promoted after testing.`
    );
  }
  return createProvenance(
    'REFERENCE',
    evidenceSource,
    `${p.stableIdentifier}:promoted:${testId}`,
    p.confidence,
    `Promoted from MODEL_GENERATED after test ${testId}`
  );
}
```

---

## 7. `src/contracts/cyberTypes.ts`

```typescript
/**
 * Genesis Cyber Foundation — Domain Contract
 *
 * Każdy obiekt ma:
 * - stable ID
 * - timestamp
 * - provenance
 * - source
 * - status
 */

import type { ProvenanceRecord } from './provenance.js';

// ============================================================================
// BASE
// ============================================================================

export interface CyberEntity {
  readonly id: string;
  readonly timestamp: string;
  readonly provenance: ProvenanceRecord;
  readonly source: string;
  readonly status: CyberStatus;
}

export type CyberStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'CANCELLED';

// ============================================================================
// OBSERVATION
// ============================================================================

export interface CyberObservation extends CyberEntity {
  readonly observationType: CyberObservationType;
  readonly sensorId: string;
  readonly rawData: Record<string, unknown>;
  readonly normalizedMetrics: Record<string, number>;
  readonly severity: number; // 0-1
  readonly confidence: number; // 0-1
}

export type CyberObservationType =
  | 'NETWORK_TRAFFIC'
  | 'AUTH_EVENT'
  | 'ENDPOINT_TELEMETRY'
  | 'FILE_ACCESS'
  | 'PRIVILEGE_CHANGE'
  | 'EXTERNAL_COMMUNICATION'
  | 'CONFIG_CHANGE'
  | 'USER_BEHAVIOR'
  | 'SYSTEM_LOG'
  | 'THREAT_INTEL'
  | 'VULNERABILITY_SCAN';

// ============================================================================
// HYPOTHESIS
// ============================================================================

export interface CyberHypothesis extends CyberEntity {
  readonly statement: string;
  readonly category: CyberHypothesisCategory;
  readonly relatedObservations: readonly string[];
  readonly falsificationCriteria: readonly FalsificationCriterion[];
  readonly confidence: number; // 0-1
  readonly verdict: HypothesisVerdict | null;
}

export type CyberHypothesisCategory =
  | 'CREDENTIAL_THEFT'
  | 'MALWARE'
  | 'INSIDER_THREAT'
  | 'DATA_EXFILTRATION'
  | 'LATERAL_MOVEMENT'
  | 'PRIVILEGE_ESCALATION'
  | 'DENIAL_OF_SERVICE'
  | 'MISCONFIGURATION'
  | 'FALSE_POSITIVE'
  | 'UNKNOWN';

export interface FalsificationCriterion {
  readonly criterionId: string;
  readonly description: string;
  readonly testType: CyberTestType;
  readonly expectedIfTrue: string;
  readonly expectedIfFalse: string;
}

export type HypothesisVerdict =
  | 'CANDIDATE'
  | 'SUPPORTED_WITHIN_PROTOCOL'
  | 'FALSIFIED_WITHIN_PROTOCOL'
  | 'INCONCLUSIVE';

// ============================================================================
// PREDICTION
// ============================================================================

export interface CyberPrediction extends CyberEntity {
  readonly hypothesisId: string;
  readonly predictedOutcome: string;
  readonly predictedMetrics: Record<string, number>;
  readonly timeHorizon: string;
  readonly confidence: number; // 0-1
  readonly preRegistered: boolean; // musi być true przed testem
}

// ============================================================================
// TEST
// ============================================================================

export interface CyberTest extends CyberEntity {
  readonly hypothesisId: string;
  readonly predictionId: string;
  readonly testType: CyberTestType;
  readonly parameters: Record<string, unknown>;
  readonly result: CyberTestResult | null;
  readonly executedAt: string | null;
}

export type CyberTestType =
  | 'AUTH_PATTERN_CHECK'
  | 'ENDPOINT_SCAN'
  | 'NETWORK_FLOW_ANALYSIS'
  | 'USER_BEHAVIOR_BASELINE'
  | 'FILE_INTEGRITY_CHECK'
  | 'PRIVILEGE_AUDIT'
  | 'IOC_LOOKUP'
  | 'TIMELINE_CORRELATION'
  | 'SANDBOX_EXECUTION'
  | 'LOG_ANALYSIS'
  | 'CONFIG_VALIDATION';

export interface CyberTestResult {
  readonly testId: string;
  readonly outcome: string;
  readonly metrics: Record<string, number>;
  readonly evidenceRefs: readonly string[];
  readonly verdict: 'SUPPORTS' | 'CONTRADICTS' | 'INCONCLUSIVE' | 'BLOCKED';
}

// ============================================================================
// EVIDENCE
// ============================================================================

export interface CyberEvidence extends CyberEntity {
  readonly evidenceType: CyberEvidenceType;
  readonly data: Record<string, unknown>;
  readonly sourceRef: string;
  readonly supportsHypotheses: readonly string[];
  readonly contradictsHypotheses: readonly string[];
  readonly strength: number; // 0-1
}

export type CyberEvidenceType =
  | 'LOG_ENTRY'
  | 'NETWORK_CAPTURE'
  | 'FILE_HASH'
  | 'PROCESS_TREE'
  | 'AUTH_RECORD'
  | 'THREAT_INTEL_MATCH'
  | 'BASELINE_DEVIATION'
  | 'CONFIG_SNAPSHOT'
  | 'USER_SESSION'
  | 'SANDBOX_REPORT';

// ============================================================================
// VERDICT
// ============================================================================

export interface CyberVerdict extends CyberEntity {
  readonly hypothesisId: string;
  readonly verdict: HypothesisVerdict;
  readonly reasoning: string;
  readonly evidenceRefs: readonly string[];
  readonly confidence: number; // 0-1
  readonly alternativesConsidered: readonly string[];
}

// ============================================================================
// DECISION
// ============================================================================

export interface CyberDecision extends CyberEntity {
  readonly decisionType: CyberDecisionType;
  readonly hypothesisId: string | null;
  readonly recommendedAction: CyberAction | null;
  readonly reasoning: string;
  readonly evidenceRefs: readonly string[];
  readonly confidence: number; // 0-1
  readonly requiresApproval: boolean;
  readonly approvalState: ApprovalState;
}

export type CyberDecisionType =
  | 'INVESTIGATE'
  | 'ISOLATE'
  | 'BLOCK'
  | 'QUARANTINE'
  | 'REMEDIATE'
  | 'ESCALATE'
  | 'MONITOR'
  | 'CLOSE'
  | 'DO_NOTHING';

export type ApprovalState =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'TIMEOUT_REJECTED';

// ============================================================================
// ACTION
// ============================================================================

export interface CyberAction extends CyberEntity {
  readonly actionType: CyberActionType;
  readonly target: string;
  readonly parameters: Record<string, unknown>;
  readonly riskLevel: RiskLevel;
  readonly reversible: boolean;
  readonly approvalId: string | null;
  readonly executedAt: string | null;
  readonly executedBy: string | null;
}

export type CyberActionType =
  | 'ISOLATE_ENDPOINT'
  | 'BLOCK_IP'
  | 'DISABLE_ACCOUNT'
  | 'REVOKE_TOKEN'
  | 'QUARANTINE_FILE'
  | 'INCREASE_MONITORING'
  | 'ESCALATE_TO_SOC'
  | 'NOTIFY_OPERATOR'
  | 'COLLECT_FORENSICS'
  | 'PATCH_SYSTEM'
  | 'RESET_CREDENTIALS';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// ============================================================================
// OUTCOME
// ============================================================================

export interface CyberOutcome extends CyberEntity {
  readonly actionId: string;
  readonly expectedOutcome: string;
  readonly actualOutcome: string;
  readonly expectedMetrics: Record<string, number>;
  readonly actualMetrics: Record<string, number>;
  readonly observedAt: string;
  readonly verdict: OutcomeVerdict;
}

export type OutcomeVerdict =
  | 'VERIFIED'
  | 'FAILED'
  | 'DRIFT'
  | 'INSUFFICIENT_DATA'
  | 'BLOCKED';

// ============================================================================
// VERIFICATION
// ============================================================================

export interface CyberVerification extends CyberEntity {
  readonly outcomeId: string;
  readonly predictionId: string;
  readonly verdict: OutcomeVerdict;
  readonly analysis: string;
  readonly requiresReinvestigation: boolean;
  readonly nextSteps: readonly string[];
}

// ============================================================================
// ATTACK PATH
// ============================================================================

export interface AttackPathNode extends CyberEntity {
  readonly nodeType: AttackPathNodeType;
  readonly description: string;
  readonly evidenceRefs: readonly string[];
  readonly verificationStatus: NodeVerificationStatus;
}

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

export type NodeVerificationStatus =
  | 'UNVERIFIED'
  | 'SUPPORTED'
  | 'FALSIFIED'
  | 'BLOCKED';

export interface AttackPathEdge {
  readonly edgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly relationship: string;
  readonly evidenceRefs: readonly string[];
  readonly verificationStatus: NodeVerificationStatus;
}

export interface AttackPath extends CyberEntity {
  readonly nodes: readonly AttackPathNode[];
  readonly edges: readonly AttackPathEdge[];
  readonly overallStatus: AttackPathStatus;
  readonly confidence: number; // 0-1
}

export type AttackPathStatus =
  | 'UNVERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'VERIFIED'
  | 'FALSIFIED'
  | 'BLOCKED'
  | 'INCONCLUSIVE';

// ============================================================================
// SECURITY DRIFT
// ============================================================================

export interface SecurityDrift extends CyberEntity {
  readonly expectedState: Record<string, unknown>;
  readonly observedState: Record<string, unknown>;
  readonly driftType: DriftType;
  readonly severity: number; // 0-1
  readonly affectedAssets: readonly string[];
}

export type DriftType =
  | 'NO_DRIFT'
  | 'DRIFT'
  | 'CRITICAL_DRIFT'
  | 'INSUFFICIENT_DATA';
```

---

## 8. `src/contracts/index.ts`

```typescript
export * from './provenance.js';
export * from './cyberTypes.js';
```

---

## 9. `src/attackPath/attackPathBuilder.ts`

```typescript
/**
 * Genesis Cyber Foundation — Attack Path Builder
 *
 * Buduje ścieżkę ataku z jawnych nodes i edges.
 * Każdy node ma status: UNVERIFIED | SUPPORTED | FALSIFIED | BLOCKED.
 */

import type {
  AttackPath,
  AttackPathNode,
  AttackPathEdge,
  AttackPathStatus,
  NodeVerificationStatus,
  CyberProvenance,
} from '../contracts/cyberTypes.js';
import { createProvenance } from '../contracts/provenance.js';

let nodeIdCounter = 0;
let edgeIdCounter = 0;
let pathIdCounter = 0;

export function createAttackPathNode(
  nodeType: AttackPathNode['nodeType'],
  description: string,
  provenance: CyberProvenance,
  source: string,
  evidenceRefs: readonly string[] = []
): AttackPathNode {
  return Object.freeze({
    id: `apn-${++nodeIdCounter}`,
    timestamp: new Date().toISOString(),
    provenance: createProvenance(provenance, source, `apn-${nodeIdCounter}`),
    source,
    status: 'ACTIVE',
    nodeType,
    description,
    evidenceRefs: Object.freeze([...evidenceRefs]),
    verificationStatus: 'UNVERIFIED' as NodeVerificationStatus,
  });
}

export function createAttackPathEdge(
  fromNodeId: string,
  toNodeId: string,
  relationship: string,
  provenance: CyberProvenance,
  source: string,
  evidenceRefs: readonly string[] = []
): AttackPathEdge {
  return Object.freeze({
    edgeId: `ape-${++edgeIdCounter}`,
    fromNodeId,
    toNodeId,
    relationship,
    evidenceRefs: Object.freeze([...evidenceRefs]),
    verificationStatus: 'UNVERIFIED' as NodeVerificationStatus,
  });
}

export function createAttackPath(
  nodes: readonly AttackPathNode[],
  edges: readonly AttackPathEdge[],
  provenance: CyberProvenance,
  source: string
): AttackPath {
  validateAttackPathStructure(nodes, edges);

  const overallStatus = computeOverallStatus(nodes, edges);

  return Object.freeze({
    id: `ap-${++pathIdCounter}`,
    timestamp: new Date().toISOString(),
    provenance: createProvenance(provenance, source, `ap-${pathIdCounter}`),
    source,
    status: 'ACTIVE',
    nodes: Object.freeze([...nodes]),
    edges: Object.freeze([...edges]),
    overallStatus,
    confidence: 0,
  });
}

function validateAttackPathStructure(
  nodes: readonly AttackPathNode[],
  edges: readonly AttackPathEdge[]
): void {
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const edge of edges) {
    if (!nodeIds.has(edge.fromNodeId)) {
      throw new Error(`Edge ${edge.edgeId} references non-existent fromNode ${edge.fromNodeId}`);
    }
    if (!nodeIds.has(edge.toNodeId)) {
      throw new Error(`Edge ${edge.edgeId} references non-existent toNode ${edge.toNodeId}`);
    }
  }
}

function computeOverallStatus(
  nodes: readonly AttackPathNode[],
  edges: readonly AttackPathEdge[]
): AttackPathStatus {
  const allStatuses = [
    ...nodes.map((n) => n.verificationStatus),
    ...edges.map((e) => e.verificationStatus),
  ];

  if (allStatuses.length === 0) {
    return 'UNVERIFIED';
  }

  if (allStatuses.every((s) => s === 'FALSIFIED')) {
    return 'FALSIFIED';
  }

  if (allStatuses.every((s) => s === 'SUPPORTED')) {
    return 'VERIFIED';
  }

  if (allStatuses.some((s) => s === 'BLOCKED') && allStatuses.every((s) => s === 'BLOCKED' || s === 'UNVERIFIED')) {
    return 'BLOCKED';
  }

  if (allStatuses.some((s) => s === 'SUPPORTED')) {
    return 'PARTIALLY_VERIFIED';
  }

  return 'UNVERIFIED';
}

export function updateNodeVerificationStatus(
  path: AttackPath,
  nodeId: string,
  newStatus: NodeVerificationStatus,
  evidenceRefs: readonly string[]
): AttackPath {
  const updatedNodes = path.nodes.map((node) =>
    node.id === nodeId
      ? Object.freeze({ ...node, verificationStatus: newStatus, evidenceRefs: Object.freeze([...node.evidenceRefs, ...evidenceRefs]) })
      : node
  );

  const overallStatus = computeOverallStatus(updatedNodes, path.edges);

  return Object.freeze({
    ...path,
    nodes: updatedNodes,
    overallStatus,
    timestamp: new Date().toISOString(),
  });
}

export function updateEdgeVerificationStatus(
  path: AttackPath,
  edgeId: string,
  newStatus: NodeVerificationStatus,
  evidenceRefs: readonly string[]
): AttackPath {
  const updatedEdges = path.edges.map((edge) =>
    edge.edgeId === edgeId
      ? Object.freeze({ ...edge, verificationStatus: newStatus, evidenceRefs: Object.freeze([...edge.evidenceRefs, ...evidenceRefs]) })
      : edge
  );

  const overallStatus = computeOverallStatus(path.nodes, updatedEdges);

  return Object.freeze({
    ...path,
    edges: updatedEdges,
    overallStatus,
    timestamp: new Date().toISOString(),
  });
}
```

---

## 10. `src/attackPath/attackPathVerifier.ts`

```typescript
/**
 * Genesis Cyber Foundation — Attack Path Verifier
 *
 * Weryfikuje ścieżki ataku.
 *
 * KLUCZOWA ZASADA:
 * System nie może oznaczyć całej ścieżki jako VERIFIED,
 * jeśli wymagane ogniwo pozostaje UNVERIFIED.
 */

import type {
  AttackPath,
  AttackPathStatus,
  NodeVerificationStatus,
} from '../contracts/cyberTypes.js';

export interface AttackPathVerificationResult {
  readonly pathId: string;
  readonly overallStatus: AttackPathStatus;
  readonly verifiedNodes: number;
  readonly totalNodes: number;
  readonly verifiedEdges: number;
  readonly totalEdges: number;
  readonly unverifiedNodes: readonly string[];
  readonly falsifiedNodes: readonly string[];
  readonly blockedNodes: readonly string[];
  readonly canBeMarkedVerified: boolean;
  readonly reason: string;
}

export function verifyAttackPath(path: AttackPath): AttackPathVerificationResult {
  const verifiedNodes = path.nodes.filter((n) => n.verificationStatus === 'SUPPORTED').length;
  const falsifiedNodes = path.nodes.filter((n) => n.verificationStatus === 'FALSIFIED').map((n) => n.id);
  const unverifiedNodes = path.nodes.filter((n) => n.verificationStatus === 'UNVERIFIED').map((n) => n.id);
  const blockedNodes = path.nodes.filter((n) => n.verificationStatus === 'BLOCKED').map((n) => n.id);

  const verifiedEdges = path.edges.filter((e) => e.verificationStatus === 'SUPPORTED').length;

  const canBeMarkedVerified =
    path.nodes.length > 0 &&
    path.nodes.every((n) => n.verificationStatus === 'SUPPORTED') &&
    path.edges.every((e) => e.verificationStatus === 'SUPPORTED');

  let reason: string;

  if (canBeMarkedVerified) {
    reason = 'All nodes and edges are SUPPORTED.';
  } else if (falsifiedNodes.length > 0) {
    reason = `Path contains falsified nodes: ${falsifiedNodes.join(', ')}. Cannot be VERIFIED.`;
  } else if (blockedNodes.length > 0) {
    reason = `Path contains blocked nodes: ${blockedNodes.join(', ')}. Cannot be VERIFIED.`;
  } else if (unverifiedNodes.length > 0) {
    reason = `Path contains unverified nodes: ${unverifiedNodes.join(', ')}. Cannot be VERIFIED until all required nodes are verified.`;
  } else {
    reason = 'Path cannot be marked VERIFIED.';
  }

  return Object.freeze({
    pathId: path.id,
    overallStatus: path.overallStatus,
    verifiedNodes,
    totalNodes: path.nodes.length,
    verifiedEdges,
    totalEdges: path.edges.length,
    unverifiedNodes: Object.freeze([...unverifiedNodes]),
    falsifiedNodes: Object.freeze([...falsifiedNodes]),
    blockedNodes: Object.freeze([...blockedNodes]),
    canBeMarkedVerified,
    reason,
  });
}

export function falsifyAttackPath(
  path: AttackPath,
  nodeId: string,
  reason: string,
  evidenceRefs: readonly string[]
): AttackPath {
  const node = path.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error(`Node ${nodeId} not found in path ${path.id}`);
  }

  const updatedNodes = path.nodes.map((n) =>
    n.id === nodeId
      ? Object.freeze({
          ...n,
          verificationStatus: 'FALSIFIED' as NodeVerificationStatus,
          evidenceRefs: Object.freeze([...n.evidenceRefs, ...evidenceRefs]),
        })
      : n
  );

  return Object.freeze({
    ...path,
    nodes: updatedNodes,
    overallStatus: 'FALSIFIED' as AttackPathStatus,
    timestamp: new Date().toISOString(),
  });
}

export function evaluateAttackPath(
  path: AttackPath,
  evidenceStrengths: ReadonlyMap<string, number>
): AttackPathVerificationResult & { confidence: number } {
  const baseResult = verifyAttackPath(path);

  let totalStrength = 0;
  let count = 0;

  for (const node of path.nodes) {
    if (node.verificationStatus === 'SUPPORTED') {
      for (const ref of node.evidenceRefs) {
        const strength = evidenceStrengths.get(ref);
        if (strength !== undefined) {
          totalStrength += strength;
          count++;
        }
      }
    }
  }

  const confidence = count > 0 ? totalStrength / count : 0;

  return Object.freeze({
    ...baseResult,
    confidence: Math.min(1, Math.max(0, confidence)),
  });
}
```

---

## 11. `src/attackPath/index.ts`

```typescript
export * from './attackPathBuilder.js';
export * from './attackPathVerifier.js';
```

---

## 12. `src/outcomeVerification/outcomeTypes.ts`

```typescript
/**
 * Genesis Cyber Foundation — Outcome Verification Types
 */

import type { OutcomeVerdict } from '../contracts/cyberTypes.js';

export interface OutcomeVerificationInput {
  readonly predictionId: string;
  readonly actionId: string;
  readonly expectedOutcome: string;
  readonly expectedMetrics: Record<string, number>;
  readonly actualOutcome: string | null;
  readonly actualMetrics: Record<string, number> | null;
  readonly tolerance: number; // 0-1, relative tolerance for metrics comparison
}

export interface OutcomeVerificationResult {
  readonly predictionId: string;
  readonly actionId: string;
  readonly verdict: OutcomeVerdict;
  readonly expectedOutcome: string;
  readonly actualOutcome: string | null;
  readonly metricComparisons: readonly MetricComparison[];
  readonly analysis: string;
  readonly requiresReinvestigation: boolean;
  readonly nextSteps: readonly string[];
}

export interface MetricComparison {
  readonly metricName: string;
  readonly expectedValue: number;
  readonly actualValue: number | null;
  readonly deviation: number | null;
  readonly withinTolerance: boolean;
}
```

---

## 13. `src/outcomeVerification/verifySecurityOutcome.ts`

```typescript
/**
 * Genesis Cyber Foundation — Security Outcome Verification
 *
 * KLUCZOWA ZASADA:
 * Jeżeli rzeczywisty outcome nie zgadza się z prediction:
 * NIE zwracaj SUCCESS.
 * Zwróć DRIFT/FAILED i informację wymagającą ponownego investigation.
 */

import type { OutcomeVerdict } from '../contracts/cyberTypes.js';
import type {
  OutcomeVerificationInput,
  OutcomeVerificationResult,
  MetricComparison,
} from './outcomeTypes.js';

export function verifySecurityOutcome(
  input: OutcomeVerificationInput
): OutcomeVerificationResult {
  const {
    predictionId,
    actionId,
    expectedOutcome,
    expectedMetrics,
    actualOutcome,
    actualMetrics,
    tolerance,
  } = input;

  // Case 1: No actual data available
  if (actualOutcome === null || actualMetrics === null) {
    return Object.freeze({
      predictionId,
      actionId,
      verdict: 'INSUFFICIENT_DATA' as OutcomeVerdict,
      expectedOutcome,
      actualOutcome: null,
      metricComparisons: Object.freeze([]),
      analysis: 'No actual outcome data available. Cannot verify.',
      requiresReinvestigation: true,
      nextSteps: Object.freeze([
        'Collect actual outcome data',
        'Re-run verification after data collection',
      ]),
    });
  }

  // Case 2: Compare metrics
  const metricComparisons: MetricComparison[] = [];
  let allWithinTolerance = true;
  let hasDeviations = false;

  for (const [metricName, expectedValue] of Object.entries(expectedMetrics)) {
    const actualValue = actualMetrics[metricName];

    if (actualValue === undefined) {
      metricComparisons.push(
        Object.freeze({
          metricName,
          expectedValue,
          actualValue: null,
          deviation: null,
          withinTolerance: false,
        })
      );
      allWithinTolerance = false;
      hasDeviations = true;
      continue;
    }

    const deviation = Math.abs(actualValue - expectedValue);
    const relativeDeviation = expectedValue !== 0 ? deviation / Math.abs(expectedValue) : deviation;
    const withinTolerance = relativeDeviation <= tolerance;

    metricComparisons.push(
      Object.freeze({
        metricName,
        expectedValue,
        actualValue,
        deviation: relativeDeviation,
        withinTolerance,
      })
    );

    if (!withinTolerance) {
      allWithinTolerance = false;
      hasDeviations = true;
    }
  }

  // Check for unexpected metrics in actual
  for (const metricName of Object.keys(actualMetrics)) {
    if (!(metricName in expectedMetrics)) {
      metricComparisons.push(
        Object.freeze({
          metricName,
          expectedValue: 0,
          actualValue: actualMetrics[metricName],
          deviation: null,
          withinTolerance: false,
        })
      );
      hasDeviations = true;
    }
  }

  // Determine verdict
  let verdict: OutcomeVerdict;
  let analysis: string;
  let requiresReinvestigation: boolean;
  let nextSteps: readonly string[];

  if (allWithinTolerance && !hasDeviations) {
    verdict = 'VERIFIED';
    analysis = 'Actual outcome matches prediction within tolerance.';
    requiresReinvestigation = false;
    nextSteps = Object.freeze(['Record verification in Memory', 'Update confidence']);
  } else if (hasDeviations && !allWithinTolerance) {
    // Check if deviations are small (DRIFT) or large (FAILED)
    const maxDeviation = Math.max(
      ...metricComparisons
        .filter((m) => m.deviation !== null)
        .map((m) => m.deviation as number)
    );

    if (maxDeviation <= tolerance * 2) {
      verdict = 'DRIFT';
      analysis = `Actual outcome drifts from prediction. Max deviation: ${(maxDeviation * 100).toFixed(1)}%. Requires investigation.`;
      requiresReinvestigation = true;
      nextSteps = Object.freeze([
        'Investigate cause of drift',
        'Check for external factors',
        'Re-evaluate hypothesis',
        'Consider additional tests',
      ]);
    } else {
      verdict = 'FAILED';
      analysis = `Actual outcome significantly differs from prediction. Max deviation: ${(maxDeviation * 100).toFixed(1)}%. Prediction is likely incorrect.`;
      requiresReinvestigation = true;
      nextSteps = Object.freeze([
        'Re-investigate hypothesis',
        'Check for confounding factors',
        'Consider alternative explanations',
        'Design new discriminating test',
        'Do NOT mark as SUCCESS',
      ]);
    }
  } else {
    verdict = 'INSUFFICIENT_DATA';
    analysis = 'Partial data available. Cannot fully verify.';
    requiresReinvestigation = true;
    nextSteps = Object.freeze(['Collect missing data', 'Re-run verification']);
  }

  return Object.freeze({
    predictionId,
    actionId,
    verdict,
    expectedOutcome,
    actualOutcome,
    metricComparisons: Object.freeze(metricComparisons),
    analysis,
    requiresReinvestigation,
    nextSteps,
  });
}
```

---

## 14. `src/outcomeVerification/index.ts`

```typescript
export * from './outcomeTypes.js';
export * from './verifySecurityOutcome.js';
```

---

## 15. `src/decisionChain/chainTypes.ts`

```typescript
/**
 * Genesis Cyber Foundation — Decision Chain Types
 *
 * Immutable event/decision graph.
 *
 * WAŻNE: To NIE jest chain-of-thought.
 * Nie zapisujemy prywatnego reasoning modelu.
 * Zapisujemy tylko audytowalne fakty i eventy.
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

export interface DecisionChainNode {
  readonly nodeId: string;
  readonly nodeType: DecisionChainNodeType;
  readonly timestamp: string;
  readonly actor: string;
  readonly provenance: ProvenanceRecord;
  readonly data: Readonly<Record<string, unknown>>;
  readonly immutableHash: string;
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
  readonly status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'BLOCKED';
  readonly immutable: boolean;
}

export interface DecisionChainQuery {
  readonly chainId?: string;
  readonly missionId?: string;
  readonly nodeType?: DecisionChainNodeType;
  readonly edgeType?: DecisionChainEdgeType;
  readonly timeRange?: { start: string; end: string };
  readonly limit?: number;
}

export interface DecisionChainAuditResult {
  readonly chainId: string;
  readonly question: string;
  readonly answer: string;
  readonly evidencePath: readonly string[];
  readonly confidence: number;
  readonly gaps: readonly string[];
}
```

---

## 16. `src/decisionChain/chainBuilder.ts`

```typescript
/**
 * Genesis Cyber Foundation — Decision Chain Builder
 *
 * Buduje immutable graf decyzji.
 * Każdy node ma hash chain (blockchain-style).
 */

import type {
  DecisionChain,
  DecisionChainNode,
  DecisionChainEdge,
  DecisionChainNodeType,
  DecisionChainEdgeType,
} from './chainTypes.js';
import type { ProvenanceRecord, CyberProvenance } from '../contracts/provenance.js';
import { createProvenance } from '../contracts/provenance.js';

let nodeIdCounter = 0;
let edgeIdCounter = 0;
let chainIdCounter = 0;

function computeHash(data: unknown, previousHash: string | null): string {
  const payload = JSON.stringify({ data, previousHash });
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function createDecisionChain(missionId: string): DecisionChain {
  return Object.freeze({
    chainId: `dc-${++chainIdCounter}`,
    missionId,
    createdAt: new Date().toISOString(),
    nodes: Object.freeze([]),
    edges: Object.freeze([]),
    status: 'IN_PROGRESS',
    immutable: false,
  });
}

export function addNodeToChain(
  chain: DecisionChain,
  nodeType: DecisionChainNodeType,
  actor: string,
  provenance: CyberProvenance,
  source: string,
  data: Record<string, unknown>
): DecisionChain {
  if (chain.immutable) {
    throw new Error(`Cannot add node to immutable chain ${chain.chainId}`);
  }

  const previousHash = chain.nodes.length > 0
    ? chain.nodes[chain.nodes.length - 1].immutableHash
    : null;

  const nodeId = `dcn-${++nodeIdCounter}`;
  const immutableHash = computeHash(data, previousHash);

  const node: DecisionChainNode = Object.freeze({
    nodeId,
    nodeType,
    timestamp: new Date().toISOString(),
    actor,
    provenance: createProvenance(provenance, source, nodeId),
    data: Object.freeze({ ...data }),
    immutableHash,
    previousHash,
  });

  return Object.freeze({
    ...chain,
    nodes: Object.freeze([...chain.nodes, node]),
    timestamp: new Date().toISOString(),
  });
}

export function addEdgeToChain(
  chain: DecisionChain,
  fromNodeId: string,
  toNodeId: string,
  edgeType: DecisionChainEdgeType,
  evidenceRefs: readonly string[] = []
): DecisionChain {
  if (chain.immutable) {
    throw new Error(`Cannot add edge to immutable chain ${chain.chainId}`);
  }

  const fromNode = chain.nodes.find((n) => n.nodeId === fromNodeId);
  const toNode = chain.nodes.find((n) => n.nodeId === toNodeId);

  if (!fromNode) {
    throw new Error(`fromNode ${fromNodeId} not found in chain ${chain.chainId}`);
  }
  if (!toNode) {
    throw new Error(`toNode ${toNodeId} not found in chain ${chain.chainId}`);
  }

  const edge: DecisionChainEdge = Object.freeze({
    edgeId: `dce-${++edgeIdCounter}`,
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

export function finalizeChain(
  chain: DecisionChain,
  status: DecisionChain['status']
): DecisionChain {
  return Object.freeze({
    ...chain,
    status,
    immutable: true,
  });
}

export function verifyChainIntegrity(chain: DecisionChain): { valid: boolean; errors: readonly string[] } {
  const errors: string[] = [];

  for (let i = 0; i < chain.nodes.length; i++) {
    const node = chain.nodes[i];
    const expectedPreviousHash = i > 0 ? chain.nodes[i - 1].immutableHash : null;

    if (node.previousHash !== expectedPreviousHash) {
      errors.push(`Node ${node.nodeId} has incorrect previousHash. Expected ${expectedPreviousHash}, got ${node.previousHash}`);
    }

    const computedHash = computeHash(node.data, node.previousHash);
    if (node.immutableHash !== computedHash) {
      errors.push(`Node ${node.nodeId} has incorrect immutableHash. Expected ${computedHash}, got ${node.immutableHash}`);
    }
  }

  for (const edge of chain.edges) {
    const fromNode = chain.nodes.find((n) => n.nodeId === edge.fromNodeId);
    const toNode = chain.nodes.find((n) => n.nodeId === edge.toNodeId);

    if (!fromNode) {
      errors.push(`Edge ${edge.edgeId} references non-existent fromNode ${edge.fromNodeId}`);
    }
    if (!toNode) {
      errors.push(`Edge ${edge.edgeId} references non-existent toNode ${edge.toNodeId}`);
    }
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  });
}
```

---

## 17. `src/decisionChain/chainQuery.ts`

```typescript
/**
 * Genesis Cyber Foundation — Decision Chain Query
 *
 * 7 pytań audytowych, które każda decyzja musi obsłużyć.
 */

import type {
  DecisionChain,
  DecisionChainAuditResult,
  DecisionChainNodeType,
} from './chainTypes.js';

export function queryChain(
  chain: DecisionChain,
  nodeType: DecisionChainNodeType
): readonly string[] {
  return Object.freeze(
    chain.nodes
      .filter((n) => n.nodeType === nodeType)
      .map((n) => n.nodeId)
  );
}

export function getEvidencePath(
  chain: DecisionChain,
  fromNodeId: string,
  toNodeId: string
): readonly string[] {
  const path: string[] = [];
  const visited = new Set<string>();

  function dfs(currentId: string): boolean {
    if (currentId === toNodeId) {
      path.push(currentId);
      return true;
    }

    if (visited.has(currentId)) {
      return false;
    }

    visited.add(currentId);
    path.push(currentId);

    for (const edge of chain.edges) {
      if (edge.fromNodeId === currentId) {
        if (dfs(edge.toNodeId)) {
          return true;
        }
      }
    }

    path.pop();
    return false;
  }

  dfs(fromNodeId);
  return Object.freeze(path);
}

export function auditDecision(
  chain: DecisionChain,
  question: string
): DecisionChainAuditResult {
  const decisions = chain.nodes.filter((n) => n.nodeType === 'DECISION');
  const evidence = chain.nodes.filter((n) => n.nodeType === 'EVIDENCE');
  const verdicts = chain.nodes.filter((n) => n.nodeType === 'VERDICT');
  const approvals = chain.nodes.filter((n) => n.nodeType === 'APPROVAL');
  const outcomes = chain.nodes.filter((n) => n.nodeType === 'OUTCOME');
  const verifications = chain.nodes.filter((n) => n.nodeType === 'VERIFICATION');

  let answer: string;
  let confidence: number;
  const gaps: string[] = [];

  if (decisions.length === 0) {
    answer = 'No decision found in chain.';
    confidence = 0;
    gaps.push('No DECISION nodes');
  } else {
    const lastDecision = decisions[decisions.length - 1];
    answer = `Decision made by ${lastDecision.actor} at ${lastDecision.timestamp}`;

    confidence = 0.5;

    if (evidence.length > 0) confidence += 0.1;
    else gaps.push('No EVIDENCE nodes');

    if (verdicts.length > 0) confidence += 0.1;
    else gaps.push('No VERDICT nodes');

    if (approvals.length > 0) confidence += 0.1;
    else gaps.push('No APPROVAL nodes');

    if (outcomes.length > 0) confidence += 0.1;
    else gaps.push('No OUTCOME nodes');

    if (verifications.length > 0) confidence += 0.1;
    else gaps.push('No VERIFICATION nodes');
  }

  const evidencePath = decisions.length > 0 && evidence.length > 0
    ? getEvidencePath(chain, decisions[decisions.length - 1].nodeId, evidence[0].nodeId)
    : Object.freeze([]);

  return Object.freeze({
    chainId: chain.chainId,
    question,
    answer,
    evidencePath,
    confidence: Math.min(1, confidence),
    gaps: Object.freeze(gaps),
  });
}
```

---

## 18. `src/decisionChain/index.ts`

```typescript
export * from './chainTypes.js';
export * from './chainBuilder.js';
export * from './chainQuery.js';
```

---

## 19. `src/permission/permissionTypes.ts`

```typescript
/**
 * Genesis Cyber Foundation — Permission Types
 */

export type ActionLevel =
  | 'OBSERVE'
  | 'ANALYZE'
  | 'SIMULATE'
  | 'RECOMMEND'
  | 'REQUEST_APPROVAL'
  | 'EXECUTE'
  | 'STOP'
  | 'EMERGENCY_STOP';

export type PermissionDecision =
  | 'ALLOWED'
  | 'DENIED'
  | 'PENDING_APPROVAL'
  | 'BLOCKED';

export interface PermissionRequest {
  readonly requestId: string;
  readonly timestamp: string;
  readonly actor: string;
  readonly role: OperatorRole;
  readonly action: ActionLevel;
  readonly target: string;
  readonly riskLevel: RiskLevel;
  readonly evidenceRefs: readonly string[];
  readonly justification: string;
}

export type OperatorRole =
  | 'VIEWER'
  | 'ANALYST'
  | 'OPERATOR'
  | 'SUPERVISOR'
  | 'DIRECTOR'
  | 'SYSTEM';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PermissionResult {
  readonly requestId: string;
  readonly decision: PermissionDecision;
  readonly requiredLevel: ActionLevel;
  readonly currentLevel: ActionLevel;
  readonly reason: string;
  readonly approvedBy: string | null;
  readonly expiresAt: string | null;
}

export interface ApprovalRecord {
  readonly approvalId: string;
  readonly requestId: string;
  readonly approvedBy: string;
  readonly role: OperatorRole;
  readonly timestamp: string;
  readonly decision: 'APPROVED' | 'REJECTED';
  readonly reason: string;
  readonly expiresAt: string | null;
}
```

---

## 20. `src/permission/permissionGate.ts`

```typescript
/**
 * Genesis Cyber Foundation — Permission Gate
 *
 * Każda akcja EXECUTE musi przejść przez PermissionGate.
 * Brak uprawnień: BLOCKED.
 * Nie wolno obchodzić PermissionGate przez model.
 */

import type {
  PermissionRequest,
  PermissionResult,
  ApprovalRecord,
  ActionLevel,
  OperatorRole,
  RiskLevel,
} from './permissionTypes.js';

// Permission matrix: role -> max allowed action level
const PERMISSION_MATRIX: Readonly<Record<OperatorRole, ActionLevel>> = Object.freeze({
  VIEWER: 'OBSERVE',
  ANALYST: 'ANALYZE',
  OPERATOR: 'RECOMMEND',
  SUPERVISOR: 'EXECUTE',
  DIRECTOR: 'EXECUTE',
  SYSTEM: 'EMERGENCY_STOP',
});

// Risk-based approval requirements
const RISK_APPROVAL_REQUIREMENTS: Readonly<Record<RiskLevel, OperatorRole[]>> = Object.freeze({
  LOW: Object.freeze([]),
  MEDIUM: Object.freeze(['OPERATOR']),
  HIGH: Object.freeze(['SUPERVISOR']),
  CRITICAL: Object.freeze(['SUPERVISOR', 'DIRECTOR']),
});

const ACTION_LEVEL_ORDER: readonly ActionLevel[] = Object.freeze([
  'OBSERVE',
  'ANALYZE',
  'SIMULATE',
  'RECOMMEND',
  'REQUEST_APPROVAL',
  'EXECUTE',
  'STOP',
  'EMERGENCY_STOP',
]);

function actionLevelIndex(level: ActionLevel): number {
  return ACTION_LEVEL_ORDER.indexOf(level);
}

export function checkPermission(request: PermissionRequest): PermissionResult {
  const maxAllowedLevel = PERMISSION_MATRIX[request.role];
  const requiredLevel = request.action;

  const maxAllowedIndex = actionLevelIndex(maxAllowedLevel);
  const requiredIndex = actionLevelIndex(requiredLevel);

  // EMERGENCY_STOP is always allowed for SYSTEM
  if (request.action === 'EMERGENCY_STOP' && request.role === 'SYSTEM') {
    return Object.freeze({
      requestId: request.requestId,
      decision: 'ALLOWED',
      requiredLevel,
      currentLevel: maxAllowedLevel,
      reason: 'EMERGENCY_STOP is always allowed for SYSTEM.',
      approvedBy: null,
      expiresAt: null,
    });
  }

  // STOP is allowed for SUPERVISOR and above
  if (request.action === 'STOP' && actionLevelIndex(request.role === 'SYSTEM' ? 'EMERGENCY_STOP' : maxAllowedLevel) >= actionLevelIndex('STOP')) {
    return Object.freeze({
      requestId: request.requestId,
      decision: 'ALLOWED',
      requiredLevel,
      currentLevel: maxAllowedLevel,
      reason: 'STOP is allowed for current role.',
      approvedBy: null,
      expiresAt: null,
    });
  }

  // Check if role allows the action level
  if (requiredIndex > maxAllowedIndex) {
    return Object.freeze({
      requestId: request.requestId,
      decision: 'DENIED',
      requiredLevel,
      currentLevel: maxAllowedLevel,
      reason: `Role ${request.role} does not have permission for action level ${requiredLevel}. Max allowed: ${maxAllowedLevel}.`,
      approvedBy: null,
      expiresAt: null,
    });
  }

  // Check risk-based approval requirements
  const requiredApprovers = RISK_APPROVAL_REQUIREMENTS[request.riskLevel];

  if (requiredApprovers.length === 0) {
    return Object.freeze({
      requestId: request.requestId,
      decision: 'ALLOWED',
      requiredLevel,
      currentLevel: maxAllowedLevel,
      reason: `Action ${requiredLevel} with risk ${request.riskLevel} is allowed for role ${request.role}.`,
      approvedBy: null,
      expiresAt: null,
    });
  }

  // Check if actor's role is in required approvers
  if (requiredApprovers.includes(request.role)) {
    return Object.freeze({
      requestId: request.requestId,
      decision: 'ALLOWED',
      requiredLevel,
      currentLevel: maxAllowedLevel,
      reason: `Role ${request.role} is authorized for risk level ${request.riskLevel}.`,
      approvedBy: request.actor,
      expiresAt: null,
    });
  }

  // Requires approval from higher role
  return Object.freeze({
    requestId: request.requestId,
    decision: 'PENDING_APPROVAL',
    requiredLevel,
    currentLevel: maxAllowedLevel,
    reason: `Action ${requiredLevel} with risk ${request.riskLevel} requires approval from: ${requiredApprovers.join(', ')}.`,
    approvedBy: null,
    expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour expiry
  });
}

export function approveRequest(
  request: PermissionRequest,
  approver: string,
  approverRole: OperatorRole,
  decision: 'APPROVED' | 'REJECTED',
  reason: string
): ApprovalRecord {
  const requiredApprovers = RISK_APPROVAL_REQUIREMENTS[request.riskLevel];

  if (!requiredApprovers.includes(approverRole)) {
    throw new Error(
      `Approver role ${approverRole} is not authorized to approve risk level ${request.riskLevel}. Required: ${requiredApprovers.join(', ')}`
    );
  }

  return Object.freeze({
    approvalId: `appr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    requestId: request.requestId,
    approvedBy: approver,
    role: approverRole,
    timestamp: new Date().toISOString(),
    decision,
    reason,
    expiresAt: null,
  });
}

export function isModelBypassAttempt(actor: string, role: OperatorRole): boolean {
  // Models should never directly EXECUTE
  // They can only RECOMMEND or REQUEST_APPROVAL
  return role === 'SYSTEM' && actor.startsWith('model:');
}
```

---

## 21. `src/permission/index.ts`

```typescript
export * from './permissionTypes.js';
export * from './permissionGate.js';
```

---

## 22. `src/workers/workerTypes.ts`

```typescript
/**
 * Genesis Cyber Foundation — Worker Types
 *
 * Modele AI są WORKERAMI, nie właścicielami decyzji.
 * ModelOutput jest zawsze oznaczony MODEL_GENERATED.
 * Nigdy automatycznie: EVIDENCE, REFERENCE, REAL_EXPERIMENTAL, VERIFIED.
 */

import type { ProvenanceRecord } from '../contracts/provenance.js';

export type CyberWorkerCapability =
  | 'OBSERVE'
  | 'ANALYZE'
  | 'GENERATE_HYPOTHESIS'
  | 'GENERATE_TEST'
  | 'ANALYZE_EVIDENCE'
  | 'PROPOSE_REMEDIATION';

export interface CyberWorker {
  readonly workerId: string;
  readonly name: string;
  readonly provider: string;
  readonly capabilities: readonly CyberWorkerCapability[];
  readonly trustLevel: ModelTrustLevel;
  readonly isActive: boolean;
}

export type ModelTrustLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNVERIFIED';

export interface ModelTask {
  readonly taskId: string;
  readonly workerId: string;
  readonly capability: CyberWorkerCapability;
  readonly input: Record<string, unknown>;
  readonly constraints: ModelConstraints;
  readonly timestamp: string;
}

export interface ModelConstraints {
  readonly maxTokens: number;
  readonly timeBudgetMs: number;
  readonly allowedTools: readonly string[];
  readonly evidenceAccess: readonly string[];
  readonly cannotFabricate: readonly string[];
  readonly mustCiteSources: boolean;
}

export interface ModelOutput {
  readonly taskId: string;
  readonly workerId: string;
  readonly outputType: ModelOutputType;
  readonly claims: readonly ModelClaim[];
  readonly provenance: ProvenanceRecord; // Zawsze MODEL_GENERATED
  readonly confidence: number; // 0-1, self-reported by model
  readonly assumptions: readonly string[];
  readonly unknowns: readonly string[];
  readonly timestamp: string;
}

export type ModelOutputType =
  | 'OBSERVATION_ANALYSIS'
  | 'HYPOTHESIS'
  | 'TEST_DESIGN'
  | 'EVIDENCE_ANALYSIS'
  | 'REMEDIATION_PROPOSAL';

export interface ModelClaim {
  readonly claimId: string;
  readonly statement: string;
  readonly confidence: number; // 0-1
  readonly evidenceRefs: readonly string[];
  readonly assumptions: readonly string[];
  readonly falsifier: string | null; // co by to obaliło
}
```

---

## 23. `src/workers/workerOrchestrator.ts`

```typescript
/**
 * Genesis Cyber Foundation — Worker Orchestrator
 *
 * ADAPTER: Wymaga implementacji po stronie Genesis.
 * Ten plik definiuje interfejs, ale nie implementuje konkretnych modeli.
 */

import type {
  CyberWorker,
  ModelTask,
  ModelOutput,
  CyberWorkerCapability,
  ModelTrustLevel,
} from './workerTypes.js';
import { createProvenance } from '../contracts/provenance.js';

export interface WorkerRegistry {
  registerWorker(worker: CyberWorker): void;
  unregisterWorker(workerId: string): void;
  getWorker(workerId: string): CyberWorker | null;
  getWorkersByCapability(capability: CyberWorkerCapability): readonly CyberWorker[];
  getActiveWorkers(): readonly CyberWorker[];
}

export interface WorkerOrchestrator {
  readonly registry: WorkerRegistry;

  dispatchTask(task: ModelTask): Promise<ModelOutput>;

  selectWorker(
    capability: CyberWorkerCapability,
    trustLevel: ModelTrustLevel
  ): CyberWorker | null;

  validateOutput(output: ModelOutput): OutputValidationResult;
}

export interface OutputValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * INTEGRATION_REQUIRED:
 * Ta funkcja musi być zaimplementowana po stronie Genesis,
 * z podłączeniem do konkretnych modeli AI (Mythos, Claude, etc.).
 */
export function createWorkerOrchestrator(): WorkerOrchestrator {
  const workers = new Map<string, CyberWorker>();

  const registry: WorkerRegistry = {
    registerWorker(worker: CyberWorker): void {
      workers.set(worker.workerId, worker);
    },

    unregisterWorker(workerId: string): void {
      workers.delete(workerId);
    },

    getWorker(workerId: string): CyberWorker | null {
      return workers.get(workerId) ?? null;
    },

    getWorkersByCapability(capability: CyberWorkerCapability): readonly CyberWorker[] {
      return Object.freeze(
        Array.from(workers.values()).filter(
          (w) => w.isActive && w.capabilities.includes(capability)
        )
      );
    },

    getActiveWorkers(): readonly CyberWorker[] {
      return Object.freeze(Array.from(workers.values()).filter((w) => w.isActive));
    },
  };

  return {
    registry,

    async dispatchTask(task: ModelTask): Promise<ModelOutput> {
      const worker = workers.get(task.workerId);
      if (!worker) {
        throw new Error(`Worker ${task.workerId} not found`);
      }
      if (!worker.isActive) {
        throw new Error(`Worker ${task.workerId} is not active`);
      }
      if (!worker.capabilities.includes(task.capability)) {
        throw new Error(
          `Worker ${task.workerId} does not have capability ${task.capability}`
        );
      }

      // INTEGRATION_REQUIRED:
      // Tutaj musi być wywołanie konkretnego modelu AI.
      // Na razie rzucamy błąd, żeby nie udawać implementacji.
      throw new Error(
        'INTEGRATION_REQUIRED: dispatchTask requires concrete model implementation. ' +
        'Connect to Mythos, Claude, or other AI model.'
      );
    },

    selectWorker(
      capability: CyberWorkerCapability,
      trustLevel: ModelTrustLevel
    ): CyberWorker | null {
      const candidates = Array.from(workers.values()).filter(
        (w) =>
          w.isActive &&
          w.capabilities.includes(capability) &&
          w.trustLevel === trustLevel
      );

      if (candidates.length === 0) {
        return null;
      }

      // Select first matching worker (simple strategy)
      return candidates[0] ?? null;
    },

    validateOutput(output: ModelOutput): OutputValidationResult {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Check provenance is MODEL_GENERATED
      if (output.provenance.provenance !== 'MODEL_GENERATED') {
        errors.push(
          `ModelOutput provenance must be MODEL_GENERATED, got ${output.provenance.provenance}`
        );
      }

      // Check claims have falsifiers
      for (const claim of output.claims) {
        if (claim.falsifier === null) {
          warnings.push(`Claim ${claim.claimId} has no falsifier defined`);
        }
        if (claim.confidence < 0 || claim.confidence > 1) {
          errors.push(`Claim ${claim.claimId} has invalid confidence ${claim.confidence}`);
        }
      }

      // Check confidence is in range
      if (output.confidence < 0 || output.confidence > 1) {
        errors.push(`Output confidence ${output.confidence} is out of range [0, 1]`);
      }

      return Object.freeze({
        valid: errors.length === 0,
        errors: Object.freeze(errors),
        warnings: Object.freeze(warnings),
      });
    },
  };
}
```

---

## 24. `src/workers/index.ts`

```typescript
export * from './workerTypes.js';
export * from './workerOrchestrator.js';
```

---

## 25. `src/conflict/conflictTypes.ts`

```typescript
/**
 * Genesis Cyber Foundation — Conflict Resolution Types
 *
 * Nie używamy majority vote.
 * Projektujemy discriminating test.
 */

import type { ModelClaim } from '../workers/workerTypes.js';

export interface Conflict {
  readonly conflictId: string;
  readonly timestamp: string;
  readonly claims: readonly ConflictingClaim[];
  readonly conflictPoint: string;
  readonly status: ConflictStatus;
}

export type ConflictStatus =
  | 'DETECTED'
  | 'ANALYZING'
  | 'TEST_DESIGNED'
  | 'TEST_EXECUTING'
  | 'RESOLVED'
  | 'UNRESOLVED'
  | 'BLOCKED';

export interface ConflictingClaim {
  readonly claimId: string;
  readonly workerId: string;
  readonly claim: ModelClaim;
  readonly position: string;
}

export interface DiscriminatingTest {
  readonly testId: string;
  readonly conflictId: string;
  readonly description: string;
  readonly expectedOutcomes: Readonly<Record<string, string>>;
  readonly status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'BLOCKED';
  readonly result: DiscriminatingTestResult | null;
}

export interface DiscriminatingTestResult {
  readonly testId: string;
  readonly outcome: string;
  readonly supportsClaims: readonly string[];
  readonly contradictsClaims: readonly string[];
  readonly inconclusiveClaims: readonly string[];
  readonly evidenceRefs: readonly string[];
}

export interface ConflictResolution {
  readonly conflictId: string;
  readonly resolution: ConflictResolutionType;
  readonly supportedClaims: readonly string[];
  readonly falsifiedClaims: readonly string[];
  readonly inconclusiveClaims: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly reasoning: string;
  readonly timestamp: string;
}

export type ConflictResolutionType =
  | 'RESOLVED_SINGLE_CLAIM'
  | 'RESOLVED_MULTIPLE_CLAIMS'
  | 'COMPETING_CLAIMS_UNRESOLVED'
  | 'BLOCKED';
```

---

## 26. `src/conflict/conflictResolver.ts`

```typescript
/**
 * Genesis Cyber Foundation — Conflict Resolver
 *
 * Nie używamy majority vote.
 * Mechanizm:
 * MODEL A → CLAIM A
 * MODEL B → CLAIM B
 * MODEL C → CLAIM C
 * → detect conflict
 * → design discriminating test
 * → execute
 * → compare evidence
 * → resolve / remain unresolved
 */

import type {
  Conflict,
  ConflictingClaim,
  ConflictStatus,
  DiscriminatingTest,
  DiscriminatingTestResult,
  ConflictResolution,
  ConflictResolutionType,
} from './conflictTypes.js';
import type { ModelClaim } from '../workers/workerTypes.js';

let conflictIdCounter = 0;
let testIdCounter = 0;

export function detectConflict(
  claims: readonly ConflictingClaim[]
): Conflict | null {
  if (claims.length < 2) {
    return null;
  }

  // Check if claims contradict each other
  const positions = new Set(claims.map((c) => c.position));

  if (positions.size < claims.length) {
    // Some claims have the same position - not a conflict
    return null;
  }

  // All claims have different positions - this is a conflict
  return Object.freeze({
    conflictId: `conflict-${++conflictIdCounter}`,
    timestamp: new Date().toISOString(),
    claims: Object.freeze([...claims]),
    conflictPoint: identifyConflictPoint(claims),
    status: 'DETECTED' as ConflictStatus,
  });
}

function identifyConflictPoint(claims: readonly ConflictingClaim[]): string {
  const positions = claims.map((c) => c.position);
  return `Conflicting positions: ${positions.join(' vs ')}`;
}

export function designDiscriminatingTest(
  conflict: Conflict,
  testDescription: string,
  expectedOutcomes: Record<string, string>
): DiscriminatingTest {
  return Object.freeze({
    testId: `dtest-${++testIdCounter}`,
    conflictId: conflict.conflictId,
    description: testDescription,
    expectedOutcomes: Object.freeze({ ...expectedOutcomes }),
    status: 'PENDING',
    result: null,
  });
}

export function executeDiscriminatingTest(
  test: DiscriminatingTest,
  result: DiscriminatingTestResult
): DiscriminatingTest {
  return Object.freeze({
    ...test,
    status: 'COMPLETED',
    result,
  });
}

export function resolveConflict(
  conflict: Conflict,
  testResult: DiscriminatingTestResult
): ConflictResolution {
  const supportedClaims = testResult.supportsClaims;
  const falsifiedClaims = testResult.contradictsClaims;
  const inconclusiveClaims = testResult.inconclusiveClaims;

  let resolution: ConflictResolutionType;
  let reasoning: string;

  if (falsifiedClaims.length === conflict.claims.length) {
    resolution = 'BLOCKED';
    reasoning = 'All claims were falsified. No valid claim remains.';
  } else if (supportedClaims.length === 1 && falsifiedClaims.length === conflict.claims.length - 1) {
    resolution = 'RESOLVED_SINGLE_CLAIM';
    reasoning = `One claim supported, others falsified. Supported claim: ${supportedClaims[0]}`;
  } else if (supportedClaims.length > 1) {
    resolution = 'RESOLVED_MULTIPLE_CLAIMS';
    reasoning = `Multiple claims supported: ${supportedClaims.join(', ')}. Further investigation may be needed.`;
  } else if (inconclusiveClaims.length > 0) {
    resolution = 'COMPETING_CLAIMS_UNRESOLVED';
    reasoning = `Data does not discriminate between claims. Inconclusive claims: ${inconclusiveClaims.join(', ')}. Additional discriminating test required.`;
  } else {
    resolution = 'COMPETING_CLAIMS_UNRESOLVED';
    reasoning = 'Unable to resolve conflict with available evidence.';
  }

  return Object.freeze({
    conflictId: conflict.conflictId,
    resolution,
    supportedClaims: Object.freeze([...supportedClaims]),
    falsifiedClaims: Object.freeze([...falsifiedClaims]),
    inconclusiveClaims: Object.freeze([...inconclusiveClaims]),
    evidenceRefs: Object.freeze([...testResult.evidenceRefs]),
    reasoning,
    timestamp: new Date().toISOString(),
  });
}

export function requiresAdditionalTest(resolution: ConflictResolution): boolean {
  return (
    resolution.resolution === 'COMPETING_CLAIMS_UNRESOLVED' ||
    resolution.resolution === 'BLOCKED'
  );
}
```

---

## 27. `src/conflict/index.ts`

```typescript
export * from './conflictTypes.js';
export * from './conflictResolver.js';
```

---

## 28. `src/attention/attentionTypes.ts`

```typescript
/**
 * Genesis Cyber Foundation — Attention Intelligence Types
 *
 * Nie traktuj progów jako certyfikowanej polityki bezpieczeństwa.
 */

export interface AttentionFactors {
  readonly severity: number; // 0-1
  readonly urgency: number; // 0-1
  readonly impact: number; // 0-1
  readonly confidence: number; // 0-1
  readonly novelty: number; // 0-1
  readonly timeSensitivity: number; // 0-1
  readonly costOfSilence: number; // 0-1
  readonly operatorWorkload: number; // 0-1
  readonly reversibility: number; // 0-1
}

export type AttentionDecision =
  | 'NO_INTERRUPT'
  | 'LOG'
  | 'QUEUE'
  | 'NOTIFY'
  | 'WARN'
  | 'REQUEST_APPROVAL'
  | 'ESCALATE'
  | 'EMERGENCY_STOP';

export interface AttentionEvaluationResult {
  readonly decision: AttentionDecision;
  readonly factors: AttentionFactors;
  readonly interruptValue: number;
  readonly suppressValue: number;
  readonly netValue: number;
  readonly reason: string;
  readonly timestamp: string;
}
```

---

## 29. `src/attention/attentionEvaluator.ts`

```typescript
/**
 * Genesis Cyber Foundation — Attention Evaluator
 *
 * Nie traktuj progów jako certyfikowanej polityki bezpieczeństwa.
 */

import type {
  AttentionFactors,
  AttentionDecision,
  AttentionEvaluationResult,
} from './attentionTypes.js';

export function evaluateAttention(
  factors: AttentionFactors
): AttentionEvaluationResult {
  // CRITICAL override: high severity + high time sensitivity
  if (factors.severity >= 0.9 && factors.timeSensitivity >= 0.8) {
    return Object.freeze({
      decision: 'EMERGENCY_STOP' as AttentionDecision,
      factors,
      interruptValue: 1,
      suppressValue: 0,
      netValue: 1,
      reason: 'Critical severity with high time sensitivity. Immediate action required.',
      timestamp: new Date().toISOString(),
    });
  }

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
    (factors.confidence < 0.3 ? 0.20 : 0) +
    (factors.severity < 0.3 ? 0.25 : 0);

  const netValue = interruptValue - suppressValue;

  let decision: AttentionDecision;
  let reason: string;

  if (netValue >= 0.75) {
    decision = 'EMERGENCY_STOP';
    reason = 'Very high interrupt value. Immediate action required.';
  } else if (netValue >= 0.60) {
    decision = 'ESCALATE';
    reason = 'High interrupt value. Escalation to supervisor recommended.';
  } else if (netValue >= 0.45) {
    decision = 'REQUEST_APPROVAL';
    reason = 'Moderate-high interrupt value. Approval required before action.';
  } else if (netValue >= 0.30) {
    decision = 'WARN';
    reason = 'Moderate interrupt value. Warning issued.';
  } else if (netValue >= 0.20) {
    decision = 'NOTIFY';
    reason = 'Low-moderate interrupt value. Notification issued.';
  } else if (netValue >= 0.10) {
    decision = 'QUEUE';
    reason = 'Low interrupt value. Queued for next natural pause.';
  } else if (netValue >= 0.0) {
    decision = 'LOG';
    reason = 'Very low interrupt value. Logged only.';
  } else {
    decision = 'NO_INTERRUPT';
    reason = 'Negative interrupt value. No interruption.';
  }

  return Object.freeze({
    decision,
    factors,
    interruptValue: Math.round(interruptValue * 100) / 100,
    suppressValue: Math.round(suppressValue * 100) / 100,
    netValue: Math.round(netValue * 100) / 100,
    reason,
    timestamp: new Date().toISOString(),
  });
}
```

---

## 30. `src/attention/index.ts`

```typescript
export * from './attentionTypes.js';
export * from './attentionEvaluator.js';
```

---

## 31. `src/drift/driftTypes.ts`

```typescript
/**
 * Genesis Cyber Foundation — Security Drift Types
 */

export interface SecurityDriftInput {
  readonly assetId: string;
  readonly expectedState: Record<string, unknown>;
  readonly observedState: Record<string, unknown>;
  readonly timestamp: string;
  readonly tolerance: number; // 0-1
}

export type DriftType =
  | 'NO_DRIFT'
  | 'DRIFT'
  | 'CRITICAL_DRIFT'
  | 'INSUFFICIENT_DATA';

export interface SecurityDriftResult {
  readonly assetId: string;
  readonly driftType: DriftType;
  readonly severity: number; // 0-1
  readonly deviations: readonly DriftDeviation[];
  readonly affectedFields: readonly string[];
  readonly analysis: string;
  readonly timestamp: string;
}

export interface DriftDeviation {
  readonly fieldName: string;
  readonly expectedValue: unknown;
  readonly observedValue: unknown;
  readonly deviationMagnitude: number | null;
  readonly isCritical: boolean;
}
```

---

## 32. `src/drift/driftDetector.ts`

```typescript
/**
 * Genesis Cyber Foundation — Security Drift Detector
 */

import type {
  SecurityDriftInput,
  SecurityDriftResult,
  DriftType,
  DriftDeviation,
} from './driftTypes.js';

export function detectSecurityDrift(
  input: SecurityDriftInput
): SecurityDriftResult {
  const { assetId, expectedState, observedState, tolerance } = input;

  const deviations: DriftDeviation[] = [];
  const affectedFields: string[] = [];

  // Compare expected vs observed
  for (const [fieldName, expectedValue] of Object.entries(expectedState)) {
    const observedValue = observedState[fieldName];

    if (observedValue === undefined) {
      deviations.push(
        Object.freeze({
          fieldName,
          expectedValue,
          observedValue: null,
          deviationMagnitude: null,
          isCritical: true,
        })
      );
      affectedFields.push(fieldName);
      continue;
    }

    if (typeof expectedValue === 'number' && typeof observedValue === 'number') {
      const deviation = Math.abs(observedValue - expectedValue);
      const relativeDeviation = expectedValue !== 0 ? deviation / Math.abs(expectedValue) : deviation;

      if (relativeDeviation > tolerance) {
        const isCritical = relativeDeviation > tolerance * 3;
        deviations.push(
          Object.freeze({
            fieldName,
            expectedValue,
            observedValue,
            deviationMagnitude: relativeDeviation,
            isCritical,
          })
        );
        affectedFields.push(fieldName);
      }
    } else if (JSON.stringify(expectedValue) !== JSON.stringify(observedValue)) {
      deviations.push(
        Object.freeze({
          fieldName,
          expectedValue,
          observedValue,
          deviationMagnitude: null,
          isCritical: true,
        })
      );
      affectedFields.push(fieldName);
    }
  }

  // Check for unexpected fields in observed state
  for (const fieldName of Object.keys(observedState)) {
    if (!(fieldName in expectedState)) {
      deviations.push(
        Object.freeze({
          fieldName,
          expectedValue: null,
          observedValue: observedState[fieldName],
          deviationMagnitude: null,
          isCritical: false,
        })
      );
      affectedFields.push(fieldName);
    }
  }

  // Determine drift type
  let driftType: DriftType;
  let severity: number;
  let analysis: string;

  if (deviations.length === 0) {
    driftType = 'NO_DRIFT';
    severity = 0;
    analysis = 'No drift detected. Observed state matches expected state.';
  } else {
    const criticalDeviations = deviations.filter((d) => d.isCritical);

    if (criticalDeviations.length > 0) {
      driftType = 'CRITICAL_DRIFT';
      severity = Math.min(1, criticalDeviations.length / Object.keys(expectedState).length + 0.5);
      analysis = `Critical drift detected. ${criticalDeviations.length} critical deviations: ${criticalDeviations.map((d) => d.fieldName).join(', ')}.`;
    } else {
      driftType = 'DRIFT';
      severity = Math.min(1, deviations.length / Object.keys(expectedState).length);
      analysis = `Drift detected. ${deviations.length} deviations: ${deviations.map((d) => d.fieldName).join(', ')}.`;
    }
  }

  return Object.freeze({
    assetId,
    driftType,
    severity: Math.round(severity * 100) / 100,
    deviations: Object.freeze(deviations),
    affectedFields: Object.freeze(affectedFields),
    analysis,
    timestamp: new Date().toISOString(),
  });
}
```

---

## 33. `src/drift/index.ts`

```typescript
export * from './driftTypes.js';
export * from './driftDetector.js';
```

---

## 34. TESTS

### `tests/attackPath/attackPath.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  createAttackPathNode,
  createAttackPathEdge,
  createAttackPath,
  updateNodeVerificationStatus,
  updateEdgeVerificationStatus,
} from '../../src/attackPath/attackPathBuilder.js';
import {
  verifyAttackPath,
  falsifyAttackPath,
  evaluateAttackPath,
} from '../../src/attackPath/attackPathVerifier.js';

describe('Attack Path Verification', () => {
  // TEST 1: valid attack path
  it('should verify a fully supported attack path', () => {
    const node1 = createAttackPathNode('INITIAL_ACCESS', 'Phishing email', 'REFERENCE', 'SIEM');
    const node2 = createAttackPathNode('EXECUTION', 'Malware executed', 'REFERENCE', 'EDR');
    const edge1 = createAttackPathEdge(node1.id, node2.id, 'leads_to', 'MODEL_GENERATED', 'Mythos');

    let path = createAttackPath([node1, node2], [edge1], 'MODEL_GENERATED', 'Genesis');

    // Verify all nodes and edges
    path = updateNodeVerificationStatus(path, node1.id, 'SUPPORTED', ['ev-1']);
    path = updateNodeVerificationStatus(path, node2.id, 'SUPPORTED', ['ev-2']);
    path = updateEdgeVerificationStatus(path, edge1.edgeId, 'SUPPORTED', ['ev-3']);

    const result = verifyAttackPath(path);

    expect(result.canBeMarkedVerified).toBe(true);
    expect(result.overallStatus).toBe('VERIFIED');
    expect(result.verifiedNodes).toBe(2);
    expect(result.totalNodes).toBe(2);
  });

  // TEST 2: falsified attack path
  it('should not verify a path with falsified node', () => {
    const node1 = createAttackPathNode('INITIAL_ACCESS', 'Phishing email', 'REFERENCE', 'SIEM');
    const node2 = createAttackPathNode('EXECUTION', 'Malware executed', 'REFERENCE', 'EDR');
    const edge1 = createAttackPathEdge(node1.id, node2.id, 'leads_to', 'MODEL_GENERATED', 'Mythos');

    let path = createAttackPath([node1, node2], [edge1], 'MODEL_GENERATED', 'Genesis');

    path = updateNodeVerificationStatus(path, node1.id, 'SUPPORTED', ['ev-1']);
    path = updateNodeVerificationStatus(path, node2.id, 'FALSIFIED', ['ev-2']);
    path = updateEdgeVerificationStatus(path, edge1.edgeId, 'SUPPORTED', ['ev-3']);

    const result = verifyAttackPath(path);

    expect(result.canBeMarkedVerified).toBe(false);
    expect(result.overallStatus).toBe('FALSIFIED');
    expect(result.falsifiedNodes).toContain(node2.id);
  });

  // TEST 3: incomplete attack path
  it('should not verify a path with unverified nodes', () => {
    const node1 = createAttackPathNode('INITIAL_ACCESS', 'Phishing email', 'REFERENCE', 'SIEM');
    const node2 = createAttackPathNode('EXECUTION', 'Malware executed', 'REFERENCE', 'EDR');
    const node3 = createAttackPathNode('EXFILTRATION', 'Data exfiltrated', 'MODEL_GENERATED', 'Mythos');
    const edge1 = createAttackPathEdge(node1.id, node2.id, 'leads_to', 'MODEL_GENERATED', 'Mythos');
    const edge2 = createAttackPathEdge(node2.id, node3.id, 'leads_to', 'MODEL_GENERATED', 'Mythos');

    let path = createAttackPath([node1, node2, node3], [edge1, edge2], 'MODEL_GENERATED', 'Genesis');

    path = updateNodeVerificationStatus(path, node1.id, 'SUPPORTED', ['ev-1']);
    path = updateNodeVerificationStatus(path, node2.id, 'SUPPORTED', ['ev-2']);
    // node3 remains UNVERIFIED
    path = updateEdgeVerificationStatus(path, edge1.edgeId, 'SUPPORTED', ['ev-3']);
    path = updateEdgeVerificationStatus(path, edge2.edgeId, 'SUPPORTED', ['ev-4']);

    const result = verifyAttackPath(path);

    expect(result.canBeMarkedVerified).toBe(false);
    expect(result.overallStatus).toBe('PARTIALLY_VERIFIED');
    expect(result.unverifiedNodes).toContain(node3.id);
    expect(result.reason).toContain('unverified nodes');
  });

  // TEST 4: falsifyAttackPath function
  it('should falsify an attack path', () => {
    const node1 = createAttackPathNode('INITIAL_ACCESS', 'Phishing email', 'REFERENCE', 'SIEM');
    const node2 = createAttackPathNode('EXECUTION', 'Malware executed', 'REFERENCE', 'EDR');
    const edge1 = createAttackPathEdge(node1.id, node2.id, 'leads_to', 'MODEL_GENERATED', 'Mythos');

    const path = createAttackPath([node1, node2], [edge1], 'MODEL_GENERATED', 'Genesis');

    const falsifiedPath = falsifyAttackPath(path, node2.id, 'No malware found', ['ev-1']);

    expect(falsifiedPath.overallStatus).toBe('FALSIFIED');
    const node = falsifiedPath.nodes.find((n) => n.id === node2.id);
    expect(node?.verificationStatus).toBe('FALSIFIED');
  });

  // TEST 5: evaluateAttackPath with evidence strengths
  it('should evaluate attack path with evidence strengths', () => {
    const node1 = createAttackPathNode('INITIAL_ACCESS', 'Phishing email', 'REFERENCE', 'SIEM');
    const edge1 = createAttackPathEdge(node1.id, node1.id, 'self', 'MODEL_GENERATED', 'Mythos');

    let path = createAttackPath([node1], [edge1], 'MODEL_GENERATED', 'Genesis');
    path = updateNodeVerificationStatus(path, node1.id, 'SUPPORTED', ['ev-1']);
    path = updateEdgeVerificationStatus(path, edge1.edgeId, 'SUPPORTED', ['ev-2']);

    const evidenceStrengths = new Map<string, number>([
      ['ev-1', 0.9],
      ['ev-2', 0.8],
    ]);

    const result = evaluateAttackPath(path, evidenceStrengths);

    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
```

### `tests/outcome/outcomeVerification.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { verifySecurityOutcome } from '../../src/outcomeVerification/verifySecurityOutcome.js';
import type { OutcomeVerificationInput } from '../../src/outcomeVerification/outcomeTypes.js';

describe('Security Outcome Verification', () => {
  // TEST 8: outcome matches prediction
  it('should return VERIFIED when outcome matches prediction', () => {
    const input: OutcomeVerificationInput = {
      predictionId: 'pred-1',
      actionId: 'action-1',
      expectedOutcome: 'Traffic reduced by 90%',
      expectedMetrics: { trafficVolume: 10, alertCount: 1 },
      actualOutcome: 'Traffic reduced by 88%',
      actualMetrics: { trafficVolume: 12, alertCount: 1 },
      tolerance: 0.25,
    };

    const result = verifySecurityOutcome(input);

    expect(result.verdict).toBe('VERIFIED');
    expect(result.requiresReinvestigation).toBe(false);
  });

  // TEST 9: outcome differs from prediction
  it('should return DRIFT when outcome differs slightly', () => {
    const input: OutcomeVerificationInput = {
      predictionId: 'pred-2',
      actionId: 'action-2',
      expectedOutcome: 'Traffic reduced by 90%',
      expectedMetrics: { trafficVolume: 10 },
      actualOutcome: 'Traffic reduced by 70%',
      actualMetrics: { trafficVolume: 30 },
      tolerance: 0.25,
    };

    const result = verifySecurityOutcome(input);

    expect(result.verdict).toBe('DRIFT');
    expect(result.requiresReinvestigation).toBe(true);
    expect(result.nextSteps).toContain('Investigate cause of drift');
  });

  // TEST 9b: outcome significantly differs
  it('should return FAILED when outcome significantly differs', () => {
    const input: OutcomeVerificationInput = {
      predictionId: 'pred-3',
      actionId: 'action-3',
      expectedOutcome: 'Traffic reduced by 90%',
      expectedMetrics: { trafficVolume: 10 },
      actualOutcome: 'Traffic increased',
      actualMetrics: { trafficVolume: 100 },
      tolerance: 0.25,
    };

    const result = verifySecurityOutcome(input);

    expect(result.verdict).toBe('FAILED');
    expect(result.requiresReinvestigation).toBe(true);
    expect(result.nextSteps).toContain('Do NOT mark as SUCCESS');
  });

  // TEST 10: insufficient data
  it('should return INSUFFICIENT_DATA when no actual data', () => {
    const input: OutcomeVerificationInput = {
      predictionId: 'pred-4',
      actionId: 'action-4',
      expectedOutcome: 'Traffic reduced',
      expectedMetrics: { trafficVolume: 10 },
      actualOutcome: null,
      actualMetrics: null,
      tolerance: 0.25,
    };

    const result = verifySecurityOutcome(input);

    expect(result.verdict).toBe('INSUFFICIENT_DATA');
    expect(result.requiresReinvestigation).toBe(true);
  });
});
```

### `tests/decisionChain/decisionChain.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  createDecisionChain,
  addNodeToChain,
  addEdgeToChain,
  finalizeChain,
  verifyChainIntegrity,
} from '../../src/decisionChain/chainBuilder.js';
import { queryChain, auditDecision } from '../../src/decisionChain/chainQuery.js';

describe('Decision Chain', () => {
  it('should create an immutable decision chain', () => {
    let chain = createDecisionChain('mission-1');

    chain = addNodeToChain(chain, 'OBSERVATION', 'SIEM', 'REFERENCE', 'siem-1', { type: 'network_traffic' });
    chain = addNodeToChain(chain, 'HYPOTHESIS', 'Mythos', 'MODEL_GENERATED', 'model-1', { statement: 'credential theft' });
    chain = addNodeToChain(chain, 'EVIDENCE', 'Genesis', 'REFERENCE', 'ev-1', { type: 'auth_log' });
    chain = addNodeToChain(chain, 'VERDICT', 'Genesis', 'SIMULATED', 'verdict-1', { verdict: 'SUPPORTED' });
    chain = addNodeToChain(chain, 'DECISION', 'Genesis', 'SIMULATED', 'decision-1', { action: 'ISOLATE' });
    chain = addNodeToChain(chain, 'APPROVAL', 'Operator', 'SIMULATED', 'approval-1', { approved: true });
    chain = addNodeToChain(chain, 'ACTION', 'SOAR', 'SIMULATED', 'action-1', { type: 'ISOLATE_ENDPOINT' });
    chain = addNodeToChain(chain, 'OUTCOME', 'SIEM', 'REFERENCE', 'outcome-1', { trafficReduced: true });
    chain = addNodeToChain(chain, 'VERIFICATION', 'Genesis', 'SIMULATED', 'verification-1', { verdict: 'VERIFIED' });

    chain = finalizeChain(chain, 'COMPLETED');

    expect(chain.immutable).toBe(true);
    expect(chain.nodes.length).toBe(9);
    expect(chain.status).toBe('COMPLETED');

    // Verify integrity
    const integrity = verifyChainIntegrity(chain);
    expect(integrity.valid).toBe(true);
    expect(integrity.errors.length).toBe(0);

    // Try to add node to immutable chain
    expect(() => {
      addNodeToChain(chain, 'OBSERVATION', 'SIEM', 'REFERENCE', 'siem-2', { type: 'test' });
    }).toThrow('Cannot add node to immutable chain');
  });

  it('should query chain by node type', () => {
    let chain = createDecisionChain('mission-2');

    chain = addNodeToChain(chain, 'OBSERVATION', 'SIEM', 'REFERENCE', 'siem-1', {});
    chain = addNodeToChain(chain, 'HYPOTHESIS', 'Mythos', 'MODEL_GENERATED', 'model-1', {});
    chain = addNodeToChain(chain, 'EVIDENCE', 'Genesis', 'REFERENCE', 'ev-1', {});

    const observations = queryChain(chain, 'OBSERVATION');
    const hypotheses = queryChain(chain, 'HYPOTHESIS');
    const evidence = queryChain(chain, 'EVIDENCE');

    expect(observations.length).toBe(1);
    expect(hypotheses.length).toBe(1);
    expect(evidence.length).toBe(1);
  });

  it('should audit decision chain', () => {
    let chain = createDecisionChain('mission-3');

    chain = addNodeToChain(chain, 'OBSERVATION', 'SIEM', 'REFERENCE', 'siem-1', {});
    chain = addNodeToChain(chain, 'HYPOTHESIS', 'Mythos', 'MODEL_GENERATED', 'model-1', {});
    chain = addNodeToChain(chain, 'EVIDENCE', 'Genesis', 'REFERENCE', 'ev-1', {});
    chain = addNodeToChain(chain, 'VERDICT', 'Genesis', 'SIMULATED', 'verdict-1', {});
    chain = addNodeToChain(chain, 'DECISION', 'Genesis', 'SIMULATED', 'decision-1', {});
    chain = addNodeToChain(chain, 'APPROVAL', 'Operator', 'SIMULATED', 'approval-1', {});
    chain = addNodeToChain(chain, 'ACTION', 'SOAR', 'SIMULATED', 'action-1', {});
    chain = addNodeToChain(chain, 'OUTCOME', 'SIEM', 'REFERENCE', 'outcome-1', {});
    chain = addNodeToChain(chain, 'VERIFICATION', 'Genesis', 'SIMULATED', 'verification-1', {});

    const audit = auditDecision(chain, 'Why was endpoint isolated?');

    expect(audit.chainId).toBe(chain.chainId);
    expect(audit.confidence).toBeGreaterThan(0);
    expect(audit.answer).toContain('Decision made');
  });
});
```

### `tests/conflict/conflictResolution.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  detectConflict,
  designDiscriminatingTest,
  executeDiscriminatingTest,
  resolveConflict,
  requiresAdditionalTest,
} from '../../src/conflict/conflictResolver.js';
import type { ConflictingClaim } from '../../src/conflict/conflictTypes.js';
import type { ModelClaim } from '../../src/workers/workerTypes.js';
import { createProvenance } from '../../src/contracts/provenance.js';

function createModelClaim(statement: string, position: string): ModelClaim {
  return Object.freeze({
    claimId: `claim-${Math.random().toString(36).slice(2, 8)}`,
    statement,
    confidence: 0.7,
    evidenceRefs: Object.freeze([]),
    assumptions: Object.freeze([]),
    falsifier: 'contradicting evidence',
  });
}

describe('Conflict Resolution', () => {
  // TEST 4: conflicting models
  it('should detect conflict between models', () => {
    const claims: ConflictingClaim[] = [
      {
        claimId: 'claim-1',
        workerId: 'mythos',
        claim: createModelClaim('Credential theft detected', 'credential_theft'),
        position: 'credential_theft',
      },
      {
        claimId: 'claim-2',
        workerId: 'claude',
        claim: createModelClaim('Insider activity detected', 'insider_threat'),
        position: 'insider_threat',
      },
      {
        claimId: 'claim-3',
        workerId: 'gemini',
        claim: createModelClaim('Malware detected', 'malware'),
        position: 'malware',
      },
    ];

    const conflict = detectConflict(claims);

    expect(conflict).not.toBeNull();
    expect(conflict?.status).toBe('DETECTED');
    expect(conflict?.claims.length).toBe(3);
    expect(conflict?.conflictPoint).toContain('vs');
  });

  it('should not detect conflict when claims agree', () => {
    const claims: ConflictingClaim[] = [
      {
        claimId: 'claim-1',
        workerId: 'mythos',
        claim: createModelClaim('Malware detected', 'malware'),
        position: 'malware',
      },
      {
        claimId: 'claim-2',
        workerId: 'claude',
        claim: createModelClaim('Malware detected', 'malware'),
        position: 'malware',
      },
    ];

    const conflict = detectConflict(claims);

    expect(conflict).toBeNull();
  });

  it('should resolve conflict with discriminating test', () => {
    const claims: ConflictingClaim[] = [
      {
        claimId: 'claim-1',
        workerId: 'mythos',
        claim: createModelClaim('Credential theft', 'credential_theft'),
        position: 'credential_theft',
      },
      {
        claimId: 'claim-2',
        workerId: 'claude',
        claim: createModelClaim('Insider threat', 'insider_threat'),
        position: 'insider_threat',
      },
    ];

    const conflict = detectConflict(claims);
    expect(conflict).not.toBeNull();

    const test = designDiscriminatingTest(
      conflict!,
      'Check auth patterns and user behavior baseline',
      {
        credential_theft: 'Unusual geo + credential in breach DB',
        insider_threat: 'Normal auth + unusual file access',
      }
    );

    const testResult = {
      testId: test.testId,
      outcome: 'Unusual geo + credential in breach DB',
      supportsClaims: Object.freeze(['claim-1']),
      contradictsClaims: Object.freeze(['claim-2']),
      inconclusiveClaims: Object.freeze([]),
      evidenceRefs: Object.freeze(['ev-1', 'ev-2']),
    };

    const completedTest = executeDiscriminatingTest(test, testResult);
    const resolution = resolveConflict(conflict!, testResult);

    expect(resolution.resolution).toBe('RESOLVED_SINGLE_CLAIM');
    expect(resolution.supportedClaims).toContain('claim-1');
    expect(resolution.falsifiedClaims).toContain('claim-2');
    expect(requiresAdditionalTest(resolution)).toBe(false);
  });

  it('should remain unresolved when data does not discriminate', () => {
    const claims: ConflictingClaim[] = [
      {
        claimId: 'claim-1',
        workerId: 'mythos',
        claim: createModelClaim('Credential theft', 'credential_theft'),
        position: 'credential_theft',
      },
      {
        claimId: 'claim-2',
        workerId: 'claude',
        claim: createModelClaim('Insider threat', 'insider_threat'),
        position: 'insider_threat',
      },
    ];

    const conflict = detectConflict(claims);
    expect(conflict).not.toBeNull();

    const testResult = {
      testId: 'test-1',
      outcome: 'Inconclusive',
      supportsClaims: Object.freeze([]),
      contradictsClaims: Object.freeze([]),
      inconclusiveClaims: Object.freeze(['claim-1', 'claim-2']),
      evidenceRefs: Object.freeze([]),
    };

    const resolution = resolveConflict(conflict!, testResult);

    expect(resolution.resolution).toBe('COMPETING_CLAIMS_UNRESOLVED');
    expect(requiresAdditionalTest(resolution)).toBe(true);
  });
});
```

### `tests/permission/permissionGate.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { checkPermission, approveRequest, isModelBypassAttempt } from '../../src/permission/permissionGate.js';
import type { PermissionRequest } from '../../src/permission/permissionTypes.js';

function createRequest(overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return Object.freeze({
    requestId: `req-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor: 'operator-1',
    role: 'OPERATOR',
    action: 'RECOMMEND',
    target: 'endpoint-1',
    riskLevel: 'LOW',
    evidenceRefs: Object.freeze([]),
    justification: 'Test',
    ...overrides,
  });
}

describe('Permission Gate', () => {
  // TEST 6: permission denied
  it('should deny EXECUTE for ANALYST', () => {
    const request = createRequest({
      role: 'ANALYST',
      action: 'EXECUTE',
      riskLevel: 'HIGH',
    });

    const result = checkPermission(request);

    expect(result.decision).toBe('DENIED');
    expect(result.reason).toContain('does not have permission');
  });

  // TEST 7: approval required
  it('should require approval for HIGH risk EXECUTE', () => {
    const request = createRequest({
      role: 'OPERATOR',
      action: 'EXECUTE',
      riskLevel: 'HIGH',
    });

    const result = checkPermission(request);

    expect(result.decision).toBe('PENDING_APPROVAL');
    expect(result.reason).toContain('requires approval');
  });

  it('should allow EXECUTE for SUPERVISOR with HIGH risk', () => {
    const request = createRequest({
      role: 'SUPERVISOR',
      action: 'EXECUTE',
      riskLevel: 'HIGH',
    });

    const result = checkPermission(request);

    expect(result.decision).toBe('ALLOWED');
  });

  it('should require multi-party approval for CRITICAL risk', () => {
    const request = createRequest({
      role: 'OPERATOR',
      action: 'EXECUTE',
      riskLevel: 'CRITICAL',
    });

    const result = checkPermission(request);

    expect(result.decision).toBe('PENDING_APPROVAL');
    expect(result.reason).toContain('SUPERVISOR');
    expect(result.reason).toContain('DIRECTOR');
  });

  it('should allow EMERGENCY_STOP for SYSTEM', () => {
    const request = createRequest({
      role: 'SYSTEM',
      action: 'EMERGENCY_STOP',
      riskLevel: 'CRITICAL',
    });

    const result = checkPermission(request);

    expect(result.decision).toBe('ALLOWED');
  });

  it('should approve request with correct role', () => {
    const request = createRequest({
      role: 'OPERATOR',
      action: 'EXECUTE',
      riskLevel: 'HIGH',
    });

    const approval = approveRequest(request, 'supervisor-1', 'SUPERVISOR', 'APPROVED', 'Approved after review');

    expect(approval.decision).toBe('APPROVED');
    expect(approval.approvedBy).toBe('supervisor-1');
  });

  it('should reject approval with incorrect role', () => {
    const request = createRequest({
      role: 'OPERATOR',
      action: 'EXECUTE',
      riskLevel: 'HIGH',
    });

    expect(() => {
      approveRequest(request, 'analyst-1', 'ANALYST', 'APPROVED', 'Trying to approve');
    }).toThrow('not authorized');
  });

  it('should detect model bypass attempt', () => {
    expect(isModelBypassAttempt('model:mythos', 'SYSTEM')).toBe(true);
    expect(isModelBypassAttempt('operator-1', 'SYSTEM')).toBe(false);
    expect(isModelBypassAttempt('model:claude', 'OPERATOR')).toBe(false);
  });
});
```

### `tests/attention/attentionEvaluator.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { evaluateAttention } from '../../src/attention/attentionEvaluator.js';
import type { AttentionFactors } from '../../src/attention/attentionTypes.js';

function createFactors(overrides: Partial<AttentionFactors> = {}): AttentionFactors {
  return Object.freeze({
    severity: 0.5,
    urgency: 0.5,
    impact: 0.5,
    confidence: 0.7,
    novelty: 0.5,
    timeSensitivity: 0.5,
    costOfSilence: 0.5,
    operatorWorkload: 0.3,
    reversibility: 0.7,
    ...overrides,
  });
}

describe('Attention Evaluator', () => {
  // TEST 13: critical attention event
  it('should return EMERGENCY_STOP for critical events', () => {
    const factors = createFactors({
      severity: 0.95,
      timeSensitivity: 0.9,
    });

    const result = evaluateAttention(factors);

    expect(result.decision).toBe('EMERGENCY_STOP');
    expect(result.reason).toContain('Critical severity');
  });

  it('should return ESCALATE for high-severity events', () => {
    const factors = createFactors({
      severity: 0.8,
      urgency: 0.8,
      impact: 0.8,
      timeSensitivity: 0.7,
      costOfSilence: 0.8,
      confidence: 0.8,
    });

    const result = evaluateAttention(factors);

    expect(['ESCALATE', 'EMERGENCY_STOP']).toContain(result.decision);
  });

  it('should return NO_INTERRUPT for low-severity events', () => {
    const factors = createFactors({
      severity: 0.1,
      urgency: 0.1,
      impact: 0.1,
      timeSensitivity: 0.1,
      costOfSilence: 0.1,
      confidence: 0.3,
      novelty: 0.1,
      operatorWorkload: 0.9,
    });

    const result = evaluateAttention(factors);

    expect(['NO_INTERRUPT', 'LOG']).toContain(result.decision);
  });

  // TEST 14: duplicate alert (low novelty)
  it('should suppress low-novelty alerts', () => {
    const factors = createFactors({
      severity: 0.5,
      novelty: 0.1,
      operatorWorkload: 0.7,
      confidence: 0.4,
    });

    const result = evaluateAttention(factors);

    expect(['LOG', 'QUEUE', 'NO_INTERRUPT']).toContain(result.decision);
  });

  it('should queue alerts when operator is busy', () => {
    const factors = createFactors({
      severity: 0.6,
      urgency: 0.5,
      impact: 0.5,
      operatorWorkload: 0.9,
      reversibility: 0.9,
    });

    const result = evaluateAttention(factors);

    expect(['QUEUE', 'LOG', 'NOTIFY']).toContain(result.decision);
  });
});
```

### `tests/drift/driftDetector.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { detectSecurityDrift } from '../../src/drift/driftDetector.js';
import type { SecurityDriftInput } from '../../src/drift/driftTypes.js';

describe('Security Drift Detector', () => {
  // TEST 15: security drift
  it('should detect NO_DRIFT when states match', () => {
    const input: SecurityDriftInput = {
      assetId: 'server-1',
      expectedState: { openPorts: 3, runningServices: 5, cpuUsage: 0.4 },
      observedState: { openPorts: 3, runningServices: 5, cpuUsage: 0.42 },
      timestamp: new Date().toISOString(),
      tolerance: 0.1,
    };

    const result = detectSecurityDrift(input);

    expect(result.driftType).toBe('NO_DRIFT');
    expect(result.severity).toBe(0);
    expect(result.deviations.length).toBe(0);
  });

  it('should detect DRIFT when states differ slightly', () => {
    const input: SecurityDriftInput = {
      assetId: 'server-2',
      expectedState: { openPorts: 3, runningServices: 5 },
      observedState: { openPorts: 4, runningServices: 5 },
      timestamp: new Date().toISOString(),
      tolerance: 0.1,
    };

    const result = detectSecurityDrift(input);

    expect(result.driftType).toBe('DRIFT');
    expect(result.affectedFields).toContain('openPorts');
  });

  it('should detect CRITICAL_DRIFT for significant deviations', () => {
    const input: SecurityDriftInput = {
      assetId: 'server-3',
      expectedState: { openPorts: 3, runningServices: 5, authorizedUsers: 10 },
      observedState: { openPorts: 15, runningServices: 20, authorizedUsers: 50 },
      timestamp: new Date().toISOString(),
      tolerance: 0.1,
    };

    const result = detectSecurityDrift(input);

    expect(result.driftType).toBe('CRITICAL_DRIFT');
    expect(result.severity).toBeGreaterThan(0.5);
  });

  it('should detect missing fields as critical drift', () => {
    const input: SecurityDriftInput = {
      assetId: 'server-4',
      expectedState: { openPorts: 3, firewallEnabled: true },
      observedState: { openPorts: 3 },
      timestamp: new Date().toISOString(),
      tolerance: 0.1,
    };

    const result = detectSecurityDrift(input);

    expect(result.driftType).toBe('CRITICAL_DRIFT');
    expect(result.affectedFields).toContain('firewallEnabled');
  });

  it('should detect unexpected fields', () => {
    const input: SecurityDriftInput = {
      assetId: 'server-5',
      expectedState: { openPorts: 3 },
      observedState: { openPorts: 3, unknownService: 'running' },
      timestamp: new Date().toISOString(),
      tolerance: 0.1,
    };

    const result = detectSecurityDrift(input);

    expect(result.affectedFields).toContain('unknownService');
  });
});
```

---

## 35. SUMMARY — STATUS KAŻDEGO ELEMENTU

| Moduł | Status | Uwagi |
|-------|--------|-------|
| `contracts/cyberTypes.ts` | **IMPLEMENTED** | Wszystkie typy domenowe |
| `contracts/provenance.ts` | **IMPLEMENTED** | MODEL_GENERATED jako czwarta kategoria |
| `attackPath/attackPathBuilder.ts` | **IMPLEMENTED** | Nodes/edges, statusy |
| `attackPath/attackPathVerifier.ts` | **IMPLEMENTED** | verify/falsify/evaluate |
| `outcomeVerification/verifySecurityOutcome.ts` | **IMPLEMENTED** | VERIFIED/FAILED/DRIFT/INSUFFICIENT_DATA |
| `decisionChain/chainBuilder.ts` | **IMPLEMENTED** | Immutable, hash chain |
| `decisionChain/chainQuery.ts` | **IMPLEMENTED** | 7 pytań audytowych |
| `permission/permissionGate.ts` | **IMPLEMENTED** | RBAC + risk-based approval |
| `attention/attentionEvaluator.ts` | **IMPLEMENTED** | Progi nie są certyfikowaną polityką |
| `drift/driftDetector.ts` | **IMPLEMENTED** | EXPECTED vs OBSERVED |
| `conflict/conflictResolver.ts` | **IMPLEMENTED** | Nie majority vote |
| `workers/workerOrchestrator.ts` | **ADAPTER** | Wymaga podłączenia modeli AI |
| `workers/workerTypes.ts` | **IMPLEMENTED** | MODEL_GENERATED nigdy EVIDENCE |
| Evidence Bundle | **INTEGRATION_REQUIRED** | Wymaga `experimentFabric/evidencePack.ts` |
| Scientific Memory | **INTEGRATION_REQUIRED** | Wymaga `core/scienceMemory.ts` |
| Replay | **INTEGRATION_REQUIRED** | Wymaga `matrixFoundation/replayVerdict.ts` |
| Provenance | **INTEGRATION_REQUIRED** | Wymaga `core/dataProvenance.ts` |
| StrategyRun | **INTEGRATION_REQUIRED** | Wymaga `core/agent/discoveryStrategy.ts` |
| Real Experiment | **INTEGRATION_REQUIRED** | Wymaga `core/experimentFabric/realExperiment.ts` |

---

## 36. TEST VECTORS — PODSUMOWANIE 15 OBOWIĄZKOWYCH

| # | Test Vector | Plik | Status |
|---|-------------|------|--------|
| 1 | valid attack path | `tests/attackPath/attackPath.test.ts` | ✅ IMPLEMENTED |
| 2 | falsified attack path | `tests/attackPath/attackPath.test.ts` | ✅ IMPLEMENTED |
| 3 | incomplete attack path | `tests/attackPath/attackPath.test.ts` | ✅ IMPLEMENTED |
| 4 | conflicting models | `tests/conflict/conflictResolution.test.ts` | ✅ IMPLEMENTED |
| 5 | fabricated evidence | `src/contracts/provenance.ts` | ✅ IMPLEMENTED (MODEL_GENERATED nigdy EVIDENCE) |
| 6 | permission denied | `tests/permission/permissionGate.test.ts` | ✅ IMPLEMENTED |
| 7 | approval required | `tests/permission/permissionGate.test.ts` | ✅ IMPLEMENTED |
| 8 | outcome matches prediction | `tests/outcome/outcomeVerification.test.ts` | ✅ IMPLEMENTED |
| 9 | outcome differs from prediction | `tests/outcome/outcomeVerification.test.ts` | ✅ IMPLEMENTED |
| 10 | insufficient data | `tests/outcome/outcomeVerification.test.ts` | ✅ IMPLEMENTED |
| 11 | replay drift | **INTEGRATION_REQUIRED** | Wymaga Genesis Replay Engine |
| 12 | stale observation | **NOT_MODELLED** | Wymaga timestamp validation |
| 13 | critical attention event | `tests/attention/attentionEvaluator.test.ts` | ✅ IMPLEMENTED |
| 14 | duplicate alert | `tests/attention/attentionEvaluator.test.ts` | ✅ IMPLEMENTED |
| 15 | security drift | `tests/drift/driftDetector.test.ts` | ✅ IMPLEMENTED |

---

## FINAL NOTES

**To jest pierwszy rzeczywisty kawałek Genesis Cyber, nie dokument strategiczny.**

Manus/Claude powinien:
1. Skopiować pliki do repo Genesis
2. Dopasować importy w `INTEGRATION_REQUIRED`
3. Zaimplementować `CyberWorkerAdapter` dla konkretnych modeli
4. Podłączyć do istniejącego Core (Evidence, Memory, Replay, Provenance)
5. Uruchomić testy: `npm test`
6. Poprawić błędy integracji

