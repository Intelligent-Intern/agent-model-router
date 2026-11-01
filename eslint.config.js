import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  { ...eslint.configs.recommended, files: ['**/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly', setTimeout: 'readonly', structuredClone: 'readonly' } } },
  ...tseslint.configs.recommended.map(config => ({ ...config, files: ['src/**/*.ts'] })),
  { files: ['src/**/*.ts'], languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } } },
);
