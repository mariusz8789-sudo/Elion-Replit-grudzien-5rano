import { useEffect, useMemo, useState } from 'react';
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { Icon } from '../Icon';
import { getToken } from '../../core/backend/session';
import { GRAPH_EDGES, getNode, type GraphEdge } from '@genesis-os/reasoning/knowledgeGraph';

/**
 * Expert review surface.
 *
 * This is a RECRUITMENT INSTRUMENT, not an internal tool, and the design follows
 * from one observation: a domain expert who receives a cold email will not create
 * an account to review a stranger's graph. They have five minutes between
 * teaching commitments.
 *
 * So the flow is inverted from the usual one:
 *
 *   read without an account  →  see one edge, not sixty-six  →  see the credit
 *   on offer  →  sign in only at the moment of submitting a verdict
 *
 * A deep link (#/review?edge=…) opens a single edge in the reviewer's own field.
 * That turns "I must find a biologist" into "I can email fifty biologists a link
 * each to one edge in their specialty" — a channel rather than a hunt.
 */

const API = '/api';

/** One entry from GET /api/reasoning/review-priority. Public, no account needed. */
interface CriticalEdge {
  edgeKey: string;
  from: string;
  to: string;
  effect: string | null;
  why: string;
  reviewStatus: string;
  score: number;
}

export type EdgeVerdict = 'confirm' | 'dispute' | 'refine' | 'insufficient-expertise';

interface EdgeStatus {
  edgeKey: string;
  status: 'unreviewed' | 'confirmed' | 'disputed' | 'refinement-proposed' | 'awaiting-expertise';
  reviewCount: number; confirms: number; disputes: number; refinements: number; declined: number;
  reviewers: { name: string; orcid: string | null; affiliation: string; verdict: string; confidence: string; comment: string; citation: string; at: number }[];
  basis: string;
}

/** Stable key matching the backend's convention: from→to→kind. */
export function edgeKeyOf(edge: GraphEdge): string {
  return `${edge.from}→${edge.to}→${edge.kind}`;
}

const STATUS_KIND: Record<EdgeStatus['status'], 'ok' | 'warn' | 'blocked' | 'info'> = {
  confirmed: 'ok', disputed: 'blocked', 'refinement-proposed': 'warn',
  'awaiting-expertise': 'warn', unreviewed: 'info',
};

const VERDICT_COPY: Record<EdgeVerdict, { label: string; help: string }> = {
  confirm: { label: 'This is correct', help: 'The relationship and its direction are right as stated.' },
  dispute: { label: 'This is wrong', help: 'Say what is wrong. An unexplained dispute blocks the edge without telling anyone how to fix it — so a reason is required.' },
  refine: { label: 'Right idea, wrong wording', help: 'Accept the relationship but propose a better statement of the mechanism.' },
  'insufficient-expertise': { label: 'Not my field', help: 'A genuinely useful answer: it tells us this edge needs a different specialist.' },
};

