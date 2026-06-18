import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  validateElectronReleaseFinalGate,
} from '../../scripts/electron-release-final-gate.mjs';

const tempRoots: string[] = [];
const finalGateScriptPath = fileURLToPath(new URL('../../scripts/electron-release-final-gate.mjs', import.meta.url));
const requiredFullGateIds = [
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
const outputMp4 = Buffer.alloc(120000, 11);
const outputMp4Sha256 = createHash('sha256').update(outputMp4).digest('hex');
const evidenceZipFiles = [
  'fresh-windows-basic-smoke.json',
  'fresh-windows-gui-session.json',
  'fresh-windows-result.json',
  'fresh-windows-gui-render.mp4',
  'fresh-windows-evidence-summary.json',
  'handoff-manifest.json',
  'SHA256SUMS.txt',
];

interface EvidencePackageReportFixture extends Record<string, unknown> {
  archive: {
    path: string;
    fileName: string;
    bytes: number;
    sha256: string;
    sha256Path: string;
  };
  summary: {
    path: string;
    bytes: number;
    sha256: string;
  };
}

describe('Electron release final gate', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
  });

  it('passes only when full verification, release acceptance, and fresh Windows evidence all pass', async () => {
    const rootDir = await makeFixtureRoot();

    const { report, reportPath } = validateElectronReleaseFinalGate({
      rootDir,
      writeReport: true,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('passed');
    expect(reportPath).toBe('.danbi/electron-release/final-release-gate-report.json');
    expect(report.fullVerificationEvidence).toMatchObject({
      status: 'passed',
      profile: 'full',
      requiredGateCount: 17,
      missingGateIds: [],
      failedGateIds: [],
    });
    expect(report.releaseAcceptanceEvidence).toMatchObject({
      status: 'passed',
      verificationStatus: 'passed',
      renderOutputCount: 4,
    });
    expect(report.freshWindowsEvidence).toMatchObject({
      status: 'passed',
      checksumStatus: 'passed',
      checksumFileCount: 14,
      basicSmokeStatus: 'passed',
      guiSessionStatus: 'passed',
      cleanupStatus: 'passed',
      outputStatus: 'passed',
      outputSha256: outputMp4Sha256,
    });
    expect(report.failures).toEqual([]);
  });

  it('runs the final gate CLI against a supplied root directory', async () => {
    const rootDir = await makeFixtureRoot();

    const result = spawnSync('node', [
      finalGateScriptPath,
      '--root-dir',
      rootDir,
      '--out',
      '.danbi/electron-release/final-gate-from-cli.json',
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
      reportPath: '.danbi/electron-release/final-gate-from-cli.json',
      fullVerificationStatus: 'passed',
      releaseAcceptanceStatus: 'passed',
      freshWindowsStatus: 'passed',
      failureCount: 0,
      failures: [],
    });
    const writtenReport = JSON.parse(await readFile(join(rootDir, '.danbi/electron-release/final-gate-from-cli.json'), 'utf8'));
    expect(writtenReport.status).toBe('passed');
  });

  it('prints final gate failures in CLI output', async () => {
    const rootDir = await makeFixtureRoot();
    await rm(join(rootDir, '.danbi/electron-release/handoff/fresh-windows-result.json'), { force: true });

    const result = spawnSync('node', [
      finalGateScriptPath,
      '--root-dir',
      rootDir,
      '--out',
      '.danbi/electron-release/final-gate-from-cli.json',
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
      reportPath: '.danbi/electron-release/final-gate-from-cli.json',
      fullVerificationStatus: 'passed',
      releaseAcceptanceStatus: 'passed',
      freshWindowsStatus: 'failed',
    });
    expect(output.failureCount).toBeGreaterThan(0);
    expect(output.failures).toEqual(expect.arrayContaining([
      'Fresh Windows manual acceptance must be passed, got failed.',
    ]));
    expect(output.failures.join('\n')).toContain('Missing fresh Windows manual result');
    expect(result.stderr).toContain('Electron release final gate failed');
  });

  it('prints final gate CLI parse failures in stdout JSON', () => {
    const result = spawnSync('node', [
      finalGateScriptPath,
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

  it('can validate a returned fresh Windows handoff directory outside the default release folder', async () => {
    const rootDir = await makeFixtureRoot({ handoffDir: 'qa-returned-handoff' });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      handoffDir: 'qa-returned-handoff',
      manualAcceptanceReport: '.danbi/electron-release/returned-fresh-windows-acceptance-report.json',
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('passed');
    expect(report.reportPaths.handoffDir).toBe('qa-returned-handoff');
    expect(report.reportPaths.manualResult).toBe('qa-returned-handoff/fresh-windows-result.json');
    expect(report.freshWindowsEvidence).toMatchObject({
      status: 'passed',
      outputSha256: outputMp4Sha256,
    });
  });

  it('can stage and validate a returned fresh Windows evidence ZIP over the local handoff', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/fresh-windows-evidence.zip');
    await rm(join(rootDir, handoffDir, 'fresh-windows-result.json'), { force: true });
    await rm(join(rootDir, handoffDir, 'fresh-windows-basic-smoke.json'), { force: true });
    await rm(join(rootDir, handoffDir, 'fresh-windows-gui-session.json'), { force: true });
    await rm(join(rootDir, handoffDir, 'fresh-windows-gui-render.mp4'), { force: true });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/fresh-windows-evidence.zip',
      evidenceZipSha256: 'returned/fresh-windows-evidence.zip.sha256',
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('passed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'passed',
      zipPath: 'returned/fresh-windows-evidence.zip',
      sha256Path: 'returned/fresh-windows-evidence.zip.sha256',
      stagingDir: '.danbi/electron-release/evidence-zip-staging',
      extractionDir: '.danbi/electron-release/evidence-zip-staging-contents',
      missingFiles: [],
      unexpectedEntries: [],
      handoffReferenceStatus: 'passed',
      summaryStatus: 'passed',
      summaryEvidenceJsonStatus: 'passed',
      summaryHandoffReferenceStatus: 'passed',
      summaryManualResultStatus: 'passed',
      summaryManualResult: {
        tester: 'QA Tester',
        checkedAt: '2026-06-16T12:00:00.000Z',
        outputMp4: {
          handoffRelativePath: 'fresh-windows-gui-render.mp4',
          bytes: outputMp4.length,
          sha256: outputMp4Sha256,
          durationSeconds: 6,
          hasVideo: true,
          hasAudio: true,
        },
      },
      summaryTimelineStatus: 'passed',
      summaryTimeline: {
        checkedAt: '2026-06-16T12:00:00.000Z',
        packagedAt: '2026-06-16T12:01:00.000Z',
      },
      summaryMetadataStatus: 'passed',
      summaryMetadata: {
        productName: 'Danbi Studio',
        version: '0.1.0',
        installer: 'Danbi Studio-0.1.0-win-x64.exe',
      },
      summaryMissingFiles: [],
      summaryUnexpectedFiles: [],
      summaryDuplicateFiles: [],
      outputMp4: {
        path: 'fresh-windows-gui-render.mp4',
        bytes: outputMp4.length,
        sha256: outputMp4Sha256,
      },
    });
    const evidencePackageEvidence = report.evidencePackageEvidence as {
      archiveDirectories: string[];
      archiveFiles: string[];
      summaryFiles: string[];
      summaryEvidenceJson: Array<{ key: string; path: string; status: string }>;
      handoffReferenceFiles: Array<{ path: string; status: string }>;
    };
    expect(evidencePackageEvidence.archiveDirectories).toEqual([]);
    expect(evidencePackageEvidence.archiveFiles).toHaveLength(evidenceZipFiles.length);
    expect(evidencePackageEvidence.archiveFiles).toEqual(expect.arrayContaining(evidenceZipFiles));
    expect(evidencePackageEvidence.summaryFiles).toEqual(evidenceZipFiles);
    expect(evidencePackageEvidence.summaryEvidenceJson).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'basicSmoke', path: 'fresh-windows-basic-smoke.json', status: 'passed' }),
      expect.objectContaining({ key: 'guiSession', path: 'fresh-windows-gui-session.json', status: 'passed' }),
      expect.objectContaining({ key: 'manualResult', path: 'fresh-windows-result.json', status: 'passed' }),
    ]));
    expect(evidencePackageEvidence.handoffReferenceFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'handoff-manifest.json', status: 'passed' }),
      expect.objectContaining({ path: 'SHA256SUMS.txt', status: 'passed' }),
    ]));
    expect(report.reportPaths.effectiveHandoffDir).toBe('.danbi/electron-release/evidence-zip-staging');
    expect(report.freshWindowsEvidence.outputSha256).toBe(outputMp4Sha256);
  });

  it('can stage a returned fresh Windows evidence ZIP when the checksum sidecar has a UTF-8 BOM', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/fresh-windows-evidence.zip');
    const zipPath = join(rootDir, 'returned/fresh-windows-evidence.zip');
    const zipHash = createHash('sha256').update(await readFile(zipPath)).digest('hex');
    await writeFixtureFile(rootDir, 'returned/fresh-windows-evidence.zip.sha256', `\uFEFF${zipHash}  fresh-windows-evidence.zip\n`);

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/fresh-windows-evidence.zip',
      evidenceZipSha256: 'returned/fresh-windows-evidence.zip.sha256',
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('passed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'passed',
      sidecarFileName: 'fresh-windows-evidence.zip',
      zipEntryInspectionStatus: 'passed',
    });
  });

  it('can stage a returned fresh Windows evidence ZIP when the checksum sidecar uses a single separator space', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/fresh-windows-evidence.zip');
    const zipPath = join(rootDir, 'returned/fresh-windows-evidence.zip');
    const zipHash = createHash('sha256').update(await readFile(zipPath)).digest('hex');
    await writeFixtureFile(rootDir, 'returned/fresh-windows-evidence.zip.sha256', `${zipHash} fresh-windows-evidence.zip\n`);

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/fresh-windows-evidence.zip',
      evidenceZipSha256: 'returned/fresh-windows-evidence.zip.sha256',
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('passed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'passed',
      sidecarFileName: 'fresh-windows-evidence.zip',
      zipEntryInspectionStatus: 'passed',
    });
  });

  it('fails by default when a returned evidence ZIP omits the package report', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/missing-report-evidence.zip');

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/missing-report-evidence.zip',
      evidenceZipSha256: 'returned/missing-report-evidence.zip.sha256',
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      summaryStatus: 'passed',
      packageReportVerification: {
        status: 'failed',
        sourcePath: 'returned/missing-report-evidence.zip.report.json',
        checks: {
          reportPresent: false,
        },
      },
    });
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence package report verification failed: reportPresent.');
  });

  it('validates the returned fresh Windows evidence package report with the ZIP summary', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/fresh-windows-evidence.zip');
    const packageReport = await writeReturnedEvidencePackageReport(rootDir, handoffDir, 'returned/fresh-windows-evidence.zip');
    const sidecarBytes = await readFile(join(rootDir, 'returned/fresh-windows-evidence.zip.sha256'));
    const packageReportBytes = await readFile(join(rootDir, 'returned/fresh-windows-evidence.zip.report.json'));
    await rm(join(rootDir, handoffDir, 'fresh-windows-result.json'), { force: true });
    await rm(join(rootDir, handoffDir, 'fresh-windows-basic-smoke.json'), { force: true });
    await rm(join(rootDir, handoffDir, 'fresh-windows-gui-session.json'), { force: true });
    await rm(join(rootDir, handoffDir, 'fresh-windows-gui-render.mp4'), { force: true });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/fresh-windows-evidence.zip',
      evidenceZipSha256: 'returned/fresh-windows-evidence.zip.sha256',
      evidenceReport: 'returned/fresh-windows-evidence.zip.report.json',
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('passed');
    expect(report.reportPaths.evidenceReport).toBe('returned/fresh-windows-evidence.zip.report.json');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'passed',
      packageReportVerification: {
        status: 'passed',
        sourcePath: 'returned/fresh-windows-evidence.zip.report.json',
        kind: 'danbi.electron.fresh-windows-evidence-package-report',
        archiveBytes: packageReport.archive.bytes,
        archiveSha256: packageReport.archive.sha256,
        summaryBytes: packageReport.summary.bytes,
        summarySha256: packageReport.summary.sha256,
        checks: {
          reportPresent: true,
          kindValid: true,
          statusPassed: true,
          archiveBytesMatchSource: true,
          archiveSha256MatchSource: true,
          archiveFileNameMatchesSidecar: true,
          summaryFingerprintMatchesArchive: true,
          zipEntryInspectionMatchesArchive: true,
        },
      },
      sidecarBytes: sidecarBytes.length,
      sidecarFileSha256: createHash('sha256').update(sidecarBytes).digest('hex'),
      packageReportBytes: packageReportBytes.length,
      packageReportSha256: createHash('sha256').update(packageReportBytes).digest('hex'),
    });
  });

  it('fails when the evidence package report summary fingerprint is wrong', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/bad-report-evidence.zip');
    await writeReturnedEvidencePackageReport(rootDir, handoffDir, 'returned/bad-report-evidence.zip', {
      summarySha256: '0'.repeat(64),
    });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/bad-report-evidence.zip',
      evidenceZipSha256: 'returned/bad-report-evidence.zip.sha256',
      evidenceReport: 'returned/bad-report-evidence.zip.report.json',
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      summaryStatus: 'passed',
      packageReportVerification: {
        status: 'failed',
        checks: {
          summaryFingerprintMatchesArchive: false,
        },
      },
    });
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence package report verification failed: summaryFingerprintMatchesArchive.');
  });

  it('fails when the evidence package report ZIP entry inspection is wrong', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/bad-report-entry-inspection-evidence.zip');
    await writeReturnedEvidencePackageReport(rootDir, handoffDir, 'returned/bad-report-entry-inspection-evidence.zip', {
      zipEntryInspection: {
        ...buildExpectedZipEntryInspection(),
        directories: ['tools'],
      },
    });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/bad-report-entry-inspection-evidence.zip',
      evidenceZipSha256: 'returned/bad-report-entry-inspection-evidence.zip.sha256',
      evidenceReport: 'returned/bad-report-entry-inspection-evidence.zip.report.json',
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      summaryStatus: 'passed',
      packageReportVerification: {
        status: 'failed',
        checks: {
          zipEntryInspectionMatchesArchive: false,
        },
      },
    });
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence package report verification failed: zipEntryInspectionMatchesArchive.');
  });

  it('fails when the returned evidence ZIP summary does not match the packaged MP4', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/bad-summary-evidence.zip', {
      summaryOutputSha256: '0'.repeat(64),
    });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/bad-summary-evidence.zip',
      evidenceZipSha256: 'returned/bad-summary-evidence.zip.sha256',
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      summaryStatus: 'failed',
    });
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence summary output MP4 SHA-256 must match fresh-windows-gui-render.mp4');
  });

  it('fails when the returned evidence ZIP summary metadata does not match release acceptance', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/wrong-metadata-evidence.zip', {
      summaryProductName: 'Different Studio',
    });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/wrong-metadata-evidence.zip',
      evidenceZipSha256: 'returned/wrong-metadata-evidence.zip.sha256',
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      summaryStatus: 'failed',
      summaryMetadataStatus: 'failed',
    });
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence summary productName must match release acceptance ("Danbi Studio"), got "Different Studio".');
  });

  it('fails when the returned evidence ZIP summary file list does not match the package contents contract', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/bad-file-list-evidence.zip', {
      summaryFiles: evidenceZipFiles.filter((file) => file !== 'SHA256SUMS.txt'),
    });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/bad-file-list-evidence.zip',
      evidenceZipSha256: 'returned/bad-file-list-evidence.zip.sha256',
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      summaryStatus: 'failed',
      summaryMissingFiles: ['SHA256SUMS.txt'],
    });
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence summary files must match required ZIP file list (missing: SHA256SUMS.txt).');
  });

  it('fails when the returned evidence ZIP summary file list uses non-canonical relative paths', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/non-canonical-file-list-evidence.zip', {
      summaryFiles: [
        ...evidenceZipFiles.filter((file) => file !== 'SHA256SUMS.txt'),
        './SHA256SUMS.txt',
      ],
    });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/non-canonical-file-list-evidence.zip',
      evidenceZipSha256: 'returned/non-canonical-file-list-evidence.zip.sha256',
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      summaryStatus: 'failed',
      summaryMissingFiles: ['SHA256SUMS.txt'],
      summaryUnexpectedFiles: ['./SHA256SUMS.txt'],
    });
    expect(report.failures.join('\n')).toContain(
      'Fresh Windows evidence summary files must be safe relative paths: "./SHA256SUMS.txt"',
    );
  });

  it('fails when the returned evidence ZIP summary manual result fingerprint is wrong', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/bad-json-summary-evidence.zip', {
      summaryManualResultSha256: '0'.repeat(64),
    });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/bad-json-summary-evidence.zip',
      evidenceZipSha256: 'returned/bad-json-summary-evidence.zip.sha256',
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      summaryStatus: 'failed',
      summaryEvidenceJsonStatus: 'failed',
    });
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence summary evidenceJson.manualResult.sha256 must match fresh-windows-result.json.');
  });

  it('fails when the returned evidence ZIP summary disagrees with the manual result body', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/manual-result-mismatch-summary-evidence.zip', {
      summaryTester: 'Another QA',
      summaryOutputDurationSeconds: 7,
    });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/manual-result-mismatch-summary-evidence.zip',
      evidenceZipSha256: 'returned/manual-result-mismatch-summary-evidence.zip.sha256',
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      summaryStatus: 'failed',
      summaryManualResultStatus: 'failed',
    });
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence summary tester must match fresh-windows-result.json tester ("QA Tester"), got "Another QA".');
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence summary outputMp4.durationSeconds must match fresh-windows-result.json output durationSeconds.');
  });

  it('fails when the returned evidence ZIP summary packagedAt is invalid or before checkedAt', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/bad-packaged-at-evidence.zip', {
      summaryPackagedAt: '2026-06-16T11:59:59.000Z',
    });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/bad-packaged-at-evidence.zip',
      evidenceZipSha256: 'returned/bad-packaged-at-evidence.zip.sha256',
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      summaryStatus: 'failed',
      summaryTimelineStatus: 'failed',
    });
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence summary packagedAt must not be before checkedAt.');
  });

  it('fails when the returned evidence ZIP summary handoff reference fingerprint is wrong', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/bad-reference-summary-evidence.zip', {
      summaryManifestSha256: '0'.repeat(64),
    });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/bad-reference-summary-evidence.zip',
      evidenceZipSha256: 'returned/bad-reference-summary-evidence.zip.sha256',
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      handoffReferenceStatus: 'passed',
      summaryHandoffReferenceStatus: 'failed',
    });
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence summary handoffReferences.manifest.sha256 must match handoff-manifest.json.');
  });

  it('fails when the returned evidence ZIP contains an unexpected file', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/unexpected-evidence.zip', {
      extraArchiveFiles: {
        'tools/extra-script.ps1': 'Write-Output "not part of the signed handoff"\n',
      },
    });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/unexpected-evidence.zip',
      evidenceZipSha256: 'returned/unexpected-evidence.zip.sha256',
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      unexpectedEntries: ['tools/extra-script.ps1'],
    });
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence ZIP contains unexpected entry: tools/extra-script.ps1');
    await expect(stat(join(rootDir, '.danbi/electron-release/evidence-zip-staging-contents'))).rejects.toThrow();
  });

  it('fails before extracting when the returned evidence ZIP contains unsafe entry paths', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    const relativeZipPath = 'returned/unsafe-evidence.zip';
    const zipPath = join(rootDir, relativeZipPath);
    await writeReturnedEvidenceZip(rootDir, handoffDir, relativeZipPath);
    await appendZipEntry(zipPath, '../escape.txt');
    const zipHash = createHash('sha256').update(await readFile(zipPath)).digest('hex');
    await writeFixtureFile(rootDir, `${relativeZipPath}.sha256`, `${zipHash}  ${basename(relativeZipPath)}\n`);

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: relativeZipPath,
      evidenceZipSha256: `${relativeZipPath}.sha256`,
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      zipEntryInspectionStatus: 'passed',
      missingFiles: [],
      unsafeEntries: ['../escape.txt'],
    });
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence ZIP contains unsafe entries: ../escape.txt');
    await expect(stat(join(rootDir, '.danbi/electron-release/evidence-zip-staging-contents'))).rejects.toThrow();
  });

  it('fails before extracting when the returned evidence ZIP checksum sidecar names an unsafe file', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    const relativeZipPath = 'returned/unsafe-sidecar-evidence.zip';
    const zipPath = join(rootDir, relativeZipPath);
    await writeReturnedEvidenceZip(rootDir, handoffDir, relativeZipPath);
    const zipHash = createHash('sha256').update(await readFile(zipPath)).digest('hex');
    await writeFixtureFile(rootDir, `${relativeZipPath}.sha256`, `${zipHash}  ../${basename(relativeZipPath)}\n`);

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: relativeZipPath,
      evidenceZipSha256: `${relativeZipPath}.sha256`,
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      sidecarFileName: null,
      zipEntryInspectionStatus: 'not-run',
    });
    expect(report.failures.join('\n')).toContain(
      'Fresh Windows evidence ZIP checksum sidecar must reference a safe .zip filename, got ../unsafe-sidecar-evidence.zip.',
    );
    await expect(stat(join(rootDir, '.danbi/electron-release/evidence-zip-staging-contents'))).rejects.toThrow();
  });

  it('fails before extracting when the returned evidence ZIP checksum sidecar has multiple entries', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    const relativeZipPath = 'returned/multi-entry-sidecar-evidence.zip';
    const zipPath = join(rootDir, relativeZipPath);
    await writeReturnedEvidenceZip(rootDir, handoffDir, relativeZipPath);
    const zipHash = createHash('sha256').update(await readFile(zipPath)).digest('hex');
    await writeFixtureFile(
      rootDir,
      `${relativeZipPath}.sha256`,
      `${zipHash}  ${basename(relativeZipPath)}\n${'0'.repeat(64)}  stale-evidence.zip\n`,
    );

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: relativeZipPath,
      evidenceZipSha256: `${relativeZipPath}.sha256`,
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      sidecarFileName: null,
      zipEntryInspectionStatus: 'not-run',
    });
    expect(report.failures.join('\n')).toContain('Invalid fresh Windows evidence ZIP checksum sidecar');
    await expect(stat(join(rootDir, '.danbi/electron-release/evidence-zip-staging-contents'))).rejects.toThrow();
  });

  it('fails before extracting when the returned evidence ZIP checksum sidecar names a Windows stream filename', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    const relativeZipPath = 'returned/unsafe-sidecar-stream-evidence.zip';
    const zipPath = join(rootDir, relativeZipPath);
    await writeReturnedEvidenceZip(rootDir, handoffDir, relativeZipPath);
    const zipHash = createHash('sha256').update(await readFile(zipPath)).digest('hex');
    await writeFixtureFile(rootDir, `${relativeZipPath}.sha256`, `${zipHash}  fresh:windows-evidence.zip\n`);

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: relativeZipPath,
      evidenceZipSha256: `${relativeZipPath}.sha256`,
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      sidecarFileName: null,
      zipEntryInspectionStatus: 'not-run',
    });
    expect(report.failures.join('\n')).toContain(
      'Fresh Windows evidence ZIP checksum sidecar must reference a safe .zip filename, got fresh:windows-evidence.zip.',
    );
    await expect(stat(join(rootDir, '.danbi/electron-release/evidence-zip-staging-contents'))).rejects.toThrow();
  });

  it('fails before extracting when the returned evidence ZIP checksum sidecar names a Windows reserved device file', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    const relativeZipPath = 'returned/unsafe-sidecar-device-evidence.zip';
    const zipPath = join(rootDir, relativeZipPath);
    await writeReturnedEvidenceZip(rootDir, handoffDir, relativeZipPath);
    const zipHash = createHash('sha256').update(await readFile(zipPath)).digest('hex');
    await writeFixtureFile(rootDir, `${relativeZipPath}.sha256`, `${zipHash}  NUL.zip\n`);

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: relativeZipPath,
      evidenceZipSha256: `${relativeZipPath}.sha256`,
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      sidecarFileName: null,
      zipEntryInspectionStatus: 'not-run',
    });
    expect(report.failures.join('\n')).toContain(
      'Fresh Windows evidence ZIP checksum sidecar must reference a safe .zip filename, got NUL.zip.',
    );
    await expect(stat(join(rootDir, '.danbi/electron-release/evidence-zip-staging-contents'))).rejects.toThrow();
  });

  it('fails before extracting when the returned evidence ZIP contains duplicate entries', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    const relativeZipPath = 'returned/duplicate-evidence.zip';
    const zipPath = join(rootDir, relativeZipPath);
    await writeReturnedEvidenceZip(rootDir, handoffDir, relativeZipPath);
    await appendZipEntry(zipPath, 'fresh-windows-result.json');
    const zipHash = createHash('sha256').update(await readFile(zipPath)).digest('hex');
    await writeFixtureFile(rootDir, `${relativeZipPath}.sha256`, `${zipHash}  ${basename(relativeZipPath)}\n`);

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: relativeZipPath,
      evidenceZipSha256: `${relativeZipPath}.sha256`,
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      zipEntryInspectionStatus: 'passed',
      missingFiles: [],
      unsafeEntries: [],
      duplicateEntries: ['fresh-windows-result.json'],
    });
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence ZIP contains duplicate entries: fresh-windows-result.json');
    await expect(stat(join(rootDir, '.danbi/electron-release/evidence-zip-staging-contents'))).rejects.toThrow();
  });

  it('fails when the returned evidence ZIP changes the local handoff manifest reference', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/changed-manifest-evidence.zip', {
      archiveFileOverrides: {
        'handoff-manifest.json': JSON.stringify({
          kind: 'danbi.electron.release-handoff',
          status: 'passed',
          productName: 'Danbi Studio',
          version: '0.1.0',
          files: [],
          handoffFiles: [],
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
        }),
      },
    });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/changed-manifest-evidence.zip',
      evidenceZipSha256: 'returned/changed-manifest-evidence.zip.sha256',
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      handoffReferenceStatus: 'failed',
      handoffReferenceFiles: expect.arrayContaining([
        expect.objectContaining({ path: 'handoff-manifest.json', status: 'failed' }),
      ]),
    });
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence ZIP handoff reference file must match local handoff: handoff-manifest.json.');
  });

  it('fails when the returned evidence ZIP changes the local handoff checksum reference', async () => {
    const handoffDir = '.danbi/electron-release/handoff';
    const rootDir = await makeFixtureRoot({ handoffDir });
    await writeReturnedEvidenceZip(rootDir, handoffDir, 'returned/changed-checksum-evidence.zip', {
      archiveFileOverrides: {
        'SHA256SUMS.txt': `${'0'.repeat(64)}  handoff-manifest.json\n`,
      },
    });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      evidenceZip: 'returned/changed-checksum-evidence.zip',
      evidenceZipSha256: 'returned/changed-checksum-evidence.zip.sha256',
      allowMissingEvidenceReport: true,
      writeReport: false,
      writeManualAcceptanceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.evidencePackageEvidence).toMatchObject({
      status: 'failed',
      handoffReferenceStatus: 'failed',
      handoffReferenceFiles: expect.arrayContaining([
        expect.objectContaining({ path: 'SHA256SUMS.txt', status: 'failed' }),
      ]),
    });
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence ZIP handoff reference file must match local handoff: SHA256SUMS.txt.');
  });

  it('fails when fresh Windows evidence is missing even if release reports passed', async () => {
    const rootDir = await makeFixtureRoot({ omitFreshWindowsEvidence: true });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      writeReport: false,
      writeManualAcceptanceReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.fullVerificationEvidence.status).toBe('passed');
    expect(report.releaseAcceptanceEvidence.status).toBe('passed');
    expect(report.freshWindowsEvidence.status).toBe('failed');
    expect(report.failures.join('\n')).toContain('Fresh Windows manual acceptance must be passed');
    expect(report.failures.join('\n')).toContain('Missing fresh Windows manual result');
  });

  it('fails when the full release verification report is incomplete', async () => {
    const rootDir = await makeFixtureRoot({
      fullVerificationPatch: {
        dryRun: true,
        results: requiredFullGateIds.slice(0, -1).map((id) => ({ id, status: 'passed' })),
      },
    });

    const { report } = validateElectronReleaseFinalGate({
      rootDir,
      writeReport: false,
      writeManualAcceptanceReport: false,
    });

    expect(report.status).toBe('failed');
    expect(report.fullVerificationEvidence.missingGateIds).toContain('electron-install-smoke');
    expect(report.failures.join('\n')).toContain('must not be a dry run');
  });
});

