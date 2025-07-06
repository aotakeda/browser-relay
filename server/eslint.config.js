const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const unusedImports = require('eslint-plugin-unused-imports');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '*.config.js',
      'eslint.config.js',
      'jest.config.js',
      'data/**',
    ],
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: ['./tsconfig.json'],
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'unused-imports': unusedImports,
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-inferrable-types': 'warn',
      
      // Unused imports and variables
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      
      // General rules
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': 'off', // Disabled in favor of unused-imports
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.js'],
    rules: {
      // Test-specific rules can be added here
    },
  },
];