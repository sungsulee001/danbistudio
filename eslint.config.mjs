import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
        varsIgnorePattern: '^_',
      }],
      '@next/next/no-img-element': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'prefer-const': 'off',
    },
  },
  {
    ignores: [
      '.next/**',
      '.danbi/**',
      'coverage/**',
      'dist/**',
      'dist-electron/**',
      'release/**',
      'build/**',
      'public/cache/**',
      'public/imports/**',
      'public/outputs/**',
      'third_party/source-mirrors/**',
      'next-env.d.ts',
    ],
  },
  {
    files: ['scripts/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];

export default eslintConfig;
