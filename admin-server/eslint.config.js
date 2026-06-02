import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const tsRules = {
  ...tsPlugin.configs.recommended.rules,
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
};

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**']
  },
  js.configs.recommended,
  {
    files: ['server/src/**/*.ts', 'server/prisma/**/*.ts', 'server/test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './server/tsconfig.json',
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        RequestInit: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: tsRules
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './web/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true }
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        FormData: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        File: 'readonly',
        HTMLElement: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: tsRules
  }
];
