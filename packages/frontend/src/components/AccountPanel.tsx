import { useEffect, useState } from 'react';
import { register, login, logout, me } from '../core/backend/client';
import { useSession, setSession, clearSession, getToken, updateUser } from '../core/backend/session';
import { ACCOUNT_PROFILES, PROFILE_TABLE, capabilityOverview, profileOfUser, type AccountProfile } from '../core/accountProfiles';
import { PasswordField } from './PasswordField';
import { ChangePasswordForm } from './auth/ChangePasswordForm';
import { pwText } from './auth/passwordAuthText';
import { useLocale } from '../core/i18n';

/**
 * Panel konta — jedyna implementacja logowania i rejestracji w aplikacji
 * (używają go ekran Konto, Ustawienia i LockedScreen). Realne konto na
 * backendzie trwałości; local-first zostaje domyślny: bez logowania aplikacja
 * działa offline, konto odblokowuje chmurę i obszary zależne od profilu.
 *
 * Rejestracja pyta o profil konta (Uczeń, Student, Nauczyciel, Badacz,
 * Instytucja). Profil decyduje o dostępie do obszarów — tabela jest jedna,
 * w packages/backend/src/accountProfiles.mjs, i ta sama egzekwuje backend.
 */

export type AccountMode = 'login' | 'register';

/** Adresy obu kroków resetu hasła (D-166) — jedno miejsce prawdy dla linków. */
export const ACCOUNT_RESET_REQUEST_HASH = '#/konto?tryb=reset-haslo';
export const ACCOUNT_RESET_CONFIRM_HASH = '#/konto?tryb=nowe-haslo';

/** Walidacja formularza rejestracji po stronie klienta — ten sam próg co backend, komunikaty po polsku. */
export function validateRegisterForm(input: { email: string; password: string; repeat: string; profile: AccountProfile | null }): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return 'Podaj poprawny adres e-mail.';
  if (input.password.length < 8) return 'Hasło musi mieć co najmniej 8 znaków.';
  if (input.password !== input.repeat) return 'Hasła nie są takie same.';
  if (!input.profile) return 'Wybierz, kim jesteś — od tego zależy, co zobaczysz w Genesis.';
  return null;
}

