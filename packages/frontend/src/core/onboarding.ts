import { readJSON, writeJSON } from './storage';

/**
 * Stan pierwszego uruchomienia — czy użytkownik ukończył (lub pominął)
 * krótkie wprowadzenie (`OnboardingOverlay`). Jeden boolean, jak
 * najprostszy możliwy magazyn: to nie jest postęp do śledzenia (patrz
 * discoveryLog.ts), tylko jednorazowa bramka "czy pokazywać nakładkę
 * powitalną przy starcie aplikacji".
 */

const KEY = 'onboarding/v1';

interface OnboardingState {
  completed: boolean;
}

function sanitize(raw: Partial<OnboardingState> | null | undefined): OnboardingState {
  return { completed: typeof raw?.completed === 'boolean' ? raw.completed : false };
}

export function hasCompletedOnboarding(): boolean {
  return sanitize(readJSON<Partial<OnboardingState> | null>(KEY, null)).completed;
}

/** Wołane zarówno po ukończeniu kroków, jak i po pominięciu — obie ścieżki liczą się jako "widziane". */
export function markOnboardingComplete(): void {
  writeJSON(KEY, { completed: true });
}
