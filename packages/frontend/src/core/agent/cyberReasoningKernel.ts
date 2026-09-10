import type {
  AttackPath,
  AttackPathEdge,
  AttackSurface,
  AttackSurfaceAsset,
  CyberInvestigationResult,
  CyberObservation,
  ObservableExpectation,
  ObservedResult,
  RemediationAction,
  SecurityTestResult,
  SecurityVerdict,
  VulnerabilityHypothesis,
} from './cyberInvestigation';

/**
 * CYBER REASONING KERNEL — pure, deterministic logic against a synthetic
 * target. Adapted from an external draft (Qwen), integrated after fixing
 * the one real defect its own author's addendum disclosed: attack-path
 * edges were re-using the hypothesis's own test/verdict instead of an
 * independent relation-specific test (see `executeRelationTests` below,
 * which replaces the draft's `executeAttackPathVerification`).
 *
 * NO Memory / Evidence / Replay / NextQuestion / StrategyRun / WorldGraph
 * here — those live in `scienceMemory.ts`'s `SavedCyberInvestigation`
 * (`buildSavedCyberInvestigation`/`saveCyberInvestigationToMemory`), which
 * this module has no dependency on. `toCyberInvestigationResult` at the
 * bottom is the one seam that hands this kernel's output to that shape.
 *
 * Every type imported from `./cyberInvestigation` is the SAME type
 * `scienceMemory.ts`'s `SavedCyberInvestigation` already validates against
 * — never a locally-redeclared copy.
 */

export const SENSITIVE_MARKERS = ['ADMIN_PANEL_SECRET', 'OWNER_RECORD', 'OTHER_OWNER_RECORD'] as const;
const isSensitive = (s: string): boolean => SENSITIVE_MARKERS.some((m) => s.includes(m));
const endpointOf = (assetId: string): string => assetId.split('::')[1] ?? '';

// ================= 1. SYNTHETIC TARGET =================

export interface FixtureOptions {
  /** Lies on purpose: kernel must NEVER read this. */
  readonly hiddenGroundTruthLies?: boolean;
  /** Remediation for /admin is accepted but does NOT change behavior. */
  readonly brokenRemediation?: boolean;
}

export class ToyVulnerableApp {
  readonly declaredRemediations: readonly string[] = ['admin-auth-fix', 'admin-auth-fix-broken'];
  /** Hidden ground truth — deliberately WRONG on two endpoints; never read by the kernel. */
  readonly hiddenGroundTruth: Readonly<Record<string, { vulnerable: boolean }>>;
  private applied = new Set<string>();
  private readonly broken: boolean;

  constructor(opts: FixtureOptions = {}) {
    this.broken = opts.brokenRemediation === true;
    const truth: Record<string, boolean> = {
      '/admin': true, '/profile': false, '/health': false,
      '/admin-backup-public': false, '/ambiguous': true,
    };
    if (opts.hiddenGroundTruthLies) { truth['/admin'] = false; truth['/admin-backup-public'] = true; }
    this.hiddenGroundTruth = Object.fromEntries(Object.entries(truth).map(([k, v]) => [k, { vulnerable: v }]));
  }

  routes(): readonly string[] { return ['/admin', '/profile', '/health', '/admin-backup-public', '/ambiguous']; }

  remediationFor(endpoint: string): string | null {
    if (endpoint !== '/admin') return null;
    return this.broken ? 'admin-auth-fix-broken' : 'admin-auth-fix';
  }

  applyRemediation(id: string): void {
    if (!this.declaredRemediations.includes(id)) throw new Error(`UNKNOWN_REMEDIATION_CONTROL: ${id}`);
    this.applied.add(id);
  }