export function AccountPanel({ initialMode = 'login', onModeChange }: { initialMode?: AccountMode; onModeChange?: (mode: AccountMode) => void } = {}) {
  const session = useSession();
  const locale = useLocale();
  const [mode, setModeState] = useState<AccountMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setModeState(initialMode); }, [initialMode]);

  // Sesja zapisana przed wprowadzeniem profili nie zna profilu — odśwież profil z serwera.
  const token = session?.token ?? null;
  useEffect(() => {
    if (!token) return;
    let alive = true;
    void me(token).then((r) => {
      if (!alive) return;
      if (r.ok) updateUser(r.data);
      else if (r.status === 401) clearSession();
    });
    return () => { alive = false; };
  }, [token]);

  function setMode(next: AccountMode) {
    setModeState(next);
    setError(null);
    onModeChange?.(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'register') {
      const invalid = validateRegisterForm({ email, password, repeat, profile });
      if (invalid) { setError(invalid); return; }
    }
    setBusy(true);
    const result = mode === 'register'
      ? await register(email.trim(), password, displayName.trim() || undefined, profile ?? undefined)
      : await login(email.trim(), password);
    setBusy(false);
    if (result.ok) {
      setSession(result.data);
      setEmail('');
      setPassword('');
      setRepeat('');
      setDisplayName('');
      setProfile(null);
      // Po wylogowaniu panel ma pokazać logowanie, nie pusty formularz rejestracji.
      if (mode === 'register') setMode('login');
    } else {
      setError(result.message);
    }
  }

  async function handleLogout() {
    const t = getToken();
    if (t) await logout(t);
    clearSession();
  }

  if (session) {
    const current = profileOfUser(session.user)!;
    return (
      <div className="account-panel" data-testid="account-signed-in">
        <div className="account-current">
          <span className="account-avatar" aria-hidden="true">👤</span>
          <div className="account-current-info">
            <strong>{session.user.displayName}</strong>
            <span className="account-email">{session.user.email}</span>
            <span className="account-profile-badge" data-testid="account-profile">Profil: {PROFILE_TABLE[current].label}</span>
          </div>
        </div>
        <ul className="account-caps" aria-label="Dostęp dla Twojego profilu">
          {capabilityOverview(current).map((c) => (
            <li key={c.capability} className={c.allowed ? 'is-open' : 'is-locked'}>
              <span aria-hidden="true">{c.allowed ? '✓' : '🔒'}</span>
              <span>{c.label}</span>
              <span className="visually-hidden">{c.allowed ? ' — dostępne' : ' — zablokowane'}</span>
            </li>
          ))}
        </ul>
        <ChangePasswordForm />
        <button className="chip-btn" onClick={handleLogout}>Wyloguj się</button>
      </div>
    );
  }

  return (
    <div className="account-panel">
      <div className="account-tabs" role="tablist" aria-label="Logowanie lub rejestracja">
        <button type="button" role="tab" aria-selected={mode === 'login'} className={`account-tab${mode === 'login' ? ' active' : ''}`} onClick={() => setMode('login')}>
          Zaloguj się
        </button>
        <button type="button" role="tab" aria-selected={mode === 'register'} className={`account-tab${mode === 'register' ? ' active' : ''}`} onClick={() => setMode('register')}>
          Utwórz konto
        </button>
      </div>
      <form className="account-form" onSubmit={submit} noValidate>
        {mode === 'register' && (
          <label className="account-field">
            <span>Imię lub nazwa wyświetlana <em>(opcjonalnie)</em></span>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} autoComplete="nickname" />
          </label>
        )}
        <label className="account-field">
          <span>E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" autoCapitalize="off" spellCheck={false} />
        </label>
        <PasswordField
          label="Hasło"
          hint={mode === 'register' ? '(min. 8 znaków)' : undefined}
          value={password}
          onChange={setPassword}
          minLength={mode === 'register' ? 8 : undefined}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        />
        {mode === 'register' && (
          <>
            <PasswordField
              label="Powtórz hasło"
              value={repeat}
              onChange={setRepeat}
              minLength={8}
              autoComplete="new-password"
              invalid={repeat.length > 0 && repeat !== password}
            />
            <fieldset className="profile-picker">
              <legend>Kim jesteś?</legend>
              <p className="profile-picker-hint">Od profilu zależy, które obszary Genesis są dla Ciebie otwarte.</p>
              {ACCOUNT_PROFILES.map((code) => (
                <label key={code} className={`profile-card${profile === code ? ' selected' : ''}`}>
                  <input type="radio" name="accountProfile" value={code} checked={profile === code} onChange={() => setProfile(code)} />
                  <span className="profile-card-text">
                    <strong>{PROFILE_TABLE[code].label}</strong>
                    <span>{PROFILE_TABLE[code].description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </>
        )}
        {error && <div className="account-error" role="alert">{error}</div>}
        <button className="chip-btn primary account-submit" type="submit" disabled={busy}>
          {busy ? 'Chwila…' : mode === 'register' ? 'Utwórz konto' : 'Zaloguj się'}
        </button>
        {mode === 'login' && (
          <p className="account-forgot">
            <a href={ACCOUNT_RESET_REQUEST_HASH} data-testid="account-forgot-password">{pwText('forgotLink', locale)}</a>
          </p>
        )}
      </form>
      <p className="settings-hint">
        Konto jest opcjonalne — bez logowania Genesis działa lokalnie. Hasło jest haszowane (scrypt) po stronie
        serwera i nigdy nie jest przechowywane jawnie.
      </p>
    </div>
  );
}
