import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('plugin signing readiness script', () => {
  it('reports checked-in production and local development signing keys', () => {
    const result = runReadinessScript([]);

    expect(result.status).toBe(0);
    const summary = JSON.parse(result.stdout) as {
      productionReady: boolean;
      productionKeyCount: number;
      developmentKeyCount: number;
      keys: Array<{ id: string; productionEligible: boolean; keyMaterialReady: boolean }>;
      warnings: string[];
    };
    expect(summary.productionReady).toBe(true);
    expect(summary.productionKeyCount).toBeGreaterThanOrEqual(1);
    expect(summary.developmentKeyCount).toBeGreaterThanOrEqual(1);
    expect(summary.warnings).not.toEqual(expect.arrayContaining([
      expect.stringContaining('No active production plugin manifest signing key'),
    ]));
    expect(summary.keys).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'danbi-production-plugin-rsa-2026',
        keyMaterialReady: true,
        productionEligible: true,
      }),
    ]));
  });

  it('fails production readiness when only development signing keys are configured', () => {
    const result = runReadinessScript(['--source', 'tests/fixtures/plugin-signing-dev-only.ts', '--require-production']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Production plugin signing readiness failed');
  });

  it('passes production readiness with the checked-in production signing key', () => {
    const result = runReadinessScript(['--channel', 'production']);

    expect(result.status).toBe(0);
    const summary = JSON.parse(result.stdout) as {
      channel: string;
      productionReady: boolean;
      productionKeyCount: number;
    };
    expect(summary).toMatchObject({
      channel: 'production',
      productionReady: true,
      productionKeyCount: expect.any(Number),
    });
    expect(summary.productionKeyCount).toBeGreaterThanOrEqual(1);
  });

  it('accepts an active production signing key fixture', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-signing-readiness-'));
    try {
      const sourcePath = join(tempRoot, 'plugin-signature.ts');
      await writeFile(sourcePath, buildProductionSigningKeyFixture(), 'utf8');
      const result = runReadinessScript(['--source', sourcePath, '--require-production']);

      expect(result.status).toBe(0);
      const summary = JSON.parse(result.stdout) as {
        productionReady: boolean;
        productionKeyCount: number;
        developmentKeyCount: number;
      };
      expect(summary).toMatchObject({
        productionReady: true,
        productionKeyCount: 1,
        developmentKeyCount: 0,
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects production signing keys without real RSA public key material', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-signing-readiness-'));
    try {
      const sourcePath = join(tempRoot, 'plugin-signature.ts');
      await writeFile(sourcePath, buildInvalidProductionSigningKeyFixture(), 'utf8');
      const result = runReadinessScript(['--source', sourcePath, '--require-production']);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Production plugin signing readiness failed');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('generates ignored production signer material without printing the private key', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-signing-keygen-'));
    try {
      const keyId = 'danbi-production-plugin-rsa-test-2026';
      const result = spawnSync(process.execPath, [
        'scripts/plugin-signing-keygen.mjs',
        '--key-id',
        keyId,
        '--label',
        'Danbi Studio production plugin signing key test',
        '--valid-from',
        '2026-06-01T00:00:00.000Z',
        '--out-dir',
        tempRoot,
      ], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('BEGIN PRIVATE KEY');
      const summary = JSON.parse(result.stdout) as {
        privateKeyPath: string;
        publicKeyPath: string;
        trustedKeyPath: string;
        trustedKey: { id: string; modulusBase64Url: string; exponentBase64Url: string };
        typeScriptTrustedKey: string;
      };
      expect(summary.trustedKey.id).toBe(keyId);
      expect(summary.typeScriptTrustedKey).toContain(`id: '${keyId}'`);
      await expect(stat(summary.privateKeyPath)).resolves.toMatchObject({ size: expect.any(Number) });
      await expect(stat(summary.publicKeyPath)).resolves.toMatchObject({ size: expect.any(Number) });
      const trustedKeyJson = JSON.parse(await readFile(summary.trustedKeyPath, 'utf8')) as {
        id: string;
        modulusBase64Url: string;
        exponentBase64Url: string;
      };
      expect(trustedKeyJson).toMatchObject({
        id: keyId,
        exponentBase64Url: 'AQAB',
      });
      expect(trustedKeyJson.modulusBase64Url.length).toBeGreaterThan(300);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('runs the production signer rotation drill without writing private keys', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-signing-rotation-drill-'));
    try {
      const result = spawnSync(process.execPath, [
        'scripts/plugin-signing-rotation-drill.mjs',
        '--out-dir',
        tempRoot,
        '--now',
        '2026-06-16T00:00:00.000Z',
      ], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('BEGIN PRIVATE KEY');
      const report = JSON.parse(result.stdout) as {
        status: string;
        reportPath: string;
        scenarios: Array<{
          name: string;
          status: string;
          expectedProductionReady: boolean;
          sourcePath: string;
          readiness: {
            productionReady: boolean;
            productionKeyCount: number;
            keys: Array<{ status: string; productionEligible: boolean; replacementKeyId?: string }>;
          };
        }>;
      };

      expect(report).toMatchObject({
        status: 'passed',
      });
      expect(report.scenarios).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: 'retiring-current-with-active-next',
          status: 'passed',
          expectedProductionReady: true,
          readiness: expect.objectContaining({
            productionReady: true,
            productionKeyCount: 2,
          }),
        }),
        expect.objectContaining({
          name: 'revoked-current-with-active-next',
          status: 'passed',
          expectedProductionReady: true,
          readiness: expect.objectContaining({
            productionReady: true,
            productionKeyCount: 1,
          }),
        }),
        expect.objectContaining({
          name: 'expired-current-without-next',
          status: 'passed',
          expectedProductionReady: false,
          readiness: expect.objectContaining({
            productionReady: false,
            productionKeyCount: 0,
          }),
        }),
      ]));

      await expect(stat(resolveReportPath(report.reportPath))).resolves.toMatchObject({ size: expect.any(Number) });
      for (const scenario of report.scenarios) {
        await expect(stat(resolveReportPath(scenario.sourcePath))).resolves.toMatchObject({ size: expect.any(Number) });
      }
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('passes the plugin signing custody audit for clean release-bound paths', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-signing-custody-clean-'));
    try {
      const manifestPath = join(tempRoot, 'manifest.json');
      await writeFile(manifestPath, JSON.stringify({
        pluginSigning: {
          productionReady: true,
          productionKeyCount: 1,
        },
      }, null, 2), 'utf8');
      const result = runCustodyAuditScript(['--path', manifestPath]);

      expect(result.status).toBe(0);
      const summary = JSON.parse(result.stdout) as {
        status: string;
        scannedFiles: number;
        violations: unknown[];
      };
      expect(summary).toMatchObject({
        status: 'passed',
        scannedFiles: 1,
        violations: [],
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('reports missing custody audit paths and fails only in strict missing-path mode', () => {
    const missingPath = join(tmpdir(), `danbi-plugin-signing-custody-missing-${Date.now()}`);
    const permissiveResult = runCustodyAuditScript(['--path', missingPath]);
    const strictResult = runCustodyAuditScript(['--path', missingPath, '--fail-on-missing']);

    expect(permissiveResult.status).toBe(0);
    expect(JSON.parse(permissiveResult.stdout)).toMatchObject({
      status: 'passed',
      missingPaths: 1,
      violations: [],
    });

    expect(strictResult.status).toBe(1);
    expect(JSON.parse(strictResult.stdout).violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'missing-path',
        reason: 'Expected custody audit path is missing.',
      }),
    ]));
  });

  it('blocks private key material and private key paths from release-bound audit paths', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-signing-custody-leak-'));
    try {
      const pemPath = join(tempRoot, 'leaked.txt');
      const manifestPath = join(tempRoot, 'manifest.json');
      await writeFile(pemPath, '-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----\n', 'utf8');
      await writeFile(manifestPath, JSON.stringify({
        privateKeyPath: '.danbi/plugin-signing/danbi-production-plugin-rsa-2026.private.pem',
      }, null, 2), 'utf8');

      const materialResult = runCustodyAuditScript(['--path', pemPath]);
      const pathResult = runCustodyAuditScript(['--path', manifestPath]);

      expect(materialResult.status).toBe(1);
      expect(materialResult.stderr).toContain('custody audit failed');
      expect(pathResult.status).toBe(1);
      expect(pathResult.stderr).toContain('custody audit failed');
      expect(JSON.parse(materialResult.stdout).violations).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'private-key-material' }),
      ]));
      expect(JSON.parse(pathResult.stdout).violations).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'private-key-path' }),
      ]));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks unsafe plugin signing private key environment paths inside the repository', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-signing-custody-env-'));
    try {
      const cleanPath = join(tempRoot, 'manifest.json');
      await writeFile(cleanPath, '{"ok":true}\n', 'utf8');
      const result = runCustodyAuditScript(['--path', cleanPath], {
        DANBI_PLUGIN_SIGNING_PRIVATE_KEY_PATH: 'src/leaked.private.pem',
      });

      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).violations).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'unsafe-private-key-env-path' }),
      ]));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('forbids plugin signing private key environment variables during production release custody audit', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-signing-custody-production-env-'));
    try {
      const cleanPath = join(tempRoot, 'manifest.json');
      await writeFile(cleanPath, '{"ok":true}\n', 'utf8');
      const result = runCustodyAuditScript(['--path', cleanPath, '--forbid-private-key-env'], {
        DANBI_PLUGIN_SIGNING_PRIVATE_KEY_PATH: '.danbi/plugin-signing/danbi-production-plugin-rsa-2026.private.pem',
      });

      expect(result.status).toBe(1);
      const summary = JSON.parse(result.stdout) as {
        forbidPrivateKeyEnv: boolean;
        violations: Array<{ type: string; reason: string }>;
      };
      expect(summary.forbidPrivateKeyEnv).toBe(true);
      expect(summary.violations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'forbidden-private-key-env',
          reason: expect.stringContaining('Production release preparation'),
        }),
      ]));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

