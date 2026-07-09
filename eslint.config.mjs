import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Lint Genesis OS. Zasady dobrane pod projekt naukowy:
 * - twarde błędy dla realnych bugów (nieużyte zmienne, brak await, ==),
 * - bez wojen stylistycznych (styl trzyma Prettier).
 */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'packages/frontend/public/sw.js'] },
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
      globals: { console: 'readonly', process: 'readonly', setTimeout: 'readonly', setInterval: 'readonly', URL: 'readonly' },
    },
    rules: {
      'no-console': 'off', // backend loguje przez console (strukturalny JSON)
    },
  },
);
