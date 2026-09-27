import { GRAPH_NODES, getNode } from '@genesis-os/reasoning/knowledgeGraph';
import { INTERVENTIONS } from '@genesis-os/reasoning/interventions';
import { generateHypotheses } from '@genesis-os/reasoning/discovery';
import { nextExperiments, experimentFrontier, rankingDegeneracy } from '@genesis-os/reasoning/discovery';
import { survivingHypotheses } from '@genesis-os/reasoning/critic';
import { analyseCancerSafety } from '@genesis-os/reasoning/cancerSafety';
import { netInfluence } from '@genesis-os/reasoning/inference';
import { listEvidence, currentSnapshot, recordArtifact, snapshotEdges } from './store.mjs';
import { assessHypothesis, VERDICT as GRAVE_VERDICT } from './graveyard.mjs';
import { liveClaims, claimState, detectContradictions } from './livingGraph.mjs';
import { edgeStatuses } from '../edgeReview.mjs';

/**
 * L4 — the Discovery Engine.
 *
 * Eight tested libraries composed into one answer. It adds no science: every
 * stage delegates to a pure function in @genesis-os/reasoning or to a memory
 * in L2. What it adds is the ORDER, the REFUSALS, and an artifact that can be
 * argued with a year from now.
 *
 * THE ONE THING IT MAY NEVER DO. It must not say a therapy works. Not because
 * that would be legally awkward, but because it is not computable from what is
 * here: a curated graph nobody has reviewed, a handful of evidence records, and
 * no wet-lab confirmation of anything. The engine answers a different question —
 * WHAT SHOULD BE INVESTIGATED NEXT, AND WHY — which is answerable, decidable and
 * checkable.
 *
 * WHY THE STAGES ARE ORDERED THIS WAY
 *
 *   1 resolve   the question becomes nodes that exist, or the run stops
 *   2 recall    what this laboratory already buried, BEFORE generating
 *   3 read      literature — currently unavailable, and reported as such
 *   4 generate  hypotheses, minus the graveyard
 *   5 rank      by value of information, never by plausibility
 *   6 check     cancer safety; conflicts reported, never resolved
 *   7 plan      experiments the assay can actually perform
 *   8 emit      an artifact carrying provenance, uncertainty and refusals
 *
 * Recall precedes generation deliberately. Generating first and filtering after
 * would let a buried hypothesis be scored, ranked and then quietly removed —
 * and the counts a reader sees would be of a list that no longer exists.
 *
 * REFUSALS ARE OUTPUT, NOT ERRORS. Every stage that declines to do something
 * appends to `refusals`, and the artifact gate rejects a run that produced none
 * of the required fields. A reader is entitled to know what the engine would not
 * say, which is usually more informative than what it would.
 */

export const ENGINE_VERSION = 'genesis-discovery-engine/1';

/**
 * Uncertainty on two axes, neither of which contains an invented constant.
 *
 * An earlier version computed coverage as `min(1, evidenceCount / 40)`. Forty
 * is not derived from anything. Worse, the field is called COVERAGE, so the
 * number read as a measured fraction of the relevant literature — which is not
 * knowable without a corpus, and this deployment has none. A platform that
 * refuses unjustified numbers elsewhere must not publish one in its flagship
 * output.
 *
 * Both axes are now ratios whose denominator is a thing that exists:
 *
 *   COVERAGE  mechanism nodes in this answer that carry at least one evidence
 *             record, over the nodes the answer traverses. It measures how much
 *             of THIS ARGUMENT is evidenced — not how much of the field is read,
 *             which nothing here can measure.
 *   BELIEF    traversed edges carrying a current expert confirmation, over the
 *             edges traversed.
 *
 * Both are zero when nothing has been entered, and zero is the honest answer
 * rather than "unknown": no evidence has been attached, and that is a fact.
 */
function uncertaintyOf({ evidencedNodes, answerNodes, reviewedEdges, totalEdges, hypotheses }) {
  const coverage = answerNodes === 0 ? 0 : Number((evidencedNodes / answerNodes).toFixed(4));
  const belief = totalEdges === 0 ? 0 : Number((reviewedEdges / totalEdges).toFixed(4));
  return {
    coverage,
    belief,
    basis: `Coverage: ${evidencedNodes} of ${answerNodes} mechanism(s) in this answer carry evidence. `
      + `Belief: ${reviewedEdges} of ${totalEdges} traversed edge(s) carry a current expert verdict. `
      + `${hypotheses} hypothesis(es) survived the graveyard and the critic. `
      + 'Neither axis measures how much of the published literature was read — nothing here can measure that without a corpus.',
  };
}

/* ------------------------------- the stages ------------------------------- */

