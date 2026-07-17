/**
 * DashboardScreen (Genesis premium UI) — the commercial product landing / pulpit.
 * A calm, modern SaaS entry: hero, real usage stats (from the user's own local data —
 * no fabricated numbers), and professional cards linking to every Genesis module, with
 * the educational platform kept as a clearly separate module. No new logic, no new
 * endpoints — pure navigation + presentation over existing screens.
 */
import { useEffect, useState } from 'react';
import { ProductChrome } from './ProductChrome';
import { Icon, type IconName } from '../Icon';
import { AccountPanel } from '../AccountPanel';
import { useSession } from '../../core/backend/session';
import { listAnalyses } from '../../core/assistantHistory';
import { listCampaigns } from '../../core/campaigns';

interface ModuleCard { hash: string; icon: IconName; title: string; desc: string; accent: string; cta: string }

const MODULES: ModuleCard[] = [
  { hash: '#/assistant', icon: 'flask', title: 'Asystent', desc: 'Wpisz SMILES — realne deskryptory RDKit, weryfikacja i raport w mniej niż minutę.', accent: 'var(--cyan)', cta: 'Analizuj cząsteczkę' },
  { hash: '#/compare', icon: 'graph', title: 'Porównaj', desc: 'Zestaw 2–50 kandydatów: ranking rozwojowy z uzasadnieniem, macierz-heatmapa, portfolio.', accent: 'var(--violet)', cta: 'Porównaj kandydatów' },
  { hash: '#/campaigns', icon: 'briefcase', title: 'Kampanie', desc: 'Projekty badawcze 2–2000 cząsteczek. Trwałe na serwerze, z eksportem CSV/JSON/PDF.', accent: 'var(--gold)', cta: 'Otwórz kampanie' },
  { hash: '#/analyses', icon: 'book', title: 'Moje analizy', desc: 'Historia zapisanych analiz — otwórz ponownie każdy raport jednym kliknięciem.', accent: 'var(--green)', cta: 'Przeglądaj historię' },
  { hash: '#/billing', icon: 'lock', title: 'Rozliczenia', desc: 'Plan, zużycie i limit API, kopiowanie i regeneracja klucza, upgrade przez Stripe.', accent: 'var(--cyan)', cta: 'Zarządzaj planem' },
];

export function DashboardScreen() {
  const session = useSession();
  const [stats, setStats] = useState({ analyses: 0, verified: 0, campaigns: 0 });

  useEffect(() => {
    if (!session) { setStats({ analyses: 0, verified: 0, campaigns: 0 }); return; }
    const a = listAnalyses(session.user.id);
    const c = listCampaigns(session.user.id);
    setStats({ analyses: a.length, verified: a.filter((x) => x.status === 'VERIFIED').length, campaigns: c.length });
  }, [session]);

  return (
    <ProductChrome active="#/genesis">
      <section className="gx-hero">
        <div className="gx-hero-badge"><span className="gx-dot" /> Grounded Chemistry · RDKit 2026.03.3</div>
        <h1>Wiarygodna analiza cząsteczek,<br /><span className="gx-hero-accent">której AI nie zmyśli</span></h1>
        <p className="gx-hero-lede">
          Realne obliczenia RDKit, provenance przy każdej wartości i jawne rozróżnienie
          zweryfikowanego faktu od interpretacji. Od pojedynczej cząsteczki po kampanię 2000 kandydatów.
        </p>
        <div className="gx-hero-actions">
          <a className="gx-btn gx-btn-primary" href="#/assistant"><Icon name="flask" size={16} /> Rozpocznij analizę</a>
          <a className="gx-btn gx-btn-ghost" href="#/campaigns"><Icon name="briefcase" size={16} /> Kampanie badawcze</a>
        </div>
      </section>

      {session ? (
        <div className="gx-stats">
          <div className="gx-stat"><span className="gx-stat-val">{stats.analyses}</span><span className="gx-stat-label">Analiz łącznie</span></div>
          <div className="gx-stat"><span className="gx-stat-val gx-ok">{stats.verified}</span><span className="gx-stat-label">Zweryfikowanych RDKit</span></div>
          <div className="gx-stat"><span className="gx-stat-val">{stats.campaigns}</span><span className="gx-stat-label">Kampanii</span></div>
          <div className="gx-stat"><span className="gx-stat-val gx-mono">{session.user.email.split('@')[0]}</span><span className="gx-stat-label">Zalogowano</span></div>
        </div>
      ) : (
        <div className="gx-login">
          <div className="gx-login-copy">
            <h3>Zaloguj się, aby zacząć</h3>
            <p>Twoje analizy i kampanie są zapisywane na Twoim koncie — przetrwają wylogowanie i zmianę urządzenia.</p>
          </div>
          <div className="gx-login-panel"><AccountPanel /></div>
        </div>
      )}

      <div className="gx-section-label">Moduły produktu</div>
      <div className="gx-grid">
        {MODULES.map((m) => (
          <a key={m.hash} className="gx-card" href={m.hash} style={{ ['--card-accent' as string]: m.accent }}>
            <span className="gx-card-icon"><Icon name={m.icon} size={20} /></span>
            <span className="gx-card-title">{m.title}</span>
            <span className="gx-card-desc">{m.desc}</span>
            <span className="gx-card-cta">{m.cta} <span className="gx-card-arrow">→</span></span>
          </a>
        ))}
      </div>

      <div className="gx-section-label">Osobny moduł</div>
      <a className="gx-edu" href="#/labs">
        <span className="gx-edu-icon"><Icon name="atom" size={22} /></span>
        <span className="gx-edu-text">
          <span className="gx-edu-title">Platforma edukacyjna Genesis OS</span>
          <span className="gx-edu-sub">13 laboratoriów fizyki i nauki, Discovery Timeline, symulacje — oddzielny moduł, dostępny obok produktu chemicznego.</span>
        </span>
        <span className="gx-edu-arrow">→</span>
      </a>
    </ProductChrome>
  );
}
