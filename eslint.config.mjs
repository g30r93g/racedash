// @ts-check
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  // Ignore build artefacts and generated files
  { ignores: ['**/dist/**', '**/node_modules/**', '**/out/**', '**/.next/**', '**/coverage/**', '**/next-env.d.ts'] },

  // Base TypeScript rules for all source files
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // React hooks rules for renderer
  {
    files: [
      'apps/renderer/**/*.tsx',
      'apps/renderer/**/*.ts',
      'apps/desktop/src/renderer/**/*.tsx',
      'apps/desktop/src/renderer/**/*.ts',
    ],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // CommonJS scripts — allow require()
  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
)
