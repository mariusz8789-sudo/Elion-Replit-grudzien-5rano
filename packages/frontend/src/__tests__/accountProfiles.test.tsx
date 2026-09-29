import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACCOUNT_PROFILES, CAPABILITIES, PROFILE_TABLE, canUseCapability, capabilityDecision, capabilityOverview, profileOfUser,
} from '../core/accountProfiles';
import { PasswordField, passwordToggleState } from '../components/PasswordField';
import { AccountPanel, validateRegisterForm } from '../components/AccountPanel';
import { accountModeFromHash } from '../components/AccountScreen';
import { ProfileLockedScreen } from '../components/ProfileLockedScreen';
import { DrugDiscoveryScreen } from '../components/DrugDiscoveryScreen';
import { CampaignScreen } from '../components/CampaignScreen';
import { AppShell } from '../components/AppShell';
import { clearSession, setSession } from '../core/backend/session';
import { register } from '../core/backend/client';
import type { AccountProfile } from '../core/accountProfiles';

/**
 * Profil konta + bramka zdolności po stronie klienta, pole hasła z „okiem"
 * i ekrany konta. Renderowane bez DOM (renderToStaticMarkup) — interakcję
 * (klik w oko, rejestracja, logowanie) sprawdza przebieg Playwright.
 */

function signIn(accountProfile?: AccountProfile): void {
  setSession({ token: 't', user: { id: 'u', email: 'ola@szkola.pl', displayName: 'Ola Nowak', createdAt: 1, ...(accountProfile ? { accountProfile } : {}) }, expiresInMs: 1 });
}

afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

describe('capability gate (shared table, imported from the backend file)', () => {
  it('pupil and student: learning, Human Explorer, results — no engines, no drug discovery, no restricted sources', () => {
    for (const p of ['UCZEN', 'STUDENT'] as const) {
      expect(canUseCapability(p, CAPABILITIES.HUMAN_EXPLORER)).toBe(true);
      expect(canUseCapability(p, CAPABILITIES.READ_RESULTS)).toBe(true);
      expect(canUseCapability(p, CAPABILITIES.COMPUTE_RUN)).toBe(false);
      expect(canUseCapability(p, CAPABILITIES.DRUG_DISCOVERY)).toBe(false);
      expect(canUseCapability(p, CAPABILITIES.RESTRICTED_SOURCES)).toBe(false);
    }
  });

  it('teacher adds teaching; researcher opens engines but not restricted; institution opens everything', () => {
    expect(canUseCapability('NAUCZYCIEL', CAPABILITIES.TEACHING)).toBe(true);
    expect(canUseCapability('NAUCZYCIEL', CAPABILITIES.COMPUTE_RUN)).toBe(false);
    expect(canUseCapability('BADACZ', CAPABILITIES.DRUG_DISCOVERY)).toBe(true);
    expect(canUseCapability('BADACZ', CAPABILITIES.RESTRICTED_SOURCES)).toBe(false);
    expect(capabilityOverview('INSTYTUCJA').every((c) => c.allowed)).toBe(true);
  });

  it('a session saved before profiles existed is treated as BADACZ, like the migrated backend row', () => {
    expect(profileOfUser({})).toBe('BADACZ');
    expect(profileOfUser({ accountProfile: 'uczen' })).toBe('UCZEN');
    expect(profileOfUser(null)).toBe(null);
  });

  it('the locked reason is plain Polish and names who has access', () => {
    const d = capabilityDecision('UCZEN', CAPABILITIES.DRUG_DISCOVERY);
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('Twój profil to „Uczeń / szkoła”');
    expect(d.reason).toContain('Badacz / naukowiec');
  });
});

describe('password show/hide toggle', () => {
  it('maps state to input type, aria-pressed and label', () => {
    expect(passwordToggleState(false)).toMatchObject({ inputType: 'password', pressed: false, label: 'Pokaż hasło' });
    expect(passwordToggleState(true)).toMatchObject({ inputType: 'text', pressed: true, label: 'Ukryj hasło' });
  });

  it('renders hidden by default with an accessible, non-submitting toggle', () => {
    const html = renderToStaticMarkup(<PasswordField label="Hasło" value="sekret123" onChange={() => {}} autoComplete="current-password" />);
    expect(html).toContain('type="password"');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Pokaż hasło: Hasło"');
  });

  it('renders visible when toggled on', () => {
    const html = renderToStaticMarkup(<PasswordField label="Hasło" value="sekret123" onChange={() => {}} autoComplete="current-password" initialVisible />);
    expect(html).toContain('type="text"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Ukryj hasło: Hasło"');
  });
});