async function makeFixtureRoot(options: {
  omitFreshWindowsEvidence?: boolean;
  fullVerificationPatch?: Record<string, unknown>;
  handoffDir?: string;
} = {}): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'danbi-electron-final-gate-'));
  tempRoots.push(rootDir);
  const handoffDir = options.handoffDir ?? '.danbi/electron-release/handoff';

  const fullVerification = {
    kind: 'danbi.electron.release-verification',
    status: 'passed',
    profile: 'full',
    production: false,
    dryRun: false,
    passedCount: requiredFullGateIds.length,
    failedCount: 0,
    skippedCount: 0,
    results: requiredFullGateIds.map((id) => ({ id, status: 'passed' })),
    ...options.fullVerificationPatch,
  };
  await writeFixtureFile(rootDir, '.danbi/electron-release/release-verification-full.json', JSON.stringify(fullVerification));

  await writeFixtureFile(rootDir, '.danbi/electron-release/release-acceptance.json', JSON.stringify({
    kind: 'danbi.electron.release-acceptance',
    status: 'passed',
    productName: 'Danbi Studio',
    version: '0.1.0',
    expectedInstallerName: 'Danbi Studio-0.1.0-win-x64.exe',
    evidence: {
      verification: {
        status: 'passed',
        profile: 'full',
        passedCount: requiredFullGateIds.length,
      },
      renderOutputs: [
        { path: '.danbi/electron-package-smoke/sample-render/getting-started.mp4' },
        { path: '.danbi/electron-gui-smoke/renders/getting-started-ui-render.mp4' },
        { path: '.danbi/electron-offline-smoke/renders/getting-started-offline-render.mp4' },
        { path: '.danbi/electron-install-smoke/renders/getting-started-installed-render.mp4' },
      ],
    },
    failures: [],
  }));

  await writeFreshWindowsFixture(rootDir, handoffDir);
  if (options.omitFreshWindowsEvidence) {
    await rm(join(rootDir, handoffDir, 'fresh-windows-result.json'), { force: true });
    await rm(join(rootDir, handoffDir, 'fresh-windows-basic-smoke.json'), { force: true });
    await rm(join(rootDir, handoffDir, 'fresh-windows-gui-session.json'), { force: true });
  }

  return rootDir;
}

