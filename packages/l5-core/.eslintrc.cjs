module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    es2022: true,
    node: true,
    jest: true,
  },
  extends: ['eslint:recommended'],
  rules: {
    'no-unused-vars': 'off',
    'no-undef': 'off',
  },
};

