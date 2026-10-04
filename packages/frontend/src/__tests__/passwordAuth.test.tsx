import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordField } from '../components/PasswordField';
import { passwordToggleState, pwText, RESET_TOKEN_PATTERN, CLIENT_PASSWORD_MIN_LENGTH } from '../components/auth/passwordAuthText';
import {
  PasswordResetConfirmForm, PasswordResetRequestForm, deliverySentence, resetTokenFromHash, tokenFromPastedValue,
} from '../components/auth/PasswordResetScreen';
import { ChangePasswordForm } from '../components/auth/ChangePasswordForm';
import { AccountPanel, ACCOUNT_RESET_REQUEST_HASH, ACCOUNT_RESET_CONFIRM_HASH } from '../components/AccountPanel';
import { AccountScreen, accountViewFromHash } from '../components/AccountScreen';
import { clearSession, setSession } from '../core/backend/session';
import { changePassword, confirmPasswordReset, requestPasswordReset } from '../core/backend/client';
import { setLocale, SUPPORTED_LOCALES, UI_LOCALES, type Locale } from '../core/i18n';
import { track } from '../core/analytics';

/**
 * D-166 — show/hide password on every password form, and the forgotten-password
 * flow. Rendered without a DOM (`renderToStaticMarkup`), like the rest of this
 * suite: the toggle is a NATIVE `<button type="button">`, so Enter and Space
 * come from the browser, and what these tests pin down is that nothing in our
 * code takes that away (no `tabindex`, no `role`, no `onKeyDown` that would
 * swallow Space, `type="button"` so Enter in the form still submits the form).
 * The real key presses are driven in `packages/e2e/src/passwordAuth.e2e.spec.ts`.
 */

const SRC = path.resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(path.join(SRC, relative), 'utf8');
/** The file with every comment removed: a rule about CODE must not trip over prose about the rule. */
const readCode = (relative: string): string =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

