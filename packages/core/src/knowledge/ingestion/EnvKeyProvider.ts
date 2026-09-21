/* Proprietary / All Rights Reserved - Genesis OS */
import type { KeyProvider } from './YouTubeOfficialApiAdapter.js';
/**
 * KeyProvider over an injected environment map (the backend passes `process.env`; tests pass a
 * plain object). Empty or whitespace-only values count as "no key", so an empty `.env.example`
 * line never turns into a credential. Secrets are never logged or echoed by this module.
 */
export function envKeyProvider(env: Readonly<Record<string, string | undefined>>, name: string): KeyProvider {
  return { getKey: () => { const v = env[name]; return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null; } };
}
export const KEY_ENV_NAMES = Object.freeze({ YOUTUBE: 'YOUTUBE_API_KEY', X: 'X_API_KEY', FACEBOOK: 'FACEBOOK_API_KEY' } as const);
