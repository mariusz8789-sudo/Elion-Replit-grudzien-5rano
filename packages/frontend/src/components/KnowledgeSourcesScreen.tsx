import { useCallback, useEffect, useState } from 'react';
import { useSession, getToken } from '../core/backend/session';
import {
  listKnowledgeProposals, publishKnowledgeProposal, rejectKnowledgeProposal,
  type KnowledgeProposal, type KnowledgeProposalsListing,
} from '../core/backend/client';

/**
 * KNOWLEDGE / PUBLIC-SOURCE SURFACE (SW-5).
 *
 * The Science Chat `/ingest <url>` command already creates PROPOSALS on the
 * real backend ledger (`POST /api/knowledge/ingest`); nothing published this
 * pipeline before had a SCREEN a human approver could use to see, publish or
 * reject them — the only reachable surface was the chat's own reply text.
 * This screen is that surface, over the SAME `/api/knowledge/proposals`
 * endpoints ScienceChat's ingest reply already names (`GET /proposals`,
 * `POST /proposals/:id/publish`, `POST /proposals/:id/reject`) — no new
 * backend route, no second ledger, no second ingestion path.
 *
 * Listing is public (the backend route requires no token); publishing or
 * rejecting requires a signed-in approver, exactly as the backend enforces
 * (`getUserByToken` → 401 without one) — this screen enforces nothing of its
 * own beyond disabling the two actions and explaining why.
 */

function groupByStatus(proposals: readonly KnowledgeProposal[]): Record<KnowledgeProposal['status'], KnowledgeProposal[]> {
  const groups: Record<KnowledgeProposal['status'], KnowledgeProposal[]> = { pending: [], published: [], rejected: [] };
  for (const p of proposals) groups[p.status].push(p);
  return groups;
}

function ProposalRow({ proposal, onDecide, deciding }: {
  proposal: KnowledgeProposal;
  onDecide: (id: string, action: 'publish' | 'reject') => void;
  deciding: string | null;
}) {
  const loggedIn = getToken() !== null;
  return (
    <li className="project-row knowledge-proposal-row" data-testid={`knowledge-proposal-${proposal.proposalId}`}>
      <div className="knowledge-proposal-claim">
        <span className="project-name">{proposal.claim}</span>
        <span className="gsc-caption">
          {proposal.sourceKind} · <code className="mono">{proposal.sourceUrl}</code> · hash <code className="mono">{proposal.contentHash.slice(0, 12)}</code>
        </span>
      </div>
      {proposal.status === 'pending' && (
        <div className="knowledge-proposal-actions">
          <button
            type="button"
            className="chip-btn primary"
            disabled={!loggedIn || deciding === proposal.proposalId}
            onClick={() => onDecide(proposal.proposalId, 'publish')}
            data-testid={`knowledge-publish-${proposal.proposalId}`}
          >
            {deciding === proposal.proposalId ? 'Zapisywanie…' : '✔ Publikuj'}
          </button>
          <button
            type="button"
            className="chip-btn"
            disabled={!loggedIn || deciding === proposal.proposalId}
            onClick={() => onDecide(proposal.proposalId, 'reject')}
            data-testid={`knowledge-reject-${proposal.proposalId}`}
          >
            ✕ Odrzuć
          </button>
        </div>
      )}
    </li>
  );
}

function ProposalGroup({ title, proposals, onDecide, deciding }: {
  title: string;
  proposals: readonly KnowledgeProposal[];
  onDecide: (id: string, action: 'publish' | 'reject') => void;
  deciding: string | null;
}) {
  if (proposals.length === 0) return null;
  return (
    <section className="settings-section" data-testid={`knowledge-group-${title}`}>
      <h2>{title} ({proposals.length})</h2>
      <ul className="project-list knowledge-proposal-list">
        {proposals.map((p) => (
          <ProposalRow key={p.proposalId} proposal={p} onDecide={onDecide} deciding={deciding} />
        ))}
      </ul>
    </section>
  );
}

export function KnowledgeSourcesScreen() {
  const session = useSession();
  const [listing, setListing] = useState<KnowledgeProposalsListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await listKnowledgeProposals();
    if (r.ok) {
      setListing(r.data);
      setError(null);
    } else {
      setError(r.message);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function handleDecide(proposalId: string, action: 'publish' | 'reject') {
    const token = getToken();
    if (!token) return;
    setDeciding(proposalId);
    const r = action === 'publish' ? await publishKnowledgeProposal(token, proposalId) : await rejectKnowledgeProposal(token, proposalId);
    setDeciding(null);
    if (r.ok) {
      await refresh();
    } else {
      setError(r.message);
    }
  }

  const groups = listing ? groupByStatus(listing.proposals) : null;

  return (
    <main className="settings-view" id="main-content" tabIndex={-1} data-testid="knowledge-sources-screen">
      <section className="settings-section">
        <h2>Wiedza i źródła publiczne</h2>
        <p className="settings-hint">
          Propozycje utworzone poleceniem <code>/ingest &lt;url&gt;</code> w Zapytaj — nic nie zasila Evidence Ledger
          ani Winner Gate, dopóki zalogowany człowiek nie opublikuje propozycji tutaj.
        </p>
        {!session && (
          <p className="settings-hint" data-testid="knowledge-signin-hint">
            Przeglądanie jest publiczne. Publikowanie lub odrzucanie propozycji wymaga zalogowania (patrz Ustawienia → Konto).
          </p>
        )}
        {error && <div className="account-error" role="alert">{error}</div>}
        {listing && (
          <p className="gsc-caption" data-testid="knowledge-ledger-status">
            Aktywne rekordy: {listing.activeRecords} · wersja ledgera {listing.ledgerVersion} · integralność łańcucha:{' '}
            {listing.ledgerOk ? 'OK' : 'NARUSZONA'}
          </p>
        )}
      </section>

      {listing === null ? (
        <section className="settings-section"><p className="settings-hint">Ładowanie…</p></section>
      ) : listing.proposals.length === 0 ? (
        <section className="settings-section"><p className="settings-hint">Brak propozycji. Użyj <code>/ingest &lt;url&gt;</code> w Zapytaj, aby zaproponować źródło.</p></section>
      ) : (
        groups && (
          <>
            <ProposalGroup title="Oczekujące" proposals={groups.pending} onDecide={handleDecide} deciding={deciding} />
            <ProposalGroup title="Opublikowane" proposals={groups.published} onDecide={handleDecide} deciding={deciding} />
            <ProposalGroup title="Odrzucone" proposals={groups.rejected} onDecide={handleDecide} deciding={deciding} />
          </>
        )
      )}
    </main>
  );
}

export default KnowledgeSourcesScreen;
