import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateFreshWindowsManualAcceptance } from './electron-release-manual-acceptance.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_RELEASE_ROOT = path.join('.danbi', 'electron-release');
const DEFAULT_HANDOFF_DIR = path.join(DEFAULT_RELEASE_ROOT, 'handoff');
const DEFAULT_FULL_VERIFICATION_REPORT = path.join(DEFAULT_RELEASE_ROOT, 'release-verification-full.json');
const DEFAULT_RELEASE_ACCEPTANCE_REPORT = path.join(DEFAULT_RELEASE_ROOT, 'release-acceptance.json');
const DEFAULT_MANUAL_ACCEPTANCE_REPORT = path.join(DEFAULT_RELEASE_ROOT, 'fresh-windows-acceptance-report.json');
const DEFAULT_FINAL_GATE_REPORT = path.join(DEFAULT_RELEASE_ROOT, 'final-release-gate-report.json');
const DEFAULT_EVIDENCE_STAGING_DIR = path.join(DEFAULT_RELEASE_ROOT, 'evidence-zip-staging');
const DEFAULT_MANUAL_RESULT_NAME = 'fresh-windows-result.json';
const DEFAULT_BASIC_SMOKE_RESULT_NAME = 'fresh-windows-basic-smoke.json';
const DEFAULT_GUI_SESSION_RESULT_NAME = 'fresh-windows-gui-session.json';
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
const STAGED_EVIDENCE_ZIP_FILES = [
  'fresh-windows-basic-smoke.json',
  'fresh-windows-gui-session.json',
  'fresh-windows-result.json',
  'fresh-windows-gui-render.mp4',
  'fresh-windows-evidence-summary.json',
];
const HANDOFF_REFERENCE_ZIP_FILES = [
  'handoff-manifest.json',
  'SHA256SUMS.txt',
];

