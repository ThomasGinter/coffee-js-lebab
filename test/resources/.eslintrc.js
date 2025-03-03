module.exports = {
  env: {
    node: true,
    es6: true
  },
  parserOptions: {
    ecmaVersion: 2023
  },
  extends: 'eslint:recommended',
  rules: {
    // Errors
    'no-unused-vars': ['error', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],
    'no-undef': 'error',
    'no-const-assign': 'error',
    'no-dupe-args': 'error',
    'no-dupe-class-members': 'error',
    'no-dupe-keys': 'error',
    'no-unreachable': 'error',

    // Common issues in converted code
    'no-var': 'warn',
    'prefer-const': 'warn',
    'no-empty': 'warn',
    'no-irregular-whitespace': 'warn',

    // Relaxed rules for decaffeinate output
    'indent': 'off',
    'semi': 'off',
    'quotes': 'off',
    'comma-dangle': 'off',
    'arrow-parens': 'off',
    'max-len': 'off',
    'camelcase': 'off',
    'no-console': 'off'
  },
  ignorePatterns: ['node_modules/', 'dist/', 'target/', 'build/']
};