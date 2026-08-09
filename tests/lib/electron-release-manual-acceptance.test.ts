import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  validateFreshWindowsManualAcceptance,
} from '../../scripts/electron-release-manual-acceptance.mjs';

const tempRoots: string[] = [];
const manualAcceptanceScriptPath = fileURLToPath(new URL('../../scripts/electron-release-manual-acceptance.mjs', import.meta.url));
const fixtureOutputMp4 = Buffer.alloc(120000, 7);
const fixtureOutputMp4Sha256 = createHash('sha256').update(fixtureOutputMp4).digest('hex');

describe('Fresh Windows manual acceptance validation', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
  });

  it('passes a completed fresh Windows result against the handoff manifest', async () => {
    const rootDir = await makeFixtureRoot();

    const { report, reportPath } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: true,
    });

    expect(report.status).toBe('passed');
    expect(reportPath).toBe('.danbi/electron-release/fresh-windows-acceptance-report.json');
    expect(report.checksumEvidence).toMatchObject({ status: 'passed' });
    expect(report.checksumEvidence.files.map((file) => file.path)).toContain('verify-fresh-windows-result.ps1');
    expect(report.checksumEvidence.files.map((file) => file.path)).toContain('package-handoff-for-qa.ps1');
    expect(report.basicSmokeEvidence).toMatchObject({
      status: 'passed',
      rendererUrl: 'http://127.0.0.1:35123/editor',
      rawSmokeChecks: {
        noRemainingNewShortcuts: true,
      },
    });
    expect(report.guiSessionEvidence).toMatchObject({
      status: 'passed',
      outputMp4Path: 'C:\\Users\\qa\\Videos\\getting-started-render.mp4',
    });
    expect(report.cleanupEvidence).toMatchObject({
      status: 'passed',
      checks: {
        processStopped: true,
        uninstallerRan: true,
        installDirRemoved: true,
        installRootRemoved: true,
        shortcutCleanup: true,
        noRemainingNewShortcuts: true,
      },
    });
    expect(report.outputEvidence).toMatchObject({
      status: 'passed',
      bytes: 120000,
      sha256: fixtureOutputMp4Sha256,
      handoffRelativePath: 'fresh-windows-gui-render.mp4',
      hasVideo: true,
      hasAudio: true,
      ffprobePath: 'C:\\Program Files\\Danbi Studio\\resources\\ffmpeg\\ffprobe.exe',
    });
    expect(report.requiredTrueChecks.every((check) => check.passed)).toBe(true);
    expect(report.requiredTextChecks.every((check) => check.passed)).toBe(true);
    expect(report.failures).toEqual([]);
  });

  it('runs the manual acceptance CLI against a supplied root directory', async () => {
    const rootDir = await makeFixtureRoot();

    const result = spawnSync('node', [
      manualAcceptanceScriptPath,
      '--root-dir',
      rootDir,
      '--out',
      '.danbi/electron-release/manual-acceptance-from-cli.json',
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
      reportPath: '.danbi/electron-release/manual-acceptance-from-cli.json',
      checksumStatus: 'passed',
      basicSmokeStatus: 'passed',
      guiSessionStatus: 'passed',
      cleanupStatus: 'passed',
      failureCount: 0,
      failures: [],
    });
  });

  it('prints manual acceptance failures in CLI output', async () => {
    const rootDir = await makeFixtureRoot();
    await rm(join(rootDir, '.danbi/electron-release/handoff/fresh-windows-result.json'), { force: true });

    const result = spawnSync('node', [
      manualAcceptanceScriptPath,
      '--root-dir',
      rootDir,
      '--out',
      '.danbi/electron-release/manual-acceptance-from-cli.json',
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
      reportPath: '.danbi/electron-release/manual-acceptance-from-cli.json',
    });
    expect(output.failureCount).toBeGreaterThan(0);
    expect(output.failures.join('\n')).toContain('Missing fresh Windows manual result');
    expect(result.stderr).toContain('Fresh Windows manual acceptance failed');
  });

  it('prints manual acceptance CLI parse failures in stdout JSON', () => {
    const result = spawnSync('node', [
      manualAcceptanceScriptPath,
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

  it('fails when the manual result is still pending or omits required proof fields', async () => {
    const rootDir = await makeFixtureRoot({
      resultPatch: {
        tester: '',
        checkedAt: '',
        artifactVerification: {
          verifyReleaseArtifactsPs1Passed: false,
          notes: '',
        },
        result: 'pending',
      },
    });

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.failures.join('\n')).toContain('Manual result must be "passed"');
    expect(report.failures.join('\n')).toContain('artifactVerification.verifyReleaseArtifactsPs1Passed');
    expect(report.failures.join('\n')).toContain('tester');
  });

  it('fails when the rendered output MP4 evidence is incomplete', async () => {
    const rootDir = await makeFixtureRoot({
      resultPatch: {
        sampleWorkflow: {
          outputMp4: {
            path: '',
            bytes: 0,
            sha256: '',
            handoffRelativePath: '',
            durationSeconds: 0,
            hasVideo: false,
            hasAudio: false,
            ffprobePath: '',
          },
        },
      },
    });

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.outputEvidence.status).toBe('failed');
    expect(report.failures.join('\n')).toContain('output MP4 must be at least');
    expect(report.failures.join('\n')).toContain('SHA-256');
    expect(report.failures.join('\n')).toContain('handoff-relative MP4 path');
    expect(report.failures.join('\n')).toContain('video stream');
    expect(report.failures.join('\n')).toContain('audio stream');
  });

  it('reports invalid returned JSON as failed evidence instead of throwing', async () => {
    const rootDir = await makeFixtureRoot();
    await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-result.json', '{ invalid json');

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.outputEvidence.status).toBe('skipped');
    expect(report.failures.join('\n')).toContain('Invalid fresh Windows manual result JSON');
  });

  it('fails when the handoff MP4 file does not match the recorded SHA-256', async () => {
    const rootDir = await makeFixtureRoot({
      resultPatch: {
        sampleWorkflow: {
          outputMp4: {
            sha256: 'a'.repeat(64),
          },
        },
      },
    });

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.outputEvidence.status).toBe('failed');
    expect(report.failures.join('\n')).toContain('handoff file SHA-256');
  });

  it('fails when the handoff MP4 uses a non-standard return path even if the file matches', async () => {
    const rootDir = await makeFixtureRoot({
      resultPatch: {
        sampleWorkflow: {
          outputMp4: {
            handoffRelativePath: 'alternate/fresh-windows-gui-render.mp4',
          },
        },
      },
    });
    await writeFixtureBuffer(
      rootDir,
      '.danbi/electron-release/handoff/alternate/fresh-windows-gui-render.mp4',
      fixtureOutputMp4,
    );

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.outputEvidence.status).toBe('failed');
    expect(report.outputEvidence.checks?.handoffRelativePathMatchesExpected).toBe(false);
    expect(report.failures.join('\n')).toContain('handoff-relative path must be fresh-windows-gui-render.mp4');
  });

  it('fails when the fresh Windows basic smoke evidence is incomplete', async () => {
    const rootDir = await makeFixtureRoot({
      basicSmokePatch: {
        status: 'failed',
        checks: {
          ffmpegReady: false,
          uninstalled: false,
          shortcutCleanup: false,
        },
        shortcuts: {
          remainingNew: [
            { path: 'C:\\Users\\qa\\Desktop\\Danbi Studio.lnk', existed: false },
          ],
        },
        smokeResult: {
          rendererUrl: 'https://example.com/editor',
          diagnostics: {
            ffmpeg: { ready: false },
            samples: { available: false },
          },
        },
      },
    });

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.basicSmokeEvidence.status).toBe('failed');
    expect(report.failures.join('\n')).toContain('Basic smoke status must be "passed"');
    expect(report.failures.join('\n')).toContain('checks.ffmpegReady');
    expect(report.failures.join('\n')).toContain('raw renderer URL');
    expect(report.failures.join('\n')).toContain('new shortcuts');
  });

  it('fails when the manual result does not match the basic smoke evidence it references', async () => {
    const rootDir = await makeFixtureRoot({
      resultPatch: {
        basicSmoke: {
          resultPath: 'wrong-basic-smoke.json',
          status: 'passed',
          checkedAt: '2026-06-16T10:00:00.000Z',
        },
      },
    });

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.failures.join('\n')).toContain('basicSmoke.resultPath');
    expect(report.failures.join('\n')).toContain('basicSmoke.checkedAt');
  });

  it('fails when the manual result does not match the GUI acceptance session it references', async () => {
    const rootDir = await makeFixtureRoot({
      resultPatch: {
        guiSession: {
          resultPath: 'wrong-gui-session.json',
          status: 'launched',
          checkedAt: '2026-06-16T10:00:00.000Z',
          outputMp4Path: 'C:\\Users\\qa\\Videos\\wrong.mp4',
          userDataDir: 'C:\\Users\\qa\\AppData\\Local\\Temp\\wrong-user-data',
          launchedWithFreshUserData: true,
          automationSavePathSet: true,
          outputPathMatchesRenderedMp4: true,
        },
      },
    });

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.failures.join('\n')).toContain('guiSession.resultPath');
    expect(report.failures.join('\n')).toContain('guiSession.checkedAt');
    expect(report.failures.join('\n')).toContain('guiSession.outputMp4Path');
    expect(report.failures.join('\n')).toContain('guiSession.userDataDir');
  });

  it('fails when the GUI acceptance session evidence is incomplete', async () => {
    const rootDir = await makeFixtureRoot({
      guiSessionPatch: {
        status: 'failed',
        checks: {
          appLaunched: false,
          freshUserDataPath: false,
          automationSavePathSet: false,
        },
        paths: {
          outputMp4: '',
        },
      },
    });

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.guiSessionEvidence.status).toBe('failed');
    expect(report.failures.join('\n')).toContain('GUI session status must be "launched"');
    expect(report.failures.join('\n')).toContain('checks.appLaunched');
    expect(report.failures.join('\n')).toContain('paths.outputMp4');
  });

  it('fails when post-acceptance cleanup evidence is incomplete', async () => {
    const rootDir = await makeFixtureRoot({
      resultPatch: {
        postAcceptanceCleanup: {
          processStopped: false,
          uninstallerRan: false,
          installDirRemoved: false,
          installRootRemoved: false,
          shortcutCleanup: false,
          remainingNewShortcuts: [
            { path: 'C:\\Users\\qa\\Desktop\\Danbi Studio.lnk', existed: false },
          ],
        },
      },
    });

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.cleanupEvidence.status).toBe('failed');
    expect(report.failures.join('\n')).toContain('postAcceptanceCleanup.processStopped');
    expect(report.failures.join('\n')).toContain('postAcceptanceCleanup.uninstallerRan');
    expect(report.failures.join('\n')).toContain('new shortcuts');
  });

  it('fails when handoff artifact checksums no longer match', async () => {
    const rootDir = await makeFixtureRoot();
    await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/Danbi Studio-0.1.0-win-x64.exe', 'tampered');

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.checksumEvidence.status).toBe('failed');
    expect(report.failures.join('\n')).toContain('SHA-256 mismatch');
  });

  it('fails when generated handoff script checksums no longer match', async () => {
    const rootDir = await makeFixtureRoot();
    await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/verify-fresh-windows-result.ps1', 'tampered');

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.checksumEvidence.status).toBe('failed');
    expect(report.failures.join('\n')).toContain('verify-fresh-windows-result.ps1');
  });

  it('fails when the checksum file omits a required handoff entry', async () => {
    const rootDir = await makeFixtureRoot({ omitChecksumTarget: 'handoff-manifest.json' });

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.checksumEvidence.status).toBe('failed');
    expect(report.failures.join('\n')).toContain('required handoff entry handoff-manifest.json');
  });

  it('fails when the checksum file contains a Windows drive-relative path', async () => {
    const rootDir = await makeFixtureRoot();
    await appendFile(
      join(rootDir, '.danbi/electron-release/handoff/SHA256SUMS.txt'),
      `${'a'.repeat(64)}  C:escape.txt\n`,
      'utf8',
    );

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.checksumEvidence.status).toBe('failed');
    expect(report.checksumEvidence.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'C:escape.txt', status: 'unsafe-path' }),
    ]));
    expect(report.failures.join('\n')).toContain('Handoff checksum path must stay relative: C:escape.txt');
  });

  it('fails when the checksum file contains a non-canonical relative path', async () => {
    const rootDir = await makeFixtureRoot();
    await appendFile(
      join(rootDir, '.danbi/electron-release/handoff/SHA256SUMS.txt'),
      `${'a'.repeat(64)}  reports/../handoff-manifest.json\n`,
      'utf8',
    );

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.checksumEvidence.status).toBe('failed');
    expect(report.checksumEvidence.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'reports/../handoff-manifest.json', status: 'unsafe-path' }),
    ]));
    expect(report.failures.join('\n')).toContain(
      'Handoff checksum path must stay relative: reports/../handoff-manifest.json',
    );
  });

  it('fails when the handoff manifest does not declare the evidence packager', async () => {
    const rootDir = await makeFixtureRoot({
      manifestPatch: {
        evidencePackager: undefined,
      },
    });

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.failures.join('\n')).toContain('Handoff manifest evidencePackager must be package-fresh-windows-evidence.ps1');
  });

  it('fails when the handoff manifest does not declare the QA handoff packager', async () => {
    const rootDir = await makeFixtureRoot({
      manifestPatch: {
        handoffPackager: undefined,
      },
    });

    const { report } = validateFreshWindowsManualAcceptance({
      rootDir,
      writeReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.failures.join('\n')).toContain('Handoff manifest handoffPackager must be package-handoff-for-qa.ps1');
  });
});

