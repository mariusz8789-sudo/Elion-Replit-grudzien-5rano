import { useState } from 'react';
import { useLocale } from '../../core/i18n';
import { confirmPasswordReset, requestPasswordReset, type ResetDelivery } from '../../core/backend/client';
import { PasswordField } from '../PasswordField';
import { CLIENT_PASSWORD_MIN_LENGTH, RESET_TOKEN_PATTERN, pwText } from './passwordAuthText';

/**
 * D-166 — zapomniane hasło: poproś o zmianę (`#/konto?tryb=reset-haslo`) i
 * ustaw nowe hasło jednorazowym tokenem (`#/konto?tryb=nowe-haslo&token=…`).
 *
 * Co ten ekran mówi uczciwie:
 *  - po żądaniu NIE pisze „wysłaliśmy maila". Pisze, że żądanie przyjęto, i
 *    osobno pokazuje STAN DOSTARCZENIA, który przyszedł od serwera. Dziś jest
 *    to `EXTERNAL_BLOCKED`: instancja nie ma dostawcy poczty, więc nic nie
 *    wyszło — i tak to jest napisane;
 *  - odpowiedź serwera jest ta sama dla konta, które istnieje, i dla adresu bez
 *    konta, więc ten ekran nie ma czego rozróżniać i nie próbuje;
 *  - statusy i teksty stanu dostarczenia są KODAMI od serwera (`status`), nigdy
 *    liczbami ani zdaniami wpisanymi w ten plik; nieznany kod pokazuje własne
 *    zdanie serwera, a nie zgadnięty napis.
 *
 * Teksty: `passwordAuthText.ts` (PL/EN/AR). Hasło żyje tylko w stanie React i w
 * ciele żądania — ten plik nie ma `console`, telemetrii ani zapisu do magazynu.
 */

/** Token z adresu albo z wklejonego linku — bierzemy tylko to, co ma kształt tokenu. */
export function resetTokenFromHash(hash: string): string {
  const fromQuery = new URLSearchParams(hash.split('?')[1] ?? '').get('token') ?? '';
  return RESET_TOKEN_PATTERN.test(fromQuery) ? fromQuery : '';
}

/**
 * Wklejony link albo sam token → token. Czysta funkcja: użytkownik, który
 * dostał link kanałem tekstowym, nie musi go rozbierać ręcznie.
 */
export function tokenFromPastedValue(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (RESET_TOKEN_PATTERN.test(trimmed)) return trimmed;
  const match = trimmed.match(/[0-9a-f]{64}/);
  return match ? match[0] : '';
}

/** Jedno zdanie o stanie dostarczenia. Kod `EXTERNAL_BLOCKED` ma własne zdanie; inny kod oddaje powód serwera. */
export function deliverySentence(delivery: ResetDelivery | null | undefined, locale: Parameters<typeof pwText>[1]): string {
  if (!delivery) return pwText('deliveryUnknown', locale);
  if (delivery.status === 'EXTERNAL_BLOCKED') return pwText('deliveryExternalBlocked', locale);
  return delivery.reason || pwText('deliveryUnknown', locale);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PasswordResetRequestForm(): JSX.Element {
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<ResetDelivery | null | undefined>(undefined);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email.trim())) { setError(pwText('errEmail', locale)); return; }
    setBusy(true);
    const result = await requestPasswordReset(email.trim());
    setBusy(false);
    if (result.ok) setAccepted(result.data.delivery ?? null);
    else setError(result.message || pwText('errOffline', locale));
  }

  if (accepted !== undefined) {
    return (
      <div className="account-panel" data-testid="reset-requested">
        <p className="account-note" role="status">{pwText('requestAccepted', locale)}</p>
        <section className="account-delivery" aria-label={pwText('deliveryHeading', locale)}>
          <strong>{pwText('deliveryHeading', locale)}</strong>
          <p data-testid="reset-delivery-status" data-delivery-status={accepted?.status ?? 'UNKNOWN'}>
            {deliverySentence(accepted, locale)}
          </p>
        </section>
        <a className="chip-btn" href="#/konto?tryb=nowe-haslo">{pwText('haveLink', locale)}</a>
      </div>
    );
  }

  return (
    <div className="account-panel">
      <form className="account-form" onSubmit={submit} noValidate>
        <p className="account-note">{pwText('requestLead', locale)}</p>
        <label className="account-field">
          <span>{pwText('emailLabel', locale)}</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" autoCapitalize="off" spellCheck={false} />
        </label>
        {error && <div className="account-error" role="alert">{error}</div>}
        <button className="chip-btn primary account-submit" type="submit" disabled={busy}>
          {busy ? pwText('requestBusy', locale) : pwText('requestSubmit', locale)}
        </button>
      </form>
      <p className="settings-hint"><a href="#/konto">{pwText('goToSignIn', locale)}</a></p>
    </div>
  );
}

export function PasswordResetConfirmForm({ initialToken = '' }: { initialToken?: string } = {}): JSX.Element {
  const locale = useLocale();
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const clean = tokenFromPastedValue(token);
    if (!clean) { setError(pwText('errTokenShape', locale)); return; }
    if (password.length < CLIENT_PASSWORD_MIN_LENGTH) { setError(pwText('errTooShort', locale)); return; }
    if (password !== repeat) { setError(pwText('errMismatch', locale)); return; }
    setBusy(true);
    const result = await confirmPasswordReset(clean, password);
    setBusy(false);
    // Hasła nie zostawiamy w pamięci komponentu dłużej, niż trzeba.
    setPassword('');
    setRepeat('');
    if (result.ok) { setDone(true); setToken(''); } else setError(result.message || pwText('errOffline', locale));
  }

  if (done) {
    return (
      <div className="account-panel" data-testid="reset-done">
        <p className="account-note" role="status">{pwText('confirmDone', locale)}</p>
        <a className="chip-btn primary" href="#/konto">{pwText('goToSignIn', locale)}</a>
      </div>
    );
  }

  return (
    <div className="account-panel">
      <form className="account-form" onSubmit={submit} noValidate>
        <p className="account-note">{pwText('confirmLead', locale)}</p>
        <label className="account-field">
          <span>{pwText('tokenLabel', locale)} <em>{pwText('tokenHint', locale)}</em></span>
          <input type="text" required value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
        </label>
        <PasswordField
          label={pwText('newPassword', locale)}
          hint={pwText('minLengthHint', locale)}
          value={password}
          onChange={setPassword}
          minLength={CLIENT_PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
        />
        <PasswordField
          label={pwText('repeatNewPassword', locale)}
          value={repeat}
          onChange={setRepeat}
          minLength={CLIENT_PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          invalid={repeat.length > 0 && repeat !== password}
        />
        {error && <div className="account-error" role="alert">{error}</div>}
        <button className="chip-btn primary account-submit" type="submit" disabled={busy}>
          {busy ? pwText('requestBusy', locale) : pwText('confirmSubmit', locale)}
        </button>
      </form>
      <p className="settings-hint"><a href="#/konto">{pwText('goToSignIn', locale)}</a></p>
    </div>
  );
}
