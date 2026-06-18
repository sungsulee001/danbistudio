import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildElectronReleaseVerificationPlan,
  runElectronReleaseVerification,
} from '../../scripts/electron-release-verify.mjs';

const tempRoots: string[] = [];
const verifyScriptPath = fileURLToPath(new URL('../../scripts/electron-release-verify.mjs', import.meta.url));

describe('Electron release verification plan', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
  });

  it('keeps the core profile focused on non-packaging release gates', () => {
    const plan = buildElectronReleaseVerificationPlan({ profile: 'core' });
    const ids = plan.commands.map((command) => command.id);

    expect(plan).toMatchObject({
      profile: 'core',
      production: false,
    });
    expect(ids).toEqual([
      'typecheck',
      'unit-tests',
      'git-diff-check',
      'eslint-clean-check',
      'architecture-check',
      'license-check',
      'plugin-signing-readiness',
      'plugin-signing-custody-audit',
    ]);
  });

  it('adds packaged GUI and offline release smoke coverage without installer checks', () => {
    const plan = buildElectronReleaseVerificationPlan({ profile: 'packaged' });
    const ids = plan.commands.map((command) => command.id);

    expect(ids).toContain('electron-package-smoke');
    expect(ids).toContain('electron-gui-smoke');
    expect(ids).toContain('electron-offline-smoke');
    expect(ids).not.toContain('electron-installer-smoke');
    expect(ids).not.toContain('electron-install-smoke');
    expect(ids).not.toContain('playwright-chromium');
    expect(plan.commands.find((command) => command.id === 'electron-smoke')).toMatchObject({
      requiresRendererServer: true,
      restartRendererServerAfter: true,
    });
  });

  it('adds production custody and installed-app gates for full production verification', () => {
    const plan = buildElectronReleaseVerificationPlan({ profile: 'full', production: true });
    const ids = plan.commands.map((command) => command.id);

    expect(plan.production).toBe(true);
    expect(ids).toEqual(expect.arrayContaining([
      'plugin-signing-production-readiness',
      'plugin-signing-production-custody-audit',
      'playwright-chromium',
      'electron-installer-smoke',
      'electron-install-smoke',
    ]));
    expect(plan.commands.find((command) => command.id === 'electron-package-smoke')?.env).toMatchObject({
      DANBI_RELEASE_CHANNEL: 'production',
    });
    expect(plan.commands.find((command) => command.id === 'playwright-chromium')).toMatchObject({
      requiresRendererServer: true,
    });
  });

  it('writes a dry-run report for the selected verification profile', async () => {
    const tempRoot = await makeTempRoot();
    const reportPath = join(tempRoot, 'verification-report.json');

    const { report } = await runElectronReleaseVerification({
      profile: 'core',
      dryRun: true,
      reportPath,
    });

    const savedReport = JSON.parse(await readFile(reportPath, 'utf8')) as typeof report;
    expect(report).toMatchObject({
      status: 'passed',
      profile: 'core',
      dryRun: true,
      commandCount: 8,
      passedCount: 0,
      failedCount: 0,
      skippedCount: 8,
    });
    expect(savedReport.results.every((result) => result.status === 'skipped')).toBe(true);
    expect(savedReport.results.every((result) => result.skippedReason === 'dry-run')).toBe(true);
  });

  it('does not start the managed renderer server for dry-run packaged gates', async () => {
    const tempRoot = await makeTempRoot();
    const { report } = await runElectronReleaseVerification({
      profile: 'packaged',
      dryRun: true,
      reportRoot: tempRoot,
    });

    expect(report.managedRendererServer).toEqual({ status: 'skipped-dry-run' });
    expect(report.results.every((result) => result.status === 'skipped')).toBe(true);
  });

  it('uses profile-specific default report paths', async () => {
    const tempRoot = await makeTempRoot();
    const coreRun = await runElectronReleaseVerification({
      profile: 'core',
      dryRun: true,
      reportRoot: tempRoot,
    });
    const productionRun = await runElectronReleaseVerification({
      profile: 'full',
      production: true,
      dryRun: true,
      reportRoot: tempRoot,
    });

    expect(coreRun.reportPath.replace(/\\/g, '/')).toBe(`${tempRoot.replace(/\\/g, '/')}/release-verification-core.json`);
    expect(productionRun.reportPath.replace(/\\/g, '/')).toBe(`${tempRoot.replace(/\\/g, '/')}/release-verification-full-production.json`);
  });

  it('runs dry-run verification CLI against a supplied root directory', async () => {
    const tempRoot = await makeTempRoot();

    const result = spawnSync('node', [
      verifyScriptPath,
      '--root-dir',
      tempRoot,
      '--profile',
      'core',
      '--dry-run',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({
      status: 'passed',
      profile: 'core',
      reportPath: '.danbi/electron-release/release-verification-core.json',
      passedCount: 0,
      failedCount: 0,
      skippedCount: 8,
      failureCount: 0,
      failures: [],
    });
    const savedReport = JSON.parse(await readFile(join(tempRoot, '.danbi/electron-release/release-verification-core.json'), 'utf8'));
    expect(savedReport).toMatchObject({
      status: 'passed',
      profile: 'core',
      dryRun: true,
      skippedCount: 8,
    });
  });

  it('prints verification CLI parse failures in stdout JSON', async () => {
    const tempRoot = await makeTempRoot();

    const result = spawnSync('node', [
      verifyScriptPath,
      '--root-dir',
      tempRoot,
      '--profile',
      'unknown',
      '--dry-run',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    expect(result.status).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({
      status: 'failed',
      failureCount: 1,
    });
    expect(output.failures.join('\n')).toContain('Unknown release verification profile: unknown');
    expect(result.stderr).toContain('Unknown release verification profile: unknown');
  });
});

async function makeTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-electron-release-verify-'));
  tempRoots.push(tempRoot);
  return tempRoot;
}