async function writeFreshWindowsFixture(rootDir: string, handoffDir: string): Promise<void> {
  const releaseFiles = [
    { role: 'installer', target: 'Danbi Studio-0.1.0-win-x64.exe', content: 'installer' },
    { role: 'installer-blockmap', target: 'Danbi Studio-0.1.0-win-x64.exe.blockmap', content: 'blockmap' },
    { role: 'release-acceptance', target: 'reports/release-acceptance.json', content: '{"status":"passed"}' },
  ].map(withHash);
  const handoffFiles = [
    { role: 'handoff-verify-script', target: 'verify-release-artifacts.ps1', content: 'Write-Output "verified"\n' },
    { role: 'fresh-windows-basic-smoke-script', target: 'run-installed-basic-smoke.ps1', content: 'Write-Output "basic"\n' },
    { role: 'fresh-windows-gui-launcher-script', target: 'launch-gui-acceptance.ps1', content: 'Write-Output "gui"\n' },
    { role: 'fresh-windows-result-recorder-script', target: 'record-fresh-windows-result.ps1', content: 'Write-Output "record"\n' },
    { role: 'fresh-windows-result-verifier-script', target: 'verify-fresh-windows-result.ps1', content: 'Write-Output "fresh verified"\n' },
    { role: 'fresh-windows-evidence-packager-script', target: 'package-fresh-windows-evidence.ps1', content: 'Write-Output "package evidence"\n' },
    { role: 'fresh-windows-acceptance-runner-script', target: 'run-fresh-windows-acceptance.ps1', content: 'Write-Output "runner"\n' },
    { role: 'fresh-windows-handoff-packager-script', target: 'package-handoff-for-qa.ps1', content: 'Write-Output "handoff package"\n' },
    { role: 'fresh-windows-checklist', target: 'FRESH_WINDOWS_ACCEPTANCE_KR.md', content: '# checklist\n' },
    { role: 'fresh-windows-result-template', target: 'fresh-windows-result-template.json', content: '{}\n' },
  ].map(withHash);
  const handoffManifest = {
    kind: 'danbi.electron.release-handoff',
    status: 'passed',
    productName: 'Danbi Studio',
    version: '0.1.0',
    files: releaseFiles.map(withoutContent),
    handoffFiles: handoffFiles.map(withoutContent),
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
  };
  const manifestText = JSON.stringify(handoffManifest);
  const checksumFiles = [
    ...releaseFiles,
    ...handoffFiles,
    withHash({ role: 'release-handoff-manifest', target: 'handoff-manifest.json', content: manifestText }),
  ];

  await writeFixtureFile(rootDir, join(handoffDir, 'handoff-manifest.json'), manifestText);
  for (const file of [...releaseFiles, ...handoffFiles]) {
    await writeFixtureFile(rootDir, join(handoffDir, file.target), file.content);
  }
  await writeFixtureFile(
    rootDir,
    join(handoffDir, 'SHA256SUMS.txt'),
    checksumFiles.map((file) => `${file.sha256}  ${file.target}`).join('\n') + '\n',
  );
  await writeFixtureBuffer(rootDir, join(handoffDir, 'fresh-windows-gui-render.mp4'), outputMp4);
  await writeFixtureFile(rootDir, join(handoffDir, 'fresh-windows-result.json'), `\uFEFF${JSON.stringify(manualResult())}`);
  await writeFixtureFile(rootDir, join(handoffDir, 'fresh-windows-basic-smoke.json'), `\uFEFF${JSON.stringify(basicSmokeResult())}`);
  await writeFixtureFile(rootDir, join(handoffDir, 'fresh-windows-gui-session.json'), `\uFEFF${JSON.stringify(guiSessionResult())}`);
}