describe('registration and login forms', () => {
  it('registration shows e-mail, password + repeat (each with a toggle), name and the five profile cards', () => {
    const html = renderToStaticMarkup(<AccountPanel initialMode="register" />);
    expect(html).toContain('type="email"');
    expect(html).toContain('Powtórz hasło');
    expect(html).toContain('Imię lub nazwa wyświetlana');
    expect(html.match(/class="password-toggle"/g)).toHaveLength(2);
    expect(html.match(/name="accountProfile"/g)).toHaveLength(5);
    for (const code of ACCOUNT_PROFILES) {
      expect(html).toContain(PROFILE_TABLE[code].label);
      expect(html).toContain(PROFILE_TABLE[code].description);
    }
    expect(html).not.toMatch(/płatnoś|cennik|subskrypc/i);
  });

  it('login shows e-mail and one password with a toggle, no profile choice', () => {
    const html = renderToStaticMarkup(<AccountPanel initialMode="login" />);
    expect(html.match(/class="password-toggle"/g)).toHaveLength(1);
    expect(html).not.toContain('name="accountProfile"');
  });

  it('client-side validation speaks Polish', () => {
    const ok = { email: 'a@b.pl', password: 'password1', repeat: 'password1', profile: 'UCZEN' as const };
    expect(validateRegisterForm(ok)).toBe(null);
    expect(validateRegisterForm({ ...ok, email: 'x' })).toBe('Podaj poprawny adres e-mail.');
    expect(validateRegisterForm({ ...ok, password: 'short', repeat: 'short' })).toBe('Hasło musi mieć co najmniej 8 znaków.');
    expect(validateRegisterForm({ ...ok, repeat: 'password2' })).toBe('Hasła nie są takie same.');
    expect(validateRegisterForm({ ...ok, profile: null })).toMatch(/Wybierz, kim jesteś/);
  });

  it('register sends the chosen profile to the backend', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ token: 't', user: {}, expiresInMs: 1 }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await register('a@b.pl', 'password1', 'Ala', 'STUDENT');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ accountProfile: 'STUDENT' });
  });

  it('the account route picks the form from the hash', () => {
    expect(accountModeFromHash('#/konto')).toBe('login');
    expect(accountModeFromHash('#/konto?tryb=rejestracja')).toBe('register');
  });

  it('signed in: name, profile and the open/locked areas, plus log out', () => {
    signIn('UCZEN');
    const html = renderToStaticMarkup(<AccountPanel />);
    expect(html).toContain('Ola Nowak');
    expect(html).toContain('Profil: Uczeń / szkoła');
    expect(html).toContain('Wyloguj się');
    expect(html).toContain('is-locked');
  });
});

describe('navigation entry and locked areas', () => {
  it('logged out: the shell shows "Zaloguj się" in the sidebar and "Zaloguj" in the mobile bar', () => {
    const html = renderToStaticMarkup(<AppShell>x</AppShell>);
    expect(html).toContain('data-testid="shell-account"');
    expect(html).toContain('Zaloguj się');
    expect(html).toContain('data-testid="mobile-account"');
    expect(html).toContain('>Zaloguj<');
  });

  it('logged in: the shell shows the name and the profile', () => {
    signIn('STUDENT');
    const html = renderToStaticMarkup(<AppShell>x</AppShell>);
    expect(html).toContain('Ola Nowak');
    expect(html).toContain('Student');
  });

  it('a pupil opening Drug Discovery or a campaign sees a locked state with its reason', () => {
    signIn('UCZEN');
    for (const screen of [<DrugDiscoveryScreen key="d" />, <CampaignScreen key="c" />]) {
      const html = renderToStaticMarkup(screen);
      expect(html).toContain('data-testid="profile-locked"');
      expect(html).toContain('Zablokowane dla profilu „Uczeń / szkoła”');
      expect(html).toContain('Kampanie odkrywania leków');
    }
  });

  it('the locked screen offers Human Explorer instead of a dead end', () => {
    const html = renderToStaticMarkup(<ProfileLockedScreen icon="💊" title="Drug Discovery" profile="STUDENT" capability={CAPABILITIES.DRUG_DISCOVERY} />);
    expect(html).toContain('href="#/human-biology-lab"');
    expect(html).toContain('href="#/konto"');
  });
});
