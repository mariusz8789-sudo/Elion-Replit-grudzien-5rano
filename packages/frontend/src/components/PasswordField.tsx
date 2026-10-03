import { useId, useState } from 'react';

/**
 * Pole hasła z przełącznikiem „pokaż / ukryj" (oko). Przełącznik to prawdziwy
 * <button type="button"> z aria-pressed i opisową etykietą, więc czytnik ekranu
 * słyszy stan, a Enter w formularzu nigdy go nie „klika" zamiast wysłać.
 */

/** Czysta mapa stanu → atrybuty; testowana osobno (bez DOM). */
export function passwordToggleState(visible: boolean): { inputType: 'text' | 'password'; pressed: boolean; label: string; icon: string } {
  return visible
    ? { inputType: 'text', pressed: true, label: 'Ukryj hasło', icon: '🙈' }
    : { inputType: 'password', pressed: false, label: 'Pokaż hasło', icon: '👁' };
}

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
}): JSX.Element {
  const [visible, setVisible] = useState(initialVisible);
  const id = useId();
  const state = passwordToggleState(visible);
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

export default PasswordField;
