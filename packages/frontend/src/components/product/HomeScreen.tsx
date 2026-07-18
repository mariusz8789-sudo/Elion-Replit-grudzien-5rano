/**
 * HomeScreen — Genesis default landing (`/`, unmatched hash). Establishes in under
 * 10 seconds that Genesis is an AI scientific discovery platform for molecule
 * analysis, not a physics simulator. Reuses ONLY existing design-system pieces from
 * the last UI polish (ProductChrome shell, gx-hero/gx-btn/gx-card/gx-edu) — no new
 * components, no new styles. The educational platform is a clearly separated
 * section below, fully functional under its own route (#/labs).
 */
import { ProductChrome } from './ProductChrome';
import { Icon, type IconName } from '../Icon';

interface ModuleCard { hash: string; icon: IconName; title: string; desc: string; accent: string; cta: string }

const MODULES: ModuleCard[] = [
  { hash: '#/compare', icon: 'graph', title: 'Porównaj', desc: 'Zestaw 2–50 kandydatów: ranking rozwojowy z uzasadnieniem, macierz-heatmapa, portfolio.', accent: 'var(--violet)', cta: 'Porównaj kandydatów' },
  { hash: '#/campaigns', icon: 'briefcase', title: 'Kampanie', desc: 'Projekty badawcze 2–2000 cząsteczek. Trwałe na serwerze, z eksportem CSV/JSON/PDF.', accent: 'var(--gold)', cta: 'Otwórz kampanie' },
  { hash: '#/analyses', icon: 'book', title: 'Moje analizy', desc: 'Historia zapisanych analiz — otwórz ponownie każdy raport jednym kliknięciem.', accent: 'var(--green)', cta: 'Przeglądaj historię' },
  { hash: '#/billing', icon: 'lock', title: 'Rozliczenia', desc: 'Plan, zużycie i limit API, kopiowanie i regeneracja klucza, upgrade przez Stripe.', accent: 'var(--cyan)', cta: 'Zarządzaj planem' },
];

export function HomeScreen() {
  return (
    <ProductChrome active="#/">
      <section className="gx-hero">
        <div className="gx-hero-badge"><span className="gx-dot" /> RDKit 2026.03.3 · realne obliczenia, nigdy zmyślone</div>
        <h1>Genesis <span className="gx-hero-accent">— AI Scientific Discovery Platform</span></h1>
        <p className="gx-hero-lede">
          Wiarygodna analiza cząsteczek: realne obliczenia RDKit, jawna proweniencja i
          wyraźne oznaczenie każdej wartości. Od pojedynczej cząsteczki po kampanię 2000 kandydatów.
        </p>
        <div className="gx-hero-actions">
          <a className="gx-btn gx-btn-primary" href="#/assistant"><Icon name="flask" size={16} /> Rozpocznij analizę</a>
        </div>
      </section>

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

      {/* The education/physics platform is a separate workspace — kept reachable but
          out of the chemistry product's primary path (hidden, not removed). */}
      <p className="gx-secondary-link">
        Szukasz platformy edukacyjnej? <a href="#/labs">Laboratoria fizyki →</a>
      </p>
    </ProductChrome>
  );
}
