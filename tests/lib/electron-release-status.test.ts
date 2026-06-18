import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildElectronReleaseStatus,
} from '../../scripts/electron-release-status.mjs';

const tempRoots: string[] = [];
const statusScriptPath = fileURLToPath(new URL('../../scripts/electron-release-status.mjs', import.meta.url));
const requiredCoreGateIds = [
  'typecheck',
  'unit-tests',
  'git-diff-check',
  'eslint-clean-check',
  'architecture-check',
  'license-check',
  'plugin-signing-readiness',
  'plugin-signing-custody-audit',
];
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

describe('Electron release status summary', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
  });

  it('reports that only returned fresh Windows evidence is blocking release approval', async () => {
    const rootDir = await makeFixtureRoot();
    const rootArg = rootDir.replace(/\\/g, '/');

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('waiting-for-fresh-windows-evidence');
    expect(status.releaseApproved).toBe(false);
    expect(status.blockerCategory).toBe('fresh-windows-evidence');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(true);
    expect(status.freshWindowsHandoffReadiness).toMatchObject({
      status: 'ready',
      externalEvidenceRequired: true,
      dirtyWorkspaceBlocksApproval: false,
      handoffPackage: {
        status: 'ready',
        packagePath: '.danbi/electron-release/danbi-studio-0.1.0-fresh-windows-handoff.zip',
        packageFileName: 'danbi-studio-0.1.0-fresh-windows-handoff.zip',
        sha256Path: '.danbi/electron-release/danbi-studio-0.1.0-fresh-windows-handoff.zip.sha256',
        packageReportPath: '.danbi/electron-release/danbi-studio-0.1.0-fresh-windows-handoff.zip.report.json',
        filesToSendRequiredCount: 3,
        filesToSendReadyCount: 3,
        filesToSendAllReady: true,
      },
      commands: {
        qaAcceptance: '.\\run-fresh-windows-acceptance.ps1 -Tester "<name>" -WaitTimeoutSeconds 600',
        localImport: `npm --prefix ${rootArg} run electron:release:import-evidence -- --root-dir ${rootArg} --evidence-dir '<returned-fresh-windows-evidence-folder>' --run-final-gate`,
      },
      commandArgs: {
        qaAcceptance: [
          '.\\run-fresh-windows-acceptance.ps1',
          '-Tester',
          '<name>',
          '-WaitTimeoutSeconds',
          '600',
        ],
        localImport: [
          'npm',
          '--prefix',
          rootArg,
          'run',
          'electron:release:import-evidence',
          '--',
          '--root-dir',
          rootArg,
          '--evidence-dir',
          '<returned-fresh-windows-evidence-folder>',
          '--run-final-gate',
        ],
      },
      expectedReturnedEvidence: {
        zip: 'fresh-windows-evidence.zip',
        sha256: 'fresh-windows-evidence.zip.sha256',
        report: 'fresh-windows-evidence.zip.report.json',
        filesToReturn: [
          {
            role: 'fresh-windows-evidence-zip',
            required: true,
            fileName: 'fresh-windows-evidence.zip',
          },
          {
            role: 'fresh-windows-evidence-zip-sha256',
            required: true,
            fileName: 'fresh-windows-evidence.zip.sha256',
          },
          {
            role: 'fresh-windows-evidence-package-report',
            required: true,
            fileName: 'fresh-windows-evidence.zip.report.json',
          },
        ],
      },
      blockers: [],
    });
    expect(status.freshWindowsHandoffReadiness.handoffPackage.filesToSend).toEqual([
      expect.objectContaining({
        role: 'handoff-zip',
        required: true,
        status: 'present',
        ready: true,
        path: '.danbi/electron-release/danbi-studio-0.1.0-fresh-windows-handoff.zip',
        fileName: 'danbi-studio-0.1.0-fresh-windows-handoff.zip',
      }),
      {
        role: 'handoff-zip-sha256',
        required: true,
        status: 'present',
        ready: true,
        path: '.danbi/electron-release/danbi-studio-0.1.0-fresh-windows-handoff.zip.sha256',
        fileName: 'danbi-studio-0.1.0-fresh-windows-handoff.zip.sha256',
        bytes: expect.any(Number),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      {
        role: 'handoff-package-report',
        required: true,
        status: 'passed',
        ready: true,
        path: '.danbi/electron-release/danbi-studio-0.1.0-fresh-windows-handoff.zip.report.json',
        fileName: 'danbi-studio-0.1.0-fresh-windows-handoff.zip.report.json',
        bytes: expect.any(Number),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    ]);
    expect(status.freshWindowsHandoffReadiness.actions.join('\n')).toContain('danbi-studio-0.1.0-fresh-windows-handoff.zip');
    expect(status.freshWindowsHandoffReadiness.actions.join('\n')).toContain('run-fresh-windows-acceptance.ps1');
    expect(status.freshWindowsHandoffReadiness.actions.join('\n')).toContain('electron:release:import-evidence');
    expect(status.checks.fullVerification.status).toBe('passed');
    expect(status.checks.releaseAcceptance.status).toBe('passed');
    expect(status.checks.releaseAcceptance.freshnessStatus).toBe('current');
    expect(status.checks.handoffPackage).toMatchObject({
      status: 'ready',
      manifestStatus: 'passed',
      freshnessStatus: 'current',
      sidecarStatus: 'present',
      sidecarBytes: expect.any(Number),
      sidecarFileSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      packageReportStatus: 'passed',
      packageReportBytes: expect.any(Number),
      packageReportSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      failureCount: 0,
    });
    expect(status.checks.evidenceImport).toMatchObject({
      status: 'not-provided',
      importStatus: null,
      archiveVerificationStatus: null,
      archiveZipEntryInspectionStatus: null,
      packageReportStatus: null,
      importedReportPath: null,
      copyVerificationStatus: null,
      archiveDirectories: [],
      archiveMissingFiles: [],
      archiveUnexpectedEntries: [],
      archiveUnsafeEntries: [],
      archiveDuplicateEntries: [],
    });
    expect(status.checks.freshWindows).toMatchObject({
      status: 'failed',
      checksumStatus: 'passed',
      basicSmokeStatus: 'missing',
      guiSessionStatus: 'missing',
    });
    expect(status.missingFreshWindowsArtifacts).toEqual([
      'E:/fixture/.danbi/electron-release/handoff/fresh-windows-basic-smoke.json',
      'E:/fixture/.danbi/electron-release/handoff/fresh-windows-gui-session.json',
      'E:/fixture/.danbi/electron-release/handoff/fresh-windows-result.json',
    ]);
    expect(status.remainingActions.join('\n')).toContain('electron:release:import-evidence');
    expect(status.reports.handoffManifest).toBe('.danbi/electron-release/handoff/handoff-manifest.json');
    expect(status.approvalPolicy).toMatchObject({
      strict: false,
      requireClean: false,
      passed: true,
      failures: [],
    });
  });

  it('quotes the local evidence import command when the workspace root contains spaces', async () => {
    const rootDir = await makeFixtureRoot({ tempRootPrefix: 'danbi release status root ' });
    const rootArg = rootDir.replace(/\\/g, '/');

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.freshWindowsHandoffReadiness.commands.localImport).toBe(
      `npm --prefix '${rootArg}' run electron:release:import-evidence -- --root-dir '${rootArg}' --evidence-dir '<returned-fresh-windows-evidence-folder>' --run-final-gate`,
    );
    expect(status.freshWindowsHandoffReadiness.commandArgs.localImport).toEqual([
      'npm',
      '--prefix',
      rootArg,
      'run',
      'electron:release:import-evidence',
      '--',
      '--root-dir',
      rootArg,
      '--evidence-dir',
      '<returned-fresh-windows-evidence-folder>',
      '--run-final-gate',
    ]);
    expect(status.remainingActions.join('\n')).toContain(`--root-dir '${rootArg}'`);
  });

  it('keeps the QA handoff package ready when the SHA-256 sidecar has a UTF-8 BOM', async () => {
    const rootDir = await makeFixtureRoot();
    const fileName = 'danbi-studio-0.1.0-fresh-windows-handoff.zip';
    const zipPath = join(rootDir, '.danbi/electron-release', fileName);
    const zipSha256 = createHash('sha256').update(await readFile(zipPath)).digest('hex');
    await writeFile(`${zipPath}.sha256`, `\uFEFF${zipSha256}  ${fileName}\n`, 'utf8');

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('waiting-for-fresh-windows-evidence');
    expect(status.blockerCategory).toBe('fresh-windows-evidence');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(true);
    expect(status.checks.handoffPackage).toMatchObject({
      status: 'ready',
      sidecarStatus: 'present',
      sidecarSha256: zipSha256,
    });
    expect(status.freshWindowsHandoffReadiness.handoffPackage).toMatchObject({
      status: 'ready',
      filesToSendAllReady: true,
    });
  });

  it('does not mark handoff files ready when the SHA-256 sidecar names a different ZIP', async () => {
    const rootDir = await makeFixtureRoot();
    const fileName = 'danbi-studio-0.1.0-fresh-windows-handoff.zip';
    const zipPath = join(rootDir, '.danbi/electron-release', fileName);
    const zipSha256 = createHash('sha256').update(await readFile(zipPath)).digest('hex');
    await writeFile(`${zipPath}.sha256`, `${zipSha256}  stale-handoff.zip\n`, 'utf8');

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('handoff-package');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.handoffPackage).toMatchObject({
      status: 'invalid',
      sidecarStatus: 'present',
      sidecarSha256: zipSha256,
    });
    expect(status.checks.handoffPackage.failures.join('\n')).toContain(
      `QA handoff ZIP SHA-256 sidecar names stale-handoff.zip, expected ${fileName}.`,
    );
    expect(status.freshWindowsHandoffReadiness.handoffPackage).toMatchObject({
      status: 'invalid',
      filesToSendAllReady: false,
      filesToSendReadyCount: 0,
    });
    expect(status.freshWindowsHandoffReadiness.handoffPackage.filesToSend).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'handoff-zip', status: 'present', ready: false }),
      expect.objectContaining({ role: 'handoff-zip-sha256', status: 'present', ready: false }),
      expect.objectContaining({ role: 'handoff-package-report', status: 'passed', ready: false }),
    ]));
  });

  it('marks the QA handoff sidecar invalid when it names a Windows reserved ZIP', async () => {
    const rootDir = await makeFixtureRoot();
    const fileName = 'danbi-studio-0.1.0-fresh-windows-handoff.zip';
    const zipPath = join(rootDir, '.danbi/electron-release', fileName);
    const zipSha256 = createHash('sha256').update(await readFile(zipPath)).digest('hex');
    await writeFile(`${zipPath}.sha256`, `${zipSha256}  NUL.zip\n`, 'utf8');

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('handoff-package');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.handoffPackage).toMatchObject({
      status: 'invalid',
      sidecarStatus: 'invalid',
      sidecarSha256: null,
    });
    expect(status.checks.handoffPackage.failures.join('\n')).toContain(
      'QA handoff ZIP SHA-256 sidecar is missing or invalid.',
    );
    expect(status.freshWindowsHandoffReadiness.handoffPackage).toMatchObject({
      status: 'invalid',
      filesToSendAllReady: false,
    });
    expect(status.freshWindowsHandoffReadiness.handoffPackage.filesToSend).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'handoff-zip-sha256', status: 'invalid', ready: false }),
    ]));
  });

  it('summarizes returned evidence import and copy verification state', async () => {
    const rootDir = await makeFixtureRoot({
      evidenceImport: {
        status: 'passed',
        importStatus: 'passed',
        imported: {
          zipPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
          sha256Path: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
          reportPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip.report.json',
          bytes: 12345,
          sha256: 'a'.repeat(64),
          sha256Bytes: 88,
          sha256FileSha256: 'b'.repeat(64),
          reportBytes: 2048,
          reportSha256: 'c'.repeat(64),
        },
        archiveVerification: {
          status: 'passed',
          archiveDirectories: ['tools'],
          missingFiles: [],
          unexpectedEntries: [],
        },
        packageReportVerification: {
          status: 'passed',
          checks: {
            reportPresent: true,
            zipEntryInspectionMatchesArchive: true,
          },
        },
        copyVerification: {
          status: 'passed',
        },
        finalGate: {
          run: true,
          result: { status: 'failed' },
        },
        failures: [],
      },
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.checks.evidenceImport).toMatchObject({
      status: 'passed',
      importStatus: 'passed',
      archiveVerificationStatus: 'passed',
      archiveDirectories: ['tools'],
      archiveMissingFiles: [],
      archiveUnexpectedEntries: [],
      packageReportStatus: 'passed',
      packageReportChecks: {
        reportPresent: true,
        zipEntryInspectionMatchesArchive: true,
      },
      packageReportFailedChecks: [],
      importedReportPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip.report.json',
      copyVerificationStatus: 'passed',
      importedZipPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
      importedSha256Path: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
      importedBytes: 12345,
      importedSha256: 'a'.repeat(64),
      importedSha256Bytes: 88,
      importedSha256FileSha256: 'b'.repeat(64),
      importedReportBytes: 2048,
      importedReportSha256: 'c'.repeat(64),
      finalGateRun: true,
      finalGateStatus: 'failed',
      finalGateReady: true,
      failureCount: 0,
    });
    expect(status.reports.evidenceImport).toBe('.danbi/electron-release/returned/evidence-import-report.json');
  });

  it('points to final gate when evidence was imported but the final gate has not been run', async () => {
    const finalGateCommand = 'npm run electron:release:final-gate -- --evidence-zip .danbi/electron-release/returned/fresh-windows-evidence.zip --evidence-zip-sha256 .danbi/electron-release/returned/fresh-windows-evidence.zip.sha256 --evidence-report .danbi/electron-release/returned/fresh-windows-evidence.zip.report.json';
    const finalGateArgs = [
      '--evidence-zip',
      '.danbi/electron-release/returned/fresh-windows-evidence.zip',
      '--evidence-zip-sha256',
      '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
      '--evidence-report',
      '.danbi/electron-release/returned/fresh-windows-evidence.zip.report.json',
    ];
    const rootDir = await makeFixtureRoot({
      evidenceImport: {
        status: 'passed',
        importStatus: 'passed',
        imported: {
          zipPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
          sha256Path: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
          reportPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip.report.json',
          bytes: 12345,
          sha256: 'e'.repeat(64),
        },
        archiveVerification: {
          status: 'passed',
          archiveDirectories: [],
          missingFiles: [],
          unexpectedEntries: [],
        },
        packageReportVerification: {
          status: 'passed',
        },
        copyVerification: {
          status: 'passed',
        },
        finalGate: {
          command: finalGateCommand,
          args: finalGateArgs,
          ready: true,
          run: false,
          result: null,
        },
        failures: [],
      },
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.releaseApproved).toBe(false);
    expect(status.blockerCategory).toBe('final-gate');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.evidenceImport).toMatchObject({
      status: 'passed',
      importStatus: 'passed',
      finalGateRun: false,
      finalGateStatus: null,
      finalGateReady: true,
      finalGateCommand,
      finalGateArgs,
      awaitingFinalGate: true,
    });
    expect(status.remainingActions.join('\n')).toContain(finalGateCommand);
    expect(status.remainingActions.join('\n')).not.toContain('Return fresh-windows-evidence.zip');
  });

  it('formats imported evidence final-gate action from args when command is absent', async () => {
    const finalGateArgs = [
      '--evidence-zip',
      '.danbi/electron-release/returned/fresh-windows-evidence.zip',
      '--evidence-zip-sha256',
      '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
      '--manual-acceptance-report',
      ".danbi/electron-release/qa's manual report.json",
    ];
    const rootDir = await makeFixtureRoot({
      evidenceImport: {
        status: 'passed',
        importStatus: 'passed',
        imported: {
          zipPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
          sha256Path: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
          reportPath: null,
          bytes: 12345,
          sha256: 'e'.repeat(64),
        },
        archiveVerification: {
          status: 'passed',
          missingFiles: [],
          unexpectedEntries: [],
        },
        packageReportVerification: {
          status: 'not-provided',
        },
        copyVerification: {
          status: 'passed',
        },
        finalGate: {
          command: null,
          args: finalGateArgs,
          ready: true,
          run: false,
          result: null,
        },
        failures: [],
      },
    });
    const rootArg = rootDir.replace(/\\/g, '/');

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.checks.evidenceImport).toMatchObject({
      finalGateReady: true,
      finalGateCommand: null,
      finalGateArgs,
      awaitingFinalGate: true,
    });
    expect(status.remainingActions.join('\n')).toContain(
      `npm --prefix ${rootArg} run electron:release:final-gate --`,
    );
    expect(status.remainingActions.join('\n')).toContain(
      "--manual-acceptance-report '.danbi/electron-release/qa''s manual report.json'",
    );
  });

  it('prints final-gate args through the status CLI for a supplied root directory', async () => {
    const finalGateArgs = [
      '--evidence-zip',
      '.danbi/electron-release/returned/fresh-windows-evidence.zip',
      '--evidence-zip-sha256',
      '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
    ];
    const rootDir = await makeFixtureRoot({
      evidenceImport: {
        status: 'passed',
        importStatus: 'passed',
        imported: {
          zipPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
          sha256Path: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
          reportPath: null,
          bytes: 12345,
          sha256: 'e'.repeat(64),
        },
        archiveVerification: {
          status: 'passed',
          missingFiles: [],
          unexpectedEntries: [],
        },
        packageReportVerification: {
          status: 'not-provided',
        },
        copyVerification: {
          status: 'passed',
        },
        finalGate: {
          command: null,
          args: finalGateArgs,
          ready: true,
          run: false,
          result: null,
        },
        failures: [],
      },
    });
    const rootArg = rootDir.replace(/\\/g, '/');

    const result = spawnSync('node', [
      statusScriptPath,
      '--root-dir',
      rootDir,
      '--out',
      '.danbi/electron-release/status-from-cli.json',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.checks.evidenceImport).toMatchObject({
      finalGateReady: true,
      finalGateArgs,
      awaitingFinalGate: true,
    });
    expect(output.remainingActions.join('\n')).toContain(
      `npm --prefix ${rootArg} run electron:release:final-gate -- --evidence-zip .danbi/electron-release/returned/fresh-windows-evidence.zip --evidence-zip-sha256 .danbi/electron-release/returned/fresh-windows-evidence.zip.sha256`,
    );
    const writtenReport = JSON.parse(await readFile(join(rootDir, '.danbi/electron-release/status-from-cli.json'), 'utf8'));
    expect(writtenReport.checks.evidenceImport).toMatchObject({
      finalGateArgs,
      awaitingFinalGate: true,
    });
  });

  it('prints root directory support in status CLI help', () => {
    const result = spawnSync('node', [
      statusScriptPath,
      '--help',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--root-dir <path>');
    expect(result.stdout).toContain('--out <path>');
  });

  it('prints status CLI parse failures in stdout JSON', () => {
    const result = spawnSync('node', [
      statusScriptPath,
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
      kind: 'danbi.electron.release-status',
      status: 'failed',
      reportPath: null,
      failureCount: 1,
      failures: ['Unknown option: --bad-option'],
    });
    expect(result.stderr).toContain('Unknown option: --bad-option');
  });

  it('falls back to imported evidence paths when final-gate args contain control characters', async () => {
    const rootDir = await makeFixtureRoot({
      evidenceImport: {
        status: 'passed',
        importStatus: 'passed',
        imported: {
          zipPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
          sha256Path: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
          reportPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip.report.json',
          bytes: 12345,
          sha256: 'e'.repeat(64),
        },
        archiveVerification: {
          status: 'passed',
          missingFiles: [],
          unexpectedEntries: [],
        },
        packageReportVerification: {
          status: 'passed',
        },
        copyVerification: {
          status: 'passed',
        },
        finalGate: {
          command: null,
          args: ['--evidence-zip', ".danbi/electron-release/returned/fresh-windows-evidence.zip\n--bad"],
          ready: true,
          run: false,
          result: null,
        },
        failures: [],
      },
    });
    const rootArg = rootDir.replace(/\\/g, '/');

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.checks.evidenceImport).toMatchObject({
      finalGateReady: true,
      finalGateCommand: null,
      finalGateArgs: [],
      awaitingFinalGate: true,
    });
    expect(status.remainingActions.join('\n')).toContain(
      `npm --prefix ${rootArg} run electron:release:final-gate -- --evidence-zip .danbi/electron-release/returned/fresh-windows-evidence.zip --evidence-zip-sha256 .danbi/electron-release/returned/fresh-windows-evidence.zip.sha256 --evidence-report .danbi/electron-release/returned/fresh-windows-evidence.zip.report.json`,
    );
    expect(status.remainingActions.join('\n')).not.toContain('--bad');
  });

  it('does not point to final gate when imported evidence report marks final-gate inputs not ready', async () => {
    const rootDir = await makeFixtureRoot({
      evidenceImport: {
        status: 'passed',
        importStatus: 'passed',
        imported: {
          zipPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
          sha256Path: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
          reportPath: null,
          bytes: 12345,
          sha256: 'e'.repeat(64),
        },
        archiveVerification: {
          status: 'passed',
          missingFiles: [],
          unexpectedEntries: [],
        },
        packageReportVerification: {
          status: 'not-provided',
        },
        copyVerification: {
          status: 'passed',
        },
        finalGate: {
          ready: false,
          command: null,
          args: [],
          run: false,
          result: null,
        },
        failures: [],
      },
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.checks.evidenceImport).toMatchObject({
      status: 'passed',
      importStatus: 'passed',
      finalGateReady: false,
      finalGateCommand: null,
      awaitingFinalGate: false,
    });
    expect(status.remainingActions.join('\n')).not.toContain('approve the imported fresh Windows evidence');
  });

  it('summarizes returned evidence import package report failed checks', async () => {
    const rootDir = await makeFixtureRoot({
      evidenceImport: {
        status: 'failed',
        importStatus: 'passed',
        imported: {
          zipPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
          sha256Path: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
          bytes: 12345,
          sha256: 'f'.repeat(64),
        },
        archiveVerification: {
          status: 'passed',
          missingFiles: [],
          unexpectedEntries: [],
        },
        packageReportVerification: {
          status: 'failed',
          checks: {
            reportPresent: true,
            zipEntryInspectionMatchesArchive: false,
            summaryFingerprintMatchesArchive: true,
          },
        },
        copyVerification: {
          status: 'not-run',
        },
        finalGate: {
          run: false,
          result: null,
        },
        failures: [
          'Fresh Windows evidence package report verification failed: zipEntryInspectionMatchesArchive.',
        ],
      },
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('evidence-import');
    expect(status.checks.evidenceImport).toMatchObject({
      status: 'failed',
      importStatus: 'passed',
      packageReportStatus: 'failed',
      packageReportChecks: {
        reportPresent: true,
        zipEntryInspectionMatchesArchive: false,
        summaryFingerprintMatchesArchive: true,
      },
      packageReportFailedChecks: ['zipEntryInspectionMatchesArchive'],
      failureCount: 1,
    });
    expect(status.remainingActions.join('\n')).toContain('re-import a valid returned ZIP');
  });

  it('separates a failed returned evidence import from plain fresh Windows evidence waiting', async () => {
    const rootDir = await makeFixtureRoot({
      evidenceImport: {
        status: 'failed',
        importStatus: 'failed',
        imported: {
          zipPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
          sha256Path: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
          bytes: null,
          sha256: null,
        },
        archiveVerification: {
          status: 'not-run',
          missingFiles: [],
          unexpectedEntries: [],
        },
        copyVerification: {
          status: 'not-run',
        },
        finalGate: {
          run: false,
          result: null,
        },
        failures: [
          'Fresh Windows evidence ZIP SHA-256 mismatch: expected bad, got good.',
        ],
      },
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.releaseApproved).toBe(false);
    expect(status.blockerCategory).toBe('evidence-import');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.evidenceImport).toMatchObject({
      status: 'failed',
      importStatus: 'failed',
      archiveVerificationStatus: 'not-run',
      copyVerificationStatus: 'not-run',
      finalGateRun: false,
      finalGateStatus: null,
      failureCount: 1,
    });
    expect(status.remainingActions.join('\n')).toContain('re-import a valid returned ZIP');
  });

  it('keeps a failed evidence import as blocker even when copy verification passed', async () => {
    const rootDir = await makeFixtureRoot({
      finalGateStatus: 'passed',
      freshWindowsStatus: 'passed',
      finalFailures: [],
      evidenceImport: {
        status: 'failed',
        importStatus: 'passed',
        imported: {
          zipPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
          sha256Path: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
          bytes: 12345,
          sha256: 'b'.repeat(64),
        },
        archiveVerification: {
          status: 'passed',
          missingFiles: [],
          unexpectedEntries: [],
        },
        copyVerification: {
          status: 'passed',
        },
        finalGate: {
          run: true,
          result: { status: 'failed' },
        },
        failures: [
          'Final release gate did not pass: failed.',
        ],
      },
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.releaseApproved).toBe(false);
    expect(status.blockerCategory).toBe('evidence-import');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.finalGate.status).toBe('passed');
    expect(status.checks.evidenceImport).toMatchObject({
      status: 'failed',
      importStatus: 'passed',
      archiveVerificationStatus: 'passed',
      copyVerificationStatus: 'passed',
      finalGateRun: true,
      finalGateStatus: 'failed',
      failureCount: 1,
    });
    expect(status.remainingActions.join('\n')).toContain('re-import a valid returned ZIP');
  });

  it('keeps an archive verification failure as an evidence import blocker', async () => {
    const rootDir = await makeFixtureRoot({
      finalGateStatus: 'passed',
      freshWindowsStatus: 'passed',
      finalFailures: [],
      evidenceImport: {
        status: 'passed',
        importStatus: 'passed',
        imported: {
          zipPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
          sha256Path: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
          bytes: 12345,
          sha256: 'c'.repeat(64),
        },
        archiveVerification: {
          status: 'failed',
          zipEntryInspectionStatus: 'passed',
          archiveDirectories: ['nested'],
          missingFiles: ['fresh-windows-result.json'],
          unexpectedEntries: ['nested/'],
          unsafeEntries: ['../escape.txt'],
          duplicateEntries: ['fresh-windows-gui-session.json'],
        },
        copyVerification: {
          status: 'passed',
        },
        finalGate: {
          run: false,
          result: null,
        },
        failures: [],
      },
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.releaseApproved).toBe(false);
    expect(status.blockerCategory).toBe('evidence-import');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.evidenceImport).toMatchObject({
      status: 'passed',
      importStatus: 'passed',
      archiveVerificationStatus: 'failed',
      archiveZipEntryInspectionStatus: 'passed',
      archiveDirectories: ['nested'],
      archiveMissingFiles: ['fresh-windows-result.json'],
      archiveUnexpectedEntries: ['nested/'],
      archiveUnsafeEntries: ['../escape.txt'],
      archiveDuplicateEntries: ['fresh-windows-gui-session.json'],
      copyVerificationStatus: 'passed',
      finalGateRun: false,
      finalGateStatus: null,
      failureCount: 0,
    });
    expect(status.remainingActions.join('\n')).toContain('re-import a valid returned ZIP');
  });

  it('summarizes final-gate evidence package ZIP entry preflight failures', async () => {
    const rootDir = await makeFixtureRoot({
      evidencePackageEvidence: {
        status: 'failed',
        zipPath: 'returned/fresh-windows-evidence.zip',
        sha256Path: 'returned/fresh-windows-evidence.zip.sha256',
        bytes: 12345,
        sha256: 'a'.repeat(64),
        sidecarFileName: 'fresh-windows-evidence.zip.sha256',
        sidecarBytes: 88,
        sidecarFileSha256: 'b'.repeat(64),
        packageReportBytes: 2048,
        packageReportSha256: 'c'.repeat(64),
        zipEntryInspectionStatus: 'passed',
        archiveDirectories: ['tools'],
        missingFiles: ['fresh-windows-result.json'],
        unexpectedEntries: ['tools/extra-script.ps1'],
        unsafeEntries: ['../escape.txt'],
        duplicateEntries: ['fresh-windows-basic-smoke.json'],
        packageReportVerification: {
          status: 'failed',
          checks: {
            reportPresent: true,
            zipEntryInspectionMatchesArchive: false,
            summaryFingerprintMatchesArchive: true,
          },
        },
      },
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('evidence-package');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.evidencePackage).toMatchObject({
      status: 'failed',
      bytes: 12345,
      sha256: 'a'.repeat(64),
      sidecarFileName: 'fresh-windows-evidence.zip.sha256',
      sidecarBytes: 88,
      sidecarFileSha256: 'b'.repeat(64),
      packageReportBytes: 2048,
      packageReportSha256: 'c'.repeat(64),
      zipEntryInspectionStatus: 'passed',
      archiveDirectories: ['tools'],
      archiveMissingFiles: ['fresh-windows-result.json'],
      archiveUnexpectedEntries: ['tools/extra-script.ps1'],
      archiveUnsafeEntries: ['../escape.txt'],
      archiveDuplicateEntries: ['fresh-windows-basic-smoke.json'],
      packageReportStatus: 'failed',
      packageReportChecks: {
        reportPresent: true,
        zipEntryInspectionMatchesArchive: false,
        summaryFingerprintMatchesArchive: true,
      },
      packageReportFailedChecks: ['zipEntryInspectionMatchesArchive'],
    });
    expect(status.remainingActions.join('\n')).toContain('Fix the failed fresh Windows evidence package');
  });

  it('does not report external-only waiting when acceptance is older than the latest full verification', async () => {
    const rootDir = await makeFixtureRoot({
      acceptanceGeneratedAt: '2026-06-16T12:05:00.000Z',
      acceptanceVerificationEndedAt: '2026-06-16T12:04:00.000Z',
      fullVerificationEndedAt: '2026-06-16T12:10:00.000Z',
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('release-acceptance');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.releaseAcceptance).toMatchObject({
      status: 'passed',
      freshnessStatus: 'stale',
      latestFullVerificationEndedAt: '2026-06-16T12:10:00.000Z',
    });
    expect(status.remainingActions.join('\n')).toContain('electron:release:acceptance');
    expect(status.warnings.join('\n')).toContain('Release acceptance is stale');
  });

  it('does not report external-only waiting when acceptance installer naming is stale', async () => {
    const rootDir = await makeFixtureRoot({
      acceptanceExpectedInstallerName: 'Danbi Studio-0.1.0-win-x64.exe',
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('release-acceptance');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.releaseAcceptance).toMatchObject({
      status: 'passed',
      freshnessStatus: 'current',
      expectedInstallerName: 'Danbi Studio-0.1.0-win-x64.exe',
      currentExpectedInstallerName: 'Danbi-Studio-0.1.0-win-x64.exe',
      installerNamingStatus: 'stale',
    });
    expect(status.checks.releaseAcceptance.installerNamingFailures.join('\n')).toContain('installer name is stale');
    expect(status.remainingActions.join('\n')).toContain('Rebuild the Electron installer with the current artifact naming rule');
    expect(status.warnings.join('\n')).toContain('Release acceptance installer naming is not usable');
  });

  it('separates current installer artifacts from stale acceptance naming evidence', async () => {
    const rootDir = await makeFixtureRoot({
      acceptanceExpectedInstallerName: 'Danbi Studio-0.1.0-win-x64.exe',
      writeCurrentInstallerArtifacts: true,
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.checks.installerArtifacts).toMatchObject({
      status: 'passed',
      expectedInstallerName: 'Danbi-Studio-0.1.0-win-x64.exe',
      installer: {
        status: 'present',
        path: 'release/electron/Danbi-Studio-0.1.0-win-x64.exe',
      },
      blockmap: {
        status: 'present',
        path: 'release/electron/Danbi-Studio-0.1.0-win-x64.exe.blockmap',
      },
      latestYml: {
        hasInstallerReference: true,
        installerSizeCheckStatus: 'passed',
        releaseDateFreshnessStatus: 'passed',
      },
    });
    expect(status.checks.releaseAcceptance.installerNamingStatus).toBe('stale');
    expect(status.remainingActions.join('\n')).toContain('Rerun npm run electron:release:verify');
    expect(status.remainingActions.join('\n')).not.toContain('Rebuild the Electron installer');
  });

  it('reports current installer artifacts as newer than full verification', async () => {
    const rootDir = await makeFixtureRoot({
      acceptanceExpectedInstallerName: 'Danbi Studio-0.1.0-win-x64.exe',
      writeCurrentInstallerArtifacts: true,
      currentInstallerReleaseDate: '2026-06-16T12:04:30.000Z',
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.checks.installerArtifacts).toMatchObject({
      status: 'stale-verification',
      latestYml: {
        releaseDate: '2026-06-16T12:04:30.000Z',
        fullVerificationEndedAt: '2026-06-16T12:03:00.000Z',
        releaseDateFreshnessStatus: 'stale-verification',
      },
    });
    expect(status.checks.installerArtifacts.failures.join('\n')).toContain('newer than the full release verification report');
    expect(status.remainingActions.join('\n')).toContain('Rerun npm run electron:release:verify');
    expect(status.warnings.join('\n')).toContain('installer artifacts are newer than the full release verification report');
  });

  it('does not report external-only waiting when the core verification report is missing required gates', async () => {
    const rootDir = await makeFixtureRoot({
      omitCoreGateIds: ['plugin-signing-custody-audit'],
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('core-verification');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.coreVerification).toMatchObject({
      status: 'passed',
      profile: 'core',
      requiredGateCount: 8,
      resultCount: 7,
      missingGateIds: ['plugin-signing-custody-audit'],
      validationFailures: [
        'Core release verification is missing required gate(s): plugin-signing-custody-audit.',
      ],
    });
    expect(status.remainingActions.join('\n')).toContain('electron:release:verify:core');
    expect(status.warnings.join('\n')).toContain('Core release verification is not usable for approval');
  });

  it('does not report external-only waiting when the latest verification report is not a full profile', async () => {
    const rootDir = await makeFixtureRoot({
      fullVerificationProfile: 'core',
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('full-verification');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.fullVerification).toMatchObject({
      status: 'passed',
      profile: 'core',
      validationFailures: [
        'Full release verification profile must be full, got core.',
      ],
    });
    expect(status.remainingActions.join('\n')).toContain('electron:release:verify');
    expect(status.warnings.join('\n')).toContain('Full release verification is not usable for approval');
  });

  it('does not report external-only waiting when the full verification report is missing required gates', async () => {
    const rootDir = await makeFixtureRoot({
      omitFullGateIds: ['electron-install-smoke'],
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('full-verification');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.fullVerification).toMatchObject({
      status: 'passed',
      profile: 'full',
      requiredGateCount: 17,
      resultCount: 16,
      missingGateIds: ['electron-install-smoke'],
      validationFailures: [
        'Full release verification is missing required gate(s): electron-install-smoke.',
      ],
    });
    expect(status.remainingActions.join('\n')).toContain('electron:release:verify');
  });

  it('does not report external-only waiting when acceptance freshness is unknown', async () => {
    const rootDir = await makeFixtureRoot({
      omitAcceptanceFreshness: true,
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('release-acceptance');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.releaseAcceptance).toMatchObject({
      status: 'passed',
      freshnessStatus: 'unknown',
    });
    expect(status.remainingActions.join('\n')).toContain('electron:release:acceptance');
    expect(status.warnings.join('\n')).toContain('Release acceptance freshness is unknown');
  });

  it('requires a current QA handoff package before calling the blocker external-only', async () => {
    const rootDir = await makeFixtureRoot({
      skipHandoffPackage: true,
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('handoff-package');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.handoffPackage).toMatchObject({
      status: 'missing',
      sidecarStatus: 'missing',
    });
    expect(status.remainingActions.join('\n')).toContain('package-handoff-for-qa.ps1');
  });

  it('requires regenerating the QA handoff when freshness is unknown', async () => {
    const rootDir = await makeFixtureRoot({
      omitHandoffFreshness: true,
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('handoff-package');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.handoffPackage).toMatchObject({
      status: 'unknown',
      manifestStatus: 'passed',
      freshnessStatus: 'unknown',
      sidecarStatus: 'present',
    });
    expect(status.checks.handoffPackage.failures.join('\n')).toContain('freshness is unknown');
    expect(status.remainingActions.join('\n')).toContain('package-handoff-for-qa.ps1');
  });

  it('requires repackaging when the QA handoff ZIP report does not match the current handoff files', async () => {
    const rootDir = await makeFixtureRoot({
      packageReportManifestSha256: '0'.repeat(64),
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('handoff-package');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.handoffPackage).toMatchObject({
      status: 'stale',
      manifestStatus: 'passed',
      freshnessStatus: 'current',
      sidecarStatus: 'present',
      packageReportStatus: 'stale',
    });
    expect(status.checks.handoffPackage.failures.join('\n')).toContain('handoff-manifest.json SHA-256 does not match the current handoff manifest');
    expect(status.remainingActions.join('\n')).toContain('package-handoff-for-qa.ps1');
  });

  it('requires repackaging when the QA handoff ZIP report entry inspection does not match the archive', async () => {
    const rootDir = await makeFixtureRoot({
      packageReportZipEntryInspection: {
        status: 'passed',
        entries: ['handoff-manifest.json'],
        files: ['handoff-manifest.json'],
        directories: [],
        unsafeEntries: [],
        duplicateEntries: [],
        unexpectedEntries: [],
        missingFiles: [],
      },
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('handoff-package');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.handoffPackage).toMatchObject({
      status: 'invalid',
      zipEntryInspectionStatus: 'passed',
      archiveMissingFiles: [],
      archiveUnexpectedEntries: [],
      archiveUnsafeEntries: [],
      archiveDuplicateEntries: [],
      packageReportStatus: 'failed',
      packageReportChecks: {
        reportPresent: true,
        zipEntryInspectionMatchesArchive: false,
      },
      packageReportFailedChecks: ['zipEntryInspectionMatchesArchive'],
    });
    expect(status.checks.handoffPackage.failures.join('\n')).toContain('ZIP entry inspection does not match the current archive');
    expect(status.remainingActions.join('\n')).toContain('package-handoff-for-qa.ps1');
  });

  it('requires repackaging when the QA handoff ZIP is missing SHA256SUMS.txt inside the archive', async () => {
    const rootDir = await makeFixtureRoot({
      omitHandoffPackageChecksumFile: true,
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('handoff-package');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.handoffPackage).toMatchObject({
      status: 'invalid',
      zipEntryInspectionStatus: 'passed',
      archiveMissingFiles: ['SHA256SUMS.txt'],
      archiveUnexpectedEntries: [],
      archiveUnsafeEntries: [],
      archiveDuplicateEntries: [],
      packageReportStatus: 'failed',
      packageReportChecks: {
        reportPresent: true,
        zipEntryInspectionMatchesArchive: false,
      },
      packageReportFailedChecks: ['zipEntryInspectionMatchesArchive'],
    });
    expect(status.checks.handoffPackage.failures.join('\n')).toContain('QA handoff ZIP is missing required files: SHA256SUMS.txt');
    expect(status.remainingActions.join('\n')).toContain('package-handoff-for-qa.ps1');
  });

  it('requires repackaging when the QA handoff ZIP contains a backslash entry path', async () => {
    const rootDir = await makeFixtureRoot();
    await appendHandoffPackageZipEntry(rootDir, 'danbi-studio-0.1.0-fresh-windows-handoff.zip', 'tools\\escape.ps1');

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('handoff-package');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.handoffPackage).toMatchObject({
      status: 'invalid',
      zipEntryInspectionStatus: 'passed',
      archiveUnsafeEntries: ['tools/escape.ps1'],
    });
    expect(status.checks.handoffPackage.failures.join('\n')).toContain('QA handoff ZIP contains unsafe entries: tools/escape.ps1');
    expect(status.remainingActions.join('\n')).toContain('package-handoff-for-qa.ps1');
  });

  it('requires repackaging when the QA handoff checksum file contains a backslash package path', async () => {
    const rootDir = await makeFixtureRoot();
    const checksumPath = join(rootDir, '.danbi/electron-release/handoff/SHA256SUMS.txt');
    const checksumText = await readFile(checksumPath, 'utf8');
    await writeFile(checksumPath, `${checksumText}${'a'.repeat(64)}  tools\\escape.ps1\n`, 'utf8');

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('handoff-package');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.handoffPackage).toMatchObject({
      status: 'stale',
      zipEntryInspectionStatus: 'passed',
    });
    expect(status.checks.handoffPackage.failures.join('\n')).toContain(
      'QA handoff checksum file contains unsafe package path: tools\\escape.ps1',
    );
    expect(status.remainingActions.join('\n')).toContain('package-handoff-for-qa.ps1');
  });

  it('requires regenerating a stale QA handoff package after acceptance changes', async () => {
    const rootDir = await makeFixtureRoot({
      acceptanceGeneratedAt: '2026-06-16T12:20:00.000Z',
      handoffAcceptanceGeneratedAt: '2026-06-16T12:04:00.000Z',
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('handoff-package');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.handoffPackage).toMatchObject({
      status: 'stale',
      manifestStatus: 'passed',
      freshnessStatus: 'stale',
      sidecarStatus: 'present',
    });
    expect(status.checks.handoffPackage.failures.join('\n')).toContain('older release acceptance report');
    expect(status.remainingActions.join('\n')).toContain('package-handoff-for-qa.ps1');
    expect(status.warnings.join('\n')).toContain('QA handoff package is stale');
  });

  it('reports approved when final release gate passed', async () => {
    const rootDir = await makeFixtureRoot({ finalGateStatus: 'passed', freshWindowsStatus: 'passed', finalFailures: [] });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('approved');
    expect(status.releaseApproved).toBe(true);
    expect(status.blockerCategory).toBeNull();
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.finalGate).toMatchObject({
      status: 'passed',
      freshnessStatus: 'current',
    });
    expect(status.remainingActions).toEqual([]);
  });

  it('does not approve a passed final gate when the core verification report is missing required gates', async () => {
    const rootDir = await makeFixtureRoot({
      finalGateStatus: 'passed',
      freshWindowsStatus: 'passed',
      finalFailures: [],
      omitCoreGateIds: ['plugin-signing-custody-audit'],
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.releaseApproved).toBe(false);
    expect(status.blockerCategory).toBe('core-verification');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.finalGate.status).toBe('passed');
    expect(status.checks.freshWindows.status).toBe('passed');
    expect(status.checks.coreVerification).toMatchObject({
      status: 'passed',
      profile: 'core',
      missingGateIds: ['plugin-signing-custody-audit'],
      validationFailures: [
        'Core release verification is missing required gate(s): plugin-signing-custody-audit.',
      ],
    });
    expect(status.remainingActions.join('\n')).toContain('electron:release:verify:core');
  });

  it('surfaces legacy ZIP-only evidence as an audit warning without blocking an explicitly approved gate', async () => {
    const rootDir = await makeFixtureRoot({
      finalGateStatus: 'passed',
      freshWindowsStatus: 'passed',
      finalFailures: [],
      evidencePackageEvidence: {
        status: 'passed',
        packageReportVerification: {
          status: 'not-provided',
        },
      },
      evidenceImport: {
        status: 'passed',
        importStatus: 'passed',
        imported: {
          zipPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
          sha256Path: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
          reportPath: null,
          bytes: 12345,
          sha256: 'd'.repeat(64),
        },
        archiveVerification: {
          status: 'passed',
          missingFiles: [],
          unexpectedEntries: [],
        },
        packageReportVerification: {
          status: 'not-provided',
        },
        copyVerification: {
          status: 'passed',
        },
        finalGate: {
          run: true,
          result: { status: 'passed' },
        },
        failures: [],
      },
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('approved');
    expect(status.releaseApproved).toBe(true);
    expect(status.checks.evidencePackage).toMatchObject({
      status: 'passed',
      packageReportStatus: 'not-provided',
      legacyMissingReport: true,
    });
    expect(status.checks.evidenceImport).toMatchObject({
      status: 'passed',
      packageReportStatus: 'not-provided',
      importedReportPath: null,
      legacyMissingReport: true,
    });
    expect(status.warnings.join('\n')).toContain('legacy ZIP-only');
    expect(status.warnings.join('\n')).toContain('fresh-windows-evidence.zip.report.json');
  });

  it('fails strict approval policy when approved evidence used legacy ZIP-only mode', async () => {
    const rootDir = await makeFixtureRoot({
      finalGateStatus: 'passed',
      freshWindowsStatus: 'passed',
      finalFailures: [],
      evidencePackageEvidence: {
        status: 'passed',
        packageReportVerification: {
          status: 'not-provided',
        },
      },
      evidenceImport: {
        status: 'passed',
        importStatus: 'passed',
        imported: {
          zipPath: '.danbi/electron-release/returned/fresh-windows-evidence.zip',
          sha256Path: '.danbi/electron-release/returned/fresh-windows-evidence.zip.sha256',
          reportPath: null,
          bytes: 12345,
          sha256: 'd'.repeat(64),
        },
        archiveVerification: {
          status: 'passed',
          missingFiles: [],
          unexpectedEntries: [],
        },
        packageReportVerification: {
          status: 'not-provided',
        },
        copyVerification: {
          status: 'passed',
        },
        finalGate: {
          run: true,
          result: { status: 'passed' },
        },
        failures: [],
      },
    });

    const status = buildElectronReleaseStatus({
      rootDir,
      strict: true,
      gitStatusText: '',
    });

    expect(status.status).toBe('approved');
    expect(status.releaseApproved).toBe(true);
    expect(status.approvalPolicy).toMatchObject({
      strict: true,
      requireClean: false,
      passed: false,
      failures: [
        'Strict release approval requires fresh-windows-evidence.zip.report.json; evidence import used legacy ZIP-only mode.',
        'Strict release approval requires fresh-windows-evidence.zip.report.json; final gate accepted legacy ZIP-only evidence.',
      ],
    });
  });

  it('does not approve a stale passed final gate when latest full verification failed', async () => {
    const rootDir = await makeFixtureRoot({
      finalGateStatus: 'passed',
      freshWindowsStatus: 'passed',
      finalFailures: [],
      fullVerificationStatus: 'failed',
      finalGateFullVerificationStatus: 'passed',
      fullFailedGateIds: ['electron-gui-smoke'],
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.releaseApproved).toBe(false);
    expect(status.blockerCategory).toBe('full-verification');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.finalGate.status).toBe('passed');
    expect(status.checks.fullVerification).toMatchObject({
      status: 'failed',
      finalGateEvidenceStatus: 'passed',
    });
    expect(status.remainingActions.join('\n')).toContain('electron:release:verify');
  });

  it('does not approve a stale passed final gate when latest acceptance failed', async () => {
    const rootDir = await makeFixtureRoot({
      finalGateStatus: 'passed',
      freshWindowsStatus: 'passed',
      finalFailures: [],
      acceptanceStatus: 'failed',
      finalGateAcceptanceStatus: 'passed',
      acceptanceFailures: ['Release acceptance installer checksum mismatch.'],
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.releaseApproved).toBe(false);
    expect(status.blockerCategory).toBe('release-acceptance');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.finalGate.status).toBe('passed');
    expect(status.checks.releaseAcceptance).toMatchObject({
      status: 'failed',
      verificationStatus: 'passed',
      failureCount: 1,
      freshnessStatus: 'not-passed',
    });
    expect(status.remainingActions.join('\n')).toContain('electron:release:acceptance');
  });

  it('does not approve a passed final gate when the QA handoff package is stale', async () => {
    const rootDir = await makeFixtureRoot({
      finalGateStatus: 'passed',
      freshWindowsStatus: 'passed',
      finalFailures: [],
      acceptanceGeneratedAt: '2026-06-16T12:20:00.000Z',
      handoffAcceptanceGeneratedAt: '2026-06-16T12:04:00.000Z',
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.releaseApproved).toBe(false);
    expect(status.blockerCategory).toBe('handoff-package');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.finalGate.status).toBe('passed');
    expect(status.checks.freshWindows.status).toBe('passed');
    expect(status.checks.handoffPackage).toMatchObject({
      status: 'stale',
      freshnessStatus: 'stale',
    });
    expect(status.remainingActions.join('\n')).toContain('package-handoff-for-qa.ps1');
  });

  it('does not approve a stale passed final gate generated before the current handoff', async () => {
    const rootDir = await makeFixtureRoot({
      finalGateStatus: 'passed',
      freshWindowsStatus: 'passed',
      finalFailures: [],
      finalGateGeneratedAt: '2026-06-16T12:04:30.000Z',
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.releaseApproved).toBe(false);
    expect(status.blockerCategory).toBe('final-gate');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.finalGate).toMatchObject({
      status: 'passed',
      generatedAt: '2026-06-16T12:04:30.000Z',
      freshnessStatus: 'stale',
    });
    expect(status.remainingActions.join('\n')).toContain('electron:release:final-gate');
    expect(status.warnings.join('\n')).toContain('Final release gate is stale');
  });

  it('treats a failed final gate generated before the current handoff as stale instead of external-only waiting', async () => {
    const rootDir = await makeFixtureRoot({
      finalGateGeneratedAt: '2026-06-16T12:04:30.000Z',
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.releaseApproved).toBe(false);
    expect(status.blockerCategory).toBe('final-gate');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.checks.finalGate).toMatchObject({
      status: 'failed',
      generatedAt: '2026-06-16T12:04:30.000Z',
      freshnessStatus: 'stale',
    });
    expect(status.remainingActions.join('\n')).toContain('electron:release:final-gate');
    expect(status.warnings.join('\n')).toContain('Final release gate is stale');
  });

  it('points back to full verification when the full verification gate has not passed', async () => {
    const rootDir = await makeFixtureRoot({
      fullVerificationStatus: 'failed',
      fullFailedGateIds: ['electron-gui-smoke'],
    });

    const status = buildElectronReleaseStatus({ rootDir });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('full-verification');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.remainingActions.join('\n')).toContain('electron:release:verify');
  });

  it('includes dirty workspace freshness warnings and changed file samples', async () => {
    const rootDir = await makeFixtureRoot();

    const status = buildElectronReleaseStatus({
      rootDir,
      gitStatusText: [
        ' M package.json',
        '?? scripts/electron-release-status.mjs',
        '?? docs/release-note.md',
      ].join('\n'),
    });

    expect(status.workspace).toMatchObject({
      status: 'dirty',
      dirty: true,
      changedCount: 3,
      releaseRelevantChangedCount: 2,
      source: 'provided',
    });
    expect(status.workspace.changedFiles).toEqual([
      { status: ' M', path: 'package.json', releaseRelevant: true },
      { status: '??', path: 'scripts/electron-release-status.mjs', releaseRelevant: true },
      { status: '??', path: 'docs/release-note.md', releaseRelevant: false },
    ]);
    expect(status.warnings.join('\n')).toContain('uncommitted or untracked change');
    expect(status.warnings.join('\n')).toContain('run checks only for changed or affected paths');
    expect(status.warnings.join('\n')).toContain(`Before final approval on the frozen release tree, run npm --prefix ${rootDir.replace(/\\/g, '/')} run electron:release:verify and npm --prefix ${rootDir.replace(/\\/g, '/')} run electron:release:final-gate`);
  });

  it('does not call fresh Windows evidence external-only when release-relevant workspace changes exist', async () => {
    const rootDir = await makeFixtureRoot();
    const rootArg = rootDir.replace(/\\/g, '/');

    const status = buildElectronReleaseStatus({
      rootDir,
      gitStatusText: [
        ' M src/lib/editor/timeline.ts',
        '?? docs/release-note.md',
      ].join('\n'),
    });

    expect(status.status).toBe('incomplete');
    expect(status.blockerCategory).toBe('fresh-windows-evidence');
    expect(status.externalFreshWindowsEvidenceOnly).toBe(false);
    expect(status.freshWindowsHandoffReadiness).toMatchObject({
      status: 'ready',
      externalEvidenceRequired: true,
      dirtyWorkspaceBlocksApproval: true,
      workspaceReleaseRelevantChangedCount: 1,
      handoffPackage: {
        status: 'ready',
        packageFileName: 'danbi-studio-0.1.0-fresh-windows-handoff.zip',
        filesToSendRequiredCount: 3,
        filesToSendReadyCount: 3,
        filesToSendAllReady: true,
        filesToSend: [
          {
            role: 'handoff-zip',
            required: true,
            status: 'present',
            ready: true,
            path: '.danbi/electron-release/danbi-studio-0.1.0-fresh-windows-handoff.zip',
            fileName: 'danbi-studio-0.1.0-fresh-windows-handoff.zip',
          },
          {
            role: 'handoff-zip-sha256',
            required: true,
            status: 'present',
            ready: true,
            path: '.danbi/electron-release/danbi-studio-0.1.0-fresh-windows-handoff.zip.sha256',
            fileName: 'danbi-studio-0.1.0-fresh-windows-handoff.zip.sha256',
          },
          {
            role: 'handoff-package-report',
            required: true,
            status: 'passed',
            ready: true,
            path: '.danbi/electron-release/danbi-studio-0.1.0-fresh-windows-handoff.zip.report.json',
            fileName: 'danbi-studio-0.1.0-fresh-windows-handoff.zip.report.json',
          },
        ],
      },
      commands: {
        qaAcceptance: '.\\run-fresh-windows-acceptance.ps1 -Tester "<name>" -WaitTimeoutSeconds 600',
        fullVerification: `npm --prefix ${rootArg} run electron:release:verify`,
        releaseAcceptance: `npm --prefix ${rootArg} run electron:release:acceptance`,
        handoff: `npm --prefix ${rootArg} run electron:release:handoff`,
      },
      commandArgs: {
        qaAcceptance: [
          '.\\run-fresh-windows-acceptance.ps1',
          '-Tester',
          '<name>',
          '-WaitTimeoutSeconds',
          '600',
        ],
        fullVerification: [
          'npm',
          '--prefix',
          rootArg,
          'run',
          'electron:release:verify',
        ],
      },
      expectedReturnedEvidence: {
        report: 'fresh-windows-evidence.zip.report.json',
        filesToReturn: [
          {
            role: 'fresh-windows-evidence-zip',
            required: true,
            fileName: 'fresh-windows-evidence.zip',
          },
          {
            role: 'fresh-windows-evidence-zip-sha256',
            required: true,
            fileName: 'fresh-windows-evidence.zip.sha256',
          },
          {
            role: 'fresh-windows-evidence-package-report',
            required: true,
            fileName: 'fresh-windows-evidence.zip.report.json',
          },
        ],
      },
      blockers: [],
    });
    expect(status.workspace.releaseRelevantChangedCount).toBe(1);
    expect(status.remainingActions.join('\n')).toContain('Complete the fresh Windows handoff evidence files');
    expect(status.remainingActions.join('\n')).toContain('danbi-studio-0.1.0-fresh-windows-handoff.zip');
    expect(status.remainingActions.join('\n')).toContain('run-fresh-windows-acceptance.ps1');
    expect(status.remainingActions.join('\n')).toContain('Do not send the existing handoff ZIP as final QA evidence');
    expect(status.remainingActions.join('\n')).toContain(`run npm --prefix ${rootArg} run electron:release:verify`);
    expect(status.remainingActions.join('\n')).toContain(`then npm --prefix ${rootArg} run electron:release:acceptance`);
    expect(status.remainingActions.join('\n')).toContain(`then npm --prefix ${rootArg} run electron:release:handoff`);
    expect(status.remainingActions.join('\n')).toContain('package-handoff-for-qa.ps1');
    expect(status.remainingActions.join('\n')).toContain('Release-relevant workspace changes are present');
    expect(status.remainingActions.join('\n')).toContain('run affected checks for those changes now');
    expect(status.remainingActions.join('\n')).toContain(`after source freeze run npm --prefix ${rootArg} run electron:release:verify and npm --prefix ${rootArg} run electron:release:final-gate before approval`);
    expect(status.warnings.join('\n')).toContain('run checks only for changed or affected paths');
  });

  it('can enforce strict approved status and clean workspace policy independently', async () => {
    const waitingRootDir = await makeFixtureRoot();

    const waitingStatus = buildElectronReleaseStatus({
      rootDir: waitingRootDir,
      strict: true,
      requireClean: true,
      gitStatusText: '?? docs/release-note.md',
    });

    expect(waitingStatus.approvalPolicy).toMatchObject({
      strict: true,
      requireClean: true,
      passed: false,
      failures: [
        'Release status must be approved, got waiting-for-fresh-windows-evidence.',
        'Workspace must be clean for release approval, got dirty.',
      ],
    });

    const approvedRootDir = await makeFixtureRoot({ finalGateStatus: 'passed', freshWindowsStatus: 'passed', finalFailures: [] });
    const approvedStatus = buildElectronReleaseStatus({
      rootDir: approvedRootDir,
      strict: true,
      requireClean: true,
      gitStatusText: '',
    });

    expect(approvedStatus.approvalPolicy).toMatchObject({
      strict: true,
      requireClean: true,
      passed: true,
      failures: [],
    });
  });
});

async function makeFixtureRoot(options: {
  finalGateStatus?: string;
  freshWindowsStatus?: string;
  finalGateGeneratedAt?: string;
  finalFailures?: string[];
  coreVerificationStatus?: string;
  coreVerificationProfile?: string;
  omitCoreGateIds?: string[];
  coreFailedGateIds?: string[];
  fullVerificationStatus?: string;
  finalGateFullVerificationStatus?: string;
  fullVerificationProfile?: string;
  omitFullGateIds?: string[];
  finalGateFullVerificationEndedAt?: string;
  acceptanceStatus?: string;
  finalGateAcceptanceStatus?: string;
  acceptanceFailures?: string[];
  fullVerificationEndedAt?: string;
  acceptanceGeneratedAt?: string;
  acceptanceVerificationEndedAt?: string;
  acceptanceExpectedInstallerName?: string;
  acceptanceInstallerPath?: string;
  acceptanceInstallerBlockmapPath?: string;
  acceptanceLatestYmlExpectedInstallerName?: string;
  handoffAcceptanceGeneratedAt?: string;
  omitAcceptanceFreshness?: boolean;
  omitHandoffFreshness?: boolean;
  skipHandoffPackage?: boolean;
  skipHandoffPackageReport?: boolean;
  omitHandoffPackageChecksumFile?: boolean;
  packageReportManifestSha256?: string;
  packageReportChecksumSha256?: string;
  packageReportZipEntryInspection?: Record<string, unknown>;
  fullFailedGateIds?: string[];
  evidencePackageEvidence?: Record<string, unknown>;
  evidenceImport?: Record<string, unknown>;
  writeCurrentInstallerArtifacts?: boolean;
  currentInstallerReleaseDate?: string;
  tempRootPrefix?: string;
} = {}): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), options.tempRootPrefix ?? 'danbi-release-status-'));
  tempRoots.push(rootDir);
  const fullStatus = options.fullVerificationStatus ?? 'passed';
  const coreStatus = options.coreVerificationStatus ?? 'passed';
  const coreVerificationProfile = options.coreVerificationProfile ?? 'core';
  const coreFailedGateIds = options.coreFailedGateIds ?? [];
  const coreVerificationGateIds = requiredCoreGateIds.filter((id) => !options.omitCoreGateIds?.includes(id));
  const fullVerificationStartedAt = '2026-06-16T11:55:00.000Z';
  const fullVerificationEndedAt = options.fullVerificationEndedAt ?? '2026-06-16T12:03:00.000Z';
  const finalGateFullStatus = options.finalGateFullVerificationStatus ?? fullStatus;
  const fullVerificationProfile = options.fullVerificationProfile ?? 'full';
  const fullVerificationGateIds = requiredFullGateIds.filter((id) => !options.omitFullGateIds?.includes(id));
  const finalGateFullVerificationEndedAt = options.finalGateFullVerificationEndedAt ?? options.acceptanceVerificationEndedAt ?? fullVerificationEndedAt;
  const acceptanceStatus = options.acceptanceStatus ?? 'passed';
  const finalGateAcceptanceStatus = options.finalGateAcceptanceStatus ?? acceptanceStatus;
  const acceptanceFailures = options.acceptanceFailures ?? [];
  const acceptanceGeneratedAt = options.omitAcceptanceFreshness ? null : options.acceptanceGeneratedAt ?? '2026-06-16T12:04:00.000Z';
  const acceptanceVerificationEndedAt = options.omitAcceptanceFreshness ? null : options.acceptanceVerificationEndedAt ?? fullVerificationEndedAt;
  const acceptanceExpectedInstallerName = options.acceptanceExpectedInstallerName ?? 'Danbi-Studio-0.1.0-win-x64.exe';
  const acceptanceInstallerPath = options.acceptanceInstallerPath ?? `release/electron/${acceptanceExpectedInstallerName}`;
  const acceptanceInstallerBlockmapPath = options.acceptanceInstallerBlockmapPath ?? `${acceptanceInstallerPath}.blockmap`;
  const acceptanceLatestYmlExpectedInstallerName = options.acceptanceLatestYmlExpectedInstallerName ?? acceptanceExpectedInstallerName;
  const handoffAcceptanceGeneratedAt = options.omitHandoffFreshness ? null : options.handoffAcceptanceGeneratedAt ?? acceptanceGeneratedAt;
  const handoffGeneratedAt = options.omitHandoffFreshness ? null : '2026-06-16T12:05:00.000Z';
  const finalGateStatus = options.finalGateStatus ?? 'failed';
  const finalGateGeneratedAt = options.finalGateGeneratedAt ?? '2026-06-16T12:06:00.000Z';
  const freshWindowsStatus = options.freshWindowsStatus ?? 'failed';
  const fullFailedGateIds = options.fullFailedGateIds ?? [];
  const finalFailures = options.finalFailures ?? [
    'Fresh Windows manual acceptance detail: Missing fresh Windows manual result: E:\\fixture\\.danbi\\electron-release\\handoff\\fresh-windows-result.json',
    'Fresh Windows manual acceptance detail: Missing fresh Windows basic smoke result: E:\\fixture\\.danbi\\electron-release\\handoff\\fresh-windows-basic-smoke.json',
    'Fresh Windows manual acceptance detail: Missing fresh Windows GUI session result: E:\\fixture\\.danbi\\electron-release\\handoff\\fresh-windows-gui-session.json',
  ];

  await writeJson(rootDir, '.danbi/electron-release/release-verification-core.json', {
    kind: 'danbi.electron.release-verification',
    status: coreStatus,
    profile: coreVerificationProfile,
    passedCount: coreStatus === 'passed' ? 8 : 7,
    failedCount: coreStatus === 'passed' ? 0 : 1,
    results: coreVerificationGateIds.map((id) => ({
      id,
      status: coreFailedGateIds.includes(id) || (coreStatus !== 'passed' && id === 'unit-tests')
        ? 'failed'
        : 'passed',
    })),
  });
  await writeJson(rootDir, '.danbi/electron-release/release-verification-full.json', {
    kind: 'danbi.electron.release-verification',
    status: fullStatus,
    profile: fullVerificationProfile,
    startedAt: fullVerificationStartedAt,
    endedAt: fullVerificationEndedAt,
    passedCount: fullStatus === 'passed' ? 17 : 16,
    failedCount: fullStatus === 'passed' ? 0 : 1,
    results: fullVerificationGateIds.map((id) => ({
      id,
      status: fullFailedGateIds.includes(id) || (fullStatus !== 'passed' && id === 'electron-gui-smoke')
        ? 'failed'
        : 'passed',
    })),
  });
  await writeJson(rootDir, '.danbi/electron-release/release-acceptance.json', {
    kind: 'danbi.electron.release-acceptance',
    status: acceptanceStatus,
    generatedAt: acceptanceGeneratedAt,
    productName: 'Danbi Studio',
    version: '0.1.0',
    expectedInstallerName: acceptanceExpectedInstallerName,
    evidence: {
      verification: {
        status: fullStatus,
        profile: 'full',
        passedCount: fullStatus === 'passed' ? 17 : 16,
        endedAt: acceptanceVerificationEndedAt,
      },
      installer: {
        path: acceptanceInstallerPath,
      },
      installerBlockmap: {
        path: acceptanceInstallerBlockmapPath,
      },
      latestYml: {
        expectedInstallerName: acceptanceLatestYmlExpectedInstallerName,
      },
      renderOutputs: [{}, {}, {}, {}],
    },
    failures: acceptanceFailures,
  });
  if (options.writeCurrentInstallerArtifacts) {
    await writeCurrentInstallerArtifactFixture(rootDir, 'Danbi-Studio-0.1.0-win-x64.exe', options.currentInstallerReleaseDate);
  }
  await writeJson(rootDir, '.danbi/electron-release/final-release-gate-report.json', {
    kind: 'danbi.electron.release-final-gate',
    generatedAt: finalGateGeneratedAt,
    status: finalGateStatus,
    productName: 'Danbi Studio',
    version: '0.1.0',
    fullVerificationEvidence: {
      status: finalGateFullStatus,
      profile: 'full',
      endedAt: finalGateFullVerificationEndedAt,
      passedCount: finalGateFullStatus === 'passed' ? 17 : 16,
      failedCount: finalGateFullStatus === 'passed' ? 0 : 1,
      missingGateIds: [],
      failedGateIds: finalGateFullStatus === 'passed' ? [] : fullFailedGateIds,
    },
    releaseAcceptanceEvidence: {
      status: finalGateAcceptanceStatus,
      installer: acceptanceExpectedInstallerName,
      verificationStatus: fullStatus,
      renderOutputCount: 4,
      failureCount: finalGateAcceptanceStatus === 'passed' ? 0 : acceptanceFailures.length,
    },
    evidencePackageEvidence: options.evidencePackageEvidence ?? { status: 'not-provided' },
    freshWindowsEvidence: {
      status: freshWindowsStatus,
      checksumStatus: 'passed',
      basicSmokeStatus: freshWindowsStatus === 'passed' ? 'passed' : 'missing',
      guiSessionStatus: freshWindowsStatus === 'passed' ? 'passed' : 'missing',
      cleanupStatus: freshWindowsStatus === 'passed' ? 'passed' : 'skipped',
      outputStatus: freshWindowsStatus === 'passed' ? 'passed' : 'skipped',
      failureCount: freshWindowsStatus === 'passed' ? 0 : 3,
      failures: finalFailures,
    },
    reportPaths: {
      manualResult: '.danbi/electron-release/handoff/fresh-windows-result.json',
      basicSmokeResult: '.danbi/electron-release/handoff/fresh-windows-basic-smoke.json',
      guiSessionResult: '.danbi/electron-release/handoff/fresh-windows-gui-session.json',
    },
    failures: finalFailures,
  });
  if (options.evidenceImport) {
    await writeJson(rootDir, '.danbi/electron-release/returned/evidence-import-report.json', {
      kind: 'danbi.electron.fresh-windows-evidence-import',
      generatedAt: '2026-06-16T12:00:00.000Z',
      ...options.evidenceImport,
    });
  }
  const handoffManifest = {
    kind: 'danbi.electron.release-handoff',
    status: 'passed',
    generatedAt: handoffGeneratedAt,
    productName: 'Danbi Studio',
    version: '0.1.0',
    acceptanceGeneratedAt: handoffAcceptanceGeneratedAt,
    sourceAcceptanceReport: '.danbi/electron-release/release-acceptance.json',
    handoffPackager: 'package-handoff-for-qa.ps1',
    checksumFile: 'SHA256SUMS.txt',
  };
  await writeJson(rootDir, '.danbi/electron-release/handoff/handoff-manifest.json', handoffManifest);
  await writeFile(join(rootDir, '.danbi/electron-release/handoff/verify-release-artifacts.ps1'), 'Write-Output "verified"\n', 'utf8');
  await writeHandoffChecksums(rootDir, [
    'handoff-manifest.json',
    'verify-release-artifacts.ps1',
  ]);
  if (!options.skipHandoffPackage) {
    await writeHandoffPackageFixture(rootDir, 'danbi-studio-0.1.0-fresh-windows-handoff.zip', 'fixture handoff package', {
      skipReport: options.skipHandoffPackageReport,
      omitArchiveChecksumFile: options.omitHandoffPackageChecksumFile,
      manifestSha256: options.packageReportManifestSha256,
      checksumSha256: options.packageReportChecksumSha256,
      zipEntryInspection: options.packageReportZipEntryInspection,
    });
  }

  return rootDir;
}

async function writeJson(rootDir: string, relativePath: string, value: unknown): Promise<void> {
  const filePath = join(rootDir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeCurrentInstallerArtifactFixture(rootDir: string, installerName: string, releaseDate = '2026-06-16T12:02:30.000Z'): Promise<void> {
  const installerBytes = Buffer.alloc(10_000_001, 1);
  await mkdir(join(rootDir, 'release/electron'), { recursive: true });
  await writeFile(join(rootDir, 'release/electron', installerName), installerBytes);
  await writeFile(join(rootDir, 'release/electron', `${installerName}.blockmap`), Buffer.alloc(1_001, 2));
  await writeFile(join(rootDir, 'release/electron/latest.yml'), [
    'version: 0.1.0',
    `path: ${installerName}`,
    `size: ${installerBytes.length}`,
    `releaseDate: '${releaseDate}'`,
    '',
  ].join('\n'), 'utf8');
}

async function writeHandoffChecksums(rootDir: string, paths: string[]): Promise<void> {
  const lines = [];
  for (const relativePath of paths) {
    const bytes = await readFile(join(rootDir, '.danbi/electron-release/handoff', relativePath));
    lines.push(`${createHash('sha256').update(bytes).digest('hex')}  ${relativePath}`);
  }
  lines.sort((left, right) => left.localeCompare(right));
  await writeFile(
    join(rootDir, '.danbi/electron-release/handoff/SHA256SUMS.txt'),
    `${lines.join('\n')}\n`,
    'utf8',
  );
}

async function writeHandoffPackageFixture(
  rootDir: string,
  fileName: string,
  content: string,
  options: {
    skipReport?: boolean;
    omitArchiveChecksumFile?: boolean;
    manifestSha256?: string;
    checksumSha256?: string;
    zipEntryInspection?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const relativePath = `.danbi/electron-release/${fileName}`;
  const zipPath = join(rootDir, relativePath);
  const stageRoot = await mkdtemp(join(rootDir, '.danbi/electron-release/handoff-package-stage-'));
  const checksumPath = join(rootDir, '.danbi/electron-release/handoff/SHA256SUMS.txt');
  const checksumText = await readFile(checksumPath, 'utf8');
  const checksumEntries = checksumText
    .split(/\r?\n/)
    .map((line) => /^([a-fA-F0-9]{64})\s{2}(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => match[2]);
  for (const entry of checksumEntries) {
    const sourcePath = join(rootDir, '.danbi/electron-release/handoff', entry);
    const targetPath = join(stageRoot, entry);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, await readFile(sourcePath));
  }
  if (!options.omitArchiveChecksumFile) {
    await writeFile(join(stageRoot, 'SHA256SUMS.txt'), checksumText, 'utf8');
  }
  await writeFile(join(stageRoot, 'handoff-package-summary.json'), `${JSON.stringify({
    kind: 'danbi.electron.release-handoff-package-summary',
    note: content,
  })}\n`, 'utf8');
  const compress = spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    'Compress-Archive -Path (Join-Path $env:DANBI_HANDOFF_STAGE "*") -DestinationPath $env:DANBI_HANDOFF_ZIP -Force',
  ], {
    env: {
      ...process.env,
      DANBI_HANDOFF_STAGE: stageRoot,
      DANBI_HANDOFF_ZIP: zipPath,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  await rm(stageRoot, { recursive: true, force: true });
  if (compress.error || compress.status !== 0) {
    throw new Error(`Failed to create fixture handoff ZIP: ${compress.error?.message ?? compress.stderr}`);
  }
  const zipBytes = await readFile(zipPath);
  const sha256 = createHash('sha256').update(zipBytes).digest('hex');
  await writeFile(join(rootDir, `${relativePath}.sha256`), `${sha256}  ${fileName}\n`, 'utf8');
  if (options.skipReport) {
    return;
  }

  const manifestPath = join(rootDir, '.danbi/electron-release/handoff/handoff-manifest.json');
  const manifestBytes = await readFile(manifestPath);
  const checksumBytes = await readFile(checksumPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const requiredArchiveFiles = [
    ...checksumEntries,
    'SHA256SUMS.txt',
    'handoff-package-summary.json',
  ].sort();
  const zipEntryInspection = options.zipEntryInspection ?? {
    status: 'passed',
    entries: requiredArchiveFiles,
    files: requiredArchiveFiles,
    directories: [],
    unsafeEntries: [],
    duplicateEntries: [],
    unexpectedEntries: [],
    missingFiles: [],
  };
  const report = {
    kind: 'danbi.electron.release-handoff-package-report',
    generatedAt: '2026-06-16T12:05:30.000Z',
    status: 'passed',
    productName: 'Danbi Studio',
    version: '0.1.0',
    acceptanceGeneratedAt: manifest.acceptanceGeneratedAt ?? null,
    handoffGeneratedAt: manifest.generatedAt ?? null,
    archive: {
      path: `E:\\fixture\\.danbi\\electron-release\\${fileName}`,
      fileName,
      bytes: zipBytes.length,
      sha256,
      sha256Path: `E:\\fixture\\.danbi\\electron-release\\${fileName}.sha256`,
    },
    handoffManifest: {
      path: 'handoff-manifest.json',
      bytes: manifestBytes.length,
      sha256: options.manifestSha256 ?? createHash('sha256').update(manifestBytes).digest('hex'),
    },
    checksumFile: {
      path: 'SHA256SUMS.txt',
      bytes: checksumBytes.length,
      sha256: options.checksumSha256 ?? createHash('sha256').update(checksumBytes).digest('hex'),
    },
    fileCount: checksumEntries.length,
    archiveFileCount: requiredArchiveFiles.length,
    zipEntryInspection,
  };
  await writeFile(join(rootDir, `${relativePath}.report.json`), `\uFEFF${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function appendHandoffPackageZipEntry(rootDir: string, fileName: string, entryName: string): Promise<void> {
  const zipPath = join(rootDir, '.danbi/electron-release', fileName);
  const append = spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    [
      'Add-Type -AssemblyName System.IO.Compression',
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      '$archive = [System.IO.Compression.ZipFile]::Open($env:DANBI_HANDOFF_ZIP, [System.IO.Compression.ZipArchiveMode]::Update)',
      'try {',
      '  $entry = $archive.CreateEntry($env:DANBI_HANDOFF_ENTRY)',
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
      DANBI_HANDOFF_ZIP: zipPath,
      DANBI_HANDOFF_ENTRY: entryName,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (append.error || append.status !== 0) {
    throw new Error(`Failed to append handoff ZIP entry: ${append.error?.message ?? append.stderr}`);
  }
  const zipBytes = await readFile(zipPath);
  const sha256 = createHash('sha256').update(zipBytes).digest('hex');
  await writeFile(`${zipPath}.sha256`, `${sha256}  ${fileName}\n`, 'utf8');
}
