const js = require('@eslint/js');
const globals = require('globals');

/**
 * Backend lint rules (Node.js, CommonJS).
 * Run with `npm run lint`. Starts from ESLint's recommended set; noisy
 * style-only rules are warnings so existing code isn't blocked.
 */
module.exports = [
  { ignores: ['node_modules/**', 'uploads/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-prototype-builtins': 'warn',
      'no-control-regex': 'warn',
    },
  },
];
