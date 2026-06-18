import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildElectronReleaseHandoff,
} from '../../scripts/electron-release-handoff.mjs';
import {
  importFreshWindowsEvidencePackage,
} from '../../scripts/electron-release-import-evidence.mjs';

const tempRoots: string[] = [];
const handoffScriptPath = fileURLToPath(new URL('../../scripts/electron-release-handoff.mjs', import.meta.url));

describe('Electron release handoff', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
  });

  it('creates a fresh Windows handoff with installer artifacts, checksums, and manual acceptance files', async () => {
    const rootDir = await makeFixtureRoot();

    const result = buildElectronReleaseHandoff({ rootDir });

    expect(result.handoffDir).toBe('.danbi/electron-release/handoff');
    expect(result.manifest).toMatchObject({
      status: 'passed',
      productName: 'Danbi Studio',
      version: '0.1.0',
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
    });
    expect(result.manifest.files.map((file) => file.role)).toEqual(expect.arrayContaining([
      'installer',
      'installer-blockmap',
      'latest-yml',
      'release-acceptance',
      'release-verification-full',
      'release-manifest',
      'render-evidence',
    ]));
    expect(result.manifest.handoffFiles.map((file) => file.role)).toEqual(expect.arrayContaining([
      'handoff-verify-script',
      'fresh-windows-basic-smoke-script',
      'fresh-windows-gui-launcher-script',
      'fresh-windows-result-recorder-script',
      'fresh-windows-result-verifier-script',
      'fresh-windows-evidence-packager-script',
      'fresh-windows-acceptance-runner-script',
      'fresh-windows-handoff-packager-script',
      'fresh-windows-checklist',
      'fresh-windows-result-template',
    ]));
    expect(existsSync(join(rootDir, '.danbi/electron-release/handoff/Danbi-Studio-0.1.0-win-x64.exe'))).toBe(true);
    expect(existsSync(join(rootDir, '.danbi/electron-release/handoff/reports/release-acceptance.json'))).toBe(true);
    expect(existsSync(join(rootDir, '.danbi/electron-release/handoff/evidence/renders/getting-started-installed-render.mp4'))).toBe(true);

    const checksums = await readFile(join(rootDir, '.danbi/electron-release/handoff/SHA256SUMS.txt'), 'utf8');
    expect(checksums).toContain('Danbi-Studio-0.1.0-win-x64.exe');
    expect(checksums).toContain('reports/release-acceptance.json');
    expect(checksums).toContain('verify-release-artifacts.ps1');
    expect(checksums).toContain('verify-fresh-windows-result.ps1');
    expect(checksums).toContain('package-fresh-windows-evidence.ps1');
    expect(checksums).toContain('package-handoff-for-qa.ps1');
    expect(checksums).toContain('FRESH_WINDOWS_ACCEPTANCE_KR.md');
    expect(checksums).toContain('fresh-windows-result-template.json');
    expect(checksums).toContain('handoff-manifest.json');

    const verifyScript = await readFile(join(rootDir, '.danbi/electron-release/handoff/verify-release-artifacts.ps1'), 'utf8');
    expect(verifyScript).toContain('Get-FileHash');
    expect(verifyScript).toContain('SHA256SUMS.txt');
    expect(verifyScript).toContain('handoff-manifest.json');
    expect(verifyScript).toContain('Test-SafeHandoffPath');
    expect(verifyScript).toContain('$Value.Contains([string][char]92)');
    expect(verifyScript).toContain('Unsafe handoff checksum path');
    expect(verifyScript).toContain('Checksum file is missing required handoff entry');
    expect(verifyScript).toContain('manifest-declared handoff entry');
    expect(verifyScript).toContain('Full verification gate count is below $($requiredFullGateIds.Count)');
    expect(verifyScript).toContain('reports/release-verification-full.json');
    expect(verifyScript).toContain('Full verification report is missing required gate');
    expect(verifyScript).toContain('eslint-clean-check');
    expect(verifyScript).toContain('fresh Windows evidence packager');
    expect(verifyScript).toContain('package-handoff-for-qa.ps1');

    const basicSmokeScript = await readFile(join(rootDir, '.danbi/electron-release/handoff/run-installed-basic-smoke.ps1'), 'utf8');
    expect(basicSmokeScript).toContain('DANBI_ELECTRON_SMOKE');
    expect(basicSmokeScript).toContain('fresh-windows-basic-smoke.json');
    expect(basicSmokeScript).toContain('Packaged sample was not available');
    expect(basicSmokeScript).toContain('shortcutCleanup');
    expect(basicSmokeScript).toContain('Remove-NewShortcuts');

    const guiLauncher = await readFile(join(rootDir, '.danbi/electron-release/handoff/launch-gui-acceptance.ps1'), 'utf8');
    expect(guiLauncher).toContain('DANBI_ELECTRON_AUTOMATION_SAVE_FILE_PATH');
    expect(guiLauncher).toContain('fresh-windows-gui-session.json');
    expect(guiLauncher).toContain('Render output path');

    const resultRecorder = await readFile(join(rootDir, '.danbi/electron-release/handoff/record-fresh-windows-result.ps1'), 'utf8');
    expect(resultRecorder).toContain('Rendered output MP4 path');
    expect(resultRecorder).toContain('fresh-windows-result.json');
    expect(resultRecorder).toContain('run-installed-basic-smoke.ps1');
    expect(resultRecorder).toContain('launch-gui-acceptance.ps1');
    expect(resultRecorder).toContain('Manual confirmation required');
    expect(resultRecorder).toContain('Invoke-GuiAcceptanceCleanup');
    expect(resultRecorder).toContain('postAcceptanceCleanup');
    expect(resultRecorder).toContain('Resolve-FfprobePath');
    expect(resultRecorder).toContain('resources\\ffmpeg\\ffprobe.exe');
    expect(resultRecorder).toContain('fresh-windows-gui-render.mp4');
    expect(resultRecorder).toContain('handoffRelativePath = $handoffOutputRelativePath');
    expect(resultRecorder).toContain('Get-FileHash -Algorithm SHA256');
    expect(resultRecorder).toContain('sha256 = $outputSha256');
    expect(resultRecorder).toContain('ffprobePath');

    const resultTemplate = JSON.parse(await readFile(join(rootDir, '.danbi/electron-release/handoff/fresh-windows-result-template.json'), 'utf8'));
    expect(resultTemplate.sampleWorkflow.outputMp4.sha256).toBe('');
    expect(resultTemplate.sampleWorkflow.outputMp4.handoffRelativePath).toBe('fresh-windows-gui-render.mp4');

    const resultVerifier = await readFile(join(rootDir, '.danbi/electron-release/handoff/verify-fresh-windows-result.ps1'), 'utf8');
    expect(resultVerifier).toContain('fresh-windows-basic-smoke.json');
    expect(resultVerifier).toContain('fresh-windows-gui-session.json');
    expect(resultVerifier).toContain('fresh-windows-result.json');
    expect(resultVerifier).toContain('Get-FileHash -Algorithm SHA256');
    expect(resultVerifier).toContain('result.sampleWorkflow.outputMp4.sha256');
    expect(resultVerifier).toContain('result.sampleWorkflow.outputMp4.handoffRelativePath');
    expect(resultVerifier).toContain('Assert-Equal $handoffOutputRelativePath "fresh-windows-gui-render.mp4"');
    expect(resultVerifier).toContain('Handoff output MP4 is missing');
    expect(resultVerifier).toContain('postAcceptanceCleanup.shortcutCleanup');

    const evidencePackager = await readFile(join(rootDir, '.danbi/electron-release/handoff/package-fresh-windows-evidence.ps1'), 'utf8');
    expect(evidencePackager).toContain('verify-fresh-windows-result.ps1');
    expect(evidencePackager).toContain('fresh-windows-evidence.zip');
    expect(evidencePackager).toContain('fresh-windows-evidence-summary.json');
    expect(evidencePackager).toContain('evidenceJson');
    expect(evidencePackager).toContain('$resultSha256');
    expect(evidencePackager).toContain('$basicSmokeSha256');
    expect(evidencePackager).toContain('$guiSessionSha256');
    expect(evidencePackager).toContain('handoffReferences');
    expect(evidencePackager).toContain('$manifestSha256');
    expect(evidencePackager).toContain('$checksumsSha256');
    expect(evidencePackager).toContain('$summarySha256');
    expect(evidencePackager).toContain('fresh-windows-evidence-package-report');
    expect(evidencePackager).toContain('$archivePath.report.json');
    expect(evidencePackager).toContain('Fresh Windows evidence package report');
    expect(evidencePackager).toContain('Write-ZipArchiveFromFiles');
    expect(evidencePackager).toContain('CreateEntryFromFile');
    expect(evidencePackager).toContain('Assert-EvidenceZipEntries');
    expect(evidencePackager).toContain('Test-SafeZipEntryName');
    expect(evidencePackager).toContain('Fresh Windows evidence package output must end with .zip');
    expect(evidencePackager).toContain('[System.IO.Compression.ZipFile]::OpenRead');
    expect(evidencePackager).toContain('unsafeEntries');
    expect(evidencePackager).toContain('duplicateEntries');
    expect(evidencePackager).toContain('unexpectedEntries');
    expect(evidencePackager).toContain('missingFiles');
    expect(evidencePackager).toContain('zipEntryInspection');
    expect(evidencePackager).toContain('fresh-windows-evidence.zip.sha256');

    const handoffPackager = await readFile(join(rootDir, '.danbi/electron-release/handoff/package-handoff-for-qa.ps1'), 'utf8');
    expect(handoffPackager).toContain('verify-release-artifacts.ps1');
    expect(handoffPackager).toContain('danbi-studio-$safeVersion-fresh-windows-handoff.zip');
    expect(handoffPackager).toContain('handoff-package-summary.json');
    expect(handoffPackager).toContain('release-handoff-package-report');
    expect(handoffPackager).toContain('$manifestSha256');
    expect(handoffPackager).toContain('$checksumSha256');
    expect(handoffPackager).toContain('$archivePath.report.json');
    expect(handoffPackager).toContain('Write-ZipArchiveFromFiles');
    expect(handoffPackager).toContain('CreateEntryFromFile');
    expect(handoffPackager).toContain('Assert-HandoffZipEntries');
    expect(handoffPackager).toContain('Test-SafeHandoffZipEntryName');
    expect(handoffPackager).toContain('$EntryName.Contains([string][char]92)');
    expect(handoffPackager).toContain('if (!(Test-SafeHandoffZipEntryName $relativePath))');
    expect(handoffPackager).toContain('Fresh Windows handoff package output must end with .zip');
    expect(handoffPackager).toContain('SHA256SUMS.txt');
    expect(handoffPackager).toContain('zipEntryInspection');
    expect(handoffPackager).toContain('$archiveSha256');
    expect(handoffPackager).toContain('.sha256');

    const acceptanceRunner = await readFile(join(rootDir, '.danbi/electron-release/handoff/run-fresh-windows-acceptance.ps1'), 'utf8');
    expect(acceptanceRunner).toContain('run-installed-basic-smoke.ps1');
    expect(acceptanceRunner).toContain('launch-gui-acceptance.ps1');
    expect(acceptanceRunner).toContain('record-fresh-windows-result.ps1');
    expect(acceptanceRunner).toContain('verify-fresh-windows-result.ps1');
    expect(acceptanceRunner).toContain('package-fresh-windows-evidence.ps1');
    expect(acceptanceRunner).toContain('Package fresh Windows return evidence');
    expect(acceptanceRunner).toContain('Verify fresh Windows result evidence');
    expect(acceptanceRunner).toContain('fresh-windows-gui-render.mp4');
    expect(acceptanceRunner).toContain('fresh-windows-evidence.zip.sha256');
    expect(acceptanceRunner).toContain('fresh-windows-evidence.zip.report.json');
    expect(acceptanceRunner).toContain('WaitTimeoutSeconds');
    expect(acceptanceRunner).toContain('Manual GUI render required');

    const checklist = await readFile(join(rootDir, '.danbi/electron-release/handoff/FRESH_WINDOWS_ACCEPTANCE_KR.md'), 'utf8');
    expect(checklist).toContain('Fresh Windows Acceptance');
    expect(checklist).toContain('package-handoff-for-qa.ps1');
    expect(checklist).toContain('danbi-studio-<version>-fresh-windows-handoff.zip');
    expect(checklist).toContain('run-fresh-windows-acceptance.ps1');
    expect(checklist).toContain('Recommended One-Pass Acceptance');
    expect(checklist).toContain('run-installed-basic-smoke.ps1');
    expect(checklist).toContain('launch-gui-acceptance.ps1');
    expect(checklist).toContain('Open the packaged getting-started sample');
    expect(checklist).toContain('packaged FFprobe');
    expect(checklist).toContain('record-fresh-windows-result.ps1');
    expect(checklist).toContain('verify-fresh-windows-result.ps1');
    expect(checklist).toContain('package-fresh-windows-evidence.ps1');
    expect(checklist).toContain('rendered MP4 SHA-256');
    expect(checklist).toContain('fresh-windows-gui-render.mp4');
    expect(checklist).toContain('fresh-windows-evidence.zip.sha256');
    expect(checklist).toContain('fresh-windows-evidence.zip.report.json');
    expect(checklist).toContain('npm run electron:release:import-evidence -- --evidence-dir "<returned-evidence-folder>" --run-final-gate');
    expect(checklist).toContain('finalGateStatus: "passed"');
    expect(checklist).toContain('failures');
  });

  it('packages the QA handoff ZIP with forward-slash nested entries', async () => {
    const rootDir = await makeFixtureRoot();
    buildElectronReleaseHandoff({ rootDir });
    const handoffDir = join(rootDir, '.danbi/electron-release/handoff');
    const archivePath = join(rootDir, '.danbi/electron-release/test-handoff.zip');

    const packageResult = spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(handoffDir, 'package-handoff-for-qa.ps1'),
      '-Out',
      archivePath,
    ], {
      cwd: handoffDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    expect(packageResult.status, packageResult.stderr || packageResult.stdout).toBe(0);
    const entries = readZipEntries(archivePath);
    expect(entries).toContain('evidence/renders/getting-started-installed-render.mp4');
    expect(entries).toContain('reports/release-verification-full.json');
    expect(entries.every((entry) => !entry.includes('\\'))).toBe(true);

    const report = JSON.parse((await readFile(`${archivePath}.report.json`, 'utf8')).replace(/^\uFEFF/, '')) as {
      zipEntryInspection: {
        status: string;
        unsafeEntries: string[];
      };
    };
    expect(report.zipEntryInspection).toMatchObject({
      status: 'passed',
      unsafeEntries: [],
    });
  });

  it('packages fresh Windows return evidence with a matching ZIP report', async () => {
    const rootDir = await makeFixtureRoot();
    buildElectronReleaseHandoff({ rootDir });
    const handoffDir = join(rootDir, '.danbi/electron-release/handoff');
    const archivePath = join(rootDir, '.danbi/electron-release/returned-evidence.zip');
    const renderText = 'rendered mp4 fixture';
    const renderSha256 = createHash('sha256').update(renderText).digest('hex');

    await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/verify-fresh-windows-result.ps1', 'Write-Output "fresh verified"\n');
    await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-basic-smoke.json', JSON.stringify({
      kind: 'danbi.electron.fresh-windows-basic-smoke',
      status: 'passed',
      checkedAt: '2026-06-18T00:00:00.000Z',
    }));
    await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-gui-session.json', JSON.stringify({
      kind: 'danbi.electron.fresh-windows-gui-session',
      status: 'launched',
      checkedAt: '2026-06-18T00:01:00.000Z',
    }));
    await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-result.json', JSON.stringify({
      tester: 'QA',
      checkedAt: '2026-06-18T00:02:00.000Z',
      sampleWorkflow: {
        outputMp4: {
          sha256: renderSha256,
          durationSeconds: 1,
          hasVideo: true,
          hasAudio: false,
        },
      },
    }));
    await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-gui-render.mp4', renderText);

    const packageResult = spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(handoffDir, 'package-fresh-windows-evidence.ps1'),
      '-Out',
      archivePath,
    ], {
      cwd: handoffDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    expect(packageResult.status, packageResult.stderr || packageResult.stdout).toBe(0);
    const entries = readZipEntries(archivePath);
    expect(entries).toEqual([
      'fresh-windows-basic-smoke.json',
      'fresh-windows-gui-session.json',
      'fresh-windows-result.json',
      'fresh-windows-gui-render.mp4',
      'fresh-windows-evidence-summary.json',
      'handoff-manifest.json',
      'SHA256SUMS.txt',
    ]);
    expect(entries.every((entry) => !entry.includes('\\'))).toBe(true);

    const report = JSON.parse((await readFile(`${archivePath}.report.json`, 'utf8')).replace(/^\uFEFF/, '')) as {
      archive: {
        fileName: string;
      };
      outputMp4: {
        sha256: string;
      };
      zipEntryInspection: {
        status: string;
        unsafeEntries: string[];
        missingFiles: string[];
        unexpectedEntries: string[];
      };
    };
    expect(report.archive.fileName).toBe('returned-evidence.zip');
    expect(report.outputMp4.sha256).toBe(renderSha256);
    expect(report.zipEntryInspection).toMatchObject({
      status: 'passed',
      unsafeEntries: [],
      missingFiles: [],
      unexpectedEntries: [],
    });
  });

  it('rejects non-ZIP fresh Windows evidence package output names', async () => {
    const rootDir = await makeFixtureRoot();
    buildElectronReleaseHandoff({ rootDir });
    const handoffDir = join(rootDir, '.danbi/electron-release/handoff');
    const archivePath = join(rootDir, '.danbi/electron-release/returned-evidence.txt');

    await writeFreshWindowsEvidenceFixture(rootDir);

    const packageResult = spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(handoffDir, 'package-fresh-windows-evidence.ps1'),
      '-Out',
      archivePath,
    ], {
      cwd: handoffDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    expect(packageResult.status).not.toBe(0);
    expect(packageResult.stderr || packageResult.stdout).toContain('Fresh Windows evidence package output must end with .zip');
    expect(existsSync(archivePath)).toBe(false);
  });

  it('rejects non-ZIP QA handoff package output names', async () => {
    const rootDir = await makeFixtureRoot();
    buildElectronReleaseHandoff({ rootDir });
    const handoffDir = join(rootDir, '.danbi/electron-release/handoff');
    const archivePath = join(rootDir, '.danbi/electron-release/handoff-package.txt');

    const packageResult = spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(handoffDir, 'package-handoff-for-qa.ps1'),
      '-Out',
      archivePath,
    ], {
      cwd: handoffDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    expect(packageResult.status).not.toBe(0);
    expect(packageResult.stderr || packageResult.stdout).toContain('Fresh Windows handoff package output must end with .zip');
    expect(existsSync(archivePath)).toBe(false);
  });

  it('imports the generated fresh Windows evidence package report', async () => {
    const rootDir = await makeFixtureRoot();
    buildElectronReleaseHandoff({ rootDir });
    const handoffDir = join(rootDir, '.danbi/electron-release/handoff');
    const archivePath = join(rootDir, '.danbi/electron-release/fresh-windows-evidence-from-packager.zip');
    const renderText = 'rendered mp4 fixture';
    const renderSha256 = createHash('sha256').update(renderText).digest('hex');

    await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/verify-fresh-windows-result.ps1', 'Write-Output "fresh verified"\n');
    await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-basic-smoke.json', JSON.stringify({
      kind: 'danbi.electron.fresh-windows-basic-smoke',
      status: 'passed',
      checkedAt: '2026-06-18T00:00:00.000Z',
    }));
    await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-gui-session.json', JSON.stringify({
      kind: 'danbi.electron.fresh-windows-gui-session',
      status: 'launched',
      checkedAt: '2026-06-18T00:01:00.000Z',
    }));
    await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-result.json', JSON.stringify({
      tester: 'QA',
      checkedAt: '2026-06-18T00:02:00.000Z',
      sampleWorkflow: {
        outputMp4: {
          sha256: renderSha256,
          durationSeconds: 1,
          hasVideo: true,
          hasAudio: false,
        },
      },
    }));
    await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-gui-render.mp4', renderText);

    const packageResult = spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(handoffDir, 'package-fresh-windows-evidence.ps1'),
      '-Out',
      archivePath,
    ], {
      cwd: handoffDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    expect(packageResult.status, packageResult.stderr || packageResult.stdout).toBe(0);

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: archivePath,
      evidenceZipSha256: `${archivePath}.sha256`,
      evidenceReport: `${archivePath}.report.json`,
      outputDir: '.danbi/electron-release/returned-fixture',
      reportPath: '.danbi/electron-release/returned-fixture/import-report.json',
      throwOnFailure: false,
    });

    expect(report).toMatchObject({
      status: 'passed',
      importStatus: 'passed',
      archiveVerification: {
        status: 'passed',
        unsafeEntries: [],
        missingFiles: [],
        unexpectedEntries: [],
      },
      packageReportVerification: {
        status: 'passed',
        checks: {
          archiveFileNameMatchesOutput: true,
          zipEntryInspectionMatchesArchive: true,
        },
      },
      copyVerification: {
        status: 'passed',
      },
    });
    expect(report.imported.reportPath).toBe('.danbi/electron-release/returned-fixture/fresh-windows-evidence-from-packager.zip.report.json');
  });

  it('runs the handoff CLI against a supplied root directory', async () => {
    const rootDir = await makeFixtureRoot();

    const result = spawnSync('node', [
      handoffScriptPath,
      '--root-dir',
      rootDir,
      '--out',
      '.danbi/electron-release/handoff-from-cli',
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
      handoffDir: '.danbi/electron-release/handoff-from-cli',
      installer: 'Danbi-Studio-0.1.0-win-x64.exe',
      checklist: 'FRESH_WINDOWS_ACCEPTANCE_KR.md',
      failureCount: 0,
      failures: [],
    });
    expect(existsSync(join(rootDir, '.danbi/electron-release/handoff-from-cli/handoff-manifest.json'))).toBe(true);
  });

  it('prints handoff CLI failures in stdout JSON', async () => {
    const rootDir = await makeFixtureRoot({ acceptanceStatus: 'failed' });

    const result = spawnSync('node', [
      handoffScriptPath,
      '--root-dir',
      rootDir,
      '--out',
      '.danbi/electron-release/handoff-from-cli',
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
      handoffDir: '.danbi/electron-release/handoff-from-cli',
      failureCount: 1,
    });
    expect(output.failures.join('\n')).toContain('Release acceptance report must be passed before handoff');
    expect(result.stderr).toContain('Release acceptance report must be passed before handoff');
  });

  it('refuses to create a handoff from a failed acceptance report', async () => {
    const rootDir = await makeFixtureRoot({ acceptanceStatus: 'failed' });

    expect(() => buildElectronReleaseHandoff({ rootDir })).toThrow('must be passed');
  });

  it('refuses to create a handoff when acceptance installer artifacts disagree', async () => {
    const rootDir = await makeFixtureRoot({
      installerPath: 'release/electron/Danbi Studio-0.1.0-win-x64.exe',
    });

    expect(() => buildElectronReleaseHandoff({ rootDir })).toThrow('Release acceptance installer artifact mismatch');
  });

  it('refuses to create a handoff from stale installer naming evidence', async () => {
    const rootDir = await makeFixtureRoot({
      expectedInstallerName: 'Danbi Studio-0.1.0-win-x64.exe',
    });

    expect(() => buildElectronReleaseHandoff({ rootDir })).toThrow('installer name is stale');
  });
});

