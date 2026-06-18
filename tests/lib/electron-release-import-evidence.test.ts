import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  importFreshWindowsEvidencePackage,
} from '../../scripts/electron-release-import-evidence.mjs';

const tempRoots: string[] = [];
const importEvidenceScriptPath = fileURLToPath(new URL('../../scripts/electron-release-import-evidence.mjs', import.meta.url));
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
  summary: {
    path: string;
    bytes: number;
    sha256: string;
  };
}

describe('Fresh Windows evidence import', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
  });

  it('copies a legacy returned external evidence ZIP without a package report only when explicitly allowed', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const rootArg = rootDir.replace(/\\/g, '/');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'downloaded-evidence.zip');
    await writeSimpleEvidenceZip(sourceZipPath);
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);

    const { report, reportPath } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      allowMissingEvidenceReport: true,
      writeReport: true,
    });

    expect(report.status).toBe('passed');
    expect(report.importStatus).toBe('passed');
    expect(reportPath).toBe('.danbi/electron-release/returned/evidence-import-report.json');
    expect(report.source).toMatchObject({
      zipPath: sourceZipPath.replace(/\\/g, '/'),
      sidecarFileName: 'fresh-windows-evidence.zip',
      bytes: zipBytes.length,
      sha256: zipSha256,
    });
    expect(report.imported).toMatchObject({
      zipPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
      sha256Path: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
      reportPath: null,
      bytes: zipBytes.length,
      sha256: zipSha256,
    });
    expect(report.archiveVerification).toMatchObject({
      status: 'passed',
      archiveDirectories: [],
      missingFiles: [],
      unexpectedEntries: [],
    });
    expect(report.archiveVerification.archiveFiles).toEqual(expect.arrayContaining(evidenceZipFiles));
    expect(report.packageReportVerification).toMatchObject({
      status: 'not-provided',
      sourcePath: null,
    });
    expect(report.copyVerification).toMatchObject({
      status: 'passed',
      sourceBytes: zipBytes.length,
      importedBytes: zipBytes.length,
      sourceSha256: zipSha256,
      importedSha256: zipSha256,
      sidecarText: `${zipSha256}  fresh-windows-evidence.zip\n`,
      checks: {
        importedZipPresent: true,
        importedBytesMatchSource: true,
        importedSha256MatchSource: true,
        importedSidecarMatchesImport: true,
      },
    });
    expect(report.finalGate.command).toContain(`npm --prefix ${rootArg} run electron:release:final-gate --`);
    expect(report.finalGate.command).toContain(`--root-dir ${rootArg}`);
    expect(report.finalGate.command).toContain('--evidence-zip .danbi/electron-release/returned/fresh-windows-evidence.zip');
    expect(report.finalGate.command).toContain('--allow-missing-evidence-report');
    expect(report.finalGate.ready).toBe(true);
    expect(report.finalGate.evidenceReport).toBeNull();
    expect(report.finalGate.run).toBe(false);
    expect(report.finalGate.result).toBeNull();
    expect(existsSync(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip'))).toBe(true);
    expect(await readFile(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip'))).toEqual(zipBytes);
    expect(await readFile(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256'), 'utf8')).toBe(`${zipSha256}  fresh-windows-evidence.zip\n`);
  });

  it('imports a returned evidence ZIP when the checksum sidecar has a UTF-8 BOM', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeSimpleEvidenceZip(sourceZipPath);
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `\uFEFF${zipSha256}  fresh-windows-evidence.zip\n`, 'utf8');

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      allowMissingEvidenceReport: true,
      writeReport: false,
    });

    expect(report.status).toBe('passed');
    expect(report.source).toMatchObject({
      sidecarFileName: 'fresh-windows-evidence.zip',
      sha256: zipSha256,
    });
    expect(report.copyVerification).toMatchObject({
      status: 'passed',
      sidecarText: `${zipSha256}  fresh-windows-evidence.zip\n`,
    });
    expect(await readFile(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256'), 'utf8')).toBe(`${zipSha256}  fresh-windows-evidence.zip\n`);
  });

  it('quotes shell-sensitive final-gate command arguments', async () => {
    const rootDir = await makeTempRoot('danbi import root ');
    const rootArg = rootDir.replace(/\\/g, '/');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeSimpleEvidenceZip(sourceZipPath);
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      allowMissingEvidenceReport: true,
      manualAcceptanceReport: ".danbi/electron-release/qa's manual report.json",
      finalGateReport: '.danbi/electron-release/reports&logs/final;gate.json',
    });

    expect(report.finalGate.ready).toBe(true);
    expect(report.finalGate.command).toContain(`npm --prefix '${rootArg}' run electron:release:final-gate --`);
    expect(report.finalGate.command).toContain(`--root-dir '${rootArg.replace(/'/g, "''")}'`);
    expect(report.finalGate.command).toContain("--manual-acceptance-report '.danbi/electron-release/qa''s manual report.json'");
    expect(report.finalGate.command).toContain("--out '.danbi/electron-release/reports&logs/final;gate.json'");
  });

  it('fails before copying when the returned evidence package report is missing by default', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeSimpleEvidenceZip(sourceZipPath);
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      throwOnFailure: false,
    });

    expect(report.status).toBe('failed');
    expect(report.importStatus).toBe('failed');
    expect(report.imported.reportPath).toBeNull();
    expect(report.archiveVerification.status).toBe('not-run');
    expect(report.copyVerification.status).toBe('not-run');
    expect(report.packageReportVerification).toMatchObject({
      status: 'failed',
      sourcePath: `${sourceZipPath.replace(/\\/g, '/')}.report.json`,
      checks: {
        reportPresent: false,
      },
    });
    expect(report.finalGate.ready).toBe(false);
    expect(report.finalGate.command).toBeNull();
    expect(report.finalGate.args).toEqual([]);
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence package report verification failed: reportPresent.');
    expect(existsSync(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip'))).toBe(false);
  });

  it('verifies and preserves a returned evidence package report', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeSimpleEvidenceZip(sourceZipPath);
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);
    const packageReport = await writeEvidencePackageReport(sourceZipPath);
    const sourceSidecarBytes = await readFile(`${sourceZipPath}.sha256`);
    const sourceReportBytes = await readFile(`${sourceZipPath}.report.json`);

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
    });

    expect(report.status).toBe('passed');
    expect(report.importStatus).toBe('passed');
    expect(report.imported).toMatchObject({
      reportPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip.report.json',
      sha256Bytes: sourceSidecarBytes.length,
      sha256FileSha256: createHash('sha256').update(sourceSidecarBytes).digest('hex'),
      reportBytes: sourceReportBytes.length,
      reportSha256: createHash('sha256').update(sourceReportBytes).digest('hex'),
    });
    expect(report.source).toMatchObject({
      sha256Bytes: sourceSidecarBytes.length,
      sha256FileSha256: createHash('sha256').update(sourceSidecarBytes).digest('hex'),
      reportBytes: sourceReportBytes.length,
      reportSha256: createHash('sha256').update(sourceReportBytes).digest('hex'),
    });
    expect(report.packageReportVerification).toMatchObject({
      status: 'passed',
      sourcePath: `${sourceZipPath.replace(/\\/g, '/')}.report.json`,
      kind: 'danbi.electron.fresh-windows-evidence-package-report',
      archiveBytes: zipBytes.length,
      archiveSha256: zipSha256,
      summaryBytes: packageReport.summary.bytes,
      summarySha256: packageReport.summary.sha256,
      checks: {
        reportPresent: true,
        kindValid: true,
        statusPassed: true,
        archiveBytesMatchSource: true,
        archiveSha256MatchSource: true,
        archiveFileNameMatchesSidecar: true,
        archiveFileNameMatchesOutput: true,
        summaryFingerprintMatchesArchive: true,
        zipEntryInspectionMatchesArchive: true,
        importedReportPresent: true,
        importedReportMatchesSource: true,
      },
    });
    expect(report.finalGate.command).toContain('--evidence-report .danbi/electron-release/returned/fresh-windows-evidence.zip.report.json');
    expect(report.finalGate.evidenceReport).toBe('.danbi/electron-release/returned/fresh-windows-evidence.zip.report.json');
    expect(await readFile(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip.report.json'), 'utf8')).toBe(`${JSON.stringify(packageReport, null, 2)}\n`);
  });

  it('imports the standard returned evidence folder without spelling out the ZIP path', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeSimpleEvidenceZip(sourceZipPath);
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);
    await writeEvidencePackageReport(sourceZipPath);
    const sourceSidecarBytes = await readFile(`${sourceZipPath}.sha256`);
    const sourceReportBytes = await readFile(`${sourceZipPath}.report.json`);

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceDir: externalDir,
    });

    expect(report.status).toBe('passed');
    expect(report.importStatus).toBe('passed');
    expect(report.source).toMatchObject({
      evidenceDir: externalDir.replace(/\\/g, '/'),
      zipPath: sourceZipPath.replace(/\\/g, '/'),
      sha256Path: `${sourceZipPath.replace(/\\/g, '/')}.sha256`,
      sidecarFileName: 'fresh-windows-evidence.zip',
      bytes: zipBytes.length,
      sha256: zipSha256,
      sha256Bytes: sourceSidecarBytes.length,
      sha256FileSha256: createHash('sha256').update(sourceSidecarBytes).digest('hex'),
      reportBytes: sourceReportBytes.length,
      reportSha256: createHash('sha256').update(sourceReportBytes).digest('hex'),
    });
    expect(report.source.resolvedFiles).toEqual([
      {
        role: 'fresh-windows-evidence-zip',
        required: true,
        status: 'present',
        ready: true,
        path: sourceZipPath.replace(/\\/g, '/'),
        fileName: 'fresh-windows-evidence.zip',
      },
      {
        role: 'fresh-windows-evidence-zip-sha256',
        required: true,
        status: 'present',
        ready: true,
        path: `${sourceZipPath.replace(/\\/g, '/')}.sha256`,
        fileName: 'fresh-windows-evidence.zip.sha256',
      },
      {
        role: 'fresh-windows-evidence-package-report',
        required: true,
        status: 'present',
        ready: true,
        path: `${sourceZipPath.replace(/\\/g, '/')}.report.json`,
        fileName: 'fresh-windows-evidence.zip.report.json',
      },
    ]);
    expect(report.packageReportVerification).toMatchObject({
      status: 'passed',
      sourcePath: `${sourceZipPath.replace(/\\/g, '/')}.report.json`,
    });
    expect(report.imported).toMatchObject({
      zipPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
      sha256Path: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
      reportPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip.report.json',
      bytes: zipBytes.length,
      sha256: zipSha256,
      sha256Bytes: sourceSidecarBytes.length,
      sha256FileSha256: createHash('sha256').update(sourceSidecarBytes).digest('hex'),
      reportBytes: sourceReportBytes.length,
      reportSha256: createHash('sha256').update(sourceReportBytes).digest('hex'),
    });
  });

  it('rejects ambiguous returned evidence source options', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');

    expect(() => importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: join(externalDir, 'fresh-windows-evidence.zip'),
      evidenceDir: externalDir,
    })).toThrow('Use either --evidence-zip <path> or --evidence-dir <dir>, not both.');
  });

  it('prints final-gate pass-through options in CLI help', () => {
    const result = spawnSync('node', [
      importEvidenceScriptPath,
      '--help',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--full-verification-report <path>');
    expect(result.stdout).toContain('--release-acceptance-report <path>');
    expect(result.stdout).toContain('--handoff-dir <path>');
    expect(result.stdout).toContain('--evidence-staging-dir <path>');
    expect(result.stdout).toContain('--manual-acceptance-report <path>');
    expect(result.stdout).toContain('--final-gate-report <path>');
  });

  it('accepts --evidence-dir through the CLI without writing into the repo workspace', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeSimpleEvidenceZip(sourceZipPath);
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);
    await writeEvidencePackageReport(sourceZipPath);

    const result = spawnSync('node', [
      importEvidenceScriptPath,
      '--root-dir',
      rootDir,
      '--evidence-dir',
      externalDir,
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
      importStatus: 'passed',
      reportPath: '.danbi/electron-release/returned/evidence-import-report.json',
      evidenceZip: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
      evidenceZipSha256: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
      finalGateReady: true,
      finalGateArgs: [
        '--root-dir',
        rootDir.replace(/\\/g, '/'),
        '--evidence-zip',
        '.danbi/electron-release/returned/fresh-windows-evidence.zip',
        '--evidence-zip-sha256',
        '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
        '--evidence-report',
        '.danbi/electron-release/returned/fresh-windows-evidence.zip.report.json',
      ],
      finalGateStatus: null,
      failureCount: 0,
    });
    expect(output.finalGateCommand).toContain(`npm --prefix ${rootDir.replace(/\\/g, '/')} run electron:release:final-gate --`);
    expect(output.finalGateCommand).toContain(`--root-dir ${rootDir.replace(/\\/g, '/')}`);
    const importReport = JSON.parse(await readFile(join(rootDir, '.danbi/electron-release/returned/evidence-import-report.json'), 'utf8'));
    expect(importReport.source).toMatchObject({
      evidenceDir: externalDir.replace(/\\/g, '/'),
      zipPath: sourceZipPath.replace(/\\/g, '/'),
      sha256Path: `${sourceZipPath.replace(/\\/g, '/')}.sha256`,
    });
    expect(importReport.source.resolvedFiles).toHaveLength(3);
    expect(await readFile(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip'))).toEqual(zipBytes);
  });

  it('prints resolved returned-folder files in CLI failure output', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeSimpleEvidenceZip(sourceZipPath);
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);

    const result = spawnSync('node', [
      importEvidenceScriptPath,
      '--root-dir',
      rootDir,
      '--evidence-dir',
      externalDir,
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
      importStatus: 'failed',
      evidenceDir: externalDir.replace(/\\/g, '/'),
      finalGateReady: false,
      finalGateArgs: [],
      finalGateCommand: null,
      failureCount: 2,
    });
    expect(output.failures).toEqual(expect.arrayContaining([
      `Missing fresh Windows evidence package report: ${sourceZipPath}.report.json`,
      'Fresh Windows evidence package report verification failed: reportPresent.',
    ]));
    expect(output.resolvedFiles).toEqual([
      {
        role: 'fresh-windows-evidence-zip',
        required: true,
        status: 'present',
        ready: true,
        path: sourceZipPath.replace(/\\/g, '/'),
        fileName: 'fresh-windows-evidence.zip',
      },
      {
        role: 'fresh-windows-evidence-zip-sha256',
        required: true,
        status: 'present',
        ready: true,
        path: `${sourceZipPath.replace(/\\/g, '/')}.sha256`,
        fileName: 'fresh-windows-evidence.zip.sha256',
      },
      {
        role: 'fresh-windows-evidence-package-report',
        required: true,
        status: 'missing',
        ready: false,
        path: `${sourceZipPath.replace(/\\/g, '/')}.report.json`,
        fileName: 'fresh-windows-evidence.zip.report.json',
      },
    ]);
    expect(result.stderr).toContain('Fresh Windows evidence import failed');
  });

  it('prints import evidence CLI parse failures in stdout JSON', () => {
    const result = spawnSync('node', [
      importEvidenceScriptPath,
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

  it('can immediately run the final release gate after importing evidence and records the gate result', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeSimpleEvidenceZip(sourceZipPath);
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      runFinalGate: true,
      allowMissingEvidenceReport: true,
      throwOnFailure: false,
    });

    expect(report.importStatus).toBe('passed');
    expect(report.archiveVerification.status).toBe('passed');
    expect(report.copyVerification.status).toBe('passed');
    expect(report.status).toBe('failed');
    expect(report.finalGate).toMatchObject({
      run: true,
      evidenceZip: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
      evidenceZipSha256: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
      result: {
        status: 'failed',
        reportPath: '.danbi/electron-release/final-release-gate-report.json',
      },
    });
    expect(report.failures).toContain('Final release gate did not pass: failed.');
    expect(existsSync(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip'))).toBe(true);
  });

  it('passes the final release gate when a complete returned evidence ZIP is imported with run-final-gate', async () => {
    const rootDir = await makeFinalGateFixtureRoot();
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeReturnedEvidenceZip(rootDir, '.danbi/electron-release/handoff', sourceZipPath);
    const summaryBytes = await readFile(join(rootDir, '.danbi/electron-release/handoff/fresh-windows-evidence-summary.json'));
    await writeEvidencePackageReport(sourceZipPath, { summaryBytes });
    await rm(join(rootDir, '.danbi/electron-release/handoff/fresh-windows-result.json'), { force: true });
    await rm(join(rootDir, '.danbi/electron-release/handoff/fresh-windows-basic-smoke.json'), { force: true });
    await rm(join(rootDir, '.danbi/electron-release/handoff/fresh-windows-gui-session.json'), { force: true });
    await rm(join(rootDir, '.danbi/electron-release/handoff/fresh-windows-gui-render.mp4'), { force: true });

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      runFinalGate: true,
    });

    expect(report.status).toBe('passed');
    expect(report.importStatus).toBe('passed');
    expect(report.archiveVerification.status).toBe('passed');
    expect(report.copyVerification.status).toBe('passed');
    expect(report.finalGate.result).toMatchObject({
      status: 'passed',
      reportPath: '.danbi/electron-release/final-release-gate-report.json',
      evidencePackageStatus: 'passed',
      freshWindowsStatus: 'passed',
      failureCount: 0,
    });
    expect(report.finalGate.evidenceZip).toBe('.danbi/electron-release/returned/fresh-windows-evidence.zip');
    expect(report.finalGate.evidenceReport).toBe('.danbi/electron-release/returned/fresh-windows-evidence.zip.report.json');
    expect(report.finalGate.command).toContain('--evidence-report .danbi/electron-release/returned/fresh-windows-evidence.zip.report.json');
    expect(report.failures).toEqual([]);
  });

  it('fails before copying when the returned ZIP checksum does not match the sidecar', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeFile(sourceZipPath, 'actual evidence bytes');
    await writeFile(`${sourceZipPath}.sha256`, `${'0'.repeat(64)}  fresh-windows-evidence.zip\n`);

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      throwOnFailure: false,
      allowMissingEvidenceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.importStatus).toBe('failed');
    expect(report.archiveVerification.status).toBe('not-run');
    expect(report.copyVerification).toMatchObject({
      status: 'not-run',
      sourceBytes: 'actual evidence bytes'.length,
      importedBytes: null,
      sourceSha256: createHash('sha256').update('actual evidence bytes').digest('hex'),
      importedSha256: null,
    });
    expect(report.failures.join('\n')).toContain('SHA-256 mismatch');
    expect(existsSync(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip'))).toBe(false);
  });

  it('fails before copying when the returned ZIP checksum sidecar has multiple entries', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeSimpleEvidenceZip(sourceZipPath);
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(
      `${sourceZipPath}.sha256`,
      `${zipSha256}  fresh-windows-evidence.zip\n${'0'.repeat(64)}  stale-evidence.zip\n`,
      'utf8',
    );

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      throwOnFailure: false,
      allowMissingEvidenceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.importStatus).toBe('failed');
    expect(report.archiveVerification.status).toBe('not-run');
    expect(report.copyVerification.status).toBe('not-run');
    expect(report.failures.join('\n')).toContain('Invalid fresh Windows evidence ZIP checksum sidecar');
  });

  it('fails before copying when the requested output ZIP name contains a Windows stream separator', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeSimpleEvidenceZip(sourceZipPath);
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      outputName: 'fresh:windows-evidence.zip',
      throwOnFailure: false,
      allowMissingEvidenceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.importStatus).toBe('failed');
    expect(report.copyVerification.status).toBe('not-run');
    expect(report.failures.join('\n')).toContain(
      'Fresh Windows evidence output name must be a safe filename, got fresh:windows-evidence.zip.',
    );
  });

  it('fails before copying when the requested output ZIP name is a Windows reserved device name', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeSimpleEvidenceZip(sourceZipPath);
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      outputName: 'NUL.zip',
      throwOnFailure: false,
      allowMissingEvidenceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.importStatus).toBe('failed');
    expect(report.copyVerification.status).toBe('not-run');
    expect(report.failures.join('\n')).toContain(
      'Fresh Windows evidence output name must be a safe filename, got NUL.zip.',
    );
  });

  it('fails before copying when a package report would not match the requested output ZIP name', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeSimpleEvidenceZip(sourceZipPath);
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);
    await writeEvidencePackageReport(sourceZipPath);

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      outputName: 'renamed-fresh-windows-evidence.zip',
      throwOnFailure: false,
    });

    expect(report.status).toBe('failed');
    expect(report.importStatus).toBe('failed');
    expect(report.archiveVerification.status).toBe('not-run');
    expect(report.copyVerification.status).toBe('not-run');
    expect(report.packageReportVerification).toMatchObject({
      status: 'failed',
      checks: {
        archiveFileNameMatchesSidecar: true,
        archiveFileNameMatchesOutput: false,
      },
    });
    expect(report.failures.join('\n')).toContain('archiveFileNameMatchesOutput');
    expect(existsSync(join(rootDir, '.danbi/electron-release/returned/renamed-fresh-windows-evidence.zip'))).toBe(false);
    expect(existsSync(join(rootDir, '.danbi/electron-release/returned/renamed-fresh-windows-evidence.zip.report.json'))).toBe(false);
  });

  it('fails before copying when the package report does not match the ZIP summary', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeSimpleEvidenceZip(sourceZipPath);
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);
    await writeEvidencePackageReport(sourceZipPath, { summarySha256: '0'.repeat(64) });

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      throwOnFailure: false,
      allowMissingEvidenceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.importStatus).toBe('failed');
    expect(report.imported.reportPath).toBeNull();
    expect(report.packageReportVerification).toMatchObject({
      status: 'failed',
      checks: {
        summaryFingerprintMatchesArchive: false,
      },
    });
    expect(report.failures.join('\n')).toContain('summaryFingerprintMatchesArchive');
    expect(report.finalGate.ready).toBe(false);
    expect(report.finalGate.command).toBeNull();
    expect(report.finalGate.args).toEqual([]);
    expect(existsSync(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip'))).toBe(false);
    expect(existsSync(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip.report.json'))).toBe(false);
  });

  it('fails before copying when the package report ZIP entry inspection does not match the archive', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeSimpleEvidenceZip(sourceZipPath);
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);
    await writeEvidencePackageReport(sourceZipPath, {
      zipEntryInspection: {
        ...buildExpectedZipEntryInspection(),
        directories: ['tools'],
      },
    });

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      throwOnFailure: false,
      allowMissingEvidenceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.importStatus).toBe('failed');
    expect(report.packageReportVerification).toMatchObject({
      status: 'failed',
      checks: {
        zipEntryInspectionMatchesArchive: false,
      },
    });
    expect(report.failures.join('\n')).toContain('zipEntryInspectionMatchesArchive');
    expect(existsSync(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip'))).toBe(false);
    expect(existsSync(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip.report.json'))).toBe(false);
  });

  it('fails before copying when the returned evidence file is not a valid ZIP archive', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    const zipBytes = Buffer.from('not a zip archive');
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(sourceZipPath, zipBytes);
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      throwOnFailure: false,
      allowMissingEvidenceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.importStatus).toBe('failed');
    expect(report.archiveVerification).toMatchObject({
      status: 'failed',
      archiveFiles: [],
      missingFiles: evidenceZipFiles,
      unexpectedEntries: [],
    });
    expect(report.copyVerification.status).toBe('not-run');
    expect(report.failures.join('\n')).toContain('missing required files');
    expect(existsSync(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip'))).toBe(false);
  });

  it('fails before copying when the returned evidence ZIP contains unsafe entry paths', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeEvidenceZipWithAppendedEntry(sourceZipPath, '../escape.txt');
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      throwOnFailure: false,
      allowMissingEvidenceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.importStatus).toBe('failed');
    expect(report.archiveVerification).toMatchObject({
      status: 'failed',
      zipEntryInspectionStatus: 'passed',
      missingFiles: [],
      unsafeEntries: ['../escape.txt'],
    });
    expect(report.copyVerification.status).toBe('not-run');
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence ZIP contains unsafe entries: ../escape.txt');
    expect(existsSync(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip'))).toBe(false);
    expect(existsSync(join(externalDir, 'escape.txt'))).toBe(false);
  });

  it('fails before copying when the returned evidence ZIP contains duplicate entries', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    await writeEvidenceZipWithAppendedEntry(sourceZipPath, 'fresh-windows-result.json');
    const zipBytes = await readFile(sourceZipPath);
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);

    const { report } = importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      throwOnFailure: false,
      allowMissingEvidenceReport: true,
    });

    expect(report.status).toBe('failed');
    expect(report.importStatus).toBe('failed');
    expect(report.archiveVerification).toMatchObject({
      status: 'failed',
      zipEntryInspectionStatus: 'passed',
      missingFiles: [],
      unsafeEntries: [],
      duplicateEntries: ['fresh-windows-result.json'],
    });
    expect(report.copyVerification.status).toBe('not-run');
    expect(report.failures.join('\n')).toContain('Fresh Windows evidence ZIP contains duplicate entries: fresh-windows-result.json');
    expect(existsSync(join(rootDir, '.danbi/electron-release/returned/fresh-windows-evidence.zip'))).toBe(false);
  });

  it('refuses to write imported evidence outside the release workspace', async () => {
    const rootDir = await makeTempRoot('danbi-import-root-');
    const externalDir = await makeTempRoot('danbi-import-external-');
    const sourceZipPath = join(externalDir, 'fresh-windows-evidence.zip');
    const zipBytes = Buffer.from('fresh windows evidence zip bytes');
    const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
    await writeFile(sourceZipPath, zipBytes);
    await writeFile(`${sourceZipPath}.sha256`, `${zipSha256}  fresh-windows-evidence.zip\n`);

    expect(() => importFreshWindowsEvidencePackage({
      rootDir,
      evidenceZip: sourceZipPath,
      outputDir: 'returned',
    })).toThrow('must stay under .danbi/electron-release');
  });
});

