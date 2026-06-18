import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildElectronReleaseAcceptance,
} from '../../scripts/electron-release-acceptance.mjs';

const tempRoots: string[] = [];
const acceptanceScriptPath = fileURLToPath(new URL('../../scripts/electron-release-acceptance.mjs', import.meta.url));

describe('Electron release acceptance audit', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
  });

  it('accepts a full verification report with installer, standalone, sample, and render evidence', async () => {
    const rootDir = await makeFixtureRoot();

    const { report, reportPath } = buildElectronReleaseAcceptance({
      rootDir,
      runCompliance: false,
      runFfprobe: false,
    });

    expect(report.status).toBe('passed');
    expect(reportPath).toBe('.danbi/electron-release/release-acceptance.json');
    expect(report.evidence.verification).toMatchObject({
      status: 'passed',
      profile: 'full',
      passedCount: 17,
      requiredGateCount: 17,
      missingGateIds: [],
      failedGateIds: [],
    });
    expect(report.evidence.installer).toMatchObject({
      path: 'release/electron/Danbi-Studio-0.1.0-win-x64.exe',
      status: 'present',
    });
    expect(report.evidence.latestYml).toMatchObject({
      expectedInstallerName: 'Danbi-Studio-0.1.0-win-x64.exe',
      hasInstallerReference: true,
      releaseDate: '2026-06-16T00:05:00.000Z',
      releaseDateFreshnessStatus: 'passed',
    });
    expect(report.evidence.standalone).toMatchObject({
      status: 'passed',
      leakedPaths: [],
      packageMain: 'server.js',
      packageScripts: { start: 'node server.js' },
      hasDevDependencies: false,
      defaultWorkflowPresent: true,
      referenceWorkflowPresent: true,
      buildRootLeakCount: 0,
    });
    expect(report.evidence.renderOutputs).toHaveLength(4);
    expect(report.evidence.renderOutputs.every((output) => output.status === 'present')).toBe(true);
  });

  it('runs the acceptance CLI against a supplied root directory', async () => {
    const rootDir = await makeFixtureRoot();

    const result = spawnSync('node', [
      acceptanceScriptPath,
      '--root-dir',
      rootDir,
      '--skip-compliance',
      '--skip-ffprobe',
      '--out',
      '.danbi/electron-release/acceptance-from-cli.json',
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
      reportPath: '.danbi/electron-release/acceptance-from-cli.json',
      installer: 'release/electron/Danbi-Studio-0.1.0-win-x64.exe',
      renderOutputCount: 4,
      verificationPassedCount: 17,
      failureCount: 0,
      failures: [],
    });
  });

  it('prints acceptance failures in CLI output', async () => {
    const rootDir = await makeFixtureRoot({
      omitInstaller: true,
    });

    const result = spawnSync('node', [
      acceptanceScriptPath,
      '--root-dir',
      rootDir,
      '--skip-compliance',
      '--skip-ffprobe',
      '--out',
      '.danbi/electron-release/acceptance-from-cli.json',
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
      reportPath: '.danbi/electron-release/acceptance-from-cli.json',
      installer: 'release/electron/Danbi-Studio-0.1.0-win-x64.exe',
    });
    expect(output.failureCount).toBeGreaterThan(0);
    expect(output.failures.join('\n')).toContain('Missing required release file: release/electron/Danbi-Studio-0.1.0-win-x64.exe');
    expect(result.stderr).toContain('Electron release acceptance failed');
  });

  it('prints acceptance CLI parse failures in stdout JSON', () => {
    const result = spawnSync('node', [
      acceptanceScriptPath,
      '--bad-option',
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
      reportPath: null,
      failureCount: 1,
      failures: ['Unknown option: --bad-option'],
    });
    expect(result.stderr).toContain('Unknown option: --bad-option');
  });

  it('fails when a required full verification gate is missing', async () => {
    const rootDir = await makeFixtureRoot({
      omitGateId: 'electron-install-smoke',
    });

    const { report } = buildElectronReleaseAcceptance({
      rootDir,
      runCompliance: false,
      runFfprobe: false,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.evidence.verification.missingGateIds).toEqual(['electron-install-smoke']);
    expect(report.failures.join('\n')).toContain('electron-install-smoke');
  });

  it('fails when latest.yml points at a different installer name', async () => {
    const rootDir = await makeFixtureRoot({
      latestYmlInstallerName: 'Danbi Studio-0.1.0-win-x64.exe',
    });

    const { report } = buildElectronReleaseAcceptance({
      rootDir,
      runCompliance: false,
      runFfprobe: false,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.evidence.latestYml).toMatchObject({
      expectedInstallerName: 'Danbi-Studio-0.1.0-win-x64.exe',
      hasInstallerReference: false,
    });
    expect(report.failures.join('\n')).toContain('latest.yml must reference installer Danbi-Studio-0.1.0-win-x64.exe');
  });

  it('skips latest.yml size matching when the installer is missing', async () => {
    const rootDir = await makeFixtureRoot({
      omitInstaller: true,
    });

    const { report } = buildElectronReleaseAcceptance({
      rootDir,
      runCompliance: false,
      runFfprobe: false,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.evidence.installer.status).toBe('missing');
    expect(report.evidence.latestYml.installerSizeCheckStatus).toBe('skipped');
    expect(report.failures.join('\n')).toContain('Missing required release file: release/electron/Danbi-Studio-0.1.0-win-x64.exe');
    expect(report.failures.join('\n')).not.toContain('undefined');
  });

  it('fails when the installer package was created after full verification ended', async () => {
    const rootDir = await makeFixtureRoot({
      latestYmlReleaseDate: '2026-06-16T00:11:00.000Z',
    });

    const { report } = buildElectronReleaseAcceptance({
      rootDir,
      runCompliance: false,
      runFfprobe: false,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.evidence.latestYml).toMatchObject({
      releaseDate: '2026-06-16T00:11:00.000Z',
      fullVerificationEndedAt: '2026-06-16T00:10:00.000Z',
      releaseDateFreshnessStatus: 'stale-verification',
    });
    expect(report.failures.join('\n')).toContain('latest.yml releaseDate is newer than the full release verification report');
  });

  it('fails when development artifacts remain in packaged standalone output', async () => {
    const rootDir = await makeFixtureRoot();
    await writeFixtureFile(rootDir, 'release/electron/win-unpacked/resources/renderer/standalone/src/leaked.ts', 'source');

    const { report } = buildElectronReleaseAcceptance({
      rootDir,
      runCompliance: false,
      runFfprobe: false,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.evidence.standalone.leakedPaths).toContain('src');
    expect(report.failures.join('\n')).toContain('Development-only standalone artifact');
  });

  it('fails when the packaged standalone renderer is missing the default ComfyUI workflow', async () => {
    const rootDir = await makeFixtureRoot({
      omitDefaultWorkflow: true,
    });

    const { report } = buildElectronReleaseAcceptance({
      rootDir,
      runCompliance: false,
      runFfprobe: false,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.evidence.standalone.defaultWorkflowPresent).toBe(false);
    expect(report.failures.join('\n')).toContain('Missing packaged default ComfyUI workflow');
  });

  it('fails when the packaged standalone renderer is missing the reference-image ComfyUI workflow', async () => {
    const rootDir = await makeFixtureRoot({
      omitReferenceWorkflow: true,
    });

    const { report } = buildElectronReleaseAcceptance({
      rootDir,
      runCompliance: false,
      runFfprobe: false,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.evidence.standalone.referenceWorkflowPresent).toBe(false);
    expect(report.failures.join('\n')).toContain('Missing packaged reference-image ComfyUI workflow');
  });
});

async function makeFixtureRoot(options: {
  omitGateId?: string;
  omitDefaultWorkflow?: boolean;
  omitReferenceWorkflow?: boolean;
  latestYmlInstallerName?: string;
  latestYmlReleaseDate?: string;
  omitInstaller?: boolean;
} = {}): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'danbi-electron-release-acceptance-'));
  tempRoots.push(rootDir);

  await writeFixtureFile(rootDir, 'package.json', JSON.stringify({
    version: '0.1.0',
    build: {
      productName: 'Danbi Studio',
    },
  }));

  await writeFixtureFile(rootDir, '.danbi/electron-release/release-verification-full.json', JSON.stringify({
    kind: 'danbi.electron.release-verification',
    status: 'passed',
    profile: 'full',
    production: false,
    dryRun: false,
    startedAt: '2026-06-16T00:00:00.000Z',
    endedAt: '2026-06-16T00:10:00.000Z',
    durationMs: 600_000,
    commandCount: requiredGateIds.length - (options.omitGateId ? 1 : 0),
    passedCount: requiredGateIds.length - (options.omitGateId ? 1 : 0),
    failedCount: 0,
    skippedCount: 0,
    results: requiredGateIds
      .filter((id) => id !== options.omitGateId)
      .map((id) => ({
        id,
        status: 'passed',
        exitCode: 0,
        durationMs: 10,
      })),
  }));

  await writeFixtureFile(rootDir, '.danbi/electron-release/manifest.json', JSON.stringify({
    generatedAt: '2026-06-16T00:00:00.000Z',
    standalonePrune: {
      status: 'passed',
      removedTraceEntryCount: 3,
      sanitizedPackageJson: true,
      sanitizedServerConfig: true,
    },
    pluginSigning: {
      productionReady: true,
    },
    pluginSigningCustodyAudit: {
      status: 'passed',
    },
  }));

  if (!options.omitInstaller) {
    await writeFixtureFile(rootDir, 'release/electron/Danbi-Studio-0.1.0-win-x64.exe', Buffer.alloc(10_000_001, 1));
  }
  await writeFixtureFile(rootDir, 'release/electron/Danbi-Studio-0.1.0-win-x64.exe.blockmap', Buffer.alloc(1_001, 2));
  await writeFixtureFile(rootDir, 'release/electron/latest.yml', [
    'version: 0.1.0',
    `path: ${options.latestYmlInstallerName ?? 'Danbi-Studio-0.1.0-win-x64.exe'}`,
    'size: 10000001',
    `releaseDate: '${options.latestYmlReleaseDate ?? '2026-06-16T00:05:00.000Z'}'`,
    '',
  ].join('\n'));
  await writeFixtureFile(rootDir, 'release/electron/win-unpacked/Danbi Studio.exe', Buffer.alloc(10_000_001, 3));
  await writeFixtureFile(
    rootDir,
    'release/electron/win-unpacked/resources/samples/getting-started/project.danbi-project.json',
    `${JSON.stringify({ id: 'sample' })}${' '.repeat(1_000)}`,
  );
  await writeFixtureFile(
    rootDir,
    'release/electron/win-unpacked/resources/samples/getting-started/tutorial.md',
    `${'# Tutorial\n'}${' '.repeat(500)}`,
  );
  await writeFixtureFile(
    rootDir,
    'release/electron/win-unpacked/resources/renderer/standalone/package.json',
    JSON.stringify({
      main: 'server.js',
      scripts: {
        start: 'node server.js',
      },
      dependencies: {
        next: '^16.2.9',
      },
    }),
  );
  await writeFixtureFile(
    rootDir,
    'release/electron/win-unpacked/resources/renderer/standalone/server.js',
    'const nextConfig = {"outputFileTracingRoot":".","turbopack":{"root":"."}};\n',
  );
  if (!options.omitDefaultWorkflow) {
    await writeFixtureFile(
      rootDir,
      'release/electron/win-unpacked/resources/renderer/standalone/workflows/broll_i2v.json',
      JSON.stringify({
        '1': {
          class_type: 'CLIPTextEncode',
          inputs: {
            text: 'B-roll',
          },
        },
      }),
    );
  }
  if (!options.omitReferenceWorkflow) {
    await writeFixtureFile(
      rootDir,
      'release/electron/win-unpacked/resources/renderer/standalone/workflows/broll_reference_i2v.json',
      JSON.stringify({
        '1': {
          class_type: 'LoadImage',
          inputs: {
            image: 'reference.png',
          },
        },
      }),
    );
  }

  for (const renderOutput of requiredRenderOutputs) {
    await writeFixtureFile(rootDir, renderOutput, Buffer.alloc(10_001, 4));
  }

  return rootDir;
}

async function writeFixtureFile(rootDir: string, relativePath: string, content: string | Buffer): Promise<void> {
  const filePath = join(rootDir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

const requiredGateIds = [
  'typecheck',
  'unit-tests',
  'git-diff-check',
  'eslint-clean-check',
  'architecture-check',
  'license-check',
  'plugin-signing-readiness',
  'plugin-signing-production-readiness',
  'plugin-signing-rotation-drill',
  'plugin-signing-custody-audit',
  'electron-smoke',
  'playwright-chromium',
  'electron-package-smoke',
  'electron-gui-smoke',
  'electron-offline-smoke',
  'electron-installer-smoke',
  'electron-install-smoke',
];

const requiredRenderOutputs = [
  '.danbi/electron-package-smoke/sample-render/getting-started.mp4',
  '.danbi/electron-gui-smoke/renders/getting-started-ui-render.mp4',
  '.danbi/electron-offline-smoke/renders/getting-started-offline-render.mp4',
  '.danbi/electron-install-smoke/renders/getting-started-installed-render.mp4',
];