function runReadinessScript(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ['scripts/plugin-signing-readiness.mjs', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function runCustodyAuditScript(
  args: string[],
  env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ['scripts/plugin-signing-custody-audit.mjs', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function resolveReportPath(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
}

function buildProductionSigningKeyFixture(): string {
  return `
export const DEFAULT_PLUGIN_MANIFEST_TRUSTED_SIGNING_KEYS = [
  {
    id: 'danbi-production-plugin-rsa-2026',
    label: 'Danbi Studio production plugin signing key',
    algorithm: 'rsa-sha256-pkcs1-v1_5',
    modulusBase64Url: '${Buffer.alloc(256, 1).toString('base64url')}',
    exponentBase64Url: 'AQAB',
    status: 'active',
    validFrom: '2026-01-01T00:00:00.000Z',
  },
];
`;
}

function buildInvalidProductionSigningKeyFixture(): string {
  return `
export const DEFAULT_PLUGIN_MANIFEST_TRUSTED_SIGNING_KEYS = [
  {
    id: 'danbi-production-plugin-rsa-2026',
    label: 'Danbi Studio production plugin signing key',
    algorithm: 'rsa-sha256-pkcs1-v1_5',
    modulusBase64Url: 'abc',
    exponentBase64Url: 'AQAB',
    status: 'active',
    validFrom: '2026-01-01T00:00:00.000Z',
  },
];
`;
}