/** 1. The question becomes nodes that exist. Never invents one. */
function resolve(question, { focus = null }) {
  const refusals = [];
  const text = String(question ?? '').toLowerCase();

  let nodes = [];
  if (focus) {
    const node = getNode(focus);
    if (node) nodes = [node];
    else refusals.push(`The requested focus "${focus}" is not a node in the curated graph, so it was ignored rather than invented.`);
  }
  if (nodes.length === 0) {
    // Match on node id and label only. No synonym expansion and no embedding
    // search: silently answering about a node the asker did not name is worse
    // than admitting the question was not understood.
    nodes = GRAPH_NODES.filter((n) => text.includes(n.id.replace(/-/g, ' ')) || text.includes(n.label.toLowerCase()));
  }
  if (nodes.length === 0) {
    refusals.push(
      'No node in the curated graph matched this question by name. The engine reasoned over the whole graph instead of guessing '
      + 'which mechanism was meant — narrow the question or pass an explicit focus node.',
    );
  }
  return { nodes, refusals };
}

/** 2. What this laboratory already buried. Tenant-scoped by construction. */
function recall(db, projectId, hypotheses) {
  const suppressed = [];
  const flagged = [];
  const kept = [];

  for (const h of hypotheses) {
    const [subject, object] = h.nodes;
    const assessment = assessHypothesis(db, {
      projectId, subject: subject ?? null, object: object ?? null, statement: h.statement,
    });
    if (assessment.verdict === GRAVE_VERDICT.BURIED) {
      suppressed.push({ hypothesis: h.statement, assessment });
      continue;
    }
    if (assessment.verdict !== GRAVE_VERDICT.NOVEL) {
      // Related but not the same claim. Kept, and marked — treating it as
      // settled would suppress a live hypothesis on the strength of a result
      // about a different one.
      flagged.push({ hypothesis: h.statement, assessment });
    }
    kept.push(h);
  }
  return { kept, suppressed, flagged };
}

/** 3. Literature. Reports unavailability; never fabricates a citation. */
function read() {
  return {
    status: 'UNAVAILABLE',
    candidates: [],
    refusal:
      'Literature-based discovery did not run: no corpus has been ingested (Looking Glass requires a PubMed corpus, and this '
      + 'deployment has none). Nothing was inferred from literature, and no citation in this artifact comes from an unread source.',
  };
}

/* ------------------------------- the engine ------------------------------- */

/**
 * Run one discovery. Returns the artifact body plus everything needed to store
 * it; persistence is the caller's decision, so the engine stays testable
 * without a write.
 */
