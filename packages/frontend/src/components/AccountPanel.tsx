import { useState } from 'react';
import { register, login, logout } from '../core/backend/client';
import { useSession, setSession, clearSession, getToken } from '../core/backend/session';
import { useI18n } from '../core/i18n';

/**
 * Panel konta (Milestone 1: Backend Persistence). Realne logowanie/rejestracja
 * przez backend trwałości — daje dostęp do współdzielonych Projektów i trwałych,
 * reprodukowalnych Serii Prób. Local-first zostaje domyślny: bez logowania cała
 * aplikacja działa offline, konto jest OPCJĄ współdzielenia w chmurze.
 */

type Mode = 'login' | 'register';

export function AccountPanel() {
  const session = useSession();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = mode === 'register' ? await register(email, password, displayName || undefined) : await login(email, password);
    setBusy(false);
    if (result.ok) {
      setSession(result.data);
      setEmail('');
      setPassword('');
      setDisplayName('');
    } else {
      setError(result.message);
    }
  }

  async function handleLogout() {
    const token = getToken();
    if (token) await logout(token);
    clearSession();
  }

  if (session) {
    return (
      <div className="account-panel">
        <div className="account-current">
          <span className="account-avatar" aria-hidden="true">👤</span>
          <div className="account-current-info">
            <strong>{session.user.displayName}</strong>
            <span className="account-email">{session.user.email}</span>
          </div>
        </div>
        <p className="settings-hint">{t('acct.loggedIn')}</p>
        <button className="chip-btn" onClick={handleLogout}>{t('common.signOut')}</button>
      </div>
    );
  }

  return (
    <div className="account-panel">
      <div className="account-tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'login'} className={`account-tab${mode === 'login' ? ' active' : ''}`} onClick={() => setMode('login')}>
          {t('common.signIn')}
        </button>
        <button role="tab" aria-selected={mode === 'register'} className={`account-tab${mode === 'register' ? ' active' : ''}`} onClick={() => setMode('register')}>
          {t('acct.register')}
        </button>
      </div>
      <form className="account-form" onSubmit={submit}>
        {mode === 'register' && (
          <label className="account-field">
            <span>{t('acct.displayName')}</span>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} autoComplete="nickname" />
          </label>
        )}
        <label className="account-field">
          <span>{t('acct.email')}</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="account-field">
          <span>{t('acct.password')} {mode === 'register' && <em>{t('acct.passwordMin')}</em>}</span>
          <input type="password" required minLength={mode === 'register' ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
        </label>
        {error && <div className="account-error" role="alert">{error}</div>}
        <button className="chip-btn primary" type="submit" disabled={busy}>
          {busy ? t('acct.busy') : mode === 'register' ? t('acct.register') : t('common.signIn')}
        </button>
      </form>
      <p className="settings-hint">{t('acct.optional')}</p>
    </div>
  );
}
