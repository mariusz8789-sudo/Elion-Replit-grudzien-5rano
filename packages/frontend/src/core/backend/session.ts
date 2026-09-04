import { useEffect, useState } from 'react';
import { readJSON, writeJSON, remove } from '../storage';
import type { Session, User } from './client';

/**
 * Stan sesji użytkownika (Milestone 1: Backend Persistence).
 *
 * Trzyma token + profil zalogowanego użytkownika, utrwala je lokalnie (żeby
 * odświeżenie strony nie wylogowywało) i rozgłasza zmiany do UI przez prosty
 * pub/sub + hook `useSession`. To CELOWO cienka warstwa: gdy nikt nie jest
 * zalogowany, aplikacja działa w pełni w trybie local-first — chmura jest opcją
 * współdzielenia, nie wymogiem.
 *
 * Uwaga bezpieczeństwa: token w localStorage jest wygodny i standardowy dla
 * SPA bez własnego serwera sesji ciasteczkowych; backend i tak wymusza wygasanie
 * (30 dni) i unieważnia token przy wylogowaniu. Nie przechowujemy hasła.
 */

const STORAGE_KEY = 'session/v1';

interface StoredSession {
  token: string;
  user: User;
}

let current: StoredSession | null = readJSON<StoredSession | null>(STORAGE_KEY, null);
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getSession(): StoredSession | null {
  return current;
}

export function getToken(): string | null {
  return current?.token ?? null;
}

export function isLoggedIn(): boolean {
  return current !== null;
}

/** Zapisuje sesję po udanym logowaniu/rejestracji. */
export function setSession(session: Session): void {
  current = { token: session.token, user: session.user };
  writeJSON(STORAGE_KEY, current);
  emit();
}

/** Aktualizuje profil (np. po odświeżeniu /auth/me) bez zmiany tokenu. */
export function updateUser(user: User): void {
  if (!current) return;
  current = { ...current, user };
  writeJSON(STORAGE_KEY, current);
  emit();
}

/** Czyści sesję lokalnie (wołane po wylogowaniu lub gdy token okaże się nieważny). */
export function clearSession(): void {
  current = null;
  remove(STORAGE_KEY);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Hook Reacta: aktualny stan sesji, reaguje na logowanie/wylogowanie w całej aplikacji. */
export function useSession(): StoredSession | null {
  const [snapshot, setSnapshot] = useState<StoredSession | null>(current);
  useEffect(() => subscribe(() => setSnapshot(current)), []);
  return snapshot;
}
