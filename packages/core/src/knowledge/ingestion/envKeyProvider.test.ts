/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { envKeyProvider, KEY_ENV_NAMES } from './EnvKeyProvider.js';
describe('envKeyProvider', () => {
  it('reads a present key and treats empty/whitespace as absent', () => {
    expect(envKeyProvider({ YOUTUBE_API_KEY: ' abc ' }, KEY_ENV_NAMES.YOUTUBE).getKey()).toBe('abc');
    expect(envKeyProvider({ YOUTUBE_API_KEY: '' }, KEY_ENV_NAMES.YOUTUBE).getKey()).toBeNull();
    expect(envKeyProvider({}, KEY_ENV_NAMES.X).getKey()).toBeNull();
  });
});
