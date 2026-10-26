// ESLint flat config — menjaga fokus pada kode server (MJS) dan aturan React dasar.
// Pemeriksaan TypeScript tetap ditangani `tsc --noEmit` karena proyek memakai TS 7
// yang yet belum didukung typescript-eslint.
import eslint from '@eslint/js';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/', 'dist/', 'ai/', 'automation/', 'deploy/', 'whatsapp/coverage/']
  },
  // Kode server & utilitas JavaScript (file TS/TSX tidak diparse ESLint —
  // pemeriksaannya ditangani penuh oleh `tsc --noEmit` dengan strict mode.)
  {
    files: ['*.mjs', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        AbortSignal: 'readonly',
        URLSearchParams: 'readonly',
        TextDecoder: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        FormData: 'readonly',
        performance: 'readonly',
        crypto: 'readonly',
        Buffer: 'readonly',
        TextEncoder: 'readonly',
        structuredClone: 'readonly'
      }
    },
    plugins: { 'eslint-comments': eslintComments },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'eslint-comments/no-unlimited-disable': 'error',
      eqeqeq: ['error', 'smart'],
      'no-throw-literal': 'error'
    }
  },
  eslint.configs.recommended,
  prettier
];