async function makeTempRoot(prefix: string): Promise<string> {
  const tempRoot = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(tempRoot);
  return tempRoot;
}

async function makeFinalGateFixtureRoot(): Promise<string> {
  const rootDir = await makeTempRoot('danbi-import-final-gate-');
  const handoffDir = '.danbi/electron-release/handoff';
  await writeFixtureFile(rootDir, '.danbi/electron-release/release-verification-full.json', JSON.stringify({
    kind: 'danbi.electron.release-verification',
    status: 'passed',
    profile: 'full',
    production: false,
    dryRun: false,
    passedCount: requiredFullGateIds.length,
    failedCount: 0,
    skippedCount: 0,
    results: requiredFullGateIds.map((id) => ({ id, status: 'passed' })),
  }));
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
  await writeFixtureFile(rootDir, join(handoffDir, 'fresh-windows-result.json'), JSON.stringify(manualResult()));
  await writeFixtureFile(rootDir, join(handoffDir, 'fresh-windows-basic-smoke.json'), JSON.stringify(basicSmokeResult()));
  await writeFixtureFile(rootDir, join(handoffDir, 'fresh-windows-gui-session.json'), JSON.stringify(guiSessionResult()));
}

async function writeReturnedEvidenceZip(rootDir: string, handoffDir: string, zipPath: string): Promise<void> {
  const evidenceJson = await buildSummaryEvidenceJson(rootDir, handoffDir);
  const handoffReferences = await buildSummaryHandoffReferences(rootDir, handoffDir);
  await writeFixtureFile(rootDir, join(handoffDir, 'fresh-windows-evidence-summary.json'), JSON.stringify({
    kind: 'danbi.electron.fresh-windows-evidence-package-summary',
    productName: 'Danbi Studio',
    version: '0.1.0',
    installer: 'Danbi Studio-0.1.0-win-x64.exe',
    tester: 'QA Tester',
    checkedAt: '2026-06-16T12:00:00.000Z',
    packagedAt: '2026-06-16T12:01:00.000Z',
    outputMp4: {
      path: 'fresh-windows-gui-render.mp4',
      bytes: outputMp4.length,
      sha256: outputMp4Sha256,
      durationSeconds: 6,
      hasVideo: true,
      hasAudio: true,
    },
    evidenceJson,
    handoffReferences,
    files: evidenceZipFiles,
  }));
  await mkdir(dirname(zipPath), { recursive: true });
  const sourceDir = join(dirname(zipPath), 'fresh-windows-evidence-source');
  await rm(sourceDir, { recursive: true, force: true });
  await mkdir(sourceDir, { recursive: true });
  for (const file of evidenceZipFiles) {
    await copyFile(join(rootDir, handoffDir, file), join(sourceDir, file));
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
  await writeFile(`${zipPath}.sha256`, `${zipHash}  ${basename(zipPath)}\n`, 'utf8');
}

async function writeSimpleEvidenceZip(zipPath: string): Promise<void> {
  await mkdir(dirname(zipPath), { recursive: true });
  const sourceDir = join(dirname(zipPath), 'simple-fresh-windows-evidence-source');
  await rm(sourceDir, { recursive: true, force: true });
  await mkdir(sourceDir, { recursive: true });
  for (const file of evidenceZipFiles) {
    const filePath = join(sourceDir, file);
    if (file === 'fresh-windows-gui-render.mp4') {
      await writeFile(filePath, outputMp4);
    } else {
      await writeFile(filePath, '{}\n', 'utf8');
    }
  }

  const result = spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    'Compress-Archive -Path (Join-Path $env:DANBI_TEST_SIMPLE_EVIDENCE_SOURCE "*") -DestinationPath $env:DANBI_TEST_SIMPLE_EVIDENCE_ZIP -Force',
  ], {
    env: {
      ...process.env,
      DANBI_TEST_SIMPLE_EVIDENCE_SOURCE: sourceDir,
      DANBI_TEST_SIMPLE_EVIDENCE_ZIP: zipPath,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? result.stderr);
  }
}

