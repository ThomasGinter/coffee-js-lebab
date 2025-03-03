const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

module.exports = [
  {
    ignores: ['node_modules/', 'dist/', 'target/', 'build/'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023
    },
    rules: {
      'no-unused-vars': ['warn', { 'args': 'after-used', 'caughtErrors': 'none', 'vars': 'local', 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],
      'no-undef': 'error',
      'no-const-assign': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-var': 'warn',
      'prefer-const': 'warn',
      'no-empty': 'warn',
      'no-irregular-whitespace': 'warn',
      'indent': 'off',
      'semi': 'off',
      'quotes': 'off',
      'comma-dangle': 'off',
      'arrow-parens': 'off',
      'max-len': 'off',
      'camelcase': 'off',
      'no-console': 'off',
    },
  },
];