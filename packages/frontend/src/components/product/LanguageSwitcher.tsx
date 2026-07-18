/**
 * LanguageSwitcher — compact language toggle. Driven by the LOCALES registry, so adding
 * a language (Spanish, German, French, Arabic, Chinese) needs no change here. The choice
 * is persisted by setLocale and re-renders every subscriber via useI18n.
 */
import { useI18n, LOCALES } from '../../core/i18n';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t('lang.label')}>
      {LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          className={`lang-opt${locale === l.code ? ' active' : ''}`}
          aria-pressed={locale === l.code}
          title={l.label}
          onClick={() => setLocale(l.code)}
        >
          {l.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