const REQUIRED_FULL_GATE_IDS = [
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

export function validateElectronReleaseFinalGate(options = {}) {
  const workspaceRoot = path.resolve(options.rootDir ?? rootDir);
  const fullVerificationPath = path.resolve(workspaceRoot, options.fullVerificationReport ?? DEFAULT_FULL_VERIFICATION_REPORT);
  const releaseAcceptancePath = path.resolve(workspaceRoot, options.releaseAcceptanceReport ?? DEFAULT_RELEASE_ACCEPTANCE_REPORT);
  const handoffDir = path.resolve(workspaceRoot, options.handoffDir ?? DEFAULT_HANDOFF_DIR);
  const evidenceZipPath = options.evidenceZip ? path.resolve(workspaceRoot, options.evidenceZip) : null;
  const evidenceZipSha256Path = evidenceZipPath
    ? path.resolve(workspaceRoot, options.evidenceZipSha256 ?? `${options.evidenceZip}.sha256`)
    : null;
  const evidenceReportPath = evidenceZipPath
    ? path.resolve(workspaceRoot, options.evidenceReport ?? `${options.evidenceZip}.report.json`)
    : null;
  const evidenceReportRequired = Boolean(evidenceZipPath)
    && (typeof options.evidenceReport === 'string' && options.evidenceReport.length > 0
      || options.allowMissingEvidenceReport !== true);
  const evidenceStagingDir = path.resolve(workspaceRoot, options.evidenceStagingDir ?? DEFAULT_EVIDENCE_STAGING_DIR);
  const manualAcceptanceReportPath = path.resolve(workspaceRoot, options.manualAcceptanceReport ?? DEFAULT_MANUAL_ACCEPTANCE_REPORT);
  const finalGateReportPath = path.resolve(workspaceRoot, options.reportPath ?? DEFAULT_FINAL_GATE_REPORT);

  assertInsideRoot(workspaceRoot, fullVerificationPath, 'full verification report');
  assertInsideRoot(workspaceRoot, releaseAcceptancePath, 'release acceptance report');
  assertInsideRoot(workspaceRoot, handoffDir, 'handoff directory');
  if (evidenceZipPath) {
    assertInsideRoot(workspaceRoot, evidenceZipPath, 'fresh Windows evidence zip');
    assertInsideRoot(workspaceRoot, evidenceZipSha256Path, 'fresh Windows evidence zip checksum');
    assertInsideRoot(workspaceRoot, evidenceReportPath, 'fresh Windows evidence package report');
    assertInsideRoot(workspaceRoot, evidenceStagingDir, 'fresh Windows evidence staging directory');
  }
  assertInsideRoot(workspaceRoot, manualAcceptanceReportPath, 'manual acceptance report');
  assertInsideRoot(workspaceRoot, finalGateReportPath, 'final gate report');

  const failures = [];
  const warnings = [];
  const fullVerificationReport = readJsonIfPresent(fullVerificationPath, failures, 'full release verification report');
  const releaseAcceptanceReport = readJsonIfPresent(releaseAcceptancePath, failures, 'release acceptance report');
  const evidencePackageEvidence = evidenceZipPath
    ? prepareEvidenceZipHandoff({
      workspaceRoot,
      baseHandoffDir: handoffDir,
      evidenceZipPath,
      evidenceZipSha256Path,
      evidenceReportPath,
      evidenceReportRequired,
      evidenceStagingDir,
      releaseAcceptanceReport,
      failures,
    })
    : { status: 'not-provided' };
  const effectiveHandoffDir = evidencePackageEvidence.status === 'passed'
    ? evidenceStagingDir
    : handoffDir;
  const manualResultPath = path.resolve(workspaceRoot, options.manualResult ?? path.join(effectiveHandoffDir, DEFAULT_MANUAL_RESULT_NAME));
  const basicSmokeResultPath = path.resolve(workspaceRoot, options.basicSmokeResult ?? path.join(effectiveHandoffDir, DEFAULT_BASIC_SMOKE_RESULT_NAME));
  const guiSessionResultPath = path.resolve(workspaceRoot, options.guiSessionResult ?? path.join(effectiveHandoffDir, DEFAULT_GUI_SESSION_RESULT_NAME));

  assertInsideRoot(workspaceRoot, manualResultPath, 'fresh Windows manual result');
  assertInsideRoot(workspaceRoot, basicSmokeResultPath, 'fresh Windows basic smoke result');
  assertInsideRoot(workspaceRoot, guiSessionResultPath, 'fresh Windows GUI session result');

  const manualAcceptance = validateFreshWindowsManualAcceptance({
    rootDir: workspaceRoot,
    handoffDir: normalizeRelative(workspaceRoot, effectiveHandoffDir),
    resultPath: normalizeRelative(workspaceRoot, manualResultPath),
    basicSmokeResultPath: normalizeRelative(workspaceRoot, basicSmokeResultPath),
    guiSessionResultPath: normalizeRelative(workspaceRoot, guiSessionResultPath),
    reportPath: normalizeRelative(workspaceRoot, manualAcceptanceReportPath),
    writeReport: options.writeManualAcceptanceReport !== false,
  });

  const fullVerificationEvidence = validateFullVerificationReport(fullVerificationReport, fullVerificationPath, failures);
  const releaseAcceptanceEvidence = validateReleaseAcceptanceReport(
    releaseAcceptanceReport,
    releaseAcceptancePath,
    fullVerificationEvidence,
    failures,
  );
  const freshWindowsEvidence = validateFreshWindowsEvidence(manualAcceptance.report, failures);

  const report = {
    kind: 'danbi.electron.release-final-gate',
    generatedAt: new Date().toISOString(),
    status: failures.length === 0 ? 'passed' : 'failed',
    productName: releaseAcceptanceReport?.productName ?? manualAcceptance.report.productName ?? null,
    version: releaseAcceptanceReport?.version ?? manualAcceptance.report.version ?? null,
    fullVerificationEvidence,
    releaseAcceptanceEvidence,
    evidencePackageEvidence,
    freshWindowsEvidence,
    reportPaths: {
      fullVerification: normalizeRelative(workspaceRoot, fullVerificationPath),
      releaseAcceptance: normalizeRelative(workspaceRoot, releaseAcceptancePath),
      handoffDir: normalizeRelative(workspaceRoot, handoffDir),
      effectiveHandoffDir: normalizeRelative(workspaceRoot, effectiveHandoffDir),
      evidenceZip: evidenceZipPath ? normalizeRelative(workspaceRoot, evidenceZipPath) : null,
      evidenceZipSha256: evidenceZipSha256Path ? normalizeRelative(workspaceRoot, evidenceZipSha256Path) : null,
      evidenceReport: evidenceReportPath && (evidenceReportRequired || existsSync(evidenceReportPath))
        ? normalizeRelative(workspaceRoot, evidenceReportPath)
        : null,
      evidenceStagingDir: evidenceZipPath ? normalizeRelative(workspaceRoot, evidenceStagingDir) : null,
      manualResult: normalizeRelative(workspaceRoot, manualResultPath),
      basicSmokeResult: normalizeRelative(workspaceRoot, basicSmokeResultPath),
      guiSessionResult: normalizeRelative(workspaceRoot, guiSessionResultPath),
      manualAcceptance: normalizeRelative(workspaceRoot, manualAcceptanceReportPath),
      finalGate: normalizeRelative(workspaceRoot, finalGateReportPath),
    },
    failures,
    warnings,
  };

  if (options.writeReport !== false) {
    mkdirSync(path.dirname(finalGateReportPath), { recursive: true });
    writeFileSync(finalGateReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  return {
    report,
    reportPath: normalizeRelative(workspaceRoot, finalGateReportPath),
  };
}

function validateFullVerificationReport(report, reportPath, failures) {
  if (!report) {
    return { status: 'missing', path: normalizeSlash(reportPath) };
  }

  const resultIds = new Set((report.results ?? []).map((result) => result.id));
  const missingGateIds = REQUIRED_FULL_GATE_IDS.filter((id) => !resultIds.has(id));
  const failedGateIds = (report.results ?? [])
    .filter((result) => result.status !== 'passed')
    .map((result) => result.id);

  if (report.status !== 'passed') {
    failures.push(`Full release verification must be passed, got ${report.status}.`);
  }
  if (report.profile !== 'full') {
    failures.push(`Full release verification profile must be full, got ${report.profile}.`);
  }
  if (report.dryRun !== false) {
    failures.push('Full release verification must not be a dry run.');
  }
  if (Number(report.failedCount ?? 0) !== 0) {
    failures.push(`Full release verification failedCount must be 0, got ${report.failedCount}.`);
  }
  if (missingGateIds.length > 0) {
    failures.push(`Full release verification is missing required gate(s): ${missingGateIds.join(', ')}`);
  }
  if (failedGateIds.length > 0) {
    failures.push(`Full release verification has non-passing gate(s): ${failedGateIds.join(', ')}`);
  }

  return {
    status: report.status ?? 'unknown',
    profile: report.profile ?? null,
    dryRun: report.dryRun ?? null,
    passedCount: report.passedCount ?? null,
    failedCount: report.failedCount ?? null,
    requiredGateCount: REQUIRED_FULL_GATE_IDS.length,
    missingGateIds,
    failedGateIds,
    path: normalizeSlash(reportPath),
  };
}

function validateReleaseAcceptanceReport(report, reportPath, fullVerificationEvidence, failures) {
  if (!report) {
    return { status: 'missing', path: normalizeSlash(reportPath) };
  }

  if (report.status !== 'passed') {
    failures.push(`Release acceptance must be passed, got ${report.status}.`);
  }
  if (report.evidence?.verification?.status !== 'passed') {
    failures.push(`Release acceptance verification evidence must be passed, got ${report.evidence?.verification?.status}.`);
  }
  if (Number(report.evidence?.verification?.passedCount ?? 0) < REQUIRED_FULL_GATE_IDS.length) {
    failures.push(`Release acceptance verification evidence must include at least ${REQUIRED_FULL_GATE_IDS.length} passed gates.`);
  }
  if (fullVerificationEvidence.status === 'passed' && report.evidence?.verification?.profile !== 'full') {
    failures.push('Release acceptance must reference full verification evidence.');
  }
  if (!Array.isArray(report.evidence?.renderOutputs) || report.evidence.renderOutputs.length < 4) {
    failures.push('Release acceptance must include all required render output evidence.');
  }

  return {
    status: report.status ?? 'unknown',
    productName: report.productName ?? null,
    version: report.version ?? null,
    installer: report.expectedInstallerName ?? null,
    verificationStatus: report.evidence?.verification?.status ?? null,
    verificationPassedCount: report.evidence?.verification?.passedCount ?? null,
    renderOutputCount: Array.isArray(report.evidence?.renderOutputs) ? report.evidence.renderOutputs.length : 0,
    failureCount: Array.isArray(report.failures) ? report.failures.length : null,
    path: normalizeSlash(reportPath),
  };
}

function validateFreshWindowsEvidence(report, failures) {
  if (report.status !== 'passed') {
    failures.push(`Fresh Windows manual acceptance must be passed, got ${report.status}.`);
  }
  if (report.checksumEvidence?.status !== 'passed') {
    failures.push(`Fresh Windows handoff checksum evidence must be passed, got ${report.checksumEvidence?.status}.`);
  }
  if (report.basicSmokeEvidence?.status !== 'passed') {
    failures.push(`Fresh Windows basic smoke evidence must be passed, got ${report.basicSmokeEvidence?.status}.`);
  }
  if (report.guiSessionEvidence?.status !== 'passed') {
    failures.push(`Fresh Windows GUI session evidence must be passed, got ${report.guiSessionEvidence?.status}.`);
  }
  if (report.cleanupEvidence?.status !== 'passed') {
    failures.push(`Fresh Windows cleanup evidence must be passed, got ${report.cleanupEvidence?.status}.`);
  }
  if (report.outputEvidence?.status !== 'passed') {
    failures.push(`Fresh Windows output MP4 evidence must be passed, got ${report.outputEvidence?.status}.`);
  }
  for (const failure of report.failures ?? []) {
    failures.push(`Fresh Windows manual acceptance detail: ${failure}`);
  }

  return {
    status: report.status ?? 'unknown',
    tester: report.tester ?? null,
    checkedAt: report.checkedAt ?? null,
    checksumStatus: report.checksumEvidence?.status ?? null,
    checksumFileCount: Array.isArray(report.checksumEvidence?.files) ? report.checksumEvidence.files.length : null,
    basicSmokeStatus: report.basicSmokeEvidence?.status ?? null,
    guiSessionStatus: report.guiSessionEvidence?.status ?? null,
    cleanupStatus: report.cleanupEvidence?.status ?? null,
    outputStatus: report.outputEvidence?.status ?? null,
    outputSha256: report.outputEvidence?.sha256 ?? null,
    failureCount: Array.isArray(report.failures) ? report.failures.length : null,
    failures: report.failures ?? [],
  };
}

function prepareEvidenceZipHandoff(options) {
  const {
    workspaceRoot,
    baseHandoffDir,
    evidenceZipPath,
    evidenceZipSha256Path,
    evidenceReportPath,
    evidenceReportRequired,
    evidenceStagingDir,
    failures,
  } = options;
  const startFailureCount = failures.length;
  const evidenceExtractionDir = `${evidenceStagingDir}-contents`;
  const evidence = {
    status: 'failed',
    zipPath: normalizeRelative(workspaceRoot, evidenceZipPath),
    sha256Path: normalizeRelative(workspaceRoot, evidenceZipSha256Path),
    stagingDir: normalizeRelative(workspaceRoot, evidenceStagingDir),
    extractionDir: normalizeRelative(workspaceRoot, evidenceExtractionDir),
    bytes: null,
    sha256: null,
    sidecarBytes: null,
    sidecarFileSha256: null,
    packageReportBytes: null,
    packageReportSha256: null,
    sidecarFileName: null,
    zipEntryInspectionStatus: 'not-run',
    zipEntries: [],
    unsafeEntries: [],
    duplicateEntries: [],
    archiveDirectories: [],
    archiveFiles: [],
    missingFiles: [],
    unexpectedEntries: [],
    packageReportVerification: {
      status: 'not-provided',
      sourcePath: null,
      kind: null,
      archiveBytes: null,
      archiveSha256: null,
      summaryBytes: null,
      summarySha256: null,
      checks: {
        reportPresent: false,
        kindValid: null,
        statusPassed: null,
        archiveBytesMatchSource: null,
        archiveSha256MatchSource: null,
        archiveFileNameMatchesSidecar: null,
        summaryFingerprintMatchesArchive: null,
        zipEntryInspectionMatchesArchive: null,
      },
    },
    handoffReferenceStatus: null,
    handoffReferenceFiles: [],
    summaryStatus: null,
    summaryEvidenceJsonStatus: null,
    summaryEvidenceJson: [],
    summaryHandoffReferenceStatus: null,
    summaryHandoffReferences: null,
    summaryManualResultStatus: null,
    summaryManualResult: null,
    summaryTimelineStatus: null,
    summaryTimeline: null,
    summaryMetadataStatus: null,
    summaryMetadata: null,
    summaryFiles: [],
    summaryMissingFiles: [],
    summaryUnexpectedFiles: [],
    summaryDuplicateFiles: [],
    outputMp4: null,
  };

  const zipStats = statSync(evidenceZipPath, { throwIfNoEntry: false });
  if (!zipStats?.isFile()) {
    failures.push(`Missing fresh Windows evidence ZIP: ${evidenceZipPath}`);
    return evidence;
  }
  const sidecar = readEvidenceZipSidecar(evidenceZipSha256Path, failures);
  const actualSha256 = hashFile(evidenceZipPath);
  const sidecarFile = readFileTransferMetadata(evidenceZipSha256Path);
  const packageReportFile = readFileTransferMetadata(evidenceReportPath);
  evidence.bytes = zipStats.size;
  evidence.sha256 = actualSha256;
  evidence.sidecarBytes = sidecarFile.bytes;
  evidence.sidecarFileSha256 = sidecarFile.sha256;
  evidence.packageReportBytes = packageReportFile.bytes;
  evidence.packageReportSha256 = packageReportFile.sha256;
  if (sidecar) {
    evidence.sidecarFileName = sidecar.fileName ?? null;
    if (sidecar.sha256 !== actualSha256) {
      failures.push(`Fresh Windows evidence ZIP SHA-256 mismatch: ${normalizeRelative(workspaceRoot, evidenceZipPath)}`);
    }
    const zipName = path.basename(evidenceZipPath);
    if (sidecar.fileName && sidecar.fileName !== zipName) {
      failures.push(`Fresh Windows evidence ZIP checksum sidecar must reference ${zipName}, got ${sidecar.fileName}.`);
    }
  }

  if (failures.length !== startFailureCount) {
    return evidence;
  }

  const entryInspection = inspectEvidenceZipEntries(evidenceZipPath);
  evidence.zipEntryInspectionStatus = entryInspection.status;
  evidence.zipEntries = entryInspection.entries;
  evidence.unsafeEntries = entryInspection.unsafeEntries;
  evidence.duplicateEntries = entryInspection.duplicateEntries;
  evidence.archiveDirectories = entryInspection.directories;
  evidence.archiveFiles = entryInspection.files;
  evidence.missingFiles = REQUIRED_EVIDENCE_ZIP_FILES.filter((file) => !entryInspection.files.includes(file));
  evidence.unexpectedEntries = [
    ...entryInspection.directories,
    ...entryInspection.files.filter((file) => !ALLOWED_EVIDENCE_ZIP_FILES.has(file)),
  ].sort();

  if (entryInspection.status !== 'passed') {
    failures.push(`Fresh Windows evidence ZIP could not be inspected before extraction: ${entryInspection.stderrTail || 'ZIP entry listing failed'}`);
  }
  if (evidence.unsafeEntries.length > 0) {
    failures.push(`Fresh Windows evidence ZIP contains unsafe entries: ${evidence.unsafeEntries.join(', ')}`);
  }
  if (evidence.duplicateEntries.length > 0) {
    failures.push(`Fresh Windows evidence ZIP contains duplicate entries: ${evidence.duplicateEntries.join(', ')}`);
  }
  if (evidence.unexpectedEntries.length > 0) {
    failures.push(`Fresh Windows evidence ZIP contains unexpected entr${evidence.unexpectedEntries.length === 1 ? 'y' : 'ies'}: ${evidence.unexpectedEntries.join(', ')}`);
  }
  if (evidence.missingFiles.length > 0) {
    failures.push(`Fresh Windows evidence ZIP is missing required file(s): ${evidence.missingFiles.join(', ')}`);
  }
  if (failures.length !== startFailureCount) {
    return evidence;
  }

  try {
    rmSync(evidenceStagingDir, { recursive: true, force: true });
    rmSync(evidenceExtractionDir, { recursive: true, force: true });
    mkdirSync(path.dirname(evidenceStagingDir), { recursive: true });
    mkdirSync(evidenceExtractionDir, { recursive: true });
  } catch (error) {
    failures.push(`Failed to prepare fresh Windows evidence extraction directory: ${error instanceof Error ? error.message : String(error)}`);
    return evidence;
  }

  const expandResult = spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    'Expand-Archive -LiteralPath $env:DANBI_EVIDENCE_ZIP -DestinationPath $env:DANBI_EVIDENCE_STAGING_DIR -Force',
  ], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      DANBI_EVIDENCE_ZIP: evidenceZipPath,
      DANBI_EVIDENCE_STAGING_DIR: evidenceExtractionDir,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (expandResult.error || expandResult.status !== 0) {
    failures.push(`Failed to expand fresh Windows evidence ZIP: ${expandResult.error?.message ?? expandResult.stderr}`);
    cleanupEvidenceExtractionDir(evidenceExtractionDir);
    return evidence;
  }

  validateEvidenceZipContents(evidenceExtractionDir, evidence, failures);
  if (failures.length !== startFailureCount) {
    cleanupEvidenceExtractionDir(evidenceExtractionDir);
    return evidence;
  }

  validateEvidenceZipHandoffReferences(evidenceExtractionDir, baseHandoffDir, evidence, failures);
  if (failures.length !== startFailureCount) {
    cleanupEvidenceExtractionDir(evidenceExtractionDir);
    return evidence;
  }

  try {
    cpSync(baseHandoffDir, evidenceStagingDir, { recursive: true });
    for (const file of STAGED_EVIDENCE_ZIP_FILES) {
      const sourcePath = path.join(evidenceExtractionDir, file);
      const targetPath = path.join(evidenceStagingDir, file);
      mkdirSync(path.dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
  } catch (error) {
    failures.push(`Failed to stage fresh Windows evidence ZIP contents: ${error instanceof Error ? error.message : String(error)}`);
    cleanupEvidenceExtractionDir(evidenceExtractionDir);
    return evidence;
  }
  cleanupEvidenceExtractionDir(evidenceExtractionDir);

  validateEvidencePackageSummary(evidenceStagingDir, evidence, failures, options.releaseAcceptanceReport);
  validateEvidencePackageReport({
    workspaceRoot,
    evidenceZipPath,
    evidenceReportPath,
    evidenceReportRequired,
    evidenceStagingDir,
    evidence,
    failures,
  });
  if (failures.length !== startFailureCount) {
    return evidence;
  }

  evidence.status = 'passed';
  return evidence;
}

function validateEvidencePackageReport(options) {
  const {
    workspaceRoot,
    evidenceReportPath,
    evidenceReportRequired,
    evidenceStagingDir,
    evidence,
    failures,
  } = options;
  const verification = evidence.packageReportVerification;
  const reportExists = Boolean(evidenceReportPath && existsSync(evidenceReportPath));

  verification.sourcePath = reportExists || evidenceReportRequired
    ? normalizeRelative(workspaceRoot, evidenceReportPath)
    : null;
  verification.checks.reportPresent = reportExists;

  if (!reportExists) {
    if (evidenceReportRequired) {
      verification.status = 'failed';
      failures.push(`Missing fresh Windows evidence package report: ${evidenceReportPath}`);
      failures.push('Fresh Windows evidence package report verification failed: reportPresent.');
    }
    return;
  }

  verification.status = 'failed';
  let packageReport;
  try {
    packageReport = parseJsonFile(evidenceReportPath);
  } catch (error) {
    failures.push(`Fresh Windows evidence package report is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const reportFailureStart = failures.length;
  const summaryPath = path.join(evidenceStagingDir, 'fresh-windows-evidence-summary.json');
  const summaryStats = statSync(summaryPath, { throwIfNoEntry: false });
  const summarySha256 = summaryStats?.isFile() ? hashFile(summaryPath) : null;
  verification.kind = packageReport.kind ?? null;
  verification.archiveBytes = packageReport.archive?.bytes ?? null;
  verification.archiveSha256 = packageReport.archive?.sha256 ?? null;
  verification.summaryBytes = packageReport.summary?.bytes ?? null;
  verification.summarySha256 = packageReport.summary?.sha256 ?? null;
  verification.checks.kindValid = packageReport.kind === 'danbi.electron.fresh-windows-evidence-package-report';
  verification.checks.statusPassed = packageReport.status === 'passed';
  verification.checks.archiveBytesMatchSource = Number(packageReport.archive?.bytes) === evidence.bytes;
  verification.checks.archiveSha256MatchSource = String(packageReport.archive?.sha256 ?? '').toLowerCase() === evidence.sha256;
  verification.checks.archiveFileNameMatchesSidecar = evidence.sidecarFileName
    ? packageReport.archive?.fileName === evidence.sidecarFileName
    : null;
  verification.checks.summaryFingerprintMatchesArchive = Boolean(summaryStats?.isFile())
    && Number(packageReport.summary?.bytes) === summaryStats.size
    && String(packageReport.summary?.sha256 ?? '').toLowerCase() === summarySha256;
  verification.checks.zipEntryInspectionMatchesArchive = packageReportZipEntryInspectionMatchesArchive(
    packageReport.zipEntryInspection,
    evidence,
  );

  for (const [check, passed] of Object.entries(verification.checks)) {
    if (passed === false) {
      failures.push(`Fresh Windows evidence package report verification failed: ${check}.`);
    }
  }

  if (failures.length === reportFailureStart) {
    verification.status = 'passed';
  }
}

function packageReportZipEntryInspectionMatchesArchive(reportInspection, evidence) {
  if (!reportInspection || typeof reportInspection !== 'object') {
    return false;
  }
  if (reportInspection.status !== evidence.zipEntryInspectionStatus) {
    return false;
  }
  return arraysEqual(normalizeStringArray(reportInspection.entries), evidence.zipEntries)
    && arraysEqual(normalizeStringArray(reportInspection.files), evidence.archiveFiles)
    && arraysEqual(normalizeStringArray(reportInspection.directories), evidence.archiveDirectories)
    && arraysEqual(normalizeStringArray(reportInspection.missingFiles), evidence.missingFiles)
    && arraysEqual(normalizeStringArray(reportInspection.unexpectedEntries), evidence.unexpectedEntries)
    && arraysEqual(normalizeStringArray(reportInspection.unsafeEntries), evidence.unsafeEntries)
    && arraysEqual(normalizeStringArray(reportInspection.duplicateEntries), evidence.duplicateEntries);
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

function cleanupEvidenceExtractionDir(extractionDir) {
  try {
    rmSync(extractionDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only; validation has already accepted or rejected the ZIP.
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
      '$archive = [System.IO.Compression.ZipFile]::OpenRead($env:DANBI_EVIDENCE_ZIP)',
      'try {',
      '  @($archive.Entries | ForEach-Object { [PSCustomObject]@{ FullName = $_.FullName } }) | ConvertTo-Json -Compress -Depth 3',
      '} finally {',
      '  $archive.Dispose()',
      '}',
    ].join('; '),
  ], {
    env: {
      ...process.env,
      DANBI_EVIDENCE_ZIP: zipPath,
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

function validateEvidenceZipContents(extractionDir, evidence, failures) {
  const entries = listArchiveEntries(extractionDir);
  const archiveFiles = entries.files.sort();
  const unexpectedEntries = [
    ...entries.directories,
    ...entries.otherEntries,
    ...archiveFiles.filter((file) => !ALLOWED_EVIDENCE_ZIP_FILES.has(file)),
  ].sort();
  const missingFiles = REQUIRED_EVIDENCE_ZIP_FILES.filter((file) => !archiveFiles.includes(file));

  evidence.archiveFiles = archiveFiles;
  evidence.missingFiles = missingFiles;
  evidence.unexpectedEntries = unexpectedEntries;

  if (unexpectedEntries.length > 0) {
    failures.push(`Fresh Windows evidence ZIP contains unexpected entr${unexpectedEntries.length === 1 ? 'y' : 'ies'}: ${unexpectedEntries.join(', ')}`);
  }
  if (missingFiles.length > 0) {
    failures.push(`Fresh Windows evidence ZIP is missing required file(s): ${missingFiles.join(', ')}`);
  }
}

function listArchiveEntries(rootPath, currentPath = rootPath) {
  const result = {
    files: [],
    directories: [],
    otherEntries: [],
  };
  for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
    const absolutePath = path.join(currentPath, entry.name);
    const relativePath = normalizeSlash(path.relative(rootPath, absolutePath));
    if (entry.isDirectory()) {
      result.directories.push(relativePath);
      const childEntries = listArchiveEntries(rootPath, absolutePath);
      result.files.push(...childEntries.files);
      result.directories.push(...childEntries.directories);
      result.otherEntries.push(...childEntries.otherEntries);
    } else if (entry.isFile()) {
      result.files.push(relativePath);
    } else {
      result.otherEntries.push(relativePath);
    }
  }
  return result;
}

function validateEvidenceZipHandoffReferences(extractionDir, baseHandoffDir, evidence, failures) {
  const startFailureCount = failures.length;
  const referenceFiles = [];

  for (const file of HANDOFF_REFERENCE_ZIP_FILES) {
    const returnedPath = path.join(extractionDir, file);
    const localPath = path.join(baseHandoffDir, file);
    const returnedStats = statSync(returnedPath, { throwIfNoEntry: false });
    const localStats = statSync(localPath, { throwIfNoEntry: false });
    const reference = {
      path: file,
      status: 'failed',
      localBytes: localStats?.isFile() ? localStats.size : null,
      returnedBytes: returnedStats?.isFile() ? returnedStats.size : null,
      localSha256: null,
      returnedSha256: null,
    };

    if (!localStats?.isFile()) {
      failures.push(`Missing local handoff reference file for evidence ZIP validation: ${file}`);
      referenceFiles.push(reference);
      continue;
    }
    if (!returnedStats?.isFile()) {
      failures.push(`Fresh Windows evidence ZIP must include handoff reference file: ${file}`);
      referenceFiles.push(reference);
      continue;
    }

    reference.localSha256 = hashFile(localPath);
    reference.returnedSha256 = hashFile(returnedPath);
    if (reference.localBytes !== reference.returnedBytes || reference.localSha256 !== reference.returnedSha256) {
      failures.push(`Fresh Windows evidence ZIP handoff reference file must match local handoff: ${file}.`);
    } else {
      reference.status = 'passed';
    }
    referenceFiles.push(reference);
  }

  evidence.handoffReferenceFiles = referenceFiles;
  evidence.handoffReferenceStatus = failures.length === startFailureCount
    && referenceFiles.length === HANDOFF_REFERENCE_ZIP_FILES.length
    && referenceFiles.every((file) => file.status === 'passed')
    ? 'passed'
    : 'failed';
}

function validateEvidencePackageSummary(evidenceStagingDir, evidence, failures, releaseAcceptanceReport) {
  const summaryPath = path.join(evidenceStagingDir, 'fresh-windows-evidence-summary.json');
  if (!existsSync(summaryPath)) {
    failures.push('Fresh Windows evidence ZIP must include fresh-windows-evidence-summary.json.');
    evidence.summaryStatus = 'missing';
    return;
  }

  let summary;
  try {
    summary = parseJsonFile(summaryPath);
  } catch (error) {
    failures.push(`Fresh Windows evidence summary is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    evidence.summaryStatus = 'failed';
    return;
  }

  evidence.summaryStatus = 'failed';
  const summaryStartFailureCount = failures.length;
  if (summary.kind !== 'danbi.electron.fresh-windows-evidence-package-summary') {
    failures.push(`Fresh Windows evidence summary kind is invalid: ${summary.kind}`);
  }
  validateEvidenceSummaryMetadata(summary, releaseAcceptanceReport, evidence, failures);
  validateEvidenceSummaryFiles(summary, evidence, failures);
  validateEvidenceSummaryEvidenceJson(summary, evidenceStagingDir, evidence, failures);
  validateEvidenceSummaryHandoffReferences(summary, evidence, failures);
  validateEvidenceSummaryManualResult(summary, evidenceStagingDir, evidence, failures);
  validateEvidenceSummaryTimeline(summary, evidence, failures);

  const outputPath = summary.outputMp4?.path;
  if (!isSafeRelativePath(outputPath) || !/\.mp4$/i.test(outputPath)) {
    failures.push(`Fresh Windows evidence summary output MP4 path must be a safe relative MP4 path, got ${outputPath}.`);
    return;
  }

  const outputFilePath = path.resolve(evidenceStagingDir, outputPath);
  if (!isInsidePath(evidenceStagingDir, outputFilePath)) {
    failures.push(`Fresh Windows evidence summary output MP4 path escapes staging directory: ${outputPath}.`);
    return;
  }

  const stats = statSync(outputFilePath, { throwIfNoEntry: false });
  if (!stats?.isFile()) {
    failures.push(`Fresh Windows evidence summary output MP4 is missing: ${outputPath}.`);
    return;
  }

  const expectedBytes = Number(summary.outputMp4?.bytes);
  const expectedSha256 = String(summary.outputMp4?.sha256 ?? '').toLowerCase();
  const actualSha256 = hashFile(outputFilePath);
  if (!Number.isFinite(expectedBytes) || expectedBytes !== stats.size) {
    failures.push(`Fresh Windows evidence summary output MP4 byte count must match ${outputPath}.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256) || expectedSha256 !== actualSha256) {
    failures.push(`Fresh Windows evidence summary output MP4 SHA-256 must match ${outputPath}.`);
  }

  evidence.outputMp4 = {
    path: normalizeSlash(outputPath),
    bytes: stats.size,
    sha256: actualSha256,
  };
  if (failures.length === summaryStartFailureCount) {
    evidence.summaryStatus = 'passed';
  }
}

function validateEvidenceSummaryMetadata(summary, releaseAcceptanceReport, evidence, failures) {
  evidence.summaryMetadataStatus = 'failed';
  evidence.summaryMetadata = {
    productName: summary.productName ?? null,
    version: summary.version ?? null,
    installer: summary.installer ?? null,
    tester: summary.tester ?? null,
    checkedAt: summary.checkedAt ?? null,
  };
  const metadataStartFailureCount = failures.length;

  if (!releaseAcceptanceReport) {
    evidence.summaryMetadataStatus = 'skipped';
    return;
  }

  const expected = {
    productName: releaseAcceptanceReport.productName,
    version: releaseAcceptanceReport.version,
    installer: releaseAcceptanceReport.expectedInstallerName,
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (summary[field] !== expectedValue) {
      failures.push(`Fresh Windows evidence summary ${field} must match release acceptance (${formatSummaryValue(expectedValue)}), got ${formatSummaryValue(summary[field])}.`);
    }
  }

  if (failures.length === metadataStartFailureCount) {
    evidence.summaryMetadataStatus = 'passed';
  }
}

function validateEvidenceSummaryFiles(summary, evidence, failures) {
  if (!Array.isArray(summary.files)) {
    failures.push('Fresh Windows evidence summary files must list the required ZIP files.');
    return;
  }

  const invalidFiles = summary.files.filter((file) => !isSafeRelativePath(file));
  const summaryFiles = summary.files
    .filter((file) => typeof file === 'string')
    .map((file) => normalizeSlash(file));
  const summaryFileSet = new Set(summaryFiles);
  const duplicateFiles = [...new Set(summaryFiles.filter((file, index) => summaryFiles.indexOf(file) !== index))].sort();
  const missingFiles = REQUIRED_EVIDENCE_ZIP_FILES.filter((file) => !summaryFileSet.has(file));
  const unexpectedFiles = summaryFiles.filter((file) => !ALLOWED_EVIDENCE_ZIP_FILES.has(file)).sort();

  evidence.summaryFiles = summaryFiles;
  evidence.summaryMissingFiles = missingFiles;
  evidence.summaryUnexpectedFiles = unexpectedFiles;
  evidence.summaryDuplicateFiles = duplicateFiles;

  if (invalidFiles.length > 0) {
    failures.push(`Fresh Windows evidence summary files must be safe relative paths: ${invalidFiles.map(formatSummaryValue).join(', ')}`);
  }
  if (missingFiles.length > 0 || unexpectedFiles.length > 0 || duplicateFiles.length > 0) {
    const details = [];
    if (missingFiles.length > 0) {
      details.push(`missing: ${missingFiles.join(', ')}`);
    }
    if (unexpectedFiles.length > 0) {
      details.push(`unexpected: ${unexpectedFiles.join(', ')}`);
    }
    if (duplicateFiles.length > 0) {
      details.push(`duplicate: ${duplicateFiles.join(', ')}`);
    }
    failures.push(`Fresh Windows evidence summary files must match required ZIP file list (${details.join('; ')}).`);
  }
}

function validateEvidenceSummaryEvidenceJson(summary, evidenceStagingDir, evidence, failures) {
  const startFailureCount = failures.length;
  evidence.summaryEvidenceJsonStatus = 'failed';
  evidence.summaryEvidenceJson = [];

  if (!summary.evidenceJson || typeof summary.evidenceJson !== 'object') {
    failures.push('Fresh Windows evidence summary must include evidenceJson.');
    return;
  }

  const expected = {
    basicSmoke: 'fresh-windows-basic-smoke.json',
    guiSession: 'fresh-windows-gui-session.json',
    manualResult: 'fresh-windows-result.json',
  };
  for (const [key, expectedPath] of Object.entries(expected)) {
    const actual = summary.evidenceJson[key];
    const result = {
      key,
      path: actual?.path ?? null,
      status: 'failed',
      bytes: null,
      sha256: null,
    };
    if (!actual || typeof actual !== 'object') {
      failures.push(`Fresh Windows evidence summary evidenceJson.${key} must describe ${expectedPath}.`);
      evidence.summaryEvidenceJson.push(result);
      continue;
    }

    const actualPath = normalizeSlash(String(actual.path ?? ''));
    const actualBytes = Number(actual.bytes);
    const actualSha256 = String(actual.sha256 ?? '').toLowerCase();
    result.path = actualPath;
    result.bytes = Number.isFinite(actualBytes) ? actualBytes : null;
    result.sha256 = /^[a-f0-9]{64}$/i.test(actualSha256) ? actualSha256 : null;

    if (actualPath !== expectedPath) {
      failures.push(`Fresh Windows evidence summary evidenceJson.${key}.path must be ${expectedPath}, got ${formatSummaryValue(actual.path)}.`);
      evidence.summaryEvidenceJson.push(result);
      continue;
    }

    const filePath = path.resolve(evidenceStagingDir, actualPath);
    if (!isInsidePath(evidenceStagingDir, filePath)) {
      failures.push(`Fresh Windows evidence summary evidenceJson.${key}.path escapes staging directory: ${actualPath}.`);
      evidence.summaryEvidenceJson.push(result);
      continue;
    }

    const stats = statSync(filePath, { throwIfNoEntry: false });
    if (!stats?.isFile()) {
      failures.push(`Fresh Windows evidence summary evidenceJson.${key} file is missing: ${actualPath}.`);
      evidence.summaryEvidenceJson.push(result);
      continue;
    }

    const fileSha256 = hashFile(filePath);
    if (!Number.isFinite(actualBytes) || actualBytes !== stats.size) {
      failures.push(`Fresh Windows evidence summary evidenceJson.${key}.bytes must match ${actualPath}.`);
    }
    if (!/^[a-f0-9]{64}$/i.test(actualSha256) || actualSha256 !== fileSha256) {
      failures.push(`Fresh Windows evidence summary evidenceJson.${key}.sha256 must match ${actualPath}.`);
    }

    result.bytes = stats.size;
    result.sha256 = fileSha256;
    result.status = failures.length === startFailureCount || !failures.some((failure) => String(failure).includes(`evidenceJson.${key}`))
      ? 'passed'
      : 'failed';
    evidence.summaryEvidenceJson.push(result);
  }

  if (failures.length === startFailureCount) {
    evidence.summaryEvidenceJsonStatus = 'passed';
  }
}

function validateEvidenceSummaryHandoffReferences(summary, evidence, failures) {
  const startFailureCount = failures.length;
  evidence.summaryHandoffReferenceStatus = 'failed';
  evidence.summaryHandoffReferences = summary.handoffReferences ?? null;

  if (!summary.handoffReferences || typeof summary.handoffReferences !== 'object') {
    failures.push('Fresh Windows evidence summary must include handoffReferences.');
    return;
  }

  const expected = {
    manifest: 'handoff-manifest.json',
    checksums: 'SHA256SUMS.txt',
  };
  const referenceByPath = new Map((evidence.handoffReferenceFiles ?? []).map((reference) => [reference.path, reference]));

  for (const [key, expectedPath] of Object.entries(expected)) {
    const actual = summary.handoffReferences[key];
    const reference = referenceByPath.get(expectedPath);
    if (!actual || typeof actual !== 'object') {
      failures.push(`Fresh Windows evidence summary handoffReferences.${key} must describe ${expectedPath}.`);
      continue;
    }
    const actualPath = normalizeSlash(String(actual.path ?? ''));
    const actualBytes = Number(actual.bytes);
    const actualSha256 = String(actual.sha256 ?? '').toLowerCase();
    if (actualPath !== expectedPath) {
      failures.push(`Fresh Windows evidence summary handoffReferences.${key}.path must be ${expectedPath}, got ${formatSummaryValue(actual.path)}.`);
    }
    if (!reference || reference.status !== 'passed') {
      failures.push(`Fresh Windows evidence summary handoffReferences.${key} cannot be verified because ${expectedPath} did not pass reference validation.`);
      continue;
    }
    if (!Number.isFinite(actualBytes) || actualBytes !== reference.localBytes || actualBytes !== reference.returnedBytes) {
      failures.push(`Fresh Windows evidence summary handoffReferences.${key}.bytes must match ${expectedPath}.`);
    }
    if (!/^[a-f0-9]{64}$/i.test(actualSha256)
      || actualSha256 !== reference.localSha256
      || actualSha256 !== reference.returnedSha256) {
      failures.push(`Fresh Windows evidence summary handoffReferences.${key}.sha256 must match ${expectedPath}.`);
    }
  }

  if (failures.length === startFailureCount) {
    evidence.summaryHandoffReferenceStatus = 'passed';
  }
}

function validateEvidenceSummaryManualResult(summary, evidenceStagingDir, evidence, failures) {
  const startFailureCount = failures.length;
  evidence.summaryManualResultStatus = 'failed';
  const resultPath = path.join(evidenceStagingDir, DEFAULT_MANUAL_RESULT_NAME);
  if (!existsSync(resultPath)) {
    failures.push('Fresh Windows evidence summary cannot be compared because fresh-windows-result.json is missing.');
    return;
  }

  let result;
  try {
    result = parseJsonFile(resultPath);
  } catch (error) {
    failures.push(`Fresh Windows evidence summary cannot be compared because fresh-windows-result.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const output = result.sampleWorkflow?.outputMp4;
  evidence.summaryManualResult = {
    tester: result.tester ?? null,
    checkedAt: result.checkedAt ?? null,
    outputMp4: output ? {
      handoffRelativePath: output.handoffRelativePath ?? null,
      bytes: output.bytes ?? null,
      sha256: output.sha256 ?? null,
      durationSeconds: output.durationSeconds ?? null,
      hasVideo: output.hasVideo ?? null,
      hasAudio: output.hasAudio ?? null,
    } : null,
  };

  if (summary.tester !== result.tester) {
    failures.push(`Fresh Windows evidence summary tester must match fresh-windows-result.json tester (${formatSummaryValue(result.tester)}), got ${formatSummaryValue(summary.tester)}.`);
  }
  if (summary.checkedAt !== result.checkedAt) {
    failures.push(`Fresh Windows evidence summary checkedAt must match fresh-windows-result.json checkedAt (${formatSummaryValue(result.checkedAt)}), got ${formatSummaryValue(summary.checkedAt)}.`);
  }
  if (!output || typeof output !== 'object') {
    failures.push('Fresh Windows evidence summary cannot be compared because fresh-windows-result.json is missing sampleWorkflow.outputMp4.');
  } else {
    const expectedPath = output.handoffRelativePath;
    const expectedBytes = Number(output.bytes);
    const expectedSha256 = String(output.sha256 ?? '').toLowerCase();
    const expectedDurationSeconds = Number(output.durationSeconds);
    if (summary.outputMp4?.path !== expectedPath) {
      failures.push(`Fresh Windows evidence summary outputMp4.path must match fresh-windows-result.json output handoffRelativePath (${formatSummaryValue(expectedPath)}), got ${formatSummaryValue(summary.outputMp4?.path)}.`);
    }
    if (!Number.isFinite(expectedBytes) || Number(summary.outputMp4?.bytes) !== expectedBytes) {
      failures.push('Fresh Windows evidence summary outputMp4.bytes must match fresh-windows-result.json output bytes.');
    }
    if (!/^[a-f0-9]{64}$/i.test(expectedSha256) || String(summary.outputMp4?.sha256 ?? '').toLowerCase() !== expectedSha256) {
      failures.push('Fresh Windows evidence summary outputMp4.sha256 must match fresh-windows-result.json output SHA-256.');
    }
    if (!Number.isFinite(expectedDurationSeconds) || Number(summary.outputMp4?.durationSeconds) !== expectedDurationSeconds) {
      failures.push('Fresh Windows evidence summary outputMp4.durationSeconds must match fresh-windows-result.json output durationSeconds.');
    }
    if (summary.outputMp4?.hasVideo !== output.hasVideo) {
      failures.push('Fresh Windows evidence summary outputMp4.hasVideo must match fresh-windows-result.json output hasVideo.');
    }
    if (summary.outputMp4?.hasAudio !== output.hasAudio) {
      failures.push('Fresh Windows evidence summary outputMp4.hasAudio must match fresh-windows-result.json output hasAudio.');
    }
  }

  if (failures.length === startFailureCount) {
    evidence.summaryManualResultStatus = 'passed';
  }
}

function validateEvidenceSummaryTimeline(summary, evidence, failures) {
  const startFailureCount = failures.length;
  evidence.summaryTimelineStatus = 'failed';
  const checkedAtTime = parseIsoTime(summary.checkedAt);
  const packagedAtTime = parseIsoTime(summary.packagedAt);
  evidence.summaryTimeline = {
    checkedAt: summary.checkedAt ?? null,
    packagedAt: summary.packagedAt ?? null,
  };

  if (checkedAtTime === null) {
    failures.push(`Fresh Windows evidence summary checkedAt must be an ISO-like timestamp, got ${formatSummaryValue(summary.checkedAt)}.`);
  }
  if (packagedAtTime === null) {
    failures.push(`Fresh Windows evidence summary packagedAt must be an ISO-like timestamp, got ${formatSummaryValue(summary.packagedAt)}.`);
  }
  if (checkedAtTime !== null && packagedAtTime !== null && packagedAtTime < checkedAtTime) {
    failures.push('Fresh Windows evidence summary packagedAt must not be before checkedAt.');
  }

  if (failures.length === startFailureCount) {
    evidence.summaryTimelineStatus = 'passed';
  }
}

function readEvidenceZipSidecar(sidecarPath, failures) {
  if (!existsSync(sidecarPath)) {
    failures.push(`Missing fresh Windows evidence ZIP checksum sidecar: ${sidecarPath}`);
    return null;
  }
  const lines = stripJsonBom(readFileSync(sidecarPath, 'utf8'))
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

function readJsonIfPresent(filePath, failures, label) {
  if (!existsSync(filePath)) {
    failures.push(`Missing ${label}: ${filePath}`);
    return null;
  }
  return parseJsonFile(filePath);
}

function parseJsonFile(filePath) {
  return JSON.parse(stripJsonBom(readFileSync(filePath, 'utf8')));
}

function stripJsonBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
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

function assertInsideRoot(workspaceRoot, targetPath, label) {
  const relative = path.relative(workspaceRoot, targetPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside workspace: ${targetPath}`);
  }
}

function isInsidePath(parentPath, targetPath) {
  const relative = path.relative(parentPath, targetPath);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim() || value.includes('\0')) {
    return false;
  }
  const slashPath = normalizeSlash(value);
  if (slashPath.startsWith('/') || /^[A-Za-z]:/.test(slashPath) || path.isAbsolute(value)) {
    return false;
  }
  const segments = slashPath.split('/');
  if (segments.some((part) => !part || part === '.' || part === '..')) {
    return false;
  }
  return path.posix.normalize(slashPath) === slashPath;
}

function formatSummaryValue(value) {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function parseIsoTime(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRelative(workspaceRoot, targetPath) {
  return normalizeSlash(path.relative(workspaceRoot, targetPath));
}

function normalizeSlash(value) {
  return value.replace(/\\/g, '/');
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
    if (arg === '--full-verification-report') {
      options.fullVerificationReport = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--release-acceptance-report') {
      options.releaseAcceptanceReport = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--handoff-dir') {
      options.handoffDir = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--evidence-zip') {
      options.evidenceZip = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--evidence-zip-sha256') {
      options.evidenceZipSha256 = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--evidence-report') {
      options.evidenceReport = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--allow-missing-evidence-report') {
      options.allowMissingEvidenceReport = true;
    } else if (arg === '--evidence-staging-dir') {
      options.evidenceStagingDir = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--manual-result') {
      options.manualResult = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--basic-smoke-result') {
      options.basicSmokeResult = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--gui-session-result') {
      options.guiSessionResult = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--manual-acceptance-report') {
      options.manualAcceptanceReport = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--root-dir') {
      options.rootDir = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--out') {
      options.reportPath = readRequiredValue(argv, ++index, arg);
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
    'Usage: node scripts/electron-release-final-gate.mjs [--full-verification-report <path>] [--release-acceptance-report <path>] [--handoff-dir <path>] [--evidence-zip <path>] [--evidence-zip-sha256 <path>] [--evidence-report <path>] [--allow-missing-evidence-report] [--evidence-staging-dir <path>] [--manual-result <path>] [--basic-smoke-result <path>] [--gui-session-result <path>] [--manual-acceptance-report <path>] [--root-dir <path>] [--out <path>]',
    '',
    'Combines full release verification, release acceptance, and fresh-Windows manual acceptance evidence into one final release gate report. If --evidence-zip is supplied, it verifies the sidecar SHA-256, stages the local handoff, expands the returned ZIP into that staging directory, then validates the staged evidence. The evidence package report is required by default and must match the ZIP archive and staged summary fingerprints; use --allow-missing-evidence-report only for legacy QA returns.',
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
    const { report, reportPath } = validateElectronReleaseFinalGate(options);
    console.log(JSON.stringify({
      status: report.status,
      reportPath,
      fullVerificationStatus: report.fullVerificationEvidence.status,
      releaseAcceptanceStatus: report.releaseAcceptanceEvidence.status,
      evidencePackageStatus: report.evidencePackageEvidence.status,
      freshWindowsStatus: report.freshWindowsEvidence.status,
      failureCount: report.failures.length,
      failures: report.failures,
    }, null, 2));
    if (report.status !== 'passed') {
      console.error(`Electron release final gate failed with ${report.failures.length} issue(s).`);
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