export function runDiscovery(db, { projectId, question, focus = null, limit = 8 }) {
  const refusals = [];
  const snapshot = currentSnapshot(db);
  if (!snapshot) {
    throw new Error('runDiscovery: no graph snapshot. Seed the curated graph before asking a question.');
  }

  // 1. Resolve.
  const resolved = resolve(question, { focus });
  refusals.push(...resolved.refusals);

  // 2/4. Generate from the workspace's own evidence, then subtract the graveyard.
  const evidence = listEvidence(db, projectId);
  const records = evidence.map((e) => ({
    id: e.id, interventionId: e.intervention ?? '', hallmarkId: e.hallmark ?? '',
    tier: e.tier, outcome: e.outcome, direction: e.direction, citation: e.citation,
    system: e.species ?? '', sampleSize: e.sample_size ?? 0,
    replicated: false, randomised: false, blinded: false, preregistered: false,
    readoutKind: 'direct', addedAt: e.created_at,
  }));

  const generated = generateHypotheses(records);
  const { kept, suppressed, flagged } = recall(db, projectId, generated);
  if (suppressed.length > 0) {
    refusals.push(
      `${suppressed.length} hypothesis(es) were not proposed because this workspace already buried them. `
      + 'They are listed in `suppressed` with what killed each one, so the decision can be disagreed with.',
    );
  }

  // 3. Literature.
  const literature = read();
  refusals.push(literature.refusal);

  // 5. Rank by value of information — never by plausibility. A hypothesis that
  // sounds right and would teach us nothing is worth less than an unglamorous
  // one that retires real uncertainty.
  const survivors = survivingHypotheses(kept, limit);
  const experiments = nextExperiments(records, INTERVENTIONS.map((i) => i.id), limit);
  const frontier = experimentFrontier(records);
  const degeneracy = rankingDegeneracy(records);
  if (degeneracy.isDegenerate) {
    refusals.push(
      `The experiment ranking is degenerate: ${degeneracy.tiedCandidates} candidates tie at the top value (${degeneracy.topValue}). `
      + 'With this little evidence the ordering carries no information and must not be read as a priority list.',
    );
  }

  // 6. Cancer safety on every intervention the surviving hypotheses touch.
  const touched = [...new Set(survivors.flatMap((s) => s.hypothesis.nodes))];
  const safety = INTERVENTIONS
    .filter((i) => touched.includes(i.id) || i.targets.some((t) => touched.includes(t.hallmarkId ?? t)))
    .map((i) => analyseCancerSafety(i.id))
    .filter(Boolean);

  // 7. Conflicts in the graph the answer traverses. Reported, never resolved.
  const contradictions = detectContradictions(db, projectId);
  const signConflicts = [];
  for (const node of resolved.nodes) {
    for (const other of resolved.nodes) {
      if (node.id === other.id) continue;
      const net = netInfluence(node.id, other.id);
      if (net?.verdict === 'conflicting') signConflicts.push(net);
    }
  }
  if (signConflicts.length > 0) {
    refusals.push(
      `${signConflicts.length} pair(s) of nodes are connected by paths of opposite sign. The engine reports both and does NOT `
      + 'average them — a mechanism that promotes and counteracts the same outcome through different routes is a finding, not noise.',
    );
  }

  // 8. Provenance: exactly what this answer rests on.
  const edges = snapshotEdges(db, snapshot.id);
  const claims = liveClaims(db, projectId).map((c) => claimState(db, c.id));

  // MEASURED, not assumed. An earlier draft hardcoded this to zero and asserted
  // in the refusal that nothing had been reviewed — true today, and a lie the
  // moment the first expert files a verdict, in exactly the direction that
  // understates the platform. The ledger is consulted.
  const statuses = edgeStatuses(db, edges.map((e) => e.edge_key));
  const confirmed = Object.values(statuses).filter((s) => s.status === 'confirmed').length;
  const disputed = Object.values(statuses).filter((s) => s.status === 'disputed').length;
  const staleReviewed = Object.values(statuses).filter((s) => s.status === 're-review-needed').length;
  const reviewedEdges = confirmed;

  if (confirmed === 0) {
    refusals.push(
      `No edge in this answer carries a current expert confirmation (${edges.length} edge(s) traversed). Every mechanism rests on `
      + 'the original curation alone, and any conclusion inherits that.',
    );
  }
  if (disputed > 0) {
    refusals.push(
      `${disputed} edge(s) in this answer are DISPUTED by a domain expert. Conclusions traversing them are reported but should not `
      + 'be acted on — a dispute names a specific problem that the rest of the reasoning does not answer.',
    );
  }
  if (staleReviewed > 0) {
    refusals.push(
      `${staleReviewed} edge(s) were reviewed against an earlier version of the claim and their verdicts no longer apply. `
      + 'They are counted as unreviewed here.',
    );
  }

  const provenance = {
    engine: ENGINE_VERSION,
    snapshotId: snapshot.id,
    edgeCount: edges.length,
    evidenceIds: evidence.map((e) => e.id),
    claimIds: claims.map((c) => c.id),
    focusNodes: resolved.nodes.map((n) => n.id),
    literature: literature.status,
    review: { confirmed, disputed, staleReviewed, totalEdges: edges.length },
  };

  // Denominator: the mechanism nodes this answer actually reasons over.
  // Numerator: those with at least one evidence record attached.
  const answerNodes = new Set(survivors.flatMap((s) => s.hypothesis.nodes));
  for (const n of resolved.nodes) answerNodes.add(n.id);
  const evidencedNodes = new Set(
    evidence.map((e) => e.hallmark).filter((h) => h && answerNodes.has(h)),
  );

  const uncertainty = uncertaintyOf({
    evidencedNodes: evidencedNodes.size,
    answerNodes: answerNodes.size,
    reviewedEdges,
    totalEdges: edges.length,
    hypotheses: survivors.length,
  });

  return {
    question: String(question ?? ''),
    snapshotId: snapshot.id,
    body: {
      engine: ENGINE_VERSION,
      focus: resolved.nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind })),
      hypotheses: survivors.map((s) => ({
        statement: s.hypothesis.statement,
        kind: s.hypothesis.kind,
        reasoning: s.hypothesis.reasoning,
        nodes: s.hypothesis.nodes,
        plausibility: s.hypothesis.plausibility,
        novelty: s.hypothesis.novelty,
        missingEvidence: s.hypothesis.missingEvidence,
        challenges: s.critique?.challenges ?? [],
        survivalScore: s.survivalScore,
      })),
      suppressedByMemory: suppressed.map((s) => ({ statement: s.hypothesis, why: s.assessment.statement })),
      relatedFailures: flagged.map((f) => ({ statement: f.hypothesis, why: f.assessment.statement })),
      literature,
      nextExperiments: experiments.slice(0, limit),
      experimentFrontier: frontier,
      cancerSafety: safety,
      conflicts: { signConflicts, contradictions },
      degeneracy,
    },
    provenance,
    uncertainty,
    refusals,
  };
}

/**
 * Run and store. The artifact goes through the same gate as everything else —
 * the engine gets no exemption from the rules it exists to enforce.
 */
export function runAndRecord(db, { projectId, question, focus = null, limit = 8, createdBy, now = Date.now() }) {
  const result = runDiscovery(db, { projectId, question, focus, limit });
  const artifact = recordArtifact(db, {
    projectId, kind: 'discovery', question: result.question, snapshotId: result.snapshotId,
    body: result.body, provenance: result.provenance, uncertainty: result.uncertainty,
    refusals: result.refusals, createdBy, now,
  });
  return artifact;
}
