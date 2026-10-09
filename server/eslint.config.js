import parser from '@typescript-eslint/parser';
export default [{ ignores: ['dist', 'coverage'] }, { files: ['**/*.{ts,tsx}'], languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } } }];
