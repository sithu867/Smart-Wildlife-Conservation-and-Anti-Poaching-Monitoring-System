import parser from '@typescript-eslint/parser';
export default [{ ignores: ['dist', 'dev-dist', 'coverage'] }, { files: ['**/*.{ts,tsx}'], languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } } }];
