import { useId, useState } from 'react';
import { useLocale, type Locale } from '../core/i18n';
import { passwordToggleState } from './auth/passwordAuthText';

/**
 * Pole hasła z przełącznikiem „pokaż / ukryj" (oko) — jedyna implementacja pola
 * hasła w aplikacji (logowanie, rejestracja, zmiana hasła, ustawienie nowego
 * hasła po resecie).
 *
 * Dostępność, świadomie:
 *  - przełącznik to prawdziwy `<button type="button">`, więc przeglądarka
 *    aktywuje go Enterem I spacją bez naszego kodu klawiatury, jest w kolejności
 *    Tab bez `tabindex`, a `type="button"` gwarantuje, że Enter w formularzu
 *    wysyła formularz, a nie „klika" oko;
 *  - `aria-pressed` niesie STAN, a `aria-label` mówi, co przycisk ZROBI
 *    („Pokaż hasło" / „Ukryj hasło") i zmienia się po przełączeniu — czytnik
 *    ekranu słyszy jedno i drugie;
 *  - `aria-controls` wiąże przycisk z polem, które przełącza;
 *  - 44×40 px pola dotyku (styles-account.css) — rozmiar na telefon.
 *
 * Bezpieczeństwo, świadomie: wartość hasła jest TYLKO w stanie React rodzica i
 * w atrybucie `value` pola. Ten komponent nie loguje jej, nie wysyła nigdzie i
 * nie zapisuje w żadnym magazynie — nie ma tu `console`, `localStorage` ani
 * `fetch`, a domyślny stan to `password`: odsłonięcie jest zawsze decyzją
 * użytkownika.
 *
 * Teksty pochodzą z `auth/passwordAuthText.ts` (PL/EN/AR) — w tym pliku nie ma
 * ani jednego napisu dla użytkownika.
 */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  hint,
  name,
  initialVisible = false,
  invalid = false,
  locale,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  minLength?: number;
  hint?: string;
  name?: string;
  initialVisible?: boolean;
  invalid?: boolean;
  /** Only to render one fixed language (tests, a screenshot); normally the app's own. */
  locale?: Locale;
}): JSX.Element {
  const [visible, setVisible] = useState(initialVisible);
  const activeLocale = useLocale();
  const id = useId();
  const state = passwordToggleState(visible, locale ?? activeLocale);
  return (
    <div className="account-field">
      <label htmlFor={id}>{label}{hint && <em> {hint}</em>}</label>
      <div className="password-wrap">
        <input
          id={id}
          name={name}
          type={state.inputType}
          required
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={invalid || undefined}
        />
        <button
          type="button"
          className="password-toggle"
          aria-pressed={state.pressed}
          aria-label={`${state.label}: ${label}`}
          aria-controls={id}
          title={state.label}
          onClick={() => setVisible((v) => !v)}
        >
          <span aria-hidden="true">{state.icon}</span>
        </button>
      </div>
    </div>
  );
}

export { passwordToggleState };
export default PasswordField;
