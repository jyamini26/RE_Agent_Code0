import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // An underscore prefix is the project's marker for a deliberately unused
      // binding, which is common in Express middleware signatures.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Non-null assertions appear only where config.ts has already validated
      // the invariant; each one carries a comment saying so.
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    // The logger is the one module allowed to reach console directly.
    files: ['apps/api/src/logger.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    files: ['**/*.test.{ts,tsx}', '**/test/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
