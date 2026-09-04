import { describe, expect, it, beforeEach } from 'vitest';
import { getSession, getToken, isLoggedIn, setSession, updateUser, clearSession } from '../core/backend/session';
import type { Session } from '../core/backend/client';

/**
 * Stan sesji (in-memory źródło prawdy). Utrwalanie w localStorage jest cichym
 * dodatkiem — logika logowania/wylogowania musi działać niezależnie od tego, czy
 * magazyn jest dostępny (tryb prywatny przeglądarki itp.).
 */

const SAMPLE: Session = {
  token: 'tok-123',
  user: { id: 'u1', email: 'a@lab.org', displayName: 'Ala', createdAt: 1 },
  expiresInMs: 1000,
};

beforeEach(() => clearSession());

describe('session store', () => {
  it('starts logged out', () => {
    expect(isLoggedIn()).toBe(false);
    expect(getToken()).toBe(null);
    expect(getSession()).toBe(null);
  });

  it('setSession logs in and exposes token + user', () => {
    setSession(SAMPLE);
    expect(isLoggedIn()).toBe(true);
    expect(getToken()).toBe('tok-123');
    expect(getSession()?.user.email).toBe('a@lab.org');
  });

  it('updateUser refreshes the profile but keeps the token', () => {
    setSession(SAMPLE);
    updateUser({ id: 'u1', email: 'a@lab.org', displayName: 'Alicja', createdAt: 1 });
    expect(getToken()).toBe('tok-123');
    expect(getSession()?.user.displayName).toBe('Alicja');
  });

  it('updateUser is a no-op when logged out', () => {
    updateUser({ id: 'x', email: 'x@x.co', displayName: 'x', createdAt: 1 });
    expect(isLoggedIn()).toBe(false);
  });

  it('clearSession logs out', () => {
    setSession(SAMPLE);
    clearSession();
    expect(isLoggedIn()).toBe(false);
    expect(getToken()).toBe(null);
  });
});