async function makeFixtureRoot(options: {
  resultPatch?: Record<string, unknown>;
  basicSmokePatch?: Record<string, unknown>;
  guiSessionPatch?: Record<string, unknown>;
  omitChecksumTarget?: string;
  manifestPatch?: Record<string, unknown>;
} = {}): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'danbi-electron-manual-acceptance-'));
  tempRoots.push(rootDir);

  const installerText = 'installer';
  const blockmapText = 'blockmap';
  const acceptanceText = JSON.stringify({ status: 'passed' });
  const files = [
    {
      role: 'installer',
      target: 'Danbi Studio-0.1.0-win-x64.exe',
      content: installerText,
    },
    {
      role: 'installer-blockmap',
      target: 'Danbi Studio-0.1.0-win-x64.exe.blockmap',
      content: blockmapText,
    },
    {
      role: 'release-acceptance',
      target: 'reports/release-acceptance.json',
      content: acceptanceText,
    },
  ].map((file) => ({
    ...file,
    bytes: Buffer.byteLength(file.content),
    sha256: sha256(file.content),
  }));
  const handoffFiles = [
    {
      role: 'handoff-verify-script',
      target: 'verify-release-artifacts.ps1',
      content: 'Write-Output "Danbi Studio handoff verified."\n',
    },
    {
      role: 'fresh-windows-basic-smoke-script',
      target: 'run-installed-basic-smoke.ps1',
      content: 'Write-Output "basic smoke"\n',
    },
    {
      role: 'fresh-windows-gui-launcher-script',
      target: 'launch-gui-acceptance.ps1',
      content: 'Write-Output "gui launcher"\n',
    },
    {
      role: 'fresh-windows-result-recorder-script',
      target: 'record-fresh-windows-result.ps1',
      content: 'Write-Output "result recorder"\n',
    },
    {
      role: 'fresh-windows-result-verifier-script',
      target: 'verify-fresh-windows-result.ps1',
      content: 'Write-Output "Fresh Windows acceptance result verified."\n',
    },
    {
      role: 'fresh-windows-evidence-packager-script',
      target: 'package-fresh-windows-evidence.ps1',
      content: 'Write-Output "Fresh Windows evidence package written"\n',
    },
    {
      role: 'fresh-windows-acceptance-runner-script',
      target: 'run-fresh-windows-acceptance.ps1',
      content: 'Write-Output "acceptance runner"\n',
    },
    {
      role: 'fresh-windows-handoff-packager-script',
      target: 'package-handoff-for-qa.ps1',
      content: 'Write-Output "handoff packager"\n',
    },
    {
      role: 'fresh-windows-checklist',
      target: 'FRESH_WINDOWS_ACCEPTANCE_KR.md',
      content: '# Fresh Windows Acceptance\n',
    },
    {
      role: 'fresh-windows-result-template',
      target: 'fresh-windows-result-template.json',
      content: '{}\n',
    },
  ].map((file) => ({
    ...file,
    bytes: Buffer.byteLength(file.content),
    sha256: sha256(file.content),
  }));

  const handoffManifest = {
    kind: 'danbi.electron.release-handoff',
    status: 'passed',
    productName: 'Danbi Studio',
    version: '0.1.0',
    files,
    handoffFiles,
    checksumFile: 'SHA256SUMS.txt',
    verifyScript: 'verify-release-artifacts.ps1',
    basicSmokeScript: 'run-installed-basic-smoke.ps1',
    guiAcceptanceLauncher: 'launch-gui-acceptance.ps1',
    resultRecorder: 'record-fresh-windows-result.ps1',
    resultVerifier: 'verify-fresh-windows-result.ps1',
    evidencePackager: 'package-fresh-windows-evidence.ps1',
    acceptanceRunner: 'run-fresh-windows-acceptance.ps1',
    handoffPackager: 'package-handoff-for-qa.ps1',
    checklist: 'FRESH_WINDOWS_ACCEPTANCE_KR.md',
    resultTemplate: 'fresh-windows-result-template.json',
    ...options.manifestPatch,
  };
  const handoffManifestText = JSON.stringify(handoffManifest);
  const handoffManifestEntry = {
    role: 'release-handoff-manifest',
    target: 'handoff-manifest.json',
    content: handoffManifestText,
    bytes: Buffer.byteLength(handoffManifestText),
    sha256: sha256(handoffManifestText),
  };
  await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/handoff-manifest.json', handoffManifestText);
  for (const file of [...files, ...handoffFiles]) {
    await writeFixtureFile(rootDir, `.danbi/electron-release/handoff/${file.target}`, file.content);
  }
  const checksumFiles = [...files, ...handoffFiles, handoffManifestEntry]
    .filter((file) => file.target !== options.omitChecksumTarget);
  await writeFixtureFile(
    rootDir,
    '.danbi/electron-release/handoff/SHA256SUMS.txt',
    checksumFiles.map((file) => `${file.sha256}  ${file.target}`).join('\n') + '\n',
  );
  await writeFixtureBuffer(rootDir, '.danbi/electron-release/handoff/fresh-windows-gui-render.mp4', fixtureOutputMp4);

  const manualResult = deepMerge({
    kind: 'danbi.electron.fresh-windows-manual-acceptance',
    productName: 'Danbi Studio',
    version: '0.1.0',
    installer: 'Danbi Studio-0.1.0-win-x64.exe',
    tester: 'QA Tester',
    machine: {
      windowsVersion: 'Windows 11 23H2',
      cpu: 'Ryzen 9',
      gpu: 'RTX',
      ramGb: '64',
      ffmpegSource: 'system PATH',
    },
    checkedAt: '2026-06-16T12:00:00.000Z',
    artifactVerification: {
      verifyReleaseArtifactsPs1Passed: true,
      notes: '',
    },
    basicSmoke: {
      resultPath: 'fresh-windows-basic-smoke.json',
      status: 'passed',
      checkedAt: '2026-06-16T11:55:00.000Z',
    },
    guiSession: {
      resultPath: 'fresh-windows-gui-session.json',
      status: 'launched',
      checkedAt: '2026-06-16T11:58:00.000Z',
      outputMp4Path: 'C:\\Users\\qa\\Videos\\getting-started-render.mp4',
      userDataDir: 'C:\\Users\\qa\\AppData\\Local\\Temp\\DanbiStudioGuiAcceptance\\user-data',
      launchedWithFreshUserData: true,
      automationSavePathSet: true,
      outputPathMatchesRenderedMp4: true,
    },
    postAcceptanceCleanup: {
      processStopped: true,
      uninstallerRan: true,
      installDirRemoved: true,
      installRootRemoved: true,
      shortcutCleanup: true,
      remainingNewShortcuts: [],
    },
    install: {
      freshWindowsProfile: true,
      installerCompleted: true,
      appLaunched: true,
      notes: '',
    },
    sampleWorkflow: {
      openedPackagedSample: true,
      programMonitorRendered: true,
      exportPlanReady: true,
      guiRenderCompleted: true,
      outputMp4Opened: true,
      noExternalNetworkRequired: true,
      outputMp4: {
        path: 'C:\\Users\\qa\\Videos\\getting-started-render.mp4',
        bytes: 120000,
        sha256: fixtureOutputMp4Sha256,
        handoffPath: 'C:\\handoff\\fresh-windows-gui-render.mp4',
        handoffRelativePath: 'fresh-windows-gui-render.mp4',
        durationSeconds: 6,
        hasVideo: true,
        hasAudio: true,
        ffprobePath: 'C:\\Program Files\\Danbi Studio\\resources\\ffmpeg\\ffprobe.exe',
      },
      notes: '',
    },
    result: 'passed',
  }, options.resultPatch ?? {});
  await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-result.json', JSON.stringify(manualResult));

  const basicSmokeResult = deepMerge({
    kind: 'danbi.electron.fresh-windows-basic-smoke',
    productName: 'Danbi Studio',
    version: '0.1.0',
    installer: 'Danbi Studio-0.1.0-win-x64.exe',
    status: 'passed',
    checkedAt: '2026-06-16T11:55:00.000Z',
    machine: {
      windowsVersion: 'Windows 11 23H2',
      cpu: 'Ryzen 9',
      gpu: 'RTX',
      ramGb: '64',
    },
    paths: {
      installRoot: 'C:\\Users\\qa\\AppData\\Local\\Temp\\DanbiStudioFreshSmoke',
      installDir: 'C:\\Users\\qa\\AppData\\Local\\Temp\\DanbiStudioFreshSmoke\\app',
      userDataDir: 'C:\\Users\\qa\\AppData\\Local\\Temp\\DanbiStudioFreshSmoke\\user-data',
      rawSmokeResultPath: 'C:\\handoff\\fresh-windows-basic-smoke.raw.json',
    },
    checks: {
      verifyReleaseArtifactsPs1Passed: true,
      installerCompleted: true,
      installedExePresent: true,
      packagedSamplePresent: true,
      packagedRendererPresent: true,
      smokeProcessExitZero: true,
      smokeResultWritten: true,
      sampleProjectAvailable: true,
      ffmpegReady: true,
      rendererUrlLocal: true,
      userDataIsFreshPath: true,
      uninstalled: true,
      shortcutCleanup: true,
    },
    shortcuts: {
      before: [
        { path: 'C:\\Users\\qa\\Desktop\\Danbi Studio.lnk', existed: false },
        { path: 'C:\\Users\\qa\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Danbi Studio.lnk', existed: false },
      ],
      remainingNew: [],
    },
    smokeResult: {
      rendererUrl: 'http://127.0.0.1:35123/editor',
      userDataPath: 'C:\\Users\\qa\\AppData\\Local\\Temp\\DanbiStudioFreshSmoke\\user-data',
      diagnostics: {
        ffmpeg: {
          ready: true,
          ffmpegPath: 'C:\\Program Files\\Danbi Studio\\resources\\ffmpeg\\ffmpeg.exe',
          ffprobePath: 'C:\\Program Files\\Danbi Studio\\resources\\ffmpeg\\ffprobe.exe',
        },
        samples: {
          available: true,
          gettingStartedPackagePath: 'C:\\Program Files\\Danbi Studio\\resources\\samples\\getting-started',
        },
      },
    },
    failure: null,
  }, options.basicSmokePatch ?? {});
  await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-basic-smoke.json', JSON.stringify(basicSmokeResult));

  const guiSessionResult = deepMerge({
    kind: 'danbi.electron.fresh-windows-gui-session',
    productName: 'Danbi Studio',
    version: '0.1.0',
    installer: 'Danbi Studio-0.1.0-win-x64.exe',
    status: 'launched',
    checkedAt: '2026-06-16T11:58:00.000Z',
    processId: 1234,
    paths: {
      installRoot: 'C:\\Users\\qa\\AppData\\Local\\Temp\\DanbiStudioGuiAcceptance',
      installDir: 'C:\\Users\\qa\\AppData\\Local\\Temp\\DanbiStudioGuiAcceptance\\app',
      userDataDir: 'C:\\Users\\qa\\AppData\\Local\\Temp\\DanbiStudioGuiAcceptance\\user-data',
      outputMp4: 'C:\\Users\\qa\\Videos\\getting-started-render.mp4',
    },
    checks: {
      verifyReleaseArtifactsPs1Passed: true,
      basicSmokePassed: true,
      installerCompleted: true,
      installedExePresent: true,
      packagedSamplePresent: true,
      packagedRendererPresent: true,
      appLaunched: true,
      freshUserDataPath: true,
      automationSavePathSet: true,
    },
  }, options.guiSessionPatch ?? {});
  await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-gui-session.json', JSON.stringify(guiSessionResult));

  return rootDir;
}

async function writeFixtureFile(rootDir: string, relativePath: string, text: string): Promise<void> {
  const filePath = join(rootDir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, text, 'utf8');
}

async function writeFixtureBuffer(rootDir: string, relativePath: string, bytes: Buffer): Promise<void> {
  const filePath = join(rootDir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(next[key])) {
      next[key] = deepMerge(next[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      next[key] = value;
    }
  }
  return next;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
