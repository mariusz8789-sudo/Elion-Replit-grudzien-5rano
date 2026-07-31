import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Lint Genesis OS. Zasady dobrane pod projekt naukowy:
 * - twarde błędy dla realnych bugów (nieużyte zmienne, brak await, ==),
 * - bez wojen stylistycznych (styl trzyma Prettier).
 */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'packages/frontend/public/sw.js', 'packages/backend/src/compute/core.bundle.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['packages/backend/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly', process: 'readonly', setTimeout: 'readonly', setInterval: 'readonly',
        clearTimeout: 'readonly', setImmediate: 'readonly', URL: 'readonly', Buffer: 'readonly', fetch: 'readonly',
        // Standard Node globals. This list is hand-maintained, so anything used
        // and not listed here fails CI with "is not defined" — which is what
        // happened to TextDecoder/TextEncoder/URLSearchParams.
        URLSearchParams: 'readonly', TextDecoder: 'readonly', TextEncoder: 'readonly',
        queueMicrotask: 'readonly', structuredClone: 'readonly',
      },
    },
    rules: {
      'no-console': 'off', // backend loguje przez console (strukturalny JSON)
      // The leading-underscore convention marks a binding that exists because a
      // signature or a destructuring requires it. It was applied to .ts only,
      // so the same deliberate code was an error in .mjs and not in .ts.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly', process: 'readonly', fetch: 'readonly', URL: 'readonly',
        // Timery i anulowanie żądań — realnie używane przez skrypty sieciowe
        // (verify-citations.mjs grzecznie odstępuje między zapytaniami i nakłada
        // limit czasu). Ta lista jest ręczna, więc brak wpisu wygląda jak błąd
        // w kodzie, a nie jak luka w konfiguracji.
        setTimeout: 'readonly', clearTimeout: 'readonly', AbortSignal: 'readonly',
        // Skrypty e2e (Playwright) używają globali przeglądarki wewnątrz page.evaluate().
        document: 'readonly', window: 'readonly', Event: 'readonly',
      },
    },
    rules: {
      'no-console': 'off', // skrypty CLI raportują postęp przez console
    },
  },
);
