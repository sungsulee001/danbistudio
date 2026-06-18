/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingExcludes: {
    '**/*': [
      '.git/**/*',
      '.logs/**/*',
      '.next/cache/**/*',
      '.next/dev/**/*',
      '.next/diagnostics/**/*',
      '.next/types/**/*',
      'coverage/**/*',
      'dist-electron/**/*',
      'playwright-report/**/*',
      'release/**/*',
      'scripts/**/*',
      'src/**/*',
      'test-results/**/*',
      'tests/**/*',
      'third_party/**/*',
      '.env',
      '.next-dev.*.log',
      'dev-server.*.log',
      'electron-builder.yml',
      'next-env.d.ts',
      'package-lock.json',
      'plan-template.md',
    ],
  },
};

export default nextConfig;