async function writeFreshWindowsEvidenceFixture(rootDir: string): Promise<{ renderSha256: string }> {
  const renderText = 'rendered mp4 fixture';
  const renderSha256 = createHash('sha256').update(renderText).digest('hex');

  await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/verify-fresh-windows-result.ps1', 'Write-Output "fresh verified"\n');
  await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-basic-smoke.json', JSON.stringify({
    kind: 'danbi.electron.fresh-windows-basic-smoke',
    status: 'passed',
    checkedAt: '2026-06-18T00:00:00.000Z',
  }));
  await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-gui-session.json', JSON.stringify({
    kind: 'danbi.electron.fresh-windows-gui-session',
    status: 'launched',
    checkedAt: '2026-06-18T00:01:00.000Z',
  }));
  await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-result.json', JSON.stringify({
    tester: 'QA',
    checkedAt: '2026-06-18T00:02:00.000Z',
    sampleWorkflow: {
      outputMp4: {
        sha256: renderSha256,
        durationSeconds: 1,
        hasVideo: true,
        hasAudio: false,
      },
    },
  }));
  await writeFixtureFile(rootDir, '.danbi/electron-release/handoff/fresh-windows-gui-render.mp4', renderText);

  return { renderSha256 };
}

async function makeFixtureRoot(options: {
  acceptanceStatus?: string;
  expectedInstallerName?: string;
  installerPath?: string;
  installerBlockmapPath?: string;
  latestYmlExpectedInstallerName?: string;
} = {}): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'danbi-electron-release-handoff-'));
  tempRoots.push(rootDir);
  const expectedInstallerName = options.expectedInstallerName ?? 'Danbi-Studio-0.1.0-win-x64.exe';
  const installerPath = options.installerPath ?? `release/electron/${expectedInstallerName}`;
  const installerBlockmapPath = options.installerBlockmapPath ?? `${installerPath}.blockmap`;

  const acceptance = {
    kind: 'danbi.electron.release-acceptance',
    generatedAt: '2026-06-16T00:00:00.000Z',
    status: options.acceptanceStatus ?? 'passed',
    productName: 'Danbi Studio',
    version: '0.1.0',
    expectedInstallerName,
    evidence: {
      verification: {
        status: 'passed',
        profile: 'full',
        dryRun: false,
        passedCount: 17,
        path: '.danbi/electron-release/release-verification-full.json',
      },
      installer: {
        path: installerPath,
      },
      installerBlockmap: {
        path: installerBlockmapPath,
      },
      latestYml: {
        path: 'release/electron/latest.yml',
        expectedInstallerName: options.latestYmlExpectedInstallerName ?? expectedInstallerName,
      },
      renderOutputs: [
        { path: '.danbi/electron-package-smoke/sample-render/getting-started.mp4' },
        { path: '.danbi/electron-gui-smoke/renders/getting-started-ui-render.mp4' },
        { path: '.danbi/electron-offline-smoke/renders/getting-started-offline-render.mp4' },
        { path: '.danbi/electron-install-smoke/renders/getting-started-installed-render.mp4' },
      ],
    },
  };

  await writeFixtureFile(rootDir, '.danbi/electron-release/release-acceptance.json', JSON.stringify(acceptance));
  await writeFixtureFile(rootDir, '.danbi/electron-release/release-verification-full.json', JSON.stringify({
    status: 'passed',
    profile: 'full',
    passedCount: 17,
    results: [
      { id: 'typecheck' },
      { id: 'unit-tests' },
      { id: 'git-diff-check' },
      { id: 'eslint-clean-check' },
      { id: 'architecture-check' },
      { id: 'license-check' },
      { id: 'plugin-signing-readiness' },
      { id: 'plugin-signing-production-readiness' },
      { id: 'plugin-signing-rotation-drill' },
      { id: 'plugin-signing-custody-audit' },
      { id: 'electron-smoke' },
      { id: 'playwright-chromium' },
      { id: 'electron-package-smoke' },
      { id: 'electron-gui-smoke' },
      { id: 'electron-offline-smoke' },
      { id: 'electron-installer-smoke' },
      { id: 'electron-install-smoke' },
    ],
  }));
  await writeFixtureFile(rootDir, '.danbi/electron-release/manifest.json', JSON.stringify({
    standalonePrune: { status: 'passed' },
    pluginSigning: { productionReady: true },
    pluginSigningCustodyAudit: { status: 'passed' },
  }));
  await writeFixtureFile(rootDir, installerPath, 'installer');
  await writeFixtureFile(rootDir, installerBlockmapPath, 'blockmap');
  await writeFixtureFile(rootDir, 'release/electron/latest.yml', `path: ${expectedInstallerName}\n`);

  for (const renderOutput of acceptance.evidence.renderOutputs) {
    await writeFixtureFile(rootDir, renderOutput.path, 'mp4');
  }

  return rootDir;
}

async function writeFixtureFile(rootDir: string, relativePath: string, text: string): Promise<void> {
  const filePath = join(rootDir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, text, 'utf8');
}

function readZipEntries(zipPath: string): string[] {
  const result = spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    [
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      '$archive = [System.IO.Compression.ZipFile]::OpenRead($env:DANBI_ZIP_PATH)',
      'try {',
      '  @($archive.Entries | ForEach-Object { [string]$_.FullName }) | ConvertTo-Json -Compress',
      '} finally {',
      '  $archive.Dispose()',
      '}',
    ].join('; '),
  ], {
    env: {
      ...process.env,
      DANBI_ZIP_PATH: zipPath,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Failed to inspect ZIP entries: ${result.error?.message ?? result.stderr}`);
  }
  const parsed = JSON.parse(result.stdout);
  return (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => String(entry));
}