  handleRequest(req: { method: string; endpoint: string; session?: string; targetOwner?: string }): ObservedResult {
    const ep = req.endpoint;
    if (ep === '/admin') {
      const fixed = this.applied.has('admin-auth-fix'); // the broken control changes nothing
      if (fixed && req.session !== 'alice') return { statusCode: 403, body: 'forbidden', responseSummary: 'AUTH_REQUIRED' };
      return { statusCode: 200, body: 'admin panel', responseSummary: 'ADMIN_PANEL_SECRET' };
    }
    if (ep === '/profile' || ep === '/admin-backup-public') { // safe: boundary + ownership enforced
      if (!req.session) return { statusCode: 401, body: 'unauthorized', responseSummary: 'AUTH_REQUIRED' };
      const target = req.targetOwner ?? req.session;
      if (target !== req.session) return { statusCode: 403, body: 'forbidden', responseSummary: 'AUTH_REQUIRED' };
      return { statusCode: 200, body: `record of ${req.session}`, responseSummary: 'OWNER_RECORD' };
    }
    if (ep === '/ambiguous') {
      if (!req.session) return { statusCode: 200, body: 'unclear', responseSummary: 'AMBIGUOUS_BODY' };
      if ((req.targetOwner ?? req.session) !== req.session) return { statusCode: 403, body: 'forbidden', responseSummary: 'AUTH_REQUIRED' };
      return { statusCode: 200, body: 'record', responseSummary: 'OWNER_RECORD' };
    }
    if (ep === '/health') return { statusCode: 200, body: 'ok', responseSummary: 'OK' };
    return { statusCode: 404, body: 'not found', responseSummary: 'NOT_FOUND' };
  }
}

// ================= OBSERVATION =================

const PROBES: readonly { session?: string; targetOwner?: string }[] = [
  { session: undefined, targetOwner: undefined },
  { session: 'alice', targetOwner: undefined },
  { session: 'alice', targetOwner: 'bob' },
];

export function collectObservations(app: ToyVulnerableApp): CyberObservation[] {
  const out: CyberObservation[] = [];
  for (const endpoint of app.routes()) {
    PROBES.forEach((p, i) => {
      const r = app.handleRequest({ method: 'GET', endpoint, session: p.session, targetOwner: p.targetOwner });
      out.push({ observationId: `obs:${endpoint}#${i}`, endpoint, method: 'GET', statusCode: r.statusCode, responseSummary: r.responseSummary });
    });
  }
  return out;
}

// ================= 2. ATTACK SURFACE (from observations only) =================

export function generateAttackSurface(observations: readonly CyberObservation[]): AttackSurfaceAsset[] {
  const assets: AttackSurfaceAsset[] = [];
  for (const ep of [...new Set(observations.map((o) => o.endpoint))]) {
    const epObs = observations.filter((o) => o.endpoint === ep);
    assets.push({ assetId: `ENDPOINT::${ep}`, kind: 'ENDPOINT', derivedFromObservationIds: epObs.map((o) => o.observationId) });
    const b = epObs.filter((o) => o.statusCode === 401 || o.statusCode === 403);
    if (b.length) assets.push({ assetId: `AUTH_BOUNDARY::${ep}`, kind: 'AUTH_BOUNDARY', derivedFromObservationIds: b.map((o) => o.observationId) });
    const d = epObs.filter((o) => isSensitive(o.responseSummary));
    if (d.length) assets.push({ assetId: `DATA_STORE::${ep}`, kind: 'DATA_STORE', derivedFromObservationIds: d.map((o) => o.observationId) });
  }
  return assets;
}

function buildTrustBoundaries(assets: readonly AttackSurfaceAsset[]): string[] {
  return assets.filter((a) => a.kind === 'AUTH_BOUNDARY').map((a) => `public->${endpointOf(a.assetId)}`);
}

// ================= 3. HYPOTHESIS GENERATION (data-driven, competing) =================

