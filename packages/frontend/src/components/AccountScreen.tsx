import { useEffect, useState } from 'react';
import { AccountPanel, type AccountMode } from './AccountPanel';
import { useSession } from '../core/backend/session';
import { ACCOUNT_PROFILES, PROFILE_TABLE } from '../core/accountProfiles';
import { useLocale } from '../core/i18n';
import { pwText } from './auth/passwordAuthText';
import { PasswordResetConfirmForm, PasswordResetRequestForm, resetTokenFromHash } from './auth/PasswordResetScreen';

/**
 * KONTO — ekran logowania i rejestracji (`#/konto`, `#/konto?tryb=rejestracja`),
 * dostępny z nawigacji (pasek boczny, dolny pasek na telefonie, menu ☰).
 * Cała logika konta żyje w AccountPanel; ten ekran to tylko układ strony.
 */

export function accountModeFromHash(hash: string): AccountMode {
  const query = new URLSearchParams(hash.split('?')[1] ?? '');
  return query.get('tryb') === 'rejestracja' ? 'register' : 'login';
}

/**
 * D-166 — ten jeden ekran obsługuje cztery widoki konta: logowanie,
 * rejestrację i dwa kroki zapomnianego hasła. Reset mieszka pod `#/konto`
 * (parametr `tryb`), więc link z adresu działa bez nowej trasy w App.tsx, a
 * token z linku jest brany tylko wtedy, gdy ma kształt tokenu.
 */
export type AccountView =
  | { kind: 'auth'; mode: AccountMode }
  | { kind: 'reset-request' }
  | { kind: 'reset-confirm'; token: string };

export function accountViewFromHash(hash: string): AccountView {
  const tryb = new URLSearchParams(hash.split('?')[1] ?? '').get('tryb');
  if (tryb === 'reset-haslo') return { kind: 'reset-request' };
  if (tryb === 'nowe-haslo') return { kind: 'reset-confirm', token: resetTokenFromHash(hash) };
  return { kind: 'auth', mode: accountModeFromHash(hash) };
}

export function AccountScreen(): JSX.Element {
  const session = useSession();
  const locale = useLocale();
  const [view, setView] = useState<AccountView>(() => accountViewFromHash(typeof window === 'undefined' ? '' : window.location.hash));
  useEffect(() => {
    const onHash = (): void => setView(accountViewFromHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const onModeChange = (next: AccountMode): void => {
    const target = next === 'register' ? '#/konto?tryb=rejestracja' : '#/konto';
    if (window.location.hash !== target) window.history.replaceState(null, '', target);
    setView({ kind: 'auth', mode: next });
  };

  const resetting = view.kind !== 'auth';
  const title = resetting
    ? pwText(view.kind === 'reset-request' ? 'requestTitle' : 'confirmTitle', locale)
    : session ? 'Twoje konto' : view.mode === 'register' ? 'Załóż konto' : 'Zaloguj się';

  return (
    <main className="locked-screen account-screen" id="main-content" tabIndex={-1}>
      <div className="locked-inner">
        <section className="locked-pitch">
          <span className="locked-icon" aria-hidden="true">{resetting ? '🔑' : '👤'}</span>
          <h1 className="locked-title">{title}</h1>
          <p className="locked-lede">
            {resetting
              ? pwText(view.kind === 'reset-request' ? 'requestLead' : 'confirmLead', locale)
              : session
                ? 'Tu widzisz swój profil i obszary Genesis, które są dla niego otwarte.'
                : 'Konto zapisuje Twoje projekty na serwerze i dopasowuje Genesis do tego, kim jesteś.'}
          </p>
          {!session && !resetting && (
            <ul className="locked-caps account-profile-list">
              {ACCOUNT_PROFILES.map((code) => (
                <li key={code}><span aria-hidden="true">◆</span><span><strong>{PROFILE_TABLE[code].label}</strong> — {PROFILE_TABLE[code].description}</span></li>
              ))}
            </ul>
          )}
        </section>
        <section className="locked-auth" aria-label={resetting ? title : session ? 'Konto' : 'Logowanie i rejestracja'}>
          {view.kind === 'reset-request' && <PasswordResetRequestForm />}
          {view.kind === 'reset-confirm' && <PasswordResetConfirmForm initialToken={view.token} />}
          {view.kind === 'auth' && <AccountPanel initialMode={view.mode} onModeChange={onModeChange} />}
        </section>
      </div>
    </main>
  );
}

export default AccountScreen;