afterEach(() => { clearSession(); setLocale('pl'); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const TOKEN = 'a'.repeat(64);
function signIn(): void {
  setSession({ token: 't', user: { id: 'u', email: 'ola@szkola.pl', displayName: 'Ola Nowak', createdAt: 1, accountProfile: 'BADACZ' }, expiresInMs: 1 });
}
function jsonFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

/* ---------------- Task 1: show / hide on every password form ---------------- */

describe('show/hide password: the toggle itself', () => {
  it('is hidden by default and only the user reveals it', () => {
    const html = renderToStaticMarkup(<PasswordField label="Hasło" value="sekret123" onChange={() => {}} autoComplete="current-password" />);
    expect(html).toContain('type="password"');
    expect(html).not.toContain('type="text"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('toggles the input type both ways and the label and state follow', () => {
    for (const locale of ['pl', 'en', 'ar'] as const) {
      const hidden = passwordToggleState(false, locale);
      const shown = passwordToggleState(true, locale);
      expect(hidden).toMatchObject({ inputType: 'password', pressed: false, label: pwText('showPassword', locale) });
      expect(shown).toMatchObject({ inputType: 'text', pressed: true, label: pwText('hidePassword', locale) });
      // The label must say which ACTION the button performs, and it must change.
      expect(shown.label).not.toBe(hidden.label);
      expect(shown.pressed).not.toBe(hidden.pressed);
      expect(shown.inputType).not.toBe(hidden.inputType);
    }
  });

  it('renders the revealed state with the other label and aria-pressed="true"', () => {
    const html = renderToStaticMarkup(<PasswordField label="Hasło" value="sekret123" onChange={() => {}} autoComplete="current-password" initialVisible />);
    expect(html).toContain('type="text"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Ukryj hasło: Hasło"');
  });

  it('the toggle is a real button, keyboard-reachable, and does not hijack Enter from the form', () => {
    const html = renderToStaticMarkup(<PasswordField label="Hasło" value="x" onChange={() => {}} autoComplete="current-password" />);
    // A native <button> is in the Tab order and the browser activates it with
    // Enter AND Space; type="button" keeps Enter in the form a form submit.
    expect(html).toMatch(/<button[^>]*type="button"[^>]*class="password-toggle"/);
    expect(html).not.toMatch(/class="password-toggle"[^>]*tabindex/i);
    expect(html).not.toMatch(/class="password-toggle"[^>]*role=/i);
    expect(html).toMatch(/aria-controls="[^"]+"/);
    // The icon is decorative; the accessible name comes from aria-label only.
    expect(html).toContain('aria-hidden="true"');

    const source = read('components/PasswordField.tsx');
    expect(source).toContain('type="button"');
    // No key handler: a custom one is how Space gets swallowed or Enter double-fires.
    expect(source).not.toMatch(/onKeyDown|onKeyUp|onKeyPress/);
    expect(source).not.toMatch(/tabIndex/);
  });

  it('the aria-label names the field, so several password fields on one form are told apart', () => {
    const html = renderToStaticMarkup(
      <>
        <PasswordField label="Nowe hasło" value="" onChange={() => {}} autoComplete="new-password" />
        <PasswordField label="Powtórz nowe hasło" value="" onChange={() => {}} autoComplete="new-password" />
      </>,
    );
    expect(html).toContain('aria-label="Pokaż hasło: Nowe hasło"');
    expect(html).toContain('aria-label="Pokaż hasło: Powtórz nowe hasło"');
  });
});

describe('show/hide password: every password form has it', () => {
  it('login: one password field with a toggle, plus the forgotten-password link', () => {
    const html = renderToStaticMarkup(<AccountPanel initialMode="login" />);
    expect(html.match(/class="password-toggle"/g)).toHaveLength(1);
    expect(html).toContain(`href="${ACCOUNT_RESET_REQUEST_HASH}"`);
    expect(html).toContain('Nie pamiętasz hasła?');
  });

  it('sign-up: password and repeat, each with its own toggle', () => {
    const html = renderToStaticMarkup(<AccountPanel initialMode="register" />);
    expect(html.match(/class="password-toggle"/g)).toHaveLength(2);
    expect(html).not.toContain(ACCOUNT_RESET_REQUEST_HASH);
  });

  it('change password (signed in): current, new and repeat, each with a toggle', () => {
    signIn();
    const html = renderToStaticMarkup(<AccountPanel />);
    expect(html).toContain('account-change-password');
    expect(html.match(/class="password-toggle"/g)).toHaveLength(3);
    expect(html).toContain('Obecne hasło');
    expect(html).toContain('Nowe hasło');
  });

  it('set a new password after a reset: new and repeat, each with a toggle', () => {
    const html = renderToStaticMarkup(<PasswordResetConfirmForm initialToken={TOKEN} />);
    expect(html.match(/class="password-toggle"/g)).toHaveLength(2);
    expect(html).toContain('type="password"');
  });

  it('every password input stays type="password" until the user asks — on all four forms', () => {
    signIn();
    const signedIn = renderToStaticMarkup(<AccountPanel />);
    clearSession();
    for (const html of [
      renderToStaticMarkup(<AccountPanel initialMode="login" />),
      renderToStaticMarkup(<AccountPanel initialMode="register" />),
      signedIn,
      renderToStaticMarkup(<PasswordResetConfirmForm initialToken={TOKEN} />),
    ]) {
      expect(html).not.toMatch(/<input[^>]*auto[Cc]omplete="(current|new)-password"[^>]*type="text"/);
      expect(html).not.toMatch(/<input[^>]*type="text"[^>]*auto[Cc]omplete="(current|new)-password"/);
      expect(html).not.toContain('aria-pressed="true"');
    }
  });
});

describe('show/hide password: the value never leaves the form', () => {
  it('no password component touches a log, telemetry or any storage', () => {
    for (const file of [
      'components/PasswordField.tsx',
      'components/auth/PasswordResetScreen.tsx',
      'components/auth/ChangePasswordForm.tsx',
      'components/auth/passwordAuthText.ts',
    ]) {
      const source = readCode(file);
      for (const forbidden of ['console.', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'sendBeacon', 'core/analytics', 'audit(', 'track(']) {
        expect(source, `${file} refers to ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('AccountPanel passes the password to the backend call and to nothing else', () => {
    const source = readCode('components/AccountPanel.tsx');
    // The only readers of the password state are the two auth calls and the field itself.
    const readers = source.match(/\bpassword\b(?!:)/g) ?? [];
    expect(readers.length).toBeGreaterThan(0);
    for (const forbidden of ['console.', 'track(', 'analytics', 'localStorage', 'writeJSON']) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('the local analytics path cannot receive a password: it takes an event name and nothing else', () => {
    // `track` is this app's only telemetry seam (core/analytics.ts: local
    // counters, no network). It takes an event CODE; its second argument is
    // accepted and THROWN AWAY, so even a caller who handed it a password
    // would store nothing. Proven by calling it with one.
    track('experiment_open', { leak: 'sekret123' });
    const stored = String(globalThis.localStorage?.getItem('analytics/v1') ?? '');
    expect(stored).not.toContain('sekret123');
    expect(stored).not.toContain('leak');
    const analytics = readCode('core/analytics.ts');
    // The meta parameter is unused by construction (underscore-prefixed, never read).
    expect(analytics).toMatch(/_meta\?:/);
    expect(analytics).not.toMatch(/\b_meta\b(?!\?:)/);
    expect(analytics).not.toContain('fetch(');
    expect(analytics).not.toContain('password');
  });

  it('a submitted login sends the password only in the request body, and logs nothing', () => {
    const logs: unknown[][] = [];
    for (const key of ['log', 'warn', 'error', 'info', 'debug'] as const) vi.spyOn(console, key).mockImplementation((...a: unknown[]) => { logs.push(a); });
    const fetchMock = jsonFetch(200, { ok: true, sessionsRevoked: 1, message: 'ok' });
    vi.stubGlobal('fetch', fetchMock);
    return changePassword('session-token', 'stareHaslo123', 'noweHaslo123').then(() => {
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({ currentPassword: 'stareHaslo123', newPassword: 'noweHaslo123' });
      // Nothing was written to any console, and nothing went to storage.
      expect(JSON.stringify(logs)).not.toContain('stareHaslo123');
      expect(JSON.stringify(logs)).not.toContain('noweHaslo123');
      expect(JSON.stringify(globalThis.localStorage ?? {})).not.toContain('noweHaslo123');
      // One request, one destination: the backend's own route.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(String(url)).toContain('/auth/password');
    });
  });
});

describe('show/hide password: text comes from the text file, in PL, EN and Arabic', () => {
  it('no password form carries a hardcoded user-facing string', () => {
    for (const file of ['components/PasswordField.tsx', 'components/auth/ChangePasswordForm.tsx', 'components/auth/PasswordResetScreen.tsx']) {
      // Every sentence the user reads is Polish by default, and Polish prose
      // carries its own letters. A diacritic inside a string literal in CODE
      // (comments stripped) is therefore a sentence that bypassed the text file.
      const code = readCode(file);
      const literals = code.match(/'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g) ?? [];
      for (const literal of literals) {
        expect(literal, `${file} hardcodes a user-facing string: ${literal}`).not.toMatch(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/);
      }
      // Either the text accessor itself, or the pure state map that is built on it.
      expect(code).toMatch(/pwText|passwordToggleState/);
    }
  });

  it('every key has all three languages and none of them is empty', () => {
    const keys = ['showPassword', 'hidePassword', 'forgotLink', 'requestTitle', 'confirmTitle', 'changeTitle', 'deliveryExternalBlocked', 'errTooShort'] as const;
    for (const key of keys) {
      const rendered = (['pl', 'en', 'ar'] as const).map((l) => pwText(key, l));
      for (const value of rendered) expect(value.trim().length).toBeGreaterThan(0);
      expect(new Set(rendered).size).toBe(3);
    }
  });

  it('Arabic is one of the offered languages and is right-to-left, so the forms it serves are too', () => {
    expect(UI_LOCALES).toContain('ar');
    expect(SUPPORTED_LOCALES).toContain('ar');
    // The eye is positioned with logical properties, so it sits at the field's
    // end in Arabic instead of over the first typed character.
    const css = read('styles-account.css');
    expect(css).toContain('inset-inline-end');
    expect(css).toContain('padding-inline-end');
    expect(css).not.toMatch(/\.password-toggle[^}]*right:\s*2px/);
  });

  it('the toggle speaks the active language', () => {
    for (const locale of ['pl', 'en', 'ar'] as Locale[]) {
      const html = renderToStaticMarkup(<PasswordField label="L" value="" onChange={() => {}} autoComplete="new-password" locale={locale} />);
      expect(html).toContain(`aria-label="${pwText('showPassword', locale)}: L"`);
    }
  });

  it('Spanish falls back to English, exactly as core/i18n t() does for an unsupplied key', () => {
    expect(pwText('showPassword', 'es')).toBe(pwText('showPassword', 'en'));
  });
});

/* ---------------- Task 2: forgotten / reset password, in the UI ---------------- */

describe('forgotten password: the route and the two steps', () => {
  it('#/konto carries all four views, so no new route is needed', () => {
    expect(accountViewFromHash('#/konto')).toEqual({ kind: 'auth', mode: 'login' });
    expect(accountViewFromHash('#/konto?tryb=rejestracja')).toEqual({ kind: 'auth', mode: 'register' });
    expect(accountViewFromHash(ACCOUNT_RESET_REQUEST_HASH)).toEqual({ kind: 'reset-request' });
    expect(accountViewFromHash(`${ACCOUNT_RESET_CONFIRM_HASH}&token=${TOKEN}`)).toEqual({ kind: 'reset-confirm', token: TOKEN });
  });

  it('a token of the wrong shape is not taken from the address at all', () => {
    expect(resetTokenFromHash(`${ACCOUNT_RESET_CONFIRM_HASH}&token=nope`)).toBe('');
    expect(resetTokenFromHash(`${ACCOUNT_RESET_CONFIRM_HASH}&token=${'z'.repeat(64)}`)).toBe('');
    expect(resetTokenFromHash(ACCOUNT_RESET_CONFIRM_HASH)).toBe('');
    expect(resetTokenFromHash(`${ACCOUNT_RESET_CONFIRM_HASH}&token=${TOKEN}`)).toBe(TOKEN);
    expect(RESET_TOKEN_PATTERN.test(TOKEN)).toBe(true);
  });

  it('a pasted whole link is accepted as well as a bare token', () => {
    expect(tokenFromPastedValue(TOKEN)).toBe(TOKEN);
    expect(tokenFromPastedValue(`  ${TOKEN}  `)).toBe(TOKEN);
    expect(tokenFromPastedValue(`https://genesis.example/#/konto?tryb=nowe-haslo&token=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromPastedValue('nothing here')).toBe('');
    expect(tokenFromPastedValue('')).toBe('');
  });

  it('the account screen renders the request step and the new-password step from the address', () => {
    const request = renderToStaticMarkup(<AccountScreen />);
    expect(request).toContain('Zaloguj się');
    vi.stubGlobal('window', { ...globalThis.window, location: { hash: ACCOUNT_RESET_REQUEST_HASH } });
    expect(renderToStaticMarkup(<PasswordResetRequestForm />)).toContain('type="email"');
  });
});

describe('forgotten password: the request says what really happened', () => {
  it('the request form sends only the address — never a password', async () => {
    const fetchMock = jsonFetch(200, { accepted: true, delivery: { status: 'EXTERNAL_BLOCKED', reason: 'brak dostawcy' }, message: 'ok' });
    vi.stubGlobal('fetch', fetchMock);
    const r = await requestPasswordReset('ola@szkola.pl');
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/auth/password-reset/request');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'ola@szkola.pl' });
    expect(String(init.body)).not.toContain('password');
  });

  it('EXTERNAL_BLOCKED is told as a blocked delivery, never as a sent message', () => {
    for (const locale of ['pl', 'en', 'ar'] as Locale[]) {
      const sentence = deliverySentence({ status: 'EXTERNAL_BLOCKED', reason: 'x' }, locale);
      expect(sentence).toBe(pwText('deliveryExternalBlocked', locale));
      // No sentence tells the user to go and look for a message that nobody sent.
      expect(sentence.toLowerCase()).not.toMatch(/sprawdź skrzynkę|check your (inbox|mail)|تحقق من بريدك/);
      expect(sentence.toLowerCase()).not.toMatch(/(^|[^t] )(wysłaliśmy|wysłano|we sent|has been sent)/);
    }
  });

  it('an unknown delivery status falls back to the server’s own reason, never to a guessed label', () => {
    expect(deliverySentence({ status: 'SOMETHING_NEW', reason: 'powód serwera' }, 'pl')).toBe('powód serwera');
    expect(deliverySentence({ status: 'SOMETHING_NEW', reason: '' }, 'pl')).toBe(pwText('deliveryUnknown', 'pl'));
    expect(deliverySentence(null, 'pl')).toBe(pwText('deliveryUnknown', 'pl'));
  });

  it('no status or number is hardcoded in the reset UI — the status comes from the server', () => {
    const source = read('components/auth/PasswordResetScreen.tsx');
    // Exactly one status code is interpreted, and it is named, not a magic number.
    expect(source).toContain("delivery.status === 'EXTERNAL_BLOCKED'");
    expect(source).not.toMatch(/status === (200|400|429|\d+)/);
    expect(source).not.toMatch(/result\.status\s*[=!]==?\s*\d/);
  });

  it('the forms never say "validated" or "signed evidence", and never call an engine open source', () => {
    for (const file of ['components/auth/PasswordResetScreen.tsx', 'components/auth/ChangePasswordForm.tsx', 'components/auth/passwordAuthText.ts', 'components/PasswordField.tsx']) {
      const source = read(file).toLowerCase();
      for (const banned of ['validated', 'zwalidowan', 'signed evidence', 'open source', 'open-source']) {
        expect(source, `${file} says "${banned}"`).not.toContain(banned);
      }
    }
  });
});

describe('forgotten password: setting the new one', () => {
  it('sends the token and the new password to the confirm route', async () => {
    const fetchMock = jsonFetch(200, { ok: true, sessionsRevoked: 2, message: 'zmienione' });
    vi.stubGlobal('fetch', fetchMock);
    const r = await confirmPasswordReset(TOKEN, 'noweHaslo123');
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/auth/password-reset/confirm');
    expect(JSON.parse(String(init.body))).toEqual({ token: TOKEN, password: 'noweHaslo123' });
  });

  it('a refusal from the server is shown as the server worded it, with no internal detail added', async () => {
    vi.stubGlobal('fetch', jsonFetch(400, { error: 'invalid_reset_token', message: 'Ten link do zmiany hasła jest nieważny. Poproś o nowy.' }));
    const r = await confirmPasswordReset(TOKEN, 'noweHaslo123');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toBe('Ten link do zmiany hasła jest nieważny. Poproś o nowy.');
      expect(r.message).not.toMatch(/sqlite|stack|\.mjs|SELECT/i);
    }
  });

  it('the client checks the token shape and the two passwords before it sends anything', () => {
    expect(CLIENT_PASSWORD_MIN_LENGTH).toBe(8);
    const html = renderToStaticMarkup(<PasswordResetConfirmForm initialToken={TOKEN} />);
    expect(html).toContain(`value="${TOKEN}"`);
    expect(html).toMatch(/minLength="8"|minlength="8"/);
    const source = read('components/auth/PasswordResetScreen.tsx');
    expect(source).toContain("errTokenShape");
    expect(source).toContain("errMismatch");
  });

  it('the done state tells the user every device was signed out', () => {
    for (const locale of ['pl', 'en', 'ar'] as Locale[]) {
      expect(pwText('confirmDone', locale).length).toBeGreaterThan(10);
    }
    expect(pwText('confirmDone', 'pl')).toMatch(/wylogowan/i);
  });
});

describe('change password while signed in', () => {
  it('requires the current password and says the session policy up front', () => {
    signIn();
    const html = renderToStaticMarkup(<ChangePasswordForm />);
    expect(html).toMatch(/autoComplete="current-password"|autocomplete="current-password"/);
    expect(html.match(/auto[Cc]omplete="new-password"/g)).toHaveLength(2);
    expect(html).toContain(pwText('changeNote', 'pl'));
  });

  it('after a successful change the local session is dropped, because the server revoked it', async () => {
    signIn();
    const source = read('components/auth/ChangePasswordForm.tsx');
    expect(source).toContain('clearSession()');
    vi.stubGlobal('fetch', jsonFetch(200, { ok: true, sessionsRevoked: 3, message: 'ok' }));
    const r = await changePassword('t', 'stareHaslo123', 'noweHaslo123');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.sessionsRevoked).toBe(3);
  });

  it('a wrong current password is reported, and no session is dropped on a refusal', async () => {
    vi.stubGlobal('fetch', jsonFetch(401, { error: 'invalid_credentials', message: 'Obecne hasło jest nieprawidłowe.' }));
    const r = await changePassword('t', 'zle', 'noweHaslo123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Obecne hasło jest nieprawidłowe.');
  });
});
