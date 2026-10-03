import { useEffect, useState } from 'react';
import { AccountPanel, type AccountMode } from './AccountPanel';
import { useSession } from '../core/backend/session';
import { ACCOUNT_PROFILES, PROFILE_TABLE } from '../core/accountProfiles';

/**
 * KONTO — ekran logowania i rejestracji (`#/konto`, `#/konto?tryb=rejestracja`),
 * dostępny z nawigacji (pasek boczny, dolny pasek na telefonie, menu ☰).
 * Cała logika konta żyje w AccountPanel; ten ekran to tylko układ strony.
 */

export function accountModeFromHash(hash: string): AccountMode {
  const query = new URLSearchParams(hash.split('?')[1] ?? '');
  return query.get('tryb') === 'rejestracja' ? 'register' : 'login';
}

export function AccountScreen(): JSX.Element {
  const session = useSession();
  const [mode, setMode] = useState<AccountMode>(() => accountModeFromHash(typeof window === 'undefined' ? '' : window.location.hash));
  useEffect(() => {
    const onHash = (): void => setMode(accountModeFromHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const onModeChange = (next: AccountMode): void => {
    const target = next === 'register' ? '#/konto?tryb=rejestracja' : '#/konto';
    if (window.location.hash !== target) window.history.replaceState(null, '', target);
    setMode(next);
  };

  return (
    <main className="locked-screen account-screen" id="main-content" tabIndex={-1}>
      <div className="locked-inner">
        <section className="locked-pitch">
          <span className="locked-icon" aria-hidden="true">👤</span>
          <h1 className="locked-title">{session ? 'Twoje konto' : mode === 'register' ? 'Załóż konto' : 'Zaloguj się'}</h1>
          <p className="locked-lede">
            {session
              ? 'Tu widzisz swój profil i obszary Genesis, które są dla niego otwarte.'
              : 'Konto zapisuje Twoje projekty na serwerze i dopasowuje Genesis do tego, kim jesteś.'}
          </p>
          {!session && (
            <ul className="locked-caps account-profile-list">
              {ACCOUNT_PROFILES.map((code) => (
                <li key={code}><span aria-hidden="true">◆</span><span><strong>{PROFILE_TABLE[code].label}</strong> — {PROFILE_TABLE[code].description}</span></li>
              ))}
            </ul>
          )}
        </section>
        <section className="locked-auth" aria-label={session ? 'Konto' : 'Logowanie i rejestracja'}>
          <AccountPanel initialMode={mode} onModeChange={onModeChange} />
        </section>
      </div>
    </main>
  );
}

export default AccountScreen;
