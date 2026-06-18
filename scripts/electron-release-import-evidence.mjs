import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateElectronReleaseFinalGate } from './electron-release-final-gate.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_OUTPUT_DIR = path.join('.danbi', 'electron-release', 'returned');
const DEFAULT_REPORT_PATH = path.join(DEFAULT_OUTPUT_DIR, 'evidence-import-report.json');
const DEFAULT_RETURNED_EVIDENCE_ZIP = 'fresh-windows-evidence.zip';
const WINDOWS_RESERVED_BASENAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const REQUIRED_EVIDENCE_ZIP_FILES = [
  'fresh-windows-basic-smoke.json',
  'fresh-windows-gui-session.json',
  'fresh-windows-result.json',
  'fresh-windows-gui-render.mp4',
  'fresh-windows-evidence-summary.json',
  'handoff-manifest.json',
  'SHA256SUMS.txt',
];
const ALLOWED_EVIDENCE_ZIP_FILES = new Set(REQUIRED_EVIDENCE_ZIP_FILES);

export function importFreshWindowsEvidencePackage(options = {}) {
  const workspaceRoot = path.resolve(options.rootDir ?? rootDir);
  const sourceOptions = resolveFreshWindowsEvidenceSourceOptions(options, workspaceRoot);
  const failures = [];

  if (!sourceOptions.evidenceZip) {
    throw new Error('Missing required --evidence-zip <path> or --evidence-dir <dir>.');
  }

  const sourceZipPath = path.resolve(workspaceRoot, sourceOptions.evidenceZip);
  const sourceSha256Path = path.resolve(workspaceRoot, sourceOptions.evidenceZipSha256 ?? `${sourceOptions.evidenceZip}.sha256`);
  const sourceReportPath = path.resolve(workspaceRoot, sourceOptions.evidenceReport ?? `${sourceOptions.evidenceZip}.report.json`);
  const sourceReportRequired = typeof sourceOptions.evidenceReport === 'string' && sourceOptions.evidenceReport.length > 0
    || sourceOptions.allowMissingEvidenceReport !== true;
  const sourceSidecarMetadata = readFileTransferMetadata(sourceSha256Path);
  const sourceReportMetadata = readFileTransferMetadata(sourceReportPath);
  const outputDir = path.resolve(workspaceRoot, sourceOptions.outputDir ?? DEFAULT_OUTPUT_DIR);
  const reportPath = path.resolve(workspaceRoot, sourceOptions.reportPath ?? DEFAULT_REPORT_PATH);

  assertOutputPathInsideReleaseRoot(workspaceRoot, outputDir, 'evidence output directory');
  assertOutputPathInsideReleaseRoot(workspaceRoot, reportPath, 'evidence import report');

  const zipStats = statSync(sourceZipPath, { throwIfNoEntry: false });
  if (!zipStats?.isFile()) {
    failures.push(`Missing fresh Windows evidence ZIP: ${sourceZipPath}`);
  }
  if (!/\.zip$/i.test(path.basename(sourceZipPath))) {
    failures.push(`Fresh Windows evidence file must be a .zip: ${sourceZipPath}`);
  }

  const sidecar = readEvidenceZipSidecar(sourceSha256Path, failures);
  const actualSha256 = zipStats?.isFile() ? hashFile(sourceZipPath) : null;
  if (sidecar && actualSha256 && sidecar.sha256 !== actualSha256) {
    failures.push(`Fresh Windows evidence ZIP SHA-256 mismatch: ${sourceZipPath}`);
  }
  const sourcePackageReport = readEvidencePackageReport(sourceReportPath, sourceReportRequired, failures);
  const sourceResolvedFiles = buildFreshWindowsEvidenceSourceFiles({
    sourceZipPath,
    sourceSha256Path,
    sourceReportPath,
    sourceReportRequired,
    zipStats,
    sidecar,
    sourcePackageReport,
  });
  const outputName = resolveOutputName(options.outputName, sidecar?.fileName, sourceZipPath, failures);
  const packageReportVerification = buildPackageReportVerification({
    sourceReportPath,
    sourcePackageReport,
    sourceReportRequired,
    zipStats,
    actualSha256,
    sidecar,
    outputName,
    failures,
  });

  const outputZipPath = path.join(outputDir, outputName);
  const outputSha256Path = path.join(outputDir, `${outputName}.sha256`);
  const outputReportPath = path.join(outputDir, `${outputName}.report.json`);
  assertOutputPathInsideReleaseRoot(workspaceRoot, outputZipPath, 'imported evidence ZIP');
  assertOutputPathInsideReleaseRoot(workspaceRoot, outputSha256Path, 'imported evidence ZIP checksum');
  assertOutputPathInsideReleaseRoot(workspaceRoot, outputReportPath, 'imported evidence package report');

  const importedZipRelativePath = normalizeRelative(workspaceRoot, outputZipPath);
  const importedSha256RelativePath = normalizeRelative(workspaceRoot, outputSha256Path);
  const importedReportRelativePath = normalizeRelative(workspaceRoot, outputReportPath);
  let finalGateResult = null;
  let archiveVerification = {
    status: 'not-run',
    extractionDir: null,
    zipEntryInspectionStatus: 'not-run',
    zipEntries: [],
    unsafeEntries: [],
    duplicateEntries: [],
    archiveDirectories: [],
    archiveFiles: [],
    missingFiles: [],
    unexpectedEntries: [],
    stderrTail: '',
  };
  const copyVerification = {
    status: 'not-run',
    sourceBytes: zipStats?.isFile() ? zipStats.size : null,
    importedBytes: null,
    sourceSha256: actualSha256,
    importedSha256: null,
    sidecarText: null,
    checks: {
      importedZipPresent: false,
      importedBytesMatchSource: false,
      importedSha256MatchSource: false,
      importedSidecarMatchesImport: false,
    },
  };

  if (failures.length === 0) {
    archiveVerification = verifyEvidenceZipArchive(sourceZipPath, outputDir, failures);
    verifyPackageReportArchiveSummary(packageReportVerification, sourcePackageReport, archiveVerification, failures);
  }

  if (failures.length === 0) {
    mkdirSync(outputDir, { recursive: true });
    if (!sameResolvedPath(sourceZipPath, outputZipPath)) {
      copyFileSync(sourceZipPath, outputZipPath);
    }
    const expectedSidecarText = `${actualSha256}  ${outputName}\n`;
    writeFileSync(outputSha256Path, expectedSidecarText, 'utf8');
    if (sourcePackageReport) {
      copyFileSync(sourceReportPath, outputReportPath);
    }

    const importedStats = statSync(outputZipPath, { throwIfNoEntry: false });
    const importedSha256 = importedStats?.isFile() ? hashFile(outputZipPath) : null;
    const importedSidecarText = existsSync(outputSha256Path) ? readFileSync(outputSha256Path, 'utf8') : null;
    copyVerification.status = 'failed';
    copyVerification.importedBytes = importedStats?.isFile() ? importedStats.size : null;
    copyVerification.importedSha256 = importedSha256;
    copyVerification.sidecarText = importedSidecarText;
    copyVerification.checks.importedZipPresent = Boolean(importedStats?.isFile());
    copyVerification.checks.importedBytesMatchSource = importedStats?.isFile() && importedStats.size === zipStats.size;
    copyVerification.checks.importedSha256MatchSource = importedSha256 === actualSha256;
    copyVerification.checks.importedSidecarMatchesImport = importedSidecarText === expectedSidecarText;

    for (const [check, passed] of Object.entries(copyVerification.checks)) {
      if (!passed) {
        failures.push(`Fresh Windows evidence import copy verification failed: ${check}.`);
      }
    }
    if (failures.length === 0) {
      copyVerification.status = 'passed';
    }

    if (sourcePackageReport) {
      verifyImportedPackageReportCopy(packageReportVerification, sourceReportPath, outputReportPath, failures);
    }
  }
  const importedSidecarMetadata = readFileTransferMetadata(outputSha256Path);
  const importedReportMetadata = readFileTransferMetadata(outputReportPath);

  const importedReportForFinalGate = packageReportVerification.status === 'passed'
    ? importedReportRelativePath
    : null;
  const importReadyForFinalGate = zipStats?.isFile()
    && actualSha256
    && sidecar?.sha256 === actualSha256
    && archiveVerification.status === 'passed'
    && (packageReportVerification.status === 'passed' || packageReportVerification.status === 'not-provided')
    && copyVerification.status === 'passed';
  const finalGateArgs = importReadyForFinalGate
    ? buildFinalGateArgs(
      sourceOptions,
      workspaceRoot,
      importedZipRelativePath,
      importedSha256RelativePath,
      importedReportForFinalGate,
    )
    : [];

  if (failures.length === 0 && sourceOptions.runFinalGate) {
    try {
      const { report: gateReport, reportPath: gateReportPath } = validateElectronReleaseFinalGate({
        rootDir: workspaceRoot,
        fullVerificationReport: sourceOptions.fullVerificationReport,
        releaseAcceptanceReport: sourceOptions.releaseAcceptanceReport,
        handoffDir: sourceOptions.handoffDir,
        evidenceZip: importedZipRelativePath,
        evidenceZipSha256: importedSha256RelativePath,
        evidenceReport: importedReportForFinalGate ?? undefined,
        allowMissingEvidenceReport: sourceOptions.allowMissingEvidenceReport,
        evidenceStagingDir: sourceOptions.evidenceStagingDir,
        manualAcceptanceReport: sourceOptions.manualAcceptanceReport,
        reportPath: sourceOptions.finalGateReport,
        writeManualAcceptanceReport: sourceOptions.writeManualAcceptanceReport,
      });
      finalGateResult = {
        status: gateReport.status,
        reportPath: gateReportPath,
        evidencePackageStatus: gateReport.evidencePackageEvidence.status,
        freshWindowsStatus: gateReport.freshWindowsEvidence.status,
        failureCount: gateReport.failures.length,
      };
      if (gateReport.status !== 'passed') {
        failures.push(`Final release gate did not pass: ${gateReport.status}.`);
      }
    } catch (error) {
      failures.push(`Final release gate could not run: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const report = {
    kind: 'danbi.electron.fresh-windows-evidence-import',
    generatedAt: new Date().toISOString(),
    status: failures.length === 0 ? 'passed' : 'failed',
    importStatus: zipStats?.isFile()
      && actualSha256
      && sidecar?.sha256 === actualSha256
      && archiveVerification.status === 'passed'
      && (packageReportVerification.status === 'passed' || packageReportVerification.status === 'not-provided')
      && copyVerification.status === 'passed'
      ? 'passed'
      : 'failed',
    source: {
      evidenceDir: sourceOptions.evidenceDir ? normalizeSlash(sourceOptions.evidenceDir) : null,
      resolvedFiles: sourceResolvedFiles,
      zipPath: normalizeSlash(sourceZipPath),
      sha256Path: normalizeSlash(sourceSha256Path),
      sidecarFileName: sidecar?.fileName ?? null,
      bytes: zipStats?.isFile() ? zipStats.size : null,
      sha256: actualSha256,
      sha256Bytes: sourceSidecarMetadata.bytes,
      sha256FileSha256: sourceSidecarMetadata.sha256,
      reportBytes: sourceReportMetadata.bytes,
      reportSha256: sourceReportMetadata.sha256,
    },
    imported: {
      zipPath: importedZipRelativePath,
      sha256Path: importedSha256RelativePath,
      reportPath: packageReportVerification.checks.importedReportPresent === true
        ? importedReportRelativePath
        : null,
      bytes: copyVerification.importedBytes,
      sha256: copyVerification.importedSha256,
      sha256Bytes: importedSidecarMetadata.bytes,
      sha256FileSha256: importedSidecarMetadata.sha256,
      reportBytes: importedReportMetadata.bytes,
      reportSha256: importedReportMetadata.sha256,
    },
    archiveVerification,
    packageReportVerification,
    copyVerification,
    finalGate: {
      command: importReadyForFinalGate
        ? buildFinalGateCommand(workspaceRoot, finalGateArgs)
        : null,
      args: finalGateArgs,
      ready: Boolean(importReadyForFinalGate),
      run: Boolean(sourceOptions.runFinalGate),
      result: finalGateResult,
      evidenceZip: importedZipRelativePath,
      evidenceZipSha256: importedSha256RelativePath,
      evidenceReport: importedReportForFinalGate,
    },
    failures,
  };

  if (options.writeReport !== false) {
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (failures.length > 0 && options.throwOnFailure !== false) {
    throw new Error(`Fresh Windows evidence import failed with ${failures.length} issue(s): ${failures.join('; ')}`);
  }

  return {
    report,
    reportPath: normalizeRelative(workspaceRoot, reportPath),
  };
}

function resolveFreshWindowsEvidenceSourceOptions(options, workspaceRoot) {
  if (options.evidenceZip && options.evidenceDir) {
    throw new Error('Use either --evidence-zip <path> or --evidence-dir <dir>, not both.');
  }
  if (options.evidenceZip || !options.evidenceDir) {
    return options;
  }
  const evidenceDir = path.resolve(workspaceRoot, options.evidenceDir);
  const evidenceZip = path.join(evidenceDir, DEFAULT_RETURNED_EVIDENCE_ZIP);
  return {
    ...options,
    evidenceDir,
    evidenceZip,
    evidenceZipSha256: options.evidenceZipSha256 ?? `${evidenceZip}.sha256`,
    evidenceReport: options.evidenceReport ?? `${evidenceZip}.report.json`,
  };
}

function buildFreshWindowsEvidenceSourceFiles({
  sourceZipPath,
  sourceSha256Path,
  sourceReportPath,
  sourceReportRequired,
  zipStats,
  sidecar,
  sourcePackageReport,
}) {
  const zipStatus = zipStats?.isFile() ? 'present' : 'missing';
  const sidecarStatus = sidecar ? 'present' : existsSync(sourceSha256Path) ? 'invalid' : 'missing';
  const reportStatus = sourcePackageReport ? 'present' : existsSync(sourceReportPath) ? 'invalid' : 'missing';
  return [
    {
      role: 'fresh-windows-evidence-zip',
      required: true,
      status: zipStatus,
      ready: zipStatus === 'present',
      path: normalizeSlash(sourceZipPath),
      fileName: path.basename(sourceZipPath),
    },
    {
      role: 'fresh-windows-evidence-zip-sha256',
      required: true,
      status: sidecarStatus,
      ready: sidecarStatus === 'present',
      path: normalizeSlash(sourceSha256Path),
      fileName: path.basename(sourceSha256Path),
    },
    {
      role: 'fresh-windows-evidence-package-report',
      required: sourceReportRequired,
      status: reportStatus,
      ready: sourceReportRequired ? reportStatus === 'present' : reportStatus === 'present' || reportStatus === 'missing',
      path: normalizeSlash(sourceReportPath),
      fileName: path.basename(sourceReportPath),
    },
  ];
}

function buildPackageReportVerification({
  sourceReportPath,
  sourcePackageReport,
  sourceReportRequired,
  zipStats,
  actualSha256,
  sidecar,
  outputName,
  failures,
}) {
  const verification = {
    status: sourcePackageReport ? 'failed' : sourceReportRequired ? 'failed' : 'not-provided',
    sourcePath: sourcePackageReport || sourceReportRequired ? normalizeSlash(sourceReportPath) : null,
    importedPath: null,
    kind: sourcePackageReport?.kind ?? null,
    archiveBytes: sourcePackageReport?.archive?.bytes ?? null,
    archiveSha256: sourcePackageReport?.archive?.sha256 ?? null,
    summaryBytes: sourcePackageReport?.summary?.bytes ?? null,
    summarySha256: sourcePackageReport?.summary?.sha256 ?? null,
    checks: {
      reportPresent: Boolean(sourcePackageReport),
      kindValid: sourcePackageReport ? sourcePackageReport.kind === 'danbi.electron.fresh-windows-evidence-package-report' : null,
      statusPassed: sourcePackageReport ? sourcePackageReport.status === 'passed' : null,
      archiveBytesMatchSource: sourcePackageReport && zipStats?.isFile()
        ? Number(sourcePackageReport.archive?.bytes) === zipStats.size
        : null,
      archiveSha256MatchSource: sourcePackageReport && actualSha256
        ? String(sourcePackageReport.archive?.sha256 ?? '').toLowerCase() === actualSha256
        : null,
      archiveFileNameMatchesSidecar: sourcePackageReport && sidecar?.fileName
        ? sourcePackageReport.archive?.fileName === sidecar.fileName
        : null,
      archiveFileNameMatchesOutput: sourcePackageReport
        ? sourcePackageReport.archive?.fileName === outputName
        : null,
      summaryFingerprintMatchesArchive: null,
      zipEntryInspectionMatchesArchive: null,
      importedReportPresent: null,
      importedReportMatchesSource: null,
    },
  };

  if (!sourcePackageReport) {
    if (sourceReportRequired) {
      failures.push('Fresh Windows evidence package report verification failed: reportPresent.');
    }
    return verification;
  }

  for (const [check, passed] of Object.entries(verification.checks)) {
    if (passed === false) {
      failures.push(`Fresh Windows evidence package report verification failed: ${check}.`);
    }
  }

  return verification;
}

function verifyPackageReportArchiveSummary(verification, sourcePackageReport, archiveVerification, failures) {
  if (!sourcePackageReport) {
    return;
  }
  const summary = archiveVerification.summaryFile;
  verification.checks.summaryFingerprintMatchesArchive = Boolean(summary)
    && Number(sourcePackageReport.summary?.bytes) === summary.bytes
    && String(sourcePackageReport.summary?.sha256 ?? '').toLowerCase() === summary.sha256;

  if (!verification.checks.summaryFingerprintMatchesArchive) {
    failures.push('Fresh Windows evidence package report verification failed: summaryFingerprintMatchesArchive.');
  }

  verification.checks.zipEntryInspectionMatchesArchive = packageReportZipEntryInspectionMatchesArchive(
    sourcePackageReport.zipEntryInspection,
    archiveVerification,
  );
  if (!verification.checks.zipEntryInspectionMatchesArchive) {
    failures.push('Fresh Windows evidence package report verification failed: zipEntryInspectionMatchesArchive.');
  }
}

function verifyImportedPackageReportCopy(verification, sourceReportPath, outputReportPath, failures) {
  const sourceStats = statSync(sourceReportPath, { throwIfNoEntry: false });
  const importedStats = statSync(outputReportPath, { throwIfNoEntry: false });
  const sourceSha256 = sourceStats?.isFile() ? hashFile(sourceReportPath) : null;
  const importedSha256 = importedStats?.isFile() ? hashFile(outputReportPath) : null;

  verification.importedPath = normalizeSlash(outputReportPath);
  verification.checks.importedReportPresent = Boolean(importedStats?.isFile());
  verification.checks.importedReportMatchesSource = Boolean(sourceStats?.isFile() && importedStats?.isFile())
    && sourceStats.size === importedStats.size
    && sourceSha256 === importedSha256;

  if (!verification.checks.importedReportPresent) {
    failures.push('Fresh Windows evidence package report copy verification failed: importedReportPresent.');
  }
  if (!verification.checks.importedReportMatchesSource) {
    failures.push('Fresh Windows evidence package report copy verification failed: importedReportMatchesSource.');
  }

  if (failures.length === 0) {
    verification.status = 'passed';
  }
}

function packageReportZipEntryInspectionMatchesArchive(reportInspection, archiveVerification) {
  if (!reportInspection || typeof reportInspection !== 'object') {
    return false;
  }
  if (reportInspection.status !== archiveVerification.zipEntryInspectionStatus) {
    return false;
  }
  return arraysEqual(normalizeStringArray(reportInspection.entries), archiveVerification.zipEntries)
    && arraysEqual(normalizeStringArray(reportInspection.files), archiveVerification.archiveFiles)
    && arraysEqual(normalizeStringArray(reportInspection.directories), archiveVerification.archiveDirectories)
    && arraysEqual(normalizeStringArray(reportInspection.missingFiles), archiveVerification.missingFiles)
    && arraysEqual(normalizeStringArray(reportInspection.unexpectedEntries), archiveVerification.unexpectedEntries)
    && arraysEqual(normalizeStringArray(reportInspection.unsafeEntries), archiveVerification.unsafeEntries)
    && arraysEqual(normalizeStringArray(reportInspection.duplicateEntries), archiveVerification.duplicateEntries);
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => normalizeSlash(String(item))).sort()
    : [];
}

function arraysEqual(left, right) {
  const normalizedLeft = normalizeStringArray(left);
  const normalizedRight = normalizeStringArray(right);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function buildFinalGateArgs(options, workspaceRoot, evidenceZip, evidenceZipSha256, evidenceReport) {
  const args = [];
  args.push('--root-dir', normalizeSlash(workspaceRoot));
  appendOptionalArg(args, '--full-verification-report', options.fullVerificationReport);
  appendOptionalArg(args, '--release-acceptance-report', options.releaseAcceptanceReport);
  appendOptionalArg(args, '--handoff-dir', options.handoffDir);
  args.push('--evidence-zip', evidenceZip);
  args.push('--evidence-zip-sha256', evidenceZipSha256);
  appendOptionalArg(args, '--evidence-report', evidenceReport);
  if (!evidenceReport && options.allowMissingEvidenceReport === true) {
    args.push('--allow-missing-evidence-report');
  }
  appendOptionalArg(args, '--evidence-staging-dir', options.evidenceStagingDir);
  appendOptionalArg(args, '--manual-acceptance-report', options.manualAcceptanceReport);
  appendOptionalArg(args, '--out', options.finalGateReport);
  return args;
}

function buildFinalGateCommand(workspaceRoot, finalGateArgs) {
  return formatCliArgs([
    'npm',
    '--prefix',
    normalizeSlash(workspaceRoot),
    'run',
    'electron:release:final-gate',
    '--',
    ...finalGateArgs,
  ]);
}

function appendOptionalArg(args, option, value) {
  if (typeof value === 'string' && value.length > 0) {
    args.push(option, value);
  }
}

function verifyEvidenceZipArchive(zipPath, outputDir, failures) {
  const extractionDir = path.join(outputDir, '.fresh-windows-evidence-import-check');
  const verification = {
    status: 'failed',
    extractionDir: normalizeSlash(extractionDir),
    zipEntryInspectionStatus: 'not-run',
    zipEntries: [],
    unsafeEntries: [],
    duplicateEntries: [],
    archiveDirectories: [],
    archiveFiles: [],
    missingFiles: [],
    unexpectedEntries: [],
    summaryFile: null,
    stderrTail: '',
  };
  const startFailureCount = failures.length;
  const entryInspection = inspectEvidenceZipEntries(zipPath);
  verification.zipEntryInspectionStatus = entryInspection.status;
  verification.zipEntries = entryInspection.entries;
  verification.unsafeEntries = entryInspection.unsafeEntries;
  verification.duplicateEntries = entryInspection.duplicateEntries;
  verification.archiveDirectories = entryInspection.directories;
  verification.archiveFiles = entryInspection.files;
  verification.missingFiles = REQUIRED_EVIDENCE_ZIP_FILES.filter((file) => !entryInspection.files.includes(file));
  verification.unexpectedEntries = [
    ...entryInspection.directories,
    ...entryInspection.files.filter((file) => !ALLOWED_EVIDENCE_ZIP_FILES.has(file)),
  ].sort();
  verification.stderrTail = entryInspection.stderrTail;

  if (entryInspection.status !== 'passed') {
    failures.push(`Fresh Windows evidence ZIP could not be inspected before extraction: ${entryInspection.stderrTail || 'ZIP entry listing failed'}`);
  }
  if (verification.unsafeEntries.length > 0) {
    failures.push(`Fresh Windows evidence ZIP contains unsafe entries: ${verification.unsafeEntries.join(', ')}`);
  }
  if (verification.duplicateEntries.length > 0) {
    failures.push(`Fresh Windows evidence ZIP contains duplicate entries: ${verification.duplicateEntries.join(', ')}`);
  }
  if (verification.unexpectedEntries.length > 0) {
    failures.push(`Fresh Windows evidence ZIP contains unexpected entr${verification.unexpectedEntries.length === 1 ? 'y' : 'ies'}: ${verification.unexpectedEntries.join(', ')}`);
  }
  if (verification.missingFiles.length > 0) {
    failures.push(`Fresh Windows evidence ZIP is missing required file${verification.missingFiles.length === 1 ? '' : 's'}: ${verification.missingFiles.join(', ')}`);
  }
  if (failures.length !== startFailureCount) {
    cleanupArchiveVerificationDir(extractionDir);
    return verification;
  }

  try {
    rmSync(extractionDir, { recursive: true, force: true });
    mkdirSync(extractionDir, { recursive: true });
  } catch (error) {
    failures.push(`Failed to prepare fresh Windows evidence ZIP verification directory: ${error instanceof Error ? error.message : String(error)}`);
    return verification;
  }

  const expandResult = spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    'Expand-Archive -LiteralPath $env:DANBI_EVIDENCE_IMPORT_ZIP -DestinationPath $env:DANBI_EVIDENCE_IMPORT_DIR -Force',
  ], {
    env: {
      ...process.env,
      DANBI_EVIDENCE_IMPORT_ZIP: zipPath,
      DANBI_EVIDENCE_IMPORT_DIR: extractionDir,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  verification.stderrTail = tail(expandResult.stderr);
  if (expandResult.error || expandResult.status !== 0) {
    failures.push(`Fresh Windows evidence ZIP could not be expanded: ${expandResult.error?.message ?? verification.stderrTail}`);
    cleanupArchiveVerificationDir(extractionDir);
    return verification;
  }

  const entries = listArchiveEntries(extractionDir);
  const archiveFiles = entries.files.sort();
  const unexpectedEntries = [
    ...entries.directories,
    ...entries.otherEntries,
    ...archiveFiles.filter((file) => !ALLOWED_EVIDENCE_ZIP_FILES.has(file)),
  ].sort();
  const missingFiles = REQUIRED_EVIDENCE_ZIP_FILES.filter((file) => !archiveFiles.includes(file));

  verification.archiveFiles = archiveFiles;
  verification.missingFiles = missingFiles;
  verification.unexpectedEntries = unexpectedEntries;
  const summaryPath = path.join(extractionDir, 'fresh-windows-evidence-summary.json');
  const summaryStats = statSync(summaryPath, { throwIfNoEntry: false });
  verification.summaryFile = summaryStats?.isFile()
    ? {
        path: 'fresh-windows-evidence-summary.json',
        bytes: summaryStats.size,
        sha256: hashFile(summaryPath),
      }
    : null;

  if (unexpectedEntries.length > 0) {
    failures.push(`Fresh Windows evidence ZIP contains unexpected entr${unexpectedEntries.length === 1 ? 'y' : 'ies'}: ${unexpectedEntries.join(', ')}`);
  }
  if (missingFiles.length > 0) {
    failures.push(`Fresh Windows evidence ZIP is missing required file${missingFiles.length === 1 ? '' : 's'}: ${missingFiles.join(', ')}`);
  }

  cleanupArchiveVerificationDir(extractionDir);
  if (failures.length === startFailureCount) {
    verification.status = 'passed';
  }
  return verification;
}

function readEvidencePackageReport(reportPath, required, failures) {
  if (!existsSync(reportPath)) {
    if (required) {
      failures.push(`Missing fresh Windows evidence package report: ${reportPath}`);
    }
    return null;
  }
  try {
    return readJson(reportPath);
  } catch (error) {
    failures.push(`Invalid fresh Windows evidence package report: ${reportPath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function cleanupArchiveVerificationDir(extractionDir) {
  try {
    rmSync(extractionDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only; archive validation has already accepted or rejected the ZIP.
  }
}

function inspectEvidenceZipEntries(zipPath) {
  const inspection = {
    status: 'failed',
    entries: [],
    files: [],
    directories: [],
    unsafeEntries: [],
    duplicateEntries: [],
    stderrTail: '',
  };
  const result = spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    [
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      '$archive = [System.IO.Compression.ZipFile]::OpenRead($env:DANBI_EVIDENCE_IMPORT_ZIP)',
      'try {',
      '  @($archive.Entries | ForEach-Object { [PSCustomObject]@{ FullName = $_.FullName } }) | ConvertTo-Json -Compress -Depth 3',
      '} finally {',
      '  $archive.Dispose()',
      '}',
    ].join('; '),
  ], {
    env: {
      ...process.env,
      DANBI_EVIDENCE_IMPORT_ZIP: zipPath,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  inspection.stderrTail = tail(result.stderr);
  if (result.error || result.status !== 0) {
    inspection.stderrTail = result.error?.message ?? inspection.stderrTail;
    return inspection;
  }

  let parsedEntries;
  try {
    parsedEntries = JSON.parse(result.stdout.trim() || '[]');
  } catch (error) {
    inspection.stderrTail = `Could not parse ZIP entry listing: ${error instanceof Error ? error.message : String(error)}`;
    return inspection;
  }

  const records = Array.isArray(parsedEntries) ? parsedEntries : [parsedEntries];
  const rawEntries = records
    .map((record) => typeof record?.FullName === 'string' ? record.FullName : '')
    .filter((entry) => entry.length > 0);
  const normalizedEntries = rawEntries.map((entry) => normalizeSlash(entry)).sort();

  inspection.entries = normalizedEntries;
  inspection.files = normalizedEntries.filter((entry) => !entry.endsWith('/')).sort();
  inspection.directories = normalizedEntries
    .filter((entry) => entry.endsWith('/'))
    .map((entry) => entry.replace(/\/+$/, ''))
    .filter((entry) => entry.length > 0)
    .sort();
  inspection.unsafeEntries = rawEntries.filter((entry) => !isSafeZipEntryName(entry)).map((entry) => normalizeSlash(entry)).sort();
  inspection.duplicateEntries = findDuplicateStrings(normalizedEntries);
  inspection.status = 'passed';
  return inspection;
}

function isSafeZipEntryName(entryName) {
  if (typeof entryName !== 'string' || entryName.length === 0 || entryName !== entryName.trim()) {
    return false;
  }
  if (entryName.includes('\\') || entryName.includes('\0')) {
    return false;
  }
  const normalized = normalizeSlash(entryName);
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    return false;
  }
  const pathForSegments = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  if (!pathForSegments) {
    return false;
  }
  return pathForSegments.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function findDuplicateStrings(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates].sort();
}

function listArchiveEntries(root) {
  const entries = {
    files: [],
    directories: [],
    otherEntries: [],
  };

  const visit = (directory, relativeBase = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = normalizeSlash(path.join(relativeBase, entry.name));
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        entries.directories.push(relativePath);
        visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        entries.files.push(relativePath);
      } else {
        entries.otherEntries.push(relativePath);
      }
    }
  };

  visit(root);
  return entries;
}

function readEvidenceZipSidecar(sidecarPath, failures) {
  if (!existsSync(sidecarPath)) {
    failures.push(`Missing fresh Windows evidence ZIP checksum sidecar: ${sidecarPath}`);
    return null;
  }
  const lines = stripTextBom(readFileSync(sidecarPath, 'utf8'))
    .split(/\r?\n/)
    .filter((item) => item.trim().length > 0);
  if (lines.length !== 1) {
    failures.push(`Invalid fresh Windows evidence ZIP checksum sidecar: ${sidecarPath}`);
    return null;
  }
  const line = lines[0];
  const match = /^([a-f0-9]{64})\s+(.+)$/i.exec(line ?? '');
  if (!match) {
    failures.push(`Invalid fresh Windows evidence ZIP checksum sidecar: ${sidecarPath}`);
    return null;
  }
  const fileName = match[2].trim();
  if (!isSafeBasename(fileName) || !/\.zip$/i.test(fileName)) {
    failures.push(`Fresh Windows evidence ZIP checksum sidecar must reference a safe .zip filename, got ${fileName}.`);
    return null;
  }
  return {
    sha256: match[1].toLowerCase(),
    fileName,
  };
}

function resolveOutputName(optionName, sidecarFileName, sourceZipPath, failures) {
  const outputName = optionName ?? sidecarFileName ?? path.basename(sourceZipPath);
  if (!isSafeBasename(outputName)) {
    failures.push(`Fresh Windows evidence output name must be a safe filename, got ${outputName}.`);
  }
  if (!/\.zip$/i.test(outputName)) {
    failures.push(`Fresh Windows evidence output name must end with .zip, got ${outputName}.`);
  }
  return outputName;
}

function isSafeBasename(value) {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && value === path.basename(value)
    && !/[<>:"\/\\|?*\x00-\x1F]/u.test(value)
    && !value.endsWith('.')
    && !WINDOWS_RESERVED_BASENAME_PATTERN.test(value)
    && !value.includes('/')
    && !value.includes('\\')
    && !value.includes('\0');
}

function assertOutputPathInsideReleaseRoot(workspaceRoot, targetPath, label) {
  const relative = path.relative(workspaceRoot, targetPath);
  const normalized = normalizeSlash(relative);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside workspace: ${targetPath}`);
  }
  if (normalized !== '.danbi/electron-release' && !normalized.startsWith('.danbi/electron-release/')) {
    throw new Error(`${label} must stay under .danbi/electron-release: ${targetPath}`);
  }
}

function sameResolvedPath(left, right) {
  const resolvedLeft = path.resolve(left);
  const resolvedRight = path.resolve(right);
  return process.platform === 'win32'
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function readFileTransferMetadata(filePath) {
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (!stats?.isFile()) {
    return { bytes: null, sha256: null };
  }
  return {
    bytes: stats.size,
    sha256: hashFile(filePath),
  };
}

function readJson(filePath) {
  return JSON.parse(stripTextBom(readFileSync(filePath, 'utf8')));
}

function stripTextBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function normalizeRelative(workspaceRoot, targetPath) {
  return normalizeSlash(path.relative(workspaceRoot, targetPath));
}

function normalizeSlash(value) {
  return value.replace(/\\/g, '/');
}

function quoteCliPath(value) {
  return /^[A-Za-z0-9._/:=-]+$/.test(value)
    ? value
    : `'${value.replace(/'/g, "''")}'`;
}

function formatCliArgs(args) {
  return args.map((arg) => quoteCliPath(arg)).join(' ');
}

function tail(text, maxLength = 2_000) {
  if (!text) {
    return '';
  }
  return text.length > maxLength ? text.slice(-maxLength) : text;
}

function parseCliArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--evidence-zip' || arg === '--zip') {
      options.evidenceZip = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--evidence-dir') {
      options.evidenceDir = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--evidence-zip-sha256' || arg === '--sha256') {
      options.evidenceZipSha256 = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--evidence-report') {
      options.evidenceReport = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--allow-missing-evidence-report') {
      options.allowMissingEvidenceReport = true;
    } else if (arg === '--out-dir') {
      options.outputDir = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--out-name') {
      options.outputName = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--report') {
      options.reportPath = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--run-final-gate') {
      options.runFinalGate = true;
    } else if (arg === '--full-verification-report') {
      options.fullVerificationReport = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--release-acceptance-report') {
      options.releaseAcceptanceReport = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--handoff-dir') {
      options.handoffDir = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--evidence-staging-dir') {
      options.evidenceStagingDir = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--manual-acceptance-report') {
      options.manualAcceptanceReport = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--final-gate-report') {
      options.finalGateReport = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--root-dir') {
      options.rootDir = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function readRequiredValue(argv, index, option) {
  const value = argv[index];
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function formatHelp() {
  return [
    'Usage: node scripts/electron-release-import-evidence.mjs (--evidence-zip <path> | --evidence-dir <dir>) [--evidence-zip-sha256 <path>] [--evidence-report <path>] [--allow-missing-evidence-report] [--out-dir <path>] [--out-name <filename.zip>] [--report <path>] [--run-final-gate] [--full-verification-report <path>] [--release-acceptance-report <path>] [--handoff-dir <path>] [--evidence-staging-dir <path>] [--manual-acceptance-report <path>] [--final-gate-report <path>] [--root-dir <path>]',
    '',
    'Copies a returned fresh-Windows evidence ZIP from an external QA location into .danbi/electron-release/returned after verifying its SHA-256 sidecar and package report. Use --evidence-dir for the standard QA return folder containing fresh-windows-evidence.zip, fresh-windows-evidence.zip.sha256, and fresh-windows-evidence.zip.report.json. The package report is required by default; use --allow-missing-evidence-report only for legacy QA returns. The report prints the exact electron:release:final-gate command to run next. With --run-final-gate, it immediately stages the imported ZIP and runs the final release gate.',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let options = {};
  try {
    options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log(formatHelp());
      process.exit(0);
    }
    const { report, reportPath } = importFreshWindowsEvidencePackage({
      ...options,
      throwOnFailure: false,
    });
    console.log(JSON.stringify({
      status: report.status,
      importStatus: report.importStatus,
      reportPath,
      evidenceDir: report.source.evidenceDir,
      resolvedFiles: report.source.resolvedFiles,
      evidenceZip: report.imported.zipPath,
      evidenceZipSha256: report.imported.sha256Path,
      evidenceReport: report.imported.reportPath,
      finalGateReady: report.finalGate.ready,
      finalGateArgs: report.finalGate.args,
      finalGateCommand: report.finalGate.command,
      finalGateStatus: report.finalGate.result?.status ?? null,
      failureCount: report.failures.length,
      failures: report.failures,
    }, null, 2));
    if (report.status !== 'passed') {
      console.error(`Fresh Windows evidence import failed with ${report.failures.length} issue(s).`);
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({
      status: 'failed',
      reportPath: typeof options.reportPath === 'string' ? normalizeSlash(options.reportPath) : null,
      failureCount: 1,
      failures: [message],
    }, null, 2));
    console.error(message);
    process.exit(1);
  }
}
