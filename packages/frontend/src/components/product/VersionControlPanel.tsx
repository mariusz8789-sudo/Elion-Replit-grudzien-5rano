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
  revokeCampaignInvite,
  listSnapshotsRemote, restoreSnapshotRemote, diffSnapshotsRemote,
  listCommentsRemote, addCommentRemote, resolveCommentRemote,
  type CampaignRole, type CampaignMember, type CampaignInvite, type SnapshotMeta, type ScientificDiff, type CampaignComment,
} from '../../core/backend/client';
import { useI18n } from '../../core/i18n';

export function VersionControlPanel({ campaignId, currentUserId, onSnapshotsChange, refreshToken }: {
  campaignId: string; currentUserId: string; onSnapshotsChange?: (snapshots: SnapshotMeta[]) => void;
  /** Bump this (e.g. a counter) whenever the parent knows the campaign changed server-side —
   *  this panel only fetches on mount otherwise, so it would never see new snapshots appear. */
  refreshToken?: number | string;
}) {
  const { t, locale } = useI18n();
  const fmt = (ts: number) => new Date(ts).toLocaleString(locale === 'pl' ? 'pl-PL' : 'en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const triggerLabel = (k: string) => (k === 'molecules_added' || k === 'analysis_completed' || k === 'restore' || k === 'manual') ? t(`vc.trigger.${k}`) : k;
  const [role, setRole] = useState<CampaignRole | null>(null);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [invites, setInvites] = useState<CampaignInvite[]>([]);
  const [copiedInvite, setCopiedInvite] = useState<string | null>(null);
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
      else if (!role) setLoadError(r.status === 429 ? t('vc.rateLimited') : (r.message || t('vc.loadError')));
    });
    listCampaignMembersRemote(token, campaignId).then((r) => { if (r.ok) { setMembers(r.data.members); setInvites(r.data.invites ?? []); } });
    listSnapshotsRemote(token, campaignId).then((r) => {
      if (!r.ok) return;
      setSnapshots(r.data.snapshots);
      if (r.data.snapshots.length >= 2) { setToId(r.data.snapshots[0].id); setFromId(r.data.snapshots[1].id); }
      onSnapshotsChange?.(r.data.snapshots);
    });
    listCommentsRemote(token, campaignId).then((r) => { if (r.ok) setComments(r.data.comments); });
  };
  useEffect(() => { refresh(); }, [campaignId, refreshToken]);

  if (!role) {
    if (loadError) {
      return (
        <Panel title={t('vc.title')} icon="clock" className="ds-mt">
          <p className="ds-note">{loadError}</p>
          <button className="ds-btn ds-mt" onClick={refresh}>{t('common.tryAgain')}</button>
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
      if (!r.ok) { setInviteMsg(r.message || t('vc.inviteFail')); return; }
      // Konto istnieje → od razu współpracownik. Konto nie istnieje → zaproszenie
      // czeka; mówimy to wprost, żeby właściciel wiedział, że musi wysłać link.
      setInviteMsg(r.data.member
        ? t('vc.inviteAdded', { email: inviteEmail, role: t(`role.${inviteRole}`) })
        : t('vc.invitePending', { email: inviteEmail, role: t(`role.${inviteRole}`) }));
      setInviteEmail('');
      refresh();
    });
  };
  /**
   * Link zapraszający. Token idzie w query (PRZED hashem), bo routing jest hashowy,
   * a celem jest #/campaigns — jedyny ekran, który pokazuje panel konta osobie
   * niezalogowanej, a zaraz po rejestracji tę samą, właśnie udostępnioną kampanię.
   */
  const inviteLink = (inviteToken: string) => `${window.location.origin}/?invite=${encodeURIComponent(inviteToken)}#/campaigns`;
  const copyInvite = (inv: CampaignInvite) => {
    void navigator.clipboard?.writeText(inviteLink(inv.token)).then(
      () => { setCopiedInvite(inv.id); window.setTimeout(() => setCopiedInvite(null), 2000); },
      () => setInviteMsg(t('vc.inviteCopyFail')),
    );
  };
  const revokeInvite = (inviteId: string) => {
    const token = getToken();
    if (!token) return;
    revokeCampaignInvite(token, campaignId, inviteId).then((r) => { if (r.ok) refresh(); });
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
      if (r.ok) setDiff(r.data.diff); else setDiffError(r.message || t('vc.compareFail'));
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
      else if (r.status === 409) setInviteMsg(t('vc.remoteNewer'));
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
    <Panel title={t('vc.title')} icon="clock" className="ds-mt" right={<StatusPill kind="info">{t(`role.${role}`)}</StatusPill>}>
      {/* Collaborators */}
      <h4 className="cmp-section-title" style={{ marginTop: 0 }}>{t('vc.collaborators')}</h4>
      <div className="ds-input-row">
        {members.length === 0 ? <span className="ds-dim">{t('vc.onlyYou')}</span> : members.map((m) => (
          <span key={m.userId} className="ds-chip">
            {m.userId === currentUserId ? t('vc.you') : m.userId.slice(0, 10)} · {t(`role.${m.role}`)}
            {isOwner ? <button type="button" onClick={() => removeMember(m.userId)} aria-label={t('vc.remove')} style={{ marginLeft: 6, border: 'none', background: 'none', cursor: 'pointer' }}><Icon name="block" size={11} /></button> : null}
          </span>
        ))}
      </div>
      {isOwner ? (
        <div className="ds-input-row ds-mt">
          <input type="email" placeholder={t('vc.invitePlaceholder')} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          <select className="compare-select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'collaborator' | 'viewer')}>
            <option value="collaborator">{t('vc.roleCollaborator')}</option>
            <option value="viewer">{t('vc.roleViewer')}</option>
          </select>
          <button className="ds-btn" onClick={invite} disabled={busy || !inviteEmail.trim()}>{t('vc.invite')}</button>
        </div>
      ) : null}
      {inviteMsg ? <p className="ds-note ds-dim">{inviteMsg}</p> : null}
      {/* Zaproszenia oczekujące — osoby bez konta Genesis. Właściciel kopiuje link
          i wysyła go dowolnym kanałem; po rejestracji tym adresem dostęp jest nadany. */}
      {invites.length > 0 ? (
        <>
          <h5 className="cmp-section-title">{t('vc.pendingInvites')}</h5>
          <p className="ds-note ds-dim" style={{ marginTop: 0 }}>{t('vc.pendingHint')}</p>
          <div className="ds-input-row">
            {invites.map((inv) => (
              <span key={inv.id} className="ds-chip">
                {inv.email} · {t(`role.${inv.role}`)}
                <button type="button" onClick={() => copyInvite(inv)} aria-label={t('vc.copyInviteLink')}
                  title={t('vc.copyInviteLink')} style={{ marginLeft: 6, border: 'none', background: 'none', cursor: 'pointer' }}>
                  <Icon name={copiedInvite === inv.id ? 'check' : 'upload'} size={11} />
                </button>
                {isOwner ? (
                  <button type="button" onClick={() => revokeInvite(inv.id)} aria-label={t('vc.revokeInvite')}
                    title={t('vc.revokeInvite')} style={{ marginLeft: 2, border: 'none', background: 'none', cursor: 'pointer' }}>
                    <Icon name="block" size={11} />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        </>
      ) : null}

      {/* Version timeline */}
      <h4 className="cmp-section-title">{t('vc.timeline')}</h4>
      {snapshots.length === 0 ? (
        <p className="ds-dim">{t('vc.noVersions')}</p>
      ) : (
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead><tr><th>{t('vc.col.when')}</th><th>{t('vc.col.event')}</th><th>{t('vc.col.author')}</th><th>RDKit</th><th>ADMET</th><th></th></tr></thead>
            <tbody>
              {snapshots.map((s, i) => (
                <tr key={s.id}>
                  <td>{fmt(s.createdAt)}</td>
                  <td>{triggerLabel(s.triggerKind)}{s.restoredFrom ? <span className="ds-dim"> {t('vc.restored')}</span> : null}</td>
                  <td className="ds-dim">{s.authorId === currentUserId ? t('vc.you') : s.authorId.slice(0, 10)}</td>
                  <td className="ds-dim ds-mono">{s.rdkitVersion ?? '—'}</td>
                  <td className="ds-dim ds-mono">{s.admetVersion ?? '—'}</td>
                  <td>{canEdit && i !== 0 ? <button className="ds-chip" onClick={() => restore(s.id)} disabled={busy}>{t('vc.restore')}</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Human-readable scientific diff — never raw JSON */}
      {snapshots.length >= 2 ? (
        <>
          <h4 className="cmp-section-title">{t('vc.compare')}</h4>
          <div className="ds-input-row">
            <select className="compare-select" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {snapshots.map((s) => <option key={s.id} value={s.id}>{fmt(s.createdAt)} · {triggerLabel(s.triggerKind)}</option>)}
            </select>
            <span className="ds-dim">→</span>
            <select className="compare-select" value={toId} onChange={(e) => setToId(e.target.value)}>
              {snapshots.map((s) => <option key={s.id} value={s.id}>{fmt(s.createdAt)} · {triggerLabel(s.triggerKind)}</option>)}
            </select>
            <button className="ds-btn" onClick={runDiff} disabled={!fromId || !toId || fromId === toId}>{t('vc.compareBtn')}</button>
          </div>
          {diffError ? <p className="ds-note" style={{ color: 'var(--danger, #c0392b)' }}>{diffError}</p> : null}
          {diff ? <ScientificDiffView diff={diff} /> : null}
        </>
      ) : null}

      {/* Scientific comments */}
      <h4 className="cmp-section-title">{t('vc.comments')}</h4>
      <div className="ds-input-row">
        <textarea className="compare-input" rows={2} value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder={t('vc.commentPlaceholder')} />
      </div>
      <div className="ds-input-row ds-mt"><button className="ds-btn" onClick={postComment} disabled={!commentText.trim()}>{t('vc.addComment')}</button></div>
      {comments.length ? (
        <ul className="ds-mt" style={{ listStyle: 'none', padding: 0, margin: '0.6rem 0 0' }}>
          {comments.map((c) => (
            <li key={c.id} className="ds-mt" style={{ paddingBottom: '0.4rem', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
              <p style={{ margin: 0 }}>{c.body}</p>
              <p className="ds-dim" style={{ margin: '0.2rem 0 0', fontSize: '0.82em' }}>
                {c.authorId === currentUserId ? t('vc.you') : c.authorId.slice(0, 10)} · {fmt(c.createdAt)}
                {c.resolved ? <> · <StatusPill kind="ok">{t('vc.resolved')}</StatusPill></> : (canEdit ? <> · <button className="ds-chip" onClick={() => resolveComment(c.id)}>{t('vc.markResolved')}</button></> : null)}
              </p>
            </li>
          ))}
        </ul>
      ) : <p className="ds-dim">{t('vc.noComments')}</p>}
    </Panel>
  );
}

function ScientificDiffView({ diff }: { diff: ScientificDiff }) {
  const { t } = useI18n();
  const nothing = !diff.moleculesAdded.length && !diff.moleculesRemoved.length && !diff.stageChanges.length
    && !diff.alertChanges.length && !diff.descriptorChanges.length && !diff.engineVersionChanges.length;
  if (nothing) return <p className="ds-dim ds-mt">{t('vc.diff.none')}</p>;
  return (
    <div className="ds-mt">
      {diff.engineVersionChanges.length ? (
        <p className="ds-note"><strong>{t('vc.diff.engine')}</strong> {diff.engineVersionChanges.map((c) => `${c.engine}: ${c.from ?? '—'} → ${c.to ?? '—'}`).join(' · ')}</p>
      ) : null}
      {diff.moleculesAdded.length ? (
        <p className="ds-note"><strong>{t('vc.diff.added', { n: diff.moleculesAdded.length })}</strong> {diff.moleculesAdded.map((m) => m.name).join(', ')}</p>
      ) : null}
      {diff.moleculesRemoved.length ? (
        <p className="ds-note"><strong>{t('vc.diff.removed', { n: diff.moleculesRemoved.length })}</strong> {diff.moleculesRemoved.map((m) => m.name).join(', ')}</p>
      ) : null}
      {diff.stageChanges.length ? (
        <div className="ds-note"><strong>{t('vc.diff.stages')}</strong>
          {diff.stageChanges.map((s) => <div key={s.id} className="ds-dim">{s.name}: {t(`stage.${s.from}`)} → {t(`stage.${s.to}`)}</div>)}
        </div>
      ) : null}
      {diff.alertChanges.length ? (
        <div className="ds-note"><strong>{t('vc.diff.alerts')}</strong>
          {diff.alertChanges.map((a) => (
            <div key={a.id} className="ds-dim">
              {a.name}: {a.added.length ? `+${a.added.join(', +')} ` : ''}{a.removed.length ? `−${a.removed.join(', −')}` : ''}
            </div>
          ))}
        </div>
      ) : null}
      {diff.descriptorChanges.length ? (
        <div className="ds-note"><strong>{t('vc.diff.descriptors')}</strong>
          {diff.descriptorChanges.map((d) => (
            <div key={d.id} className="ds-dim">
              {d.name}: {d.fields.map((f) => `${f.field} ${f.from} → ${f.to} (${f.causedBy === 'rdkit_version_change' ? t('vc.diff.rdkitChange') : t('vc.diff.dataChange')})`).join(', ')}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