async function writeEvidenceZipWithAppendedEntry(zipPath: string, entryName: string): Promise<void> {
  await writeSimpleEvidenceZip(zipPath);
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

async function writeEvidencePackageReport(
  zipPath: string,
  options: {
    archiveSha256?: string;
    summaryBytes?: Buffer;
    summarySha256?: string;
    zipEntryInspection?: Record<string, unknown>;
  } = {},
): Promise<EvidencePackageReportFixture> {
  const zipBytes = await readFile(zipPath);
  const zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
  const summaryBytes = options.summaryBytes ?? Buffer.from('{}\n', 'utf8');
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
      path: zipPath,
      fileName: basename(zipPath),
      bytes: zipBytes.length,
      sha256: options.archiveSha256 ?? zipSha256,
      sha256Path: `${zipPath}.sha256`,
    },
    summary: {
      path: 'fresh-windows-evidence-summary.json',
      bytes: summaryBytes.length,
      sha256: options.summarySha256 ?? summarySha256,
    },
    evidenceJson: {},
    outputMp4: {},
    handoffReferences: {},
    files: evidenceZipFiles,
    zipEntryInspection: options.zipEntryInspection ?? buildExpectedZipEntryInspection(),
  };
  await writeFile(`${zipPath}.report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
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

async function buildSummaryEvidenceJson(rootDir: string, handoffDir: string): Promise<Record<string, unknown>> {
  const basicSmokeBytes = await readFile(join(rootDir, handoffDir, 'fresh-windows-basic-smoke.json'));
  const guiSessionBytes = await readFile(join(rootDir, handoffDir, 'fresh-windows-gui-session.json'));
  const manualResultBytes = await readFile(join(rootDir, handoffDir, 'fresh-windows-result.json'));
  return {
    basicSmoke: {
      path: 'fresh-windows-basic-smoke.json',
      bytes: basicSmokeBytes.length,
      sha256: createHash('sha256').update(basicSmokeBytes).digest('hex'),
    },
    guiSession: {
      path: 'fresh-windows-gui-session.json',
      bytes: guiSessionBytes.length,
      sha256: createHash('sha256').update(guiSessionBytes).digest('hex'),
    },
    manualResult: {
      path: 'fresh-windows-result.json',
      bytes: manualResultBytes.length,
      sha256: createHash('sha256').update(manualResultBytes).digest('hex'),
    },
  };
}

async function buildSummaryHandoffReferences(rootDir: string, handoffDir: string): Promise<Record<string, unknown>> {
  const manifestBytes = await readFile(join(rootDir, handoffDir, 'handoff-manifest.json'));
  const checksumsBytes = await readFile(join(rootDir, handoffDir, 'SHA256SUMS.txt'));
  return {
    manifest: {
      path: 'handoff-manifest.json',
      bytes: manifestBytes.length,
      sha256: createHash('sha256').update(manifestBytes).digest('hex'),
    },
    checksums: {
      path: 'SHA256SUMS.txt',
      bytes: checksumsBytes.length,
      sha256: createHash('sha256').update(checksumsBytes).digest('hex'),
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
