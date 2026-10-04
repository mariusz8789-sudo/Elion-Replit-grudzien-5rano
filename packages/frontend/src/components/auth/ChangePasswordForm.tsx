import { useState } from 'react';
import { useLocale } from '../../core/i18n';
import { changePassword } from '../../core/backend/client';
import { clearSession, getToken } from '../../core/backend/session';
import { PasswordField } from '../PasswordField';
import { CLIENT_PASSWORD_MIN_LENGTH, pwText } from './passwordAuthText';

/**
 * D-166 — zmiana hasła przez zalogowanego użytkownika (ekran Konto).
 *
 * Wymaga obecnego hasła: sam token sesji nie wystarcza, bo przejęta sesja nie
 * ma dawać prawa do podmiany hasła. Po udanej zmianie serwer kasuje KAŻDĄ sesję
 * konta, więc ten komponent od razu czyści sesję lokalną — inaczej aplikacja
 * trzymałaby token, który serwer już odrzuca, i użytkownik widziałby siebie
 * jako zalogowanego aż do pierwszego żądania.
 *
 * Teksty: `passwordAuthText.ts` (PL/EN/AR). Hasła żyją tylko w stanie React i w
 * ciele żądania — ani `console`, ani telemetria, ani magazyn ich nie widzą.
 */
export function ChangePasswordForm(): JSX.Element {
  const locale = useLocale();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (next.length < CLIENT_PASSWORD_MIN_LENGTH) { setError(pwText('errTooShort', locale)); return; }
    if (next !== repeat) { setError(pwText('errMismatch', locale)); return; }
    const token = getToken();
    if (!token) { clearSession(); return; }
    setBusy(true);
    const result = await changePassword(token, current, next);
    setBusy(false);
    setCurrent('');
    setNext('');
    setRepeat('');
    if (result.ok) {
      setDone(true);
      // Serwer przerwał wszystkie sesje, w tym tę — nie udajemy, że trwa.
      clearSession();
    } else {
      setError(result.message || pwText('errOffline', locale));
    }
  }

  if (done) {
    return <p className="account-note" role="status" data-testid="password-changed">{pwText('confirmDone', locale)}</p>;
  }

  return (
    <details className="account-change-password">
      <summary>{pwText('changeTitle', locale)}</summary>
      <form className="account-form" onSubmit={submit} noValidate>
        <PasswordField label={pwText('currentPassword', locale)} value={current} onChange={setCurrent} autoComplete="current-password" />
        <PasswordField
          label={pwText('newPassword', locale)}
          hint={pwText('minLengthHint', locale)}
          value={next}
          onChange={setNext}
          minLength={CLIENT_PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
        />
        <PasswordField
          label={pwText('repeatNewPassword', locale)}
          value={repeat}
          onChange={setRepeat}
          minLength={CLIENT_PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          invalid={repeat.length > 0 && repeat !== next}
        />
        {error && <div className="account-error" role="alert">{error}</div>}
        <p className="settings-hint">{pwText('changeNote', locale)}</p>
        <button className="chip-btn primary account-submit" type="submit" disabled={busy}>
          {busy ? pwText('requestBusy', locale) : pwText('changeSubmit', locale)}
        </button>
      </form>
    </details>
  );
}

export default ChangePasswordForm;
