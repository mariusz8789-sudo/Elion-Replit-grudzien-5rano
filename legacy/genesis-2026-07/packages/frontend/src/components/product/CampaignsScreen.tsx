/**
 * CampaignsScreen (Stage 7) — the Research Campaigns list + create form. A campaign is a
 * molecular research project (name, description, scientific goal, owner, date, status).
 * Reuses the product chrome + session; campaigns persist per-user in localStorage.
 */
import { useEffect, useState } from 'react';
import { ProductChrome } from './ProductChrome';
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { Icon } from '../Icon';
import { AccountPanel } from '../AccountPanel';
import { useSession, getToken } from '../../core/backend/session';
import { listCampaigns, createCampaign, deleteCampaign, type Campaign } from '../../core/campaigns';
import { syncCampaigns, removeCampaignRemote } from '../../core/campaignSync';
import { loadSampleProject } from '../../core/sampleProject';
import { useI18n } from '../../core/i18n';

export function CampaignsScreen() {
  const session = useSession();
  const { t } = useI18n();
  const [items, setItems] = useState<Campaign[]>([]);
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [form, setForm] = useState({ name: '', goal: '', description: '' });
  const refresh = () => { if (session) setItems(listCampaigns(session.user.id)); };
  useEffect(refresh, [session]);
  // Genesis 2.1 (Part 2): dwukierunkowa synchronizacja z serwerem przy logowaniu
  // (offline-first — localStorage pozostaje natychmiastowe; to lustro w chmurze).
  useEffect(() => {
    const t = getToken();
    if (!session || !t) return;
    syncCampaigns(t, session.user.id).then(() => refresh()).catch(() => { /* offline → zostaje lokalne */ });
  }, [session]);

  if (!session) {
    return (
      <ProductChrome active="#/campaigns">
        <div className="product-hero">
          <h1>{t('campaigns.signin.title')}</h1>
          <p className="product-lede">{t('campaigns.signin.lede')}</p>
        </div>
        <Panel title={t('common.signIn')} icon="lock"><AccountPanel /></Panel>
      </ProductChrome>
    );
  }

  const submit = () => {
    if (!form.name.trim()) return;
    const c = createCampaign({ ownerId: session.user.id, name: form.name, description: form.description, goal: form.goal, owner: session.user.email });
    setForm({ name: '', goal: '', description: '' }); setCreating(false); refresh();
    window.location.hash = `#/campaigns/${c.id}`;
  };
  const remove = (c: Campaign) => {
    deleteCampaign(session.user.id, c.id);
    const t = getToken();
    if (t) removeCampaignRemote(t, c.id).catch(() => { /* best-effort */ });
    refresh();
  };
  const loadSample = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      const firstId = await loadSampleProject(session.user.id, session.user.email);
      refresh();
      window.location.hash = `#/campaigns/${firstId}`;
    } finally { setSeeding(false); }
  };

  return (
    <ProductChrome active="#/campaigns">
      <Panel title={t('campaigns.title')} icon="briefcase" right={<button className="ds-btn ds-btn-primary" onClick={() => setCreating((v) => !v)}><Icon name="spark" size={14} /> {t('campaigns.new')}</button>}>
        {creating ? (
          <div className="campaign-form">
            <label>{t('campaigns.form.name')}<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('campaigns.form.namePlaceholder')} maxLength={80} autoFocus /></label>
            <label>{t('campaigns.form.goal')}<input value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder={t('campaigns.form.goalPlaceholder')} maxLength={160} /></label>
            <label>{t('campaigns.form.desc')}<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={400} /></label>
            <div className="ds-input-row">
              <button className="ds-btn ds-btn-primary" onClick={submit} disabled={!form.name.trim()}>{t('common.create')}</button>
              <button className="ds-btn" onClick={() => setCreating(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        ) : null}

        {items.length === 0 && !creating ? (
          <div className="ds-empty">
            <Icon name="briefcase" size={26} className="ds-empty-icon" />
            <h4>{t('campaigns.empty.title')}</h4>
            <p>{t('campaigns.empty.body')}</p>
            <div className="ds-input-row" style={{ justifyContent: 'center' }}>
              <button className="ds-btn ds-btn-primary" onClick={() => setCreating(true)}>{t('campaigns.new')}</button>
              <button className="ds-btn" onClick={loadSample} disabled={seeding}>{seeding ? t('campaigns.sampleLoading') : t('campaigns.sample')}</button>
            </div>
          </div>
        ) : (
          <div className="campaign-cards ds-mt">
            {items.map((c) => {
              const analysed = c.molecules.filter((m) => m.status === 'ANALYSED').length;
              return (
                <a key={c.id} className="campaign-card" href={`#/campaigns/${c.id}`}>
                  <header><span className="ds-strong">{c.name}</span><StatusPill kind={c.status === 'ACTIVE' ? 'ok' : 'info'}>{t(`status.${c.status}`)}</StatusPill></header>
                  <p className="campaign-goal">{c.goal || t('campaigns.card.noGoal')}</p>
                  <footer>
                    <span className="ds-dim">{t('campaigns.card.stats', { molecules: c.molecules.length, analysed })}</span>
                    <button className="ds-chip" onClick={(e) => { e.preventDefault(); remove(c); }} title={t('campaigns.delete')}><Icon name="block" size={13} /></button>
                  </footer>
                </a>
              );
            })}
          </div>
        )}
      </Panel>
    </ProductChrome>
  );
}