async function writeReturnedEvidenceZip(
  rootDir: string,
  handoffDir: string,
  relativeZipPath: string,
  options: {
    summaryOutputSha256?: string;
    summaryTester?: string;
    summaryCheckedAt?: string;
    summaryPackagedAt?: string;
    summaryOutputDurationSeconds?: number;
    summaryOutputHasVideo?: boolean;
    summaryOutputHasAudio?: boolean;
    summaryProductName?: string;
    summaryVersion?: string;
    summaryInstaller?: string;
    summaryFiles?: string[];
    summaryBasicSmokeSha256?: string;
    summaryGuiSessionSha256?: string;
    summaryManualResultSha256?: string;
    summaryManifestSha256?: string;
    summaryChecksumsSha256?: string;
    archiveFileOverrides?: Record<string, string | Buffer>;
    extraArchiveFiles?: Record<string, string | Buffer>;
  } = {},
): Promise<void> {
  const evidenceJson = await buildSummaryEvidenceJson(rootDir, handoffDir, {
    basicSmokeSha256: options.summaryBasicSmokeSha256,
    guiSessionSha256: options.summaryGuiSessionSha256,
    manualResultSha256: options.summaryManualResultSha256,
  });
  const handoffReferences = await buildSummaryHandoffReferences(rootDir, handoffDir, {
    manifestSha256: options.summaryManifestSha256,
    checksumsSha256: options.summaryChecksumsSha256,
  });
  await writeFixtureFile(rootDir, join(handoffDir, 'fresh-windows-evidence-summary.json'), `\uFEFF${JSON.stringify({
    kind: 'danbi.electron.fresh-windows-evidence-package-summary',
    productName: options.summaryProductName ?? 'Danbi Studio',
    version: options.summaryVersion ?? '0.1.0',
    installer: options.summaryInstaller ?? 'Danbi Studio-0.1.0-win-x64.exe',
    tester: options.summaryTester ?? 'QA Tester',
    checkedAt: options.summaryCheckedAt ?? '2026-06-16T12:00:00.000Z',
    packagedAt: options.summaryPackagedAt ?? '2026-06-16T12:01:00.000Z',
    outputMp4: {
      path: 'fresh-windows-gui-render.mp4',
      bytes: outputMp4.length,
      sha256: options.summaryOutputSha256 ?? outputMp4Sha256,
      durationSeconds: options.summaryOutputDurationSeconds ?? 6,
      hasVideo: options.summaryOutputHasVideo ?? true,
      hasAudio: options.summaryOutputHasAudio ?? true,
    },
    evidenceJson,
    handoffReferences,
    files: options.summaryFiles ?? evidenceZipFiles,
  })}`);
  const zipPath = join(rootDir, relativeZipPath);
  await mkdir(dirname(zipPath), { recursive: true });
  const sourceDir = join(rootDir, 'returned', 'fresh-windows-evidence-source');
  await rm(sourceDir, { recursive: true, force: true });
  await mkdir(sourceDir, { recursive: true });
  for (const file of evidenceZipFiles) {
    await copyFile(join(rootDir, handoffDir, file), join(sourceDir, file));
  }
  for (const [file, content] of Object.entries(options.archiveFileOverrides ?? {})) {
    const filePath = join(sourceDir, file);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }
  for (const [file, content] of Object.entries(options.extraArchiveFiles ?? {})) {
    const filePath = join(sourceDir, file);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }
  const result = spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    'Compress-Archive -Path (Join-Path $env:DANBI_TEST_EVIDENCE_SOURCE "*") -DestinationPath $env:DANBI_TEST_EVIDENCE_ZIP -Force',
  ], {
    cwd: rootDir,
    env: {
      ...process.env,
      DANBI_TEST_EVIDENCE_SOURCE: sourceDir,
      DANBI_TEST_EVIDENCE_ZIP: zipPath,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? result.stderr);
  }
  const zipHash = createHash('sha256').update(await readFile(zipPath)).digest('hex');
  await writeFixtureFile(rootDir, `${relativeZipPath}.sha256`, `${zipHash}  ${basename(relativeZipPath)}\n`);
}