export function generateHypotheses(attackSurface: readonly AttackSurfaceAsset[]): VulnerabilityHypothesis[] {
  const hyps: VulnerabilityHypothesis[] = [];
  const sensitive = [...SENSITIVE_MARKERS];
  for (const ep of [...new Set(attackSurface.filter((a) => a.kind === 'ENDPOINT').map((a) => endpointOf(a.assetId)))]) {
    const endpointAsset = attackSurface.find((a) => a.kind === 'ENDPOINT' && endpointOf(a.assetId) === ep);
    const dataAsset = attackSurface.find((a) => a.kind === 'DATA_STORE' && endpointOf(a.assetId) === ep);
    const boundaryAsset = attackSurface.find((a) => a.kind === 'AUTH_BOUNDARY' && endpointOf(a.assetId) === ep);
    if (!endpointAsset || !dataAsset) continue;
    // Competing explanation 1: boundary missing/bypassed.
    hyps.push({
      hypothesisId: `hyp:AUTH_BYPASS::${ep}`, kind: 'AUTH_BYPASS',
      statement: `Unauthenticated access to ${ep} yields sensitive data (boundary absent or bypassed).`,
      derivedFromAssetIds: [endpointAsset.assetId, dataAsset.assetId],
      falsifier: { predictedObservable: { statusCode: 200, summaryContains: sensitive }, falsifyingObservable: { statusCodeIn: [401, 403] } },
    });
    // Competing explanation 2: disclosure is intentional/public, not a bypass.
    hyps.push({
      hypothesisId: `hyp:INFO_DISCLOSURE::${ep}`, kind: 'INFO_DISCLOSURE',
      statement: `${ep} discloses record-level data to unauthenticated callers by design, not by bypass.`,
      derivedFromAssetIds: [dataAsset.assetId],
      falsifier: { predictedObservable: { statusCode: 200, summaryContains: sensitive, summaryNotContains: ['AUTH_REQUIRED'] }, falsifyingObservable: { statusCodeIn: [401, 403, 404] } },
    });
    // Competing explanation 3 (only if a boundary was observed): cross-privilege read.
    if (boundaryAsset) {
      hyps.push({
        hypothesisId: `hyp:PRIVILEGE_ESCALATION::${ep}`, kind: 'PRIVILEGE_ESCALATION',
        statement: `An authenticated low-privilege session can read another owner's record at ${ep}.`,
        derivedFromAssetIds: [boundaryAsset.assetId, dataAsset.assetId],
        falsifier: { predictedObservable: { statusCode: 200, summaryContains: ['OTHER_OWNER_RECORD'] }, falsifyingObservable: { statusCodeIn: [401, 403] } },
      });
    }
  }
  return hyps;
}

/** Co-surviving competing hypotheses per endpoint (unresolved by current evidence). */
export function competingGroups(hypotheses: readonly VulnerabilityHypothesis[], verdicts: readonly SecurityVerdict[]): string[][] {
  const byEp = new Map<string, string[]>();
  for (const h of hypotheses) {
    const v = verdicts.find((x) => x.hypothesisId === h.hypothesisId);
    if (v?.assessment !== 'SUPPORTED_WITHIN_PROTOCOL') continue;
    const ep = endpointOf(h.derivedFromAssetIds[0] ?? '');
    byEp.set(ep, [...(byEp.get(ep) ?? []), h.hypothesisId]);
  }
  return [...byEp.values()].filter((g) => g.length > 1);
}

// ================= 4. TEST DESIGN + CONTROLLED EXECUTION =================

export interface TestDesign { readonly probeLabel: string; readonly method: string; readonly endpoint: string; readonly session?: string; readonly targetOwner?: string; }

export function designTest(hypothesis: VulnerabilityHypothesis): TestDesign {
  const ep = endpointOf(hypothesis.derivedFromAssetIds[0] ?? '');
  if (hypothesis.kind === 'PRIVILEGE_ESCALATION') return { probeLabel: 'cross-owner-read', method: 'GET', endpoint: ep, session: 'alice', targetOwner: 'bob' };
  if (hypothesis.kind === 'INJECTION') return { probeLabel: 'reflected-input', method: 'GET', endpoint: ep, session: undefined };
  return { probeLabel: 'unauthenticated-access', method: 'GET', endpoint: ep, session: undefined };
}

export function runSecurityTest(hypothesis: VulnerabilityHypothesis, target: ToyVulnerableApp, testIdSuffix = ''): SecurityTestResult {
  const d = designTest(hypothesis);
  const r = target.handleRequest({ method: d.method, endpoint: d.endpoint, session: d.session, targetOwner: d.targetOwner });
  return {
    testId: `test:${hypothesis.hypothesisId}${testIdSuffix ? ':' + testIdSuffix : ''}`,
    hypothesisId: hypothesis.hypothesisId,
    executedAt: new Date().toISOString(),
    observedResult: r,
    provenance: 'SIMULATED',
  };
}

// ================= 5. VERDICT (observation-only) =================

