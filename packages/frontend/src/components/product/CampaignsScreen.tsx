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
import { useSession } from '../../core/backend/session';
import { listCampaigns, createCampaign, deleteCampaign, type Campaign } from '../../core/campaigns';

export function CampaignsScreen() {
  const session = useSession();
  const [items, setItems] = useState<Campaign[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', goal: '', description: '' });
  const refresh = () => { if (session) setItems(listCampaigns(session.user.id)); };
  useEffect(refresh, [session]);

  if (!session) {
    return (
      <ProductChrome active="#/campaigns">
        <div className="product-hero">
          <h1>Kampanie badawcze</h1>
          <p className="product-lede">Naukowcy nie analizują jednej cząsteczki — prowadzą kampanie. Zaloguj się, aby utworzyć projekt.</p>
        </div>
        <Panel title="Zaloguj się" icon="lock"><AccountPanel /></Panel>
      </ProductChrome>
    );
  }

  const submit = () => {
    if (!form.name.trim()) return;
    const c = createCampaign({ ownerId: session.user.id, name: form.name, description: form.description, goal: form.goal, owner: session.user.email });
    setForm({ name: '', goal: '', description: '' }); setCreating(false); refresh();
    window.location.hash = `#/campaigns/${c.id}`;
  };
  const remove = (c: Campaign) => { deleteCampaign(session.user.id, c.id); refresh(); };

  return (
    <ProductChrome active="#/campaigns">
      <Panel title="Kampanie badawcze" icon="briefcase" right={<button className="ds-btn ds-btn-primary" onClick={() => setCreating((v) => !v)}><Icon name="spark" size={14} /> Nowa kampania</button>}>
        {creating ? (
          <div className="campaign-form">
            <label>Nazwa projektu<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="np. Snake Venom Inhibitors" maxLength={80} autoFocus /></label>
            <label>Cel naukowy<input value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="np. Wskazać najbardziej obiecujących kandydatów do walidacji" maxLength={160} /></label>
            <label>Opis (opcjonalnie)<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={400} /></label>
            <div className="ds-input-row">
              <button className="ds-btn ds-btn-primary" onClick={submit} disabled={!form.name.trim()}>Utwórz</button>
              <button className="ds-btn" onClick={() => setCreating(false)}>Anuluj</button>
            </div>
          </div>
        ) : null}

        {items.length === 0 && !creating ? (
          <div className="ds-empty"><Icon name="briefcase" size={26} className="ds-empty-icon" /><h4>Brak kampanii</h4><p>Utwórz pierwszy projekt badawczy i dodaj cząsteczki do porównania.</p></div>
        ) : (
          <div className="campaign-cards ds-mt">
            {items.map((c) => {
              const analysed = c.molecules.filter((m) => m.status === 'ANALYSED').length;
              return (
                <a key={c.id} className="campaign-card" href={`#/campaigns/${c.id}`}>
                  <header><span className="ds-strong">{c.name}</span><StatusPill kind={c.status === 'ACTIVE' ? 'ok' : 'info'}>{c.status}</StatusPill></header>
                  <p className="campaign-goal">{c.goal || 'Bez zdefiniowanego celu'}</p>
                  <footer>
                    <span className="ds-dim">{c.molecules.length} cząsteczek · {analysed} przeanalizowanych</span>
                    <button className="ds-chip" onClick={(e) => { e.preventDefault(); remove(c); }} title="Usuń kampanię"><Icon name="block" size={13} /></button>
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