async function appendZipEntry(zipPath: string, entryName: string): Promise<void> {
  const result = spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    [
      'Add-Type -AssemblyName System.IO.Compression',
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      '$archive = [System.IO.Compression.ZipFile]::Open($env:DANBI_TEST_APPEND_EVIDENCE_ZIP, [System.IO.Compression.ZipArchiveMode]::Update)',
      'try {',
      '  $entry = $archive.CreateEntry($env:DANBI_TEST_APPEND_EVIDENCE_ENTRY)',
      '  $writer = [System.IO.StreamWriter]::new($entry.Open())',
      '  try {',
      '    $writer.Write("appended")',
      '  } finally {',
      '    $writer.Dispose()',
      '  }',
      '} finally {',
      '  $archive.Dispose()',
      '}',
    ].join('; '),
  ], {
    env: {
      ...process.env,
      DANBI_TEST_APPEND_EVIDENCE_ZIP: zipPath,
      DANBI_TEST_APPEND_EVIDENCE_ENTRY: entryName,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? result.stderr);
  }
}

async function writeReturnedEvidencePackageReport(
  rootDir: string,
  handoffDir: string,
  relativeZipPath: string,
  options: {
    archiveSha256?: string;
    summarySha256?: string;
    zipEntryInspection?: Record<string, unknown>;
  } = {},
): Promise<EvidencePackageReportFixture> {
  const zipPath = join(rootDir, relativeZipPath);
  const zipBytes = await readFile(zipPath);
  const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
  const summaryBytes = await readFile(join(rootDir, handoffDir, 'fresh-windows-evidence-summary.json'));
  const summarySha256 = createHash('sha256').update(summaryBytes).digest('hex');
  const report: EvidencePackageReportFixture = {
    kind: 'danbi.electron.fresh-windows-evidence-package-report',
    generatedAt: '2026-06-16T12:02:00.000Z',
    status: 'passed',
    productName: 'Danbi Studio',
    version: '0.1.0',
    tester: 'QA Tester',
    checkedAt: '2026-06-16T12:00:00.000Z',
    archive: {
      path: relativeZipPath,
      fileName: basename(relativeZipPath),
      bytes: zipBytes.length,
      sha256: options.archiveSha256 ?? zipSha256,
      sha256Path: `${relativeZipPath}.sha256`,
    },
    summary: {
      path: 'fresh-windows-evidence-summary.json',
      bytes: summaryBytes.length,
      sha256: options.summarySha256 ?? summarySha256,
    },
    evidenceJson: await buildSummaryEvidenceJson(rootDir, handoffDir),
    outputMp4: {
      path: 'fresh-windows-gui-render.mp4',
      bytes: outputMp4.length,
      sha256: outputMp4Sha256,
    },
    handoffReferences: await buildSummaryHandoffReferences(rootDir, handoffDir),
    files: evidenceZipFiles,
    zipEntryInspection: options.zipEntryInspection ?? buildExpectedZipEntryInspection(),
  };
  await writeFixtureFile(rootDir, `${relativeZipPath}.report.json`, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function buildExpectedZipEntryInspection(): Record<string, unknown> {
  const files = [...evidenceZipFiles].sort();
  return {
    status: 'passed',
    entries: files,
    files,
    directories: [],
    unsafeEntries: [],
    duplicateEntries: [],
    unexpectedEntries: [],
    missingFiles: [],
  };
}

async function buildSummaryEvidenceJson(
  rootDir: string,
  handoffDir: string,
  overrides: { basicSmokeSha256?: string; guiSessionSha256?: string; manualResultSha256?: string } = {},
): Promise<Record<string, unknown>> {
  const basicSmokeBytes = await readFile(join(rootDir, handoffDir, 'fresh-windows-basic-smoke.json'));
  const guiSessionBytes = await readFile(join(rootDir, handoffDir, 'fresh-windows-gui-session.json'));
  const manualResultBytes = await readFile(join(rootDir, handoffDir, 'fresh-windows-result.json'));
  return {
    basicSmoke: {
      path: 'fresh-windows-basic-smoke.json',
      bytes: basicSmokeBytes.length,
      sha256: overrides.basicSmokeSha256 ?? createHash('sha256').update(basicSmokeBytes).digest('hex'),
    },
    guiSession: {
      path: 'fresh-windows-gui-session.json',
      bytes: guiSessionBytes.length,
      sha256: overrides.guiSessionSha256 ?? createHash('sha256').update(guiSessionBytes).digest('hex'),
    },
    manualResult: {
      path: 'fresh-windows-result.json',
      bytes: manualResultBytes.length,
      sha256: overrides.manualResultSha256 ?? createHash('sha256').update(manualResultBytes).digest('hex'),
    },
  };
}

async function buildSummaryHandoffReferences(
  rootDir: string,
  handoffDir: string,
  overrides: { manifestSha256?: string; checksumsSha256?: string } = {},
): Promise<Record<string, unknown>> {
  const manifestBytes = await readFile(join(rootDir, handoffDir, 'handoff-manifest.json'));
  const checksumsBytes = await readFile(join(rootDir, handoffDir, 'SHA256SUMS.txt'));
  return {
    manifest: {
      path: 'handoff-manifest.json',
      bytes: manifestBytes.length,
      sha256: overrides.manifestSha256 ?? createHash('sha256').update(manifestBytes).digest('hex'),
    },
    checksums: {
      path: 'SHA256SUMS.txt',
      bytes: checksumsBytes.length,
      sha256: overrides.checksumsSha256 ?? createHash('sha256').update(checksumsBytes).digest('hex'),
    },
  };
}

function manualResult(): Record<string, unknown> {
  return {
    kind: 'danbi.electron.fresh-windows-manual-acceptance',
    productName: 'Danbi Studio',
    version: '0.1.0',
    installer: 'Danbi Studio-0.1.0-win-x64.exe',
    tester: 'QA Tester',
    machine: { windowsVersion: 'Windows 11', cpu: 'Ryzen 9', gpu: 'RTX', ramGb: '64' },
    checkedAt: '2026-06-16T12:00:00.000Z',
    artifactVerification: { verifyReleaseArtifactsPs1Passed: true, notes: '' },
    basicSmoke: { resultPath: 'fresh-windows-basic-smoke.json', status: 'passed', checkedAt: '2026-06-16T11:55:00.000Z' },
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
    install: { freshWindowsProfile: true, installerCompleted: true, appLaunched: true, notes: '' },
    sampleWorkflow: {
      openedPackagedSample: true,
      programMonitorRendered: true,
      exportPlanReady: true,
      guiRenderCompleted: true,
      outputMp4Opened: true,
      noExternalNetworkRequired: true,
      outputMp4: {
        path: 'C:\\Users\\qa\\Videos\\getting-started-render.mp4',
        bytes: outputMp4.length,
        sha256: outputMp4Sha256,
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
  };
}

function basicSmokeResult(): Record<string, unknown> {
  return {
    kind: 'danbi.electron.fresh-windows-basic-smoke',
    productName: 'Danbi Studio',
    version: '0.1.0',
    installer: 'Danbi Studio-0.1.0-win-x64.exe',
    status: 'passed',
    checkedAt: '2026-06-16T11:55:00.000Z',
    machine: { windowsVersion: 'Windows 11', cpu: 'Ryzen 9', gpu: 'RTX', ramGb: '64' },
    paths: {
      installRoot: 'C:\\Users\\qa\\AppData\\Local\\Temp\\DanbiStudioBasicSmoke',
      installDir: 'C:\\Users\\qa\\AppData\\Local\\Temp\\DanbiStudioBasicSmoke\\app',
      userDataDir: 'C:\\Users\\qa\\AppData\\Local\\Temp\\DanbiStudioBasicSmoke\\user-data',
      rawSmokeResultPath: 'C:\\handoff\\fresh-windows-basic-smoke.raw.json',
    },
    shortcuts: { remainingNew: [] },
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
    smokeResult: {
      rendererUrl: 'http://127.0.0.1:35123/editor',
      userDataPath: 'C:\\Users\\qa\\AppData\\Local\\Temp\\DanbiStudioBasicSmoke\\user-data',
      diagnostics: {
        ffmpeg: { ready: true, ffmpegPath: 'C:\\ffmpeg\\ffmpeg.exe', ffprobePath: 'C:\\ffmpeg\\ffprobe.exe' },
        samples: { available: true, gettingStartedPackagePath: 'C:\\Program Files\\Danbi Studio\\resources\\samples\\getting-started' },
      },
    },
  };
}

function guiSessionResult(): Record<string, unknown> {
  return {
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
  };
}

function withHash<T extends { content: string }>(file: T): T & { bytes: number; sha256: string } {
  return {
    ...file,
    bytes: Buffer.byteLength(file.content),
    sha256: createHash('sha256').update(file.content).digest('hex'),
  };
}

function withoutContent<T extends { content: string }>(file: T): Omit<T, 'content'> {
  const { content, ...rest } = file;
  return rest;
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