function matches(exp: ObservableExpectation, obs: ObservedResult): boolean {
  if (exp.statusCode !== undefined && obs.statusCode !== exp.statusCode) return false;
  if (exp.statusCodeIn && !exp.statusCodeIn.includes(obs.statusCode)) return false;
  if (exp.summaryContains && !exp.summaryContains.some((m) => obs.responseSummary.includes(m))) return false;
  if (exp.summaryNotContains && exp.summaryNotContains.some((m) => obs.responseSummary.includes(m))) return false;
  return true;
}

export function judgeVerdict(hypothesis: VulnerabilityHypothesis, testResult: SecurityTestResult): SecurityVerdict {
  const obs = testResult.observedResult; // only observable input
  if (matches(hypothesis.falsifier.falsifyingObservable, obs)) {
    return { hypothesisId: hypothesis.hypothesisId, assessment: 'FALSIFIED_WITHIN_PROTOCOL', reasoning: `Falsifying observable matched (status=${obs.statusCode}, summary=${obs.responseSummary}).` };
  }
  if (matches(hypothesis.falsifier.predictedObservable, obs)) {
    return { hypothesisId: hypothesis.hypothesisId, assessment: 'SUPPORTED_WITHIN_PROTOCOL', reasoning: `Predicted observable matched (status=${obs.statusCode}, summary=${obs.responseSummary}).` };
  }
  return { hypothesisId: hypothesis.hypothesisId, assessment: 'INCONCLUSIVE', reasoning: `Observed result matches neither prediction nor falsifier (status=${obs.statusCode}, summary=${obs.responseSummary}).` };
}

// ================= 7. ATTACK PATH =================

function edgeEndpoints(h: VulnerabilityHypothesis): { from: string; to: string } {
  const ep = endpointOf(h.derivedFromAssetIds[0] ?? '');
  const from = h.kind === 'PRIVILEGE_ESCALATION' ? `AUTH_BOUNDARY::${ep}` : `ENDPOINT::${ep}`;
  const to = h.derivedFromAssetIds.find((id) => id.startsWith('DATA_STORE::')) ?? `DATA_STORE::${ep}`;
  return { from, to };
}

/** Safe default: without relation-specific evidence (see `executeRelationTests`), every edge is INCONCLUSIVE — never inherited from a hypothesis verdict. */
export function buildAttackPath(hypotheses: readonly VulnerabilityHypothesis[]): AttackPathEdge[] {
  return hypotheses.map((h) => {
    const { from, to } = edgeEndpoints(h);
    return { fromAssetId: from, toAssetId: to, derivedFromTestIds: [], status: 'INCONCLUSIVE' as const };
  });
}

/**
 * RELATION-SPECIFIC EDGE EVIDENCE — each edge gets its own R1 (relation
 * probe) + R2 (control probe); status is decided from the (R1, R2) PAIR,
 * never from the hypothesis's own verdict. This is what an earlier draft
 * of this kernel got wrong (it re-used `runSecurityTest`+`judgeVerdict` on
 * the hypothesis itself and copied that verdict onto the edge — functionally
 * indistinguishable from "both endpoints SUPPORTED, so the edge is too").
 *
 * ENDPOINT -> DATA_STORE (AUTH_BYPASS / INFO_DISCLOSURE):
 *   R1 = unauthenticated probe on the endpoint: does sensitive data flow out?
 *   R2 = a control probe on an endpoint with NO declared DATA_STORE (here,
 *        `/health`): the sensitive marker must NOT appear there, or R1's
 *        marker match proves nothing about attribution to THIS store.
 *   SUPPORTED  = R1 leaks the marker AND R2 stays clean.
 *   FALSIFIED  = R1 does not leak (access denied/absent).
 *   INCONCLUSIVE = R2 is contaminated (control itself leaks) — cannot attribute.
 *
 * AUTH_BOUNDARY -> DATA_STORE (PRIVILEGE_ESCALATION):
 *   R1 = cross-owner probe (alice requesting bob's record): is the OTHER
 *        owner's data reachable through the boundary?
 *   R2 = own-owner probe (alice requesting alice's own record): proves the
 *        store is reachable for an authorized owner, so R1's outcome is a
 *        boundary DECISION, not merely "the store doesn't exist".
 *   SUPPORTED  = R1 leaks another owner's record AND R2 succeeds.
 *   FALSIFIED  = R1 is denied AND R2 succeeds (the boundary correctly guards).
 *   INCONCLUSIVE = R2 fails (store unreachable even for its owner — nothing to attribute).
 */
