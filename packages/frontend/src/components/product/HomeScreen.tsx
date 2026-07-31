/**
 * HomeScreen — Genesis default landing (`/`, unmatched hash). Establishes in under
 * 10 seconds that Genesis is a molecule-analysis product, not a physics simulator.
 * Reuses ONLY existing design-system pieces (ProductChrome shell, gx-* classes) and the
 * i18n seam — fully bilingual (EN/PL). The education/physics platform is a separate
 * workspace, demoted to a quiet secondary link (hidden, not removed).
 */
import { ProductChrome } from './ProductChrome';
import { Icon, type IconName } from '../Icon';
import { useI18n } from '../../core/i18n';

interface ModuleCard { hash: string; icon: IconName; titleKey: string; descKey: string; ctaKey: string; accent: string }

const MODULES: ModuleCard[] = [
  { hash: '#/compare', icon: 'graph', titleKey: 'nav.compare', descKey: 'home.mod.compare.desc', ctaKey: 'home.mod.compare.cta', accent: 'var(--violet)' },
  { hash: '#/campaigns', icon: 'briefcase', titleKey: 'nav.projects', descKey: 'home.mod.projects.desc', ctaKey: 'home.mod.projects.cta', accent: 'var(--gold)' },
  { hash: '#/analyses', icon: 'book', titleKey: 'nav.analyses', descKey: 'home.mod.analyses.desc', ctaKey: 'home.mod.analyses.cta', accent: 'var(--green)' },
  { hash: '#/billing', icon: 'lock', titleKey: 'nav.billing', descKey: 'home.mod.billing.desc', ctaKey: 'home.mod.billing.cta', accent: 'var(--cyan)' },
];

export function HomeScreen() {
  const { t } = useI18n();
  return (
    <ProductChrome active="#/">
      <section className="gx-hero">
        <div className="gx-hero-badge"><span className="gx-dot" /> {t('home.badge')}</div>
        <h1>Genesis <span className="gx-hero-accent">{t('home.titleAccent')}</span></h1>
        <p className="gx-hero-lede">{t('home.lede')}</p>
        <div className="gx-hero-actions">
          <a className="gx-btn gx-btn-primary" href="#/assistant"><Icon name="flask" size={16} /> {t('home.cta.analyse')}</a>
        </div>
      </section>

      <div className="gx-section-label">{t('home.modules')}</div>
      <div className="gx-grid">
        {MODULES.map((m) => (
          <a key={m.hash} className="gx-card" href={m.hash} style={{ ['--card-accent' as string]: m.accent }}>
            <span className="gx-card-icon"><Icon name={m.icon} size={20} /></span>
            <span className="gx-card-title">{t(m.titleKey)}</span>
            <span className="gx-card-desc">{t(m.descKey)}</span>
            <span className="gx-card-cta">{t(m.ctaKey)} <span className="gx-card-arrow">→</span></span>
          </a>
        ))}
      </div>

      {/* The education/physics platform is a separate workspace — kept reachable but
          out of the chemistry product's primary path (hidden, not removed). */}
      <p className="gx-secondary-link">
        {t('home.labsLink')} <a href="#/labs">{t('home.labsLinkText')}</a>
      </p>
    </ProductChrome>
  );
}