export function EdgeReviewScreen({ initialEdgeKey }: { initialEdgeKey?: string }) {
  const edges = useMemo(() => GRAPH_EDGES.filter((e) => e.kind === 'mechanistic' || e.kind === 'oncogenic-coupling'), []);
  const [edgeKey, setEdgeKey] = useState(() => initialEdgeKey ?? edgeKeyOf(edges[0]));
  const edge = useMemo(() => edges.find((e) => edgeKeyOf(e) === edgeKey) ?? edges[0], [edges, edgeKey]);

  const [status, setStatus] = useState<EdgeStatus | null>(null);
  const [coverage, setCoverage] = useState<{ reviewed: number; total: number; reviewers: number } | null>(null);
  const [verdict, setVerdict] = useState<EdgeVerdict>('confirm');
  const [comment, setComment] = useState('');
  const [citation, setCitation] = useState('');
  const [proposed, setProposed] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [priority, setPriority] = useState<CriticalEdge[] | null>(null);

  const signedIn = Boolean(getToken());

  const load = () => {
    // Which claims actually decide what Genesis concludes. Public, so this
    // loads before any sign-in — it is the argument for spending the hour.
    void fetch(`${API}/reasoning/review-priority?limit=5`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPriority(d?.worklist ?? null))
      .catch(() => setPriority(null));
    void fetch(`${API}/review/edge/${encodeURIComponent(edgeKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStatus(d.status))
      .catch(() => setStatus(null));
    void fetch(`${API}/review/coverage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ edgeKeys: edges.map(edgeKeyOf) }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCoverage(d.coverage))
      .catch(() => setCoverage(null));
  };

  useEffect(load, [edgeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    const token = getToken();
    if (!token) { setMessage('Sign in to record your verdict. Reading an edge never requires an account.'); return; }
    setBusy(true); setMessage(null);
    void fetch(`${API}/review/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ edgeKey, verdict, comment, citation, proposedMechanism: proposed || null }),
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) { setMessage(body.message ?? 'Could not record the review.'); return; }
        setMessage('Recorded. Your name is now attached to this edge.');
        setComment(''); setCitation(''); setProposed('');
        load();
      })
      .catch(() => { setBusy(false); setMessage('Network error — the review was not recorded.'); });
  };

  const fromLabel = getNode(edge.from)?.label ?? String(edge.from);
  const toLabel = getNode(edge.to)?.label ?? String(edge.to);
  const shareLink = `${window.location.origin}/#/review?edge=${encodeURIComponent(edgeKey)}`;

  return (
    <>
      {priority && priority.length > 0 ? (
        <Panel
          title="Where your hour would change the most"
          icon="target"
          right={<StatusPill kind="warn">{priority.length} of many</StatusPill>}
        >
          <p className="ds-note">
            Most edges in the graph change nothing when removed. These are the ones every conclusion rests on —
            computed, not chosen. Reviewing one of these moves the platform; reviewing an arbitrary edge usually
            does not.
          </p>
          <ol className="crit-list">
            {priority.map((e) => (
              <li key={e.edgeKey}>
                <button className="crit-pick" onClick={() => setEdgeKey(e.edgeKey)}>
                  {e.from} {e.effect === 'promotes' ? '→ drives →' : '→ opposes →'} {e.to}
                </button>
                <p className="ds-dim crit-why">{e.why}</p>
                {e.reviewStatus === 'disputed' ? <StatusPill kind="warn">already disputed</StatusPill> : null}
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      <Panel title="Review one relationship" icon="shield"
        right={coverage ? <StatusPill kind="info">{coverage.reviewed}/{coverage.total} edges reviewed by {coverage.reviewers} expert(s)</StatusPill> : null}>
        <p className="ds-note">
          Genesis reasons over a curated graph of mechanisms. Every conclusion it produces is downstream of these
          relationships, so a wrong edge quietly corrupts everything built on it. We are asking domain experts to check
          them <strong>one at a time</strong>. Your name, affiliation and ORCID are attached to whatever you decide, and
          your contribution is countable and exportable.
        </p>
        <p className="ds-dim">
          Reading requires no account. You will only be asked to sign in at the moment you record a verdict.
        </p>

        <label className="lg-field ds-mt">
          <span>Relationship under review</span>
          <select className="compare-select" value={edgeKey} onChange={(e) => setEdgeKey(e.target.value)}>
            {edges.map((e) => (
              <option key={edgeKeyOf(e)} value={edgeKeyOf(e)}>
                {getNode(e.from)?.label} {e.effect === 'promotes' ? '→ drives →' : '→ opposes →'} {getNode(e.to)?.label}
              </option>
            ))}
          </select>
        </label>
      </Panel>

      <Panel title={`${fromLabel} ${edge.effect === 'promotes' ? 'drives' : 'opposes'} ${toLabel}`} icon="graph"
        right={status ? <StatusPill kind={STATUS_KIND[status.status]}>{status.status}</StatusPill> : null}>
        <div className="lg-review-claim">
          <span className="lg-hero-tag">The claim, as Genesis currently states it</span>
          <p className="lg-answer">{edge.mechanism}</p>
          <p className="ds-dim">
            Declared confidence: <strong>{edge.honesty}</strong> · relationship type: {edge.kind}
          </p>
        </div>

        {status ? <p className="ds-note lg-summary">{status.basis}</p> : null}

        {status && status.reviewers.length > 0 ? (
          <>
            <h5 className="lg-h5">What other experts have said</h5>
            {status.reviewers.map((r, i) => (
              <div key={i} className={`lg-finding ${r.verdict === 'dispute' ? 'lg-finding-risk' : r.verdict === 'confirm' ? 'lg-finding-ok' : ''}`}>
                <div className="lg-finding-head">
                  <StatusPill kind={r.verdict === 'confirm' ? 'ok' : r.verdict === 'dispute' ? 'blocked' : 'warn'}>{r.verdict}</StatusPill>
                  <strong>{r.name}</strong>
                  <span className="ds-dim">{r.affiliation}{r.orcid ? ` · ORCID ${r.orcid}` : ''} · confidence {r.confidence}</span>
                </div>
                {r.comment ? <p className="ds-note">{r.comment}</p> : null}
                {r.citation ? <p className="ds-mono ds-dim">{r.citation}</p> : null}
              </div>
            ))}
          </>
        ) : null}
      </Panel>

      <Panel title="Your verdict" icon="book">
        <div className="lg-verdicts">
          {(Object.keys(VERDICT_COPY) as EdgeVerdict[]).map((v) => (
            <button key={v} className={`lg-verdict-btn${verdict === v ? ' active' : ''}`} onClick={() => setVerdict(v)} aria-pressed={verdict === v}>
              <strong>{VERDICT_COPY[v].label}</strong>
              <span>{VERDICT_COPY[v].help}</span>
            </button>
          ))}
        </div>

        <label className="lg-field ds-mt">
          <span>{verdict === 'dispute' ? 'What is wrong? (required)' : 'Comment (optional)'}</span>
          <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder={verdict === 'dispute' ? 'e.g. this holds in fibroblasts but not in post-mitotic tissue' : ''} />
        </label>

        {verdict === 'refine' ? (
          <label className="lg-field">
            <span>How should it be stated instead? (required)</span>
            <textarea rows={3} value={proposed} onChange={(e) => setProposed(e.target.value)} />
          </label>
        ) : null}

        <label className="lg-field">
          <span>Supporting reference (optional — DOI or PMID)</span>
          <input type="text" value={citation} onChange={(e) => setCitation(e.target.value)} placeholder="PMID:12345678" />
        </label>

        {!signedIn ? (
          <p className="ds-note">
            <Icon name="lock" size={12} /> You are not signed in. Creating an account takes one field and an e-mail
            address — it exists only so your name can be attached to your judgement.
          </p>
        ) : null}

        <button className="ds-btn" onClick={submit} disabled={busy}>
          {busy ? 'Recording…' : 'Record my verdict'}
        </button>
        {message ? <p className="ds-note lg-summary">{message}</p> : null}
      </Panel>

      <Panel title="Send this edge to a colleague" icon="upload">
        <p className="ds-note">
          A link to <strong>this single relationship</strong>. Nobody needs an account to open it.
        </p>
        <input className="lg-share" type="text" readOnly value={shareLink} onFocus={(e) => e.currentTarget.select()} />
      </Panel>
    </>
  );
}