export function executeRelationTests(app: ToyVulnerableApp, hypotheses: readonly VulnerabilityHypothesis[]): AttackPathEdge[] {
  return hypotheses.map((h) => {
    const ep = endpointOf(h.derivedFromAssetIds[0] ?? '');
    const { from, to } = edgeEndpoints(h);

    if (h.kind === 'PRIVILEGE_ESCALATION') {
      const r1 = app.handleRequest({ method: 'GET', endpoint: ep, session: 'alice', targetOwner: 'bob' });
      const r2 = app.handleRequest({ method: 'GET', endpoint: ep, session: 'alice', targetOwner: 'alice' });
      const r1Id = `test:relation:${h.hypothesisId}:R1`;
      const r2Id = `test:relation:${h.hypothesisId}:R2`;
      const r2Ok = r2.statusCode === 200 && isSensitive(r2.responseSummary);
      if (!r2Ok) return { fromAssetId: from, toAssetId: to, derivedFromTestIds: [r1Id, r2Id], status: 'INCONCLUSIVE' as const };
      const leaked = r1.statusCode === 200 && r1.responseSummary.includes('OTHER_OWNER_RECORD');
      const denied = r1.statusCode === 401 || r1.statusCode === 403;
      const status = leaked ? 'SUPPORTED_WITHIN_PROTOCOL' as const : denied ? 'FALSIFIED_WITHIN_PROTOCOL' as const : 'INCONCLUSIVE' as const;
      return { fromAssetId: from, toAssetId: to, derivedFromTestIds: [r1Id, r2Id], status };
    }

    // AUTH_BYPASS / INFO_DISCLOSURE: ENDPOINT -> DATA_STORE
    const r1 = app.handleRequest({ method: 'GET', endpoint: ep });
    const r2 = app.handleRequest({ method: 'GET', endpoint: '/health' });
    const r1Id = `test:relation:${h.hypothesisId}:R1`;
    const r2Id = `test:relation:${h.hypothesisId}:R2`;
    const controlClean = !isSensitive(r2.responseSummary);
    if (!controlClean) return { fromAssetId: from, toAssetId: to, derivedFromTestIds: [r1Id, r2Id], status: 'INCONCLUSIVE' as const };
    const leaked = r1.statusCode === 200 && isSensitive(r1.responseSummary);
    const status = leaked ? 'SUPPORTED_WITHIN_PROTOCOL' as const : 'FALSIFIED_WITHIN_PROTOCOL' as const;
    return { fromAssetId: from, toAssetId: to, derivedFromTestIds: [r1Id, r2Id], status };
  });
}

// ================= 8. REMEDIATION + INDEPENDENT RETEST =================

export function createRemediation(app: ToyVulnerableApp, hypothesis: VulnerabilityHypothesis): RemediationAction | null {
  const ep = endpointOf(hypothesis.derivedFromAssetIds[0] ?? '');
  const control = app.remediationFor(ep); // id comes FROM the app, never invented
  if (!control) return null;
  return { remediationId: control, targetAssetId: `ENDPOINT::${ep}`, description: `Enable ${control} on ${ep}` };
}

export function applyRemediation(app: ToyVulnerableApp, action: RemediationAction): void { app.applyRemediation(action.remediationId); }

export function retest(hypothesis: VulnerabilityHypothesis, app: ToyVulnerableApp, suffix = 'retest'): SecurityTestResult {
  return runSecurityTest(hypothesis, app, suffix); // fresh execution, new testId
}

// ================= 9. SECURITY OUTCOME VERIFICATION =================

export interface OutcomeVerification { readonly verified: boolean; readonly reasoning: string; readonly beforeViolated: boolean; readonly afterViolated: boolean; }
const violates = (obs: ObservedResult): boolean => obs.statusCode === 200 && isSensitive(obs.responseSummary);

