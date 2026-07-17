/**
 * VersionControlPanel (Genesis 2.1, Part 4) — Scientific Version Control UI.
 *
 * ONE shared component, used identically from CampaignScreen's desktop and mobile bodies
 * (no separate mobile variant — this panel is already narrow/stacked, unlike the hero/
 * candidate-card layouts that genuinely need different markup per breakpoint). Renders:
 * immutable version timeline, a human-readable scientific diff between any two snapshots
 * (never raw JSON), one-click restore, collaborator invite/remove (Owner/Collaborator/
 * Viewer), and scientific comments. Git terminology stays out of the UI — "wersja"
 * ("version"), never "commit"/"branch"/"snapshot" in user-facing copy.
 */
import { useEffect, useState } from 'react';
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { Icon } from '../Icon';
import { getToken } from '../../core/backend/session';
import {
  fetchCampaignWithRole, listCampaignMembersRemote, inviteCampaignMember, removeCampaignMemberRemote,
  listSnapshotsRemote, restoreSnapshotRemote, diffSnapshotsRemote,
  listCommentsRemote, addCommentRemote, resolveCommentRemote,
  type CampaignRole, type CampaignMember, type SnapshotMeta, type ScientificDiff, type CampaignComment,
} from '../../core/backend/client';

const TRIGGER_LABEL: Record<string, string> = {
  molecules_added: 'Dodano cząsteczki', analysis_completed: 'Zakończono analizę',
  restore: 'Przywrócono wersję', manual: 'Zapis ręczny',
};
const ROLE_LABEL: Record<CampaignRole, string> = { owner: 'Właściciel', collaborator: 'Współpracownik', viewer: 'Widz' };