export function verifySecurityOutcome(before: SecurityTestResult, after: SecurityTestResult): OutcomeVerification {
  const bv = violates(before.observedResult);
  const av = violates(after.observedResult);
  if (bv === av) {
    return { verified: false, beforeViolated: bv, afterViolated: av, reasoning: `No observable change in security property (before violated=${bv}, after violated=${av}). NOT VERIFIED.` };
  }
  if (bv && !av) {
    return { verified: true, beforeViolated: bv, afterViolated: av, reasoning: `Unauthenticated sensitive access went from allowed (status=${before.observedResult.statusCode}) to denied (status=${after.observedResult.statusCode}). VERIFIED.` };
  }
  return { verified: false, beforeViolated: bv, afterViolated: av, reasoning: `Property changed in unexpected direction (before violated=${bv}, after violated=${av}). NOT VERIFIED.` };
}

// ================= ORCHESTRATOR + TRACE =================

export interface TraceStep { readonly stage: string; readonly detail: string; }
export interface InvestigationTrace {
  readonly steps: readonly TraceStep[];
  readonly observations: readonly CyberObservation[];
  readonly assets: readonly AttackSurfaceAsset[];
  readonly hypotheses: readonly VulnerabilityHypothesis[];
  readonly tests: readonly SecurityTestResult[];
  readonly verdicts: readonly SecurityVerdict[];
  readonly edges: readonly AttackPathEdge[];
  readonly competing: readonly string[][];
}

export function runInvestigation(app: ToyVulnerableApp): InvestigationTrace {
  const steps: TraceStep[] = [];
  const observations = collectObservations(app);
  steps.push({ stage: 'OBSERVATION', detail: `${observations.length} probes` });
  const assets = generateAttackSurface(observations);
  steps.push({ stage: 'ATTACK_SURFACE', detail: assets.map((a) => a.assetId).join(', ') });
  const hypotheses = generateHypotheses(assets);
  steps.push({ stage: 'HYPOTHESIS', detail: hypotheses.map((h) => h.hypothesisId).join(', ') });
  steps.push({ stage: 'FALSIFIER', detail: hypotheses.map((h) => `${h.hypothesisId}:fals=${JSON.stringify(h.falsifier.falsifyingObservable)}`).join(' | ') });
  const tests = hypotheses.map((h) => runSecurityTest(h, app));
  steps.push({ stage: 'TEST', detail: tests.map((t) => t.testId).join(', ') });
  const verdicts = hypotheses.map((h, i) => judgeVerdict(h, tests[i]!));
  verdicts.forEach((v) => steps.push({ stage: 'OBSERVED_RESULT/VERDICT', detail: `${v.hypothesisId} -> ${v.assessment}` }));
  const edges = executeRelationTests(app, hypotheses);
  steps.push({ stage: 'ATTACK_PATH', detail: edges.map((e) => `${e.fromAssetId}->${e.toAssetId}:${e.status}(${e.derivedFromTestIds.length})`).join(', ') });
  const competing = competingGroups(hypotheses, verdicts);
  steps.push({ stage: 'COMPETING', detail: competing.map((g) => g.join('+')).join(' vs ') || 'none' });
  return { steps, observations, assets, hypotheses, tests, verdicts, edges, competing };
}

// ================= SEAM TO SCIENCE MEMORY =================

/**
 * The one place this kernel's output becomes the canonical
 * `CyberInvestigationResult` (`cyberInvestigation.ts`), ready for
 * `buildSavedCyberInvestigation`/`saveCyberInvestigationToMemory`
 * (`scienceMemory.ts`) — which this module never calls itself.
 */
export function toCyberInvestigationResult(
  investigationId: string,
  goal: string,
  trace: InvestigationTrace,
  extras: {
    readonly remediation?: RemediationAction | null;
    readonly retestResult?: SecurityTestResult | null;
    readonly retestVerdict?: SecurityVerdict | null;
  } = {},
): CyberInvestigationResult {
  const attackSurface: AttackSurface = { assets: trace.assets, trustBoundaries: buildTrustBoundaries(trace.assets) };
  const attackPath: AttackPath = {
    assetIds: [...new Set(trace.edges.flatMap((e) => [e.fromAssetId, e.toAssetId]))],
    edges: trace.edges,
  };
  return {
    investigationId,
    goal,
    observations: trace.observations,
    attackSurface,
    hypotheses: trace.hypotheses,
    testResults: trace.tests,
    verdicts: trace.verdicts,
    attackPath,
    remediation: extras.remediation ?? null,
    retestResult: extras.retestResult ?? null,
    retestVerdict: extras.retestVerdict ?? null,
  };
}