function fmt(ts: number): string {
  return new Date(ts).toLocaleString('pl-PL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function VersionControlPanel({ campaignId, currentUserId, onSnapshotsChange, refreshToken }: {
  campaignId: string; currentUserId: string; onSnapshotsChange?: (snapshots: SnapshotMeta[]) => void;
  /** Bump this (e.g. a counter) whenever the parent knows the campaign changed server-side —
   *  this panel only fetches on mount otherwise, so it would never see new snapshots appear. */
  refreshToken?: number | string;
}) {
  const [role, setRole] = useState<CampaignRole | null>(null);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [comments, setComments] = useState<CampaignComment[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'collaborator' | 'viewer'>('collaborator');
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [fromId, setFromId] = useState<string>('');
  const [toId, setToId] = useState<string>('');
  const [diff, setDiff] = useState<ScientificDiff | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = () => {
    const token = getToken();
    if (!token) return;
    fetchCampaignWithRole(token, campaignId).then((r) => {
      if (r.ok) { setRole(r.data.role); setLoadError(null); }
      // Nie zerujemy `role`, gdy już był ustalony — chwilowy błąd sieci/limitu żądań nie
      // ma chować panel, który już poprawnie się załadował. Błąd pokazujemy tylko, gdy
      // NIC jeszcze nie wczytaliśmy (pierwsze ładowanie), żeby użytkownik wiedział, że coś
      // poszło nie tak, zamiast widzieć, jakby funkcja historii wersji w ogóle nie istniała.
      else if (!role) setLoadError(r.status === 429 ? 'Zbyt wiele żądań — odczekaj chwilę i spróbuj ponownie.' : (r.message || 'Nie udało się wczytać historii wersji.'));
    });
    listCampaignMembersRemote(token, campaignId).then((r) => { if (r.ok) setMembers(r.data.members); });
    listSnapshotsRemote(token, campaignId).then((r) => {
      if (!r.ok) return;
      setSnapshots(r.data.snapshots);
      if (r.data.snapshots.length >= 2) { setToId(r.data.snapshots[0].id); setFromId(r.data.snapshots[1].id); }
      onSnapshotsChange?.(r.data.snapshots);
    });
    listCommentsRemote(token, campaignId).then((r) => { if (r.ok) setComments(r.data.comments); });
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [campaignId, refreshToken]);

  if (!role) {
    if (loadError) {
      return (
        <Panel title="Historia wersji naukowych" icon="clock" className="ds-mt">
          <p className="ds-note">{loadError}</p>
          <button className="ds-btn ds-mt" onClick={refresh}>Spróbuj ponownie</button>
        </Panel>
      );
    }
    return null; // trwa pierwsze ładowanie — jeszcze nic do pokazania
  }

  const canEdit = role === 'owner' || role === 'collaborator';
  const isOwner = role === 'owner';

  const invite = () => {
    const token = getToken();
    if (!token || !inviteEmail.trim()) return;
    setBusy(true); setInviteMsg(null);
    inviteCampaignMember(token, campaignId, inviteEmail.trim().toLowerCase(), inviteRole).then((r) => {
      setBusy(false);
      if (r.ok) { setInviteEmail(''); setInviteMsg(`Dodano ${inviteEmail} jako ${ROLE_LABEL[inviteRole]}.`); refresh(); }
      else setInviteMsg(r.message || 'Nie udało się dodać współpracownika.');
    });
  };
  const removeMember = (userId: string) => {
    const token = getToken();
    if (!token) return;
    removeCampaignMemberRemote(token, campaignId, userId).then((r) => { if (r.ok) refresh(); });
  };

  const runDiff = () => {
    const token = getToken();
    if (!token || !fromId || !toId) return;
    setDiffError(null); setDiff(null);
    diffSnapshotsRemote(token, campaignId, fromId, toId).then((r) => {
      if (r.ok) setDiff(r.data.diff); else setDiffError(r.message || 'Nie udało się porównać wersji.');
    });
  };

  const restore = (snapshotId: string) => {
    const token = getToken();
    if (!token) return;
    const latest = snapshots[0]?.id ?? null;
    setBusy(true);
    restoreSnapshotRemote(token, campaignId, snapshotId, latest).then((r) => {
      setBusy(false);
      if (r.ok) refresh();
      else if (r.status === 409) setInviteMsg('Ktoś inny zapisał nowszą wersję w międzyczasie. Odśwież stronę i spróbuj ponownie.');
    });
  };

  const postComment = () => {
    const token = getToken();
    if (!token || !commentText.trim()) return;
    addCommentRemote(token, campaignId, commentText.trim()).then((r) => { if (r.ok) { setCommentText(''); refresh(); } });
  };
  const resolveComment = (id: string) => {
    const token = getToken();
    if (!token) return;
    resolveCommentRemote(token, campaignId, id, true).then((r) => { if (r.ok) refresh(); });
  };

  return (
    <Panel title="Historia wersji naukowych" icon="clock" className="ds-mt" right={<StatusPill kind="info">{ROLE_LABEL[role]}</StatusPill>}>
      {/* Współpracownicy */}
      <h4 className="cmp-section-title" style={{ marginTop: 0 }}>Współpracownicy</h4>
      <div className="ds-input-row">
        {members.length === 0 ? <span className="ds-dim">Tylko Ty masz dostęp do tej kampanii.</span> : members.map((m) => (
          <span key={m.userId} className="ds-chip">
            {m.userId === currentUserId ? 'Ty' : m.userId.slice(0, 10)} · {ROLE_LABEL[m.role]}
            {isOwner ? <button type="button" onClick={() => removeMember(m.userId)} aria-label="Usuń" style={{ marginLeft: 6, border: 'none', background: 'none', cursor: 'pointer' }}><Icon name="block" size={11} /></button> : null}
          </span>
        ))}
      </div>
      {isOwner ? (
        <div className="ds-input-row ds-mt">
          <input type="email" placeholder="e-mail współpracownika" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          <select className="compare-select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'collaborator' | 'viewer')}>
            <option value="collaborator">Współpracownik (edycja)</option>
            <option value="viewer">Widz (tylko odczyt)</option>
          </select>
          <button className="ds-btn" onClick={invite} disabled={busy || !inviteEmail.trim()}>Zaproś</button>
        </div>
      ) : null}
      {inviteMsg ? <p className="ds-note ds-dim">{inviteMsg}</p> : null}

      {/* Oś czasu wersji */}
      <h4 className="cmp-section-title">Oś czasu</h4>
      {snapshots.length === 0 ? (
        <p className="ds-dim">Brak zapisanych wersji jeszcze — pojawią się automatycznie po dodaniu cząsteczek lub zakończeniu analizy.</p>
      ) : (
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead><tr><th>Kiedy</th><th>Zdarzenie</th><th>Autor</th><th>RDKit</th><th>ADMET</th><th></th></tr></thead>
            <tbody>
              {snapshots.map((s, i) => (
                <tr key={s.id}>
                  <td>{fmt(s.createdAt)}</td>
                  <td>{TRIGGER_LABEL[s.triggerKind] ?? s.triggerKind}{s.restoredFrom ? <span className="ds-dim"> (przywrócona)</span> : null}</td>
                  <td className="ds-dim">{s.authorId === currentUserId ? 'Ty' : s.authorId.slice(0, 10)}</td>
                  <td className="ds-dim ds-mono">{s.rdkitVersion ?? '—'}</td>
                  <td className="ds-dim ds-mono">{s.admetVersion ?? '—'}</td>
                  <td>{canEdit && i !== 0 ? <button className="ds-chip" onClick={() => restore(s.id)} disabled={busy}>Przywróć</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Porównanie dwóch wersji — czytelny diff naukowy, nigdy surowy JSON */}
      {snapshots.length >= 2 ? (
        <>
          <h4 className="cmp-section-title">Porównaj wersje</h4>
          <div className="ds-input-row">
            <select className="compare-select" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {snapshots.map((s) => <option key={s.id} value={s.id}>{fmt(s.createdAt)} · {TRIGGER_LABEL[s.triggerKind] ?? s.triggerKind}</option>)}
            </select>
            <span className="ds-dim">→</span>
            <select className="compare-select" value={toId} onChange={(e) => setToId(e.target.value)}>
              {snapshots.map((s) => <option key={s.id} value={s.id}>{fmt(s.createdAt)} · {TRIGGER_LABEL[s.triggerKind] ?? s.triggerKind}</option>)}
            </select>
            <button className="ds-btn" onClick={runDiff} disabled={!fromId || !toId || fromId === toId}>Porównaj</button>
          </div>
          {diffError ? <p className="ds-note" style={{ color: 'var(--danger, #c0392b)' }}>{diffError}</p> : null}
          {diff ? <ScientificDiffView diff={diff} /> : null}
        </>
      ) : null}

      {/* Komentarze naukowe */}
      <h4 className="cmp-section-title">Komentarze</h4>
      <div className="ds-input-row">
        <textarea className="compare-input" rows={2} value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Dodaj komentarz naukowy do tej kampanii…" />
      </div>
      <div className="ds-input-row ds-mt"><button className="ds-btn" onClick={postComment} disabled={!commentText.trim()}>Dodaj komentarz</button></div>
      {comments.length ? (
        <ul className="ds-mt" style={{ listStyle: 'none', padding: 0, margin: '0.6rem 0 0' }}>
          {comments.map((c) => (
            <li key={c.id} className="ds-mt" style={{ paddingBottom: '0.4rem', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
              <p style={{ margin: 0 }}>{c.body}</p>
              <p className="ds-dim" style={{ margin: '0.2rem 0 0', fontSize: '0.82em' }}>
                {c.authorId === currentUserId ? 'Ty' : c.authorId.slice(0, 10)} · {fmt(c.createdAt)}
                {c.resolved ? <> · <StatusPill kind="ok">rozwiązany</StatusPill></> : (canEdit ? <> · <button className="ds-chip" onClick={() => resolveComment(c.id)}>Oznacz jako rozwiązany</button></> : null)}
              </p>
            </li>
          ))}
        </ul>
      ) : <p className="ds-dim">Brak komentarzy.</p>}
    </Panel>
  );
}

function ScientificDiffView({ diff }: { diff: ScientificDiff }) {
  const nothing = !diff.moleculesAdded.length && !diff.moleculesRemoved.length && !diff.stageChanges.length
    && !diff.alertChanges.length && !diff.descriptorChanges.length && !diff.engineVersionChanges.length;
  if (nothing) return <p className="ds-dim ds-mt">Brak różnic naukowych między tymi wersjami.</p>;
  return (
    <div className="ds-mt">
      {diff.engineVersionChanges.length ? (
        <p className="ds-note"><strong>Zmiana wersji silnika:</strong> {diff.engineVersionChanges.map((c) => `${c.engine}: ${c.from ?? '—'} → ${c.to ?? '—'}`).join(' · ')}</p>
      ) : null}
      {diff.moleculesAdded.length ? (
        <p className="ds-note"><strong>Dodane cząsteczki ({diff.moleculesAdded.length}):</strong> {diff.moleculesAdded.map((m) => m.name).join(', ')}</p>
      ) : null}
      {diff.moleculesRemoved.length ? (
        <p className="ds-note"><strong>Usunięte cząsteczki ({diff.moleculesRemoved.length}):</strong> {diff.moleculesRemoved.map((m) => m.name).join(', ')}</p>
      ) : null}
      {diff.stageChanges.length ? (
        <div className="ds-note"><strong>Zmiany etapu:</strong>
          {diff.stageChanges.map((s) => <div key={s.id} className="ds-dim">{s.name}: {s.from} → {s.to}</div>)}
        </div>
      ) : null}
      {diff.alertChanges.length ? (
        <div className="ds-note"><strong>Zmiany alertów strukturalnych:</strong>
          {diff.alertChanges.map((a) => (
            <div key={a.id} className="ds-dim">
              {a.name}: {a.added.length ? `+${a.added.join(', +')} ` : ''}{a.removed.length ? `−${a.removed.join(', −')}` : ''}
            </div>
          ))}
        </div>
      ) : null}
      {diff.descriptorChanges.length ? (
        <div className="ds-note"><strong>Zmiany deskryptorów RDKit:</strong>
          {diff.descriptorChanges.map((d) => (
            <div key={d.id} className="ds-dim">
              {d.name}: {d.fields.map((f) => `${f.field} ${f.from} → ${f.to} (${f.causedBy === 'rdkit_version_change' ? 'zmiana wersji RDKit' : 'zmiana danych'})`).join(', ')}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
