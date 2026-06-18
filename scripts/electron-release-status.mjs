import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWindowsInstallerArtifactName } from './electron-release-artifacts.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_RELEASE_ROOT = path.join('.danbi', 'electron-release');
const DEFAULT_ELECTRON_RELEASE_DIR = path.join('release', 'electron');
const DEFAULT_FINAL_GATE_REPORT = path.join(DEFAULT_RELEASE_ROOT, 'final-release-gate-report.json');
const DEFAULT_CORE_VERIFICATION_REPORT = path.join(DEFAULT_RELEASE_ROOT, 'release-verification-core.json');
const DEFAULT_FULL_VERIFICATION_REPORT = path.join(DEFAULT_RELEASE_ROOT, 'release-verification-full.json');
const DEFAULT_RELEASE_ACCEPTANCE_REPORT = path.join(DEFAULT_RELEASE_ROOT, 'release-acceptance.json');
const DEFAULT_EVIDENCE_IMPORT_REPORT = path.join(DEFAULT_RELEASE_ROOT, 'returned', 'evidence-import-report.json');
const DEFAULT_HANDOFF_MANIFEST = path.join(DEFAULT_RELEASE_ROOT, 'handoff', 'handoff-manifest.json');
const WINDOWS_RESERVED_BASENAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const REQUIRED_CORE_GATE_IDS = [
  'typecheck',
  'unit-tests',
  'git-diff-check',
  'eslint-clean-check',
  'architecture-check',
  'license-check',
  'plugin-signing-readiness',
  'plugin-signing-custody-audit',
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

export function buildElectronReleaseStatus(options = {}) {
  const workspaceRoot = path.resolve(options.rootDir ?? rootDir);
  const finalGatePath = path.resolve(workspaceRoot, options.finalGateReport ?? DEFAULT_FINAL_GATE_REPORT);
  const coreVerificationPath = path.resolve(workspaceRoot, options.coreVerificationReport ?? DEFAULT_CORE_VERIFICATION_REPORT);
  const fullVerificationPath = path.resolve(workspaceRoot, options.fullVerificationReport ?? DEFAULT_FULL_VERIFICATION_REPORT);
  const releaseAcceptancePath = path.resolve(workspaceRoot, options.releaseAcceptanceReport ?? DEFAULT_RELEASE_ACCEPTANCE_REPORT);
  const evidenceImportPath = path.resolve(workspaceRoot, options.evidenceImportReport ?? DEFAULT_EVIDENCE_IMPORT_REPORT);
  const handoffManifestPath = path.resolve(workspaceRoot, options.handoffManifest ?? DEFAULT_HANDOFF_MANIFEST);

  assertInsideRoot(workspaceRoot, finalGatePath, 'final gate report');
  assertInsideRoot(workspaceRoot, coreVerificationPath, 'core verification report');
  assertInsideRoot(workspaceRoot, fullVerificationPath, 'full verification report');
  assertInsideRoot(workspaceRoot, releaseAcceptancePath, 'release acceptance report');
  assertInsideRoot(workspaceRoot, evidenceImportPath, 'evidence import report');
  assertInsideRoot(workspaceRoot, handoffManifestPath, 'handoff manifest');

  const finalGate = readJsonIfPresent(finalGatePath);
  const coreVerification = readJsonIfPresent(coreVerificationPath);
  const fullVerification = readJsonIfPresent(fullVerificationPath);
  const releaseAcceptance = readJsonIfPresent(releaseAcceptancePath);
  const evidenceImport = readJsonIfPresent(evidenceImportPath);
  const handoffManifest = readJsonIfPresent(handoffManifestPath);
  const workspace = collectWorkspaceState(workspaceRoot, options);

  const checks = buildChecks(finalGate, coreVerification, fullVerification, releaseAcceptance, evidenceImport, handoffManifest, handoffManifestPath, workspaceRoot, options);
  const missingFreshWindowsArtifacts = extractMissingFreshWindowsArtifacts(finalGate);
  const freshWindowsHandoffReadiness = buildFreshWindowsHandoffReadiness(checks, finalGate, missingFreshWindowsArtifacts, workspace, workspaceRoot);
  const externalFreshWindowsEvidenceOnly = isExternalFreshWindowsEvidenceOnly(checks, finalGate, missingFreshWindowsArtifacts, workspace);
  const releaseApproved = isReleaseApproved(checks);
  const status = releaseApproved
    ? 'approved'
    : externalFreshWindowsEvidenceOnly
      ? 'waiting-for-fresh-windows-evidence'
      : 'incomplete';
  const blockerCategory = releaseApproved
    ? null
    : externalFreshWindowsEvidenceOnly
      ? 'fresh-windows-evidence'
      : findPrimaryBlocker(checks);
  const remainingActions = buildRemainingActions(status, checks, missingFreshWindowsArtifacts, freshWindowsHandoffReadiness, workspaceRoot);
  const warnings = buildWarnings(workspace, status, checks, workspaceRoot);
  const approvalPolicy = buildApprovalPolicy(status, workspace, options, checks);

  return {
    kind: 'danbi.electron.release-status',
    generatedAt: new Date().toISOString(),
    status,
    releaseApproved,
    blockerCategory,
    productName: finalGate?.productName ?? releaseAcceptance?.productName ?? null,
    version: finalGate?.version ?? releaseAcceptance?.version ?? null,
    externalFreshWindowsEvidenceOnly,
    workspace,
    freshWindowsHandoffReadiness,
    checks,
    missingFreshWindowsArtifacts,
    remainingActions,
    reports: {
      finalGate: normalizeRelative(workspaceRoot, finalGatePath),
      coreVerification: normalizeRelative(workspaceRoot, coreVerificationPath),
      fullVerification: normalizeRelative(workspaceRoot, fullVerificationPath),
      releaseAcceptance: normalizeRelative(workspaceRoot, releaseAcceptancePath),
      evidenceImport: normalizeRelative(workspaceRoot, evidenceImportPath),
      handoffManifest: normalizeRelative(workspaceRoot, handoffManifestPath),
    },
    failures: finalGate?.failures ?? [],
    warnings,
    approvalPolicy,
  };
}

function buildChecks(finalGate, coreVerification, fullVerification, releaseAcceptance, evidenceImport, handoffManifest, handoffManifestPath, workspaceRoot, options) {
  const coreVerificationCheck = buildCoreVerificationCheck(coreVerification);
  const fullVerificationCheck = buildFullVerificationCheck(finalGate, fullVerification);
  const releaseAcceptanceCheck = buildReleaseAcceptanceCheck(finalGate, releaseAcceptance, fullVerificationCheck);
  const installerArtifactsCheck = buildInstallerArtifactsCheck(workspaceRoot, releaseAcceptance, finalGate, fullVerificationCheck);
  const handoffPackageCheck = buildHandoffPackageCheck(workspaceRoot, releaseAcceptance, handoffManifest, handoffManifestPath, options);
  const finalGateCheck = buildFinalGateCheck(finalGate, fullVerificationCheck, releaseAcceptanceCheck, handoffPackageCheck);
  const evidencePackageStatus = finalGate?.evidencePackageEvidence?.status ?? 'not-provided';
  const evidencePackageReportStatus = finalGate?.evidencePackageEvidence?.packageReportVerification?.status ?? null;
  const evidencePackageReportPath = finalGate?.evidencePackageEvidence?.packageReportVerification?.sourcePath ?? finalGate?.reportPaths?.evidenceReport ?? null;
  const evidencePackageReportChecks = finalGate?.evidencePackageEvidence?.packageReportVerification?.checks ?? null;
  const evidenceImportStatus = evidenceImport?.status ?? 'not-provided';
  const evidenceImportPackageReportStatus = evidenceImport?.packageReportVerification?.status ?? null;
  const evidenceImportPackageReportChecks = evidenceImport?.packageReportVerification?.checks ?? null;
  const importedReportPath = evidenceImport?.imported?.reportPath ?? null;
  const evidenceImportFinalGateRun = evidenceImport?.finalGate?.run ?? null;
  const evidenceImportFinalGateStatus = evidenceImport?.finalGate?.result?.status ?? null;
  const evidenceImportFinalGateArgs = normalizeCliArgs(evidenceImport?.finalGate?.args);
  const evidenceImportHasFinalGateInputs = evidenceImportStatus === 'passed'
    && evidenceImport?.importStatus === 'passed'
    && evidenceImport?.archiveVerification?.status === 'passed'
    && (evidenceImportPackageReportStatus === 'passed' || evidenceImportPackageReportStatus === 'not-provided')
    && evidenceImport?.copyVerification?.status === 'passed'
    && Boolean(evidenceImport?.imported?.zipPath && evidenceImport?.imported?.sha256Path);
  const evidenceImportFinalGateReady = typeof evidenceImport?.finalGate?.ready === 'boolean'
    ? evidenceImport.finalGate.ready
    : evidenceImportHasFinalGateInputs;
  return {
    coreVerification: coreVerificationCheck,
    fullVerification: fullVerificationCheck,
    releaseAcceptance: releaseAcceptanceCheck,
    installerArtifacts: installerArtifactsCheck,
    handoffPackage: handoffPackageCheck,
    evidencePackage: {
      status: evidencePackageStatus,
      zipPath: finalGate?.evidencePackageEvidence?.zipPath ?? finalGate?.reportPaths?.evidenceZip ?? null,
      sha256Path: finalGate?.evidencePackageEvidence?.sha256Path ?? finalGate?.reportPaths?.evidenceZipSha256 ?? null,
      bytes: finalGate?.evidencePackageEvidence?.bytes ?? null,
      sha256: finalGate?.evidencePackageEvidence?.sha256 ?? null,
      sidecarFileName: finalGate?.evidencePackageEvidence?.sidecarFileName ?? null,
      sidecarBytes: finalGate?.evidencePackageEvidence?.sidecarBytes ?? null,
      sidecarFileSha256: finalGate?.evidencePackageEvidence?.sidecarFileSha256 ?? null,
      packageReportBytes: finalGate?.evidencePackageEvidence?.packageReportBytes ?? null,
      packageReportSha256: finalGate?.evidencePackageEvidence?.packageReportSha256 ?? null,
      zipEntryInspectionStatus: finalGate?.evidencePackageEvidence?.zipEntryInspectionStatus ?? null,
      archiveDirectories: finalGate?.evidencePackageEvidence?.archiveDirectories ?? [],
      archiveMissingFiles: finalGate?.evidencePackageEvidence?.missingFiles ?? [],
      archiveUnexpectedEntries: finalGate?.evidencePackageEvidence?.unexpectedEntries ?? [],
      archiveUnsafeEntries: finalGate?.evidencePackageEvidence?.unsafeEntries ?? [],
      archiveDuplicateEntries: finalGate?.evidencePackageEvidence?.duplicateEntries ?? [],
      packageReportStatus: evidencePackageReportStatus,
      packageReportChecks: evidencePackageReportChecks,
      packageReportFailedChecks: collectFailedChecks(evidencePackageReportChecks),
      reportPath: evidencePackageReportPath,
      legacyMissingReport: evidencePackageStatus === 'passed' && evidencePackageReportStatus === 'not-provided',
    },
    evidenceImport: {
      status: evidenceImportStatus,
      importStatus: evidenceImport?.importStatus ?? null,
      archiveVerificationStatus: evidenceImport?.archiveVerification?.status ?? null,
      archiveZipEntryInspectionStatus: evidenceImport?.archiveVerification?.zipEntryInspectionStatus ?? null,
      archiveDirectories: evidenceImport?.archiveVerification?.archiveDirectories ?? [],
      archiveMissingFiles: evidenceImport?.archiveVerification?.missingFiles ?? [],
      archiveUnexpectedEntries: evidenceImport?.archiveVerification?.unexpectedEntries ?? [],
      archiveUnsafeEntries: evidenceImport?.archiveVerification?.unsafeEntries ?? [],
      archiveDuplicateEntries: evidenceImport?.archiveVerification?.duplicateEntries ?? [],
      packageReportStatus: evidenceImportPackageReportStatus,
      packageReportChecks: evidenceImportPackageReportChecks,
      packageReportFailedChecks: collectFailedChecks(evidenceImportPackageReportChecks),
      importedReportPath,
      legacyMissingReport: evidenceImportStatus === 'passed'
        && evidenceImportPackageReportStatus === 'not-provided'
        && !importedReportPath,
      copyVerificationStatus: evidenceImport?.copyVerification?.status ?? null,
      importedZipPath: evidenceImport?.imported?.zipPath ?? null,
      importedSha256Path: evidenceImport?.imported?.sha256Path ?? null,
      importedBytes: evidenceImport?.imported?.bytes ?? null,
      importedSha256: evidenceImport?.imported?.sha256 ?? null,
      importedSha256Bytes: evidenceImport?.imported?.sha256Bytes ?? null,
      importedSha256FileSha256: evidenceImport?.imported?.sha256FileSha256 ?? null,
      importedReportBytes: evidenceImport?.imported?.reportBytes ?? null,
      importedReportSha256: evidenceImport?.imported?.reportSha256 ?? null,
      finalGateRun: evidenceImportFinalGateRun,
      finalGateStatus: evidenceImportFinalGateStatus,
      finalGateReady: evidenceImportFinalGateReady,
      finalGateCommand: evidenceImport?.finalGate?.command ?? null,
      finalGateArgs: evidenceImportFinalGateArgs,
      awaitingFinalGate: evidenceImportHasFinalGateInputs
        && evidenceImportFinalGateReady
        && evidenceImportFinalGateRun !== true
        && evidenceImportFinalGateStatus !== 'passed',
      failureCount: Array.isArray(evidenceImport?.failures) ? evidenceImport.failures.length : null,
    },
    freshWindows: {
      status: finalGate?.freshWindowsEvidence?.status ?? 'missing',
      checksumStatus: finalGate?.freshWindowsEvidence?.checksumStatus ?? null,
      basicSmokeStatus: finalGate?.freshWindowsEvidence?.basicSmokeStatus ?? null,
      guiSessionStatus: finalGate?.freshWindowsEvidence?.guiSessionStatus ?? null,
      cleanupStatus: finalGate?.freshWindowsEvidence?.cleanupStatus ?? null,
      outputStatus: finalGate?.freshWindowsEvidence?.outputStatus ?? null,
      outputSha256: finalGate?.freshWindowsEvidence?.outputSha256 ?? null,
      failureCount: finalGate?.freshWindowsEvidence?.failureCount ?? null,
    },
    finalGate: finalGateCheck,
  };
}

function buildCoreVerificationCheck(coreVerification) {
  const gateEvidence = deriveVerificationGateEvidence(coreVerification, REQUIRED_CORE_GATE_IDS);
  const validationFailures = validateVerificationStatusEvidence({
    evidence: coreVerification,
    expectedProfile: 'core',
    label: 'Core release verification',
    missingGateIds: gateEvidence.missingGateIds,
    failedGateIds: gateEvidence.failedGateIds,
  });
  return {
    status: coreVerification?.status ?? 'missing',
    profile: coreVerification?.profile ?? null,
    passedCount: coreVerification?.passedCount ?? null,
    failedCount: coreVerification?.failedCount ?? null,
    requiredGateCount: gateEvidence.requiredGateCount,
    resultCount: gateEvidence.resultCount,
    missingGateIds: gateEvidence.missingGateIds,
    failedGateIds: gateEvidence.failedGateIds,
    startedAt: coreVerification?.startedAt ?? null,
    endedAt: coreVerification?.endedAt ?? null,
    validationFailures,
  };
}

function collectFailedChecks(checks) {
  if (!checks || typeof checks !== 'object') {
    return [];
  }
  return Object.entries(checks)
    .filter(([, passed]) => passed === false)
    .map(([check]) => check)
    .sort();
}

function buildFinalGateCheck(finalGate, fullVerificationCheck, releaseAcceptanceCheck, handoffPackageCheck) {
  const status = finalGate?.status ?? 'missing';
  const generatedAt = finalGate?.generatedAt ?? null;
  return {
    status,
    generatedAt,
    freshnessStatus: computeFinalGateFreshness(status, generatedAt, fullVerificationCheck, releaseAcceptanceCheck, handoffPackageCheck),
    failureCount: finalGate?.failures?.length ?? null,
  };
}

function buildFullVerificationCheck(finalGate, fullVerification) {
  const evidence = fullVerification ?? finalGate?.fullVerificationEvidence ?? null;
  const failedCount = evidence?.failedCount ?? null;
  const gateEvidence = deriveVerificationGateEvidence(evidence, REQUIRED_FULL_GATE_IDS);
  const missingGateIds = gateEvidence.missingGateIds;
  const failedGateIds = gateEvidence.failedGateIds;
  const validationFailures = validateVerificationStatusEvidence({
    evidence,
    expectedProfile: 'full',
    label: 'Full release verification',
    missingGateIds,
    failedGateIds,
  });
  return {
    status: evidence?.status ?? 'missing',
    profile: evidence?.profile ?? null,
    passedCount: evidence?.passedCount ?? null,
    failedCount,
    requiredGateCount: gateEvidence.requiredGateCount,
    resultCount: gateEvidence.resultCount,
    missingGateIds,
    failedGateIds,
    startedAt: evidence?.startedAt ?? null,
    endedAt: evidence?.endedAt ?? null,
    source: fullVerification ? 'report' : finalGate?.fullVerificationEvidence ? 'final-gate' : 'missing',
    finalGateEvidenceStatus: finalGate?.fullVerificationEvidence?.status ?? null,
    finalGateEvidenceEndedAt: finalGate?.fullVerificationEvidence?.endedAt ?? null,
    validationFailures,
  };
}

function deriveVerificationGateEvidence(evidence, requiredGateIds) {
  if (Array.isArray(evidence?.results)) {
    const resultIds = new Set(evidence.results
      .map((result) => result?.id)
      .filter((id) => typeof id === 'string' && id.length > 0));
    return {
      requiredGateCount: requiredGateIds.length,
      resultCount: evidence.results.length,
      missingGateIds: requiredGateIds.filter((id) => !resultIds.has(id)),
      failedGateIds: evidence.results
        .filter((result) => typeof result?.id === 'string' && result.status !== 'passed')
        .map((result) => result.id)
        .sort(),
    };
  }
  return {
    requiredGateCount: requiredGateIds.length,
    resultCount: null,
    missingGateIds: normalizeStringArray(evidence?.missingGateIds),
    failedGateIds: normalizeStringArray(evidence?.failedGateIds),
  };
}

function validateVerificationStatusEvidence({ evidence, expectedProfile, label, missingGateIds, failedGateIds }) {
  if (!evidence) {
    return [`${label} report is missing.`];
  }
  const failures = [];
  if (evidence.status !== 'passed') {
    failures.push(`${label} must be passed, got ${evidence.status ?? 'missing'}.`);
  }
  if (evidence.profile !== expectedProfile) {
    failures.push(`${label} profile must be ${expectedProfile}, got ${evidence.profile ?? 'missing'}.`);
  }
  if (Number(evidence.failedCount ?? 0) !== 0) {
    failures.push(`${label} failedCount must be 0, got ${evidence.failedCount}.`);
  }
  if (missingGateIds.length > 0) {
    failures.push(`${label} is missing required gate(s): ${missingGateIds.join(', ')}.`);
  }
  if (failedGateIds.length > 0) {
    failures.push(`${label} has non-passing gate(s): ${failedGateIds.join(', ')}.`);
  }
  return failures;
}

function buildReleaseAcceptanceCheck(finalGate, releaseAcceptance, fullVerificationCheck) {
  const status = releaseAcceptance?.status ?? finalGate?.releaseAcceptanceEvidence?.status ?? 'missing';
  const verificationEndedAt = releaseAcceptance?.evidence?.verification?.endedAt ?? null;
  const generatedAt = releaseAcceptance?.generatedAt ?? null;
  const installerNaming = validateReleaseAcceptanceInstallerNaming(releaseAcceptance, finalGate);
  return {
    status,
    verificationStatus: releaseAcceptance?.evidence?.verification?.status ?? finalGate?.releaseAcceptanceEvidence?.verificationStatus ?? null,
    renderOutputCount: releaseAcceptance?.evidence?.renderOutputs?.length ?? finalGate?.releaseAcceptanceEvidence?.renderOutputCount ?? null,
    failureCount: releaseAcceptance?.failures?.length ?? finalGate?.releaseAcceptanceEvidence?.failureCount ?? null,
    generatedAt,
    verificationEndedAt,
    freshnessStatus: computeAcceptanceFreshness(status, generatedAt, verificationEndedAt, fullVerificationCheck.endedAt),
    latestFullVerificationEndedAt: fullVerificationCheck.endedAt,
    expectedInstallerName: installerNaming.expectedInstallerName,
    currentExpectedInstallerName: installerNaming.currentExpectedInstallerName,
    installerPath: installerNaming.installerPath,
    installerBlockmapPath: installerNaming.installerBlockmapPath,
    latestYmlExpectedInstallerName: installerNaming.latestYmlExpectedInstallerName,
    installerNamingStatus: installerNaming.status,
    installerNamingFailures: installerNaming.failures,
  };
}

function validateReleaseAcceptanceInstallerNaming(releaseAcceptance, finalGate) {
  const productName = releaseAcceptance?.productName ?? finalGate?.productName ?? null;
  const version = releaseAcceptance?.version ?? finalGate?.version ?? null;
  const expectedInstallerName = releaseAcceptance?.expectedInstallerName ?? finalGate?.releaseAcceptanceEvidence?.installer ?? null;
  const currentExpectedInstallerName = isNonEmptyString(productName) && isNonEmptyString(version)
    ? buildWindowsInstallerArtifactName(productName, version)
    : null;
  const installerPath = releaseAcceptance?.evidence?.installer?.path ?? null;
  const installerBlockmapPath = releaseAcceptance?.evidence?.installerBlockmap?.path ?? null;
  const latestYmlExpectedInstallerName = releaseAcceptance?.evidence?.latestYml?.expectedInstallerName ?? null;
  const failures = [];

  if (!releaseAcceptance && !finalGate?.releaseAcceptanceEvidence) {
    return {
      status: 'missing',
      expectedInstallerName,
      currentExpectedInstallerName,
      installerPath,
      installerBlockmapPath,
      latestYmlExpectedInstallerName,
      failures,
    };
  }
  if (!isNonEmptyString(expectedInstallerName)) {
    failures.push('Release acceptance expectedInstallerName is missing.');
  }
  if (!isNonEmptyString(currentExpectedInstallerName)) {
    failures.push('Release acceptance productName/version cannot derive the current installer artifact name.');
  }
  if (isNonEmptyString(expectedInstallerName) && isNonEmptyString(currentExpectedInstallerName) && expectedInstallerName !== currentExpectedInstallerName) {
    failures.push(`Release acceptance installer name is stale for the current artifact naming rule. Expected ${currentExpectedInstallerName}, got ${expectedInstallerName}.`);
  }
  if (isNonEmptyString(installerPath) && isNonEmptyString(expectedInstallerName) && path.basename(installerPath) !== expectedInstallerName) {
    failures.push(`Release acceptance installer path must end with ${expectedInstallerName}, got ${path.basename(installerPath)}.`);
  }
  if (isNonEmptyString(installerBlockmapPath) && isNonEmptyString(expectedInstallerName) && path.basename(installerBlockmapPath) !== `${expectedInstallerName}.blockmap`) {
    failures.push(`Release acceptance installer blockmap path must end with ${expectedInstallerName}.blockmap, got ${path.basename(installerBlockmapPath)}.`);
  }
  if (isNonEmptyString(latestYmlExpectedInstallerName) && isNonEmptyString(expectedInstallerName) && latestYmlExpectedInstallerName !== expectedInstallerName) {
    failures.push(`Release acceptance latest.yml expected installer must be ${expectedInstallerName}, got ${latestYmlExpectedInstallerName}.`);
  }

  return {
    status: failures.length === 0 ? 'passed' : failures.some((failure) => failure.includes('stale')) ? 'stale' : 'failed',
    expectedInstallerName,
    currentExpectedInstallerName,
    installerPath,
    installerBlockmapPath,
    latestYmlExpectedInstallerName,
    failures,
  };
}

function buildInstallerArtifactsCheck(workspaceRoot, releaseAcceptance, finalGate, fullVerificationCheck) {
  const packageJson = readJsonIfPresent(path.join(workspaceRoot, 'package.json'));
  const productName = releaseAcceptance?.productName ?? finalGate?.productName ?? 'Danbi Studio';
  const version = packageJson?.version ?? releaseAcceptance?.version ?? finalGate?.version ?? null;
  const expectedInstallerName = isNonEmptyString(productName) && isNonEmptyString(version)
    ? buildWindowsInstallerArtifactName(productName, version)
    : null;
  const releaseDir = path.join(workspaceRoot, DEFAULT_ELECTRON_RELEASE_DIR);
  const installerPath = expectedInstallerName ? path.join(releaseDir, expectedInstallerName) : null;
  const blockmapPath = installerPath ? `${installerPath}.blockmap` : null;
  const latestYmlPath = path.join(releaseDir, 'latest.yml');
  const failures = [];
  const installer = installerPath
    ? readReleaseFileEvidence(workspaceRoot, installerPath, 10_000_000, failures)
    : { status: 'unknown', path: null, bytes: null, sha256: null };
  const blockmap = blockmapPath
    ? readReleaseFileEvidence(workspaceRoot, blockmapPath, 1_000, failures)
    : { status: 'unknown', path: null, bytes: null, sha256: null };
  const latestYml = validateCurrentLatestYml(
    workspaceRoot,
    latestYmlPath,
    version,
    expectedInstallerName,
    installer.bytes,
    fullVerificationCheck.endedAt,
    failures,
  );

  if (!expectedInstallerName) {
    failures.push('Current installer artifact name cannot be derived from productName/version.');
  }

  return {
    status: failures.length === 0
      ? 'passed'
      : installer.status === 'missing' || blockmap.status === 'missing'
        ? 'missing'
      : latestYml.releaseDateFreshnessStatus === 'stale-verification'
        ? 'stale-verification'
      : 'failed',
    expectedInstallerName,
    releaseDir: normalizeSlash(DEFAULT_ELECTRON_RELEASE_DIR),
    installer,
    blockmap,
    latestYml,
    failureCount: failures.length,
    failures,
  };
}

function readReleaseFileEvidence(workspaceRoot, filePath, minimumBytes, failures) {
  const relativePath = normalizeRelative(workspaceRoot, filePath);
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (!stats?.isFile()) {
    failures.push(`Missing current release artifact: ${relativePath}`);
    return { status: 'missing', path: relativePath, bytes: null, sha256: null };
  }
  if (stats.size < minimumBytes) {
    failures.push(`Current release artifact is too small: ${relativePath} (${stats.size} bytes, expected >= ${minimumBytes})`);
  }
  return {
    status: stats.size >= minimumBytes ? 'present' : 'too-small',
    path: relativePath,
    bytes: stats.size,
    sha256: hashFile(filePath),
  };
}

function validateCurrentLatestYml(workspaceRoot, filePath, version, expectedInstallerName, installerBytes, fullVerificationEndedAt, failures) {
  const evidence = readReleaseFileEvidence(workspaceRoot, filePath, 1, failures);
  if (evidence.status === 'missing') {
    return {
      ...evidence,
      hasVersion: false,
      hasInstallerReference: false,
      hasInstallerSize: false,
      installerSizeCheckStatus: 'skipped',
      releaseDate: null,
      fullVerificationEndedAt,
      releaseDateFreshnessStatus: 'skipped',
    };
  }
  const text = readFileSync(filePath, 'utf8');
  const hasVersion = isNonEmptyString(version) && text.includes(`version: ${version}`);
  const hasInstallerReference = isNonEmptyString(expectedInstallerName)
    && new RegExp(`(?:url|path):\\s*["']?${escapeRegExp(expectedInstallerName)}["']?\\s*$`, 'im').test(text);
  const canCheckInstallerSize = Number.isFinite(installerBytes);
  const hasInstallerSize = canCheckInstallerSize && text.includes(`size: ${installerBytes}`);
  const releaseDate = readLatestYmlReleaseDate(text);
  const releaseDateMs = parseIsoMillis(releaseDate);
  const verificationEndedMs = parseIsoMillis(fullVerificationEndedAt);
  let releaseDateFreshnessStatus = 'passed';

  if (!hasVersion) {
    failures.push(`Current release latest.yml must record version ${version ?? '(unknown)'}.`);
  }
  if (!hasInstallerReference) {
    failures.push(`Current release latest.yml must reference installer ${expectedInstallerName ?? '(unknown)'}.`);
  }
  if (canCheckInstallerSize && !hasInstallerSize) {
    failures.push(`Current release latest.yml must record installer size ${installerBytes}.`);
  }
  if (!releaseDate) {
    releaseDateFreshnessStatus = 'missing';
    failures.push('Current release latest.yml must record releaseDate.');
  } else if (releaseDateMs === null) {
    releaseDateFreshnessStatus = 'invalid';
    failures.push('Current release latest.yml releaseDate must be an ISO-like timestamp.');
  } else if (verificationEndedMs === null) {
    releaseDateFreshnessStatus = 'unknown';
    failures.push('Current full release verification endedAt is missing; rerun full release verification after packaging.');
  } else if (releaseDateMs > verificationEndedMs) {
    releaseDateFreshnessStatus = 'stale-verification';
    failures.push('Current installer artifacts are newer than the full release verification report; rerun full release verification after packaging.');
  }

  return {
    ...evidence,
    hasVersion,
    hasInstallerReference,
    hasInstallerSize,
    installerSizeCheckStatus: canCheckInstallerSize ? (hasInstallerSize ? 'passed' : 'failed') : 'skipped',
    releaseDate,
    fullVerificationEndedAt,
    releaseDateFreshnessStatus,
  };
}

function computeAcceptanceFreshness(status, generatedAt, acceptanceVerificationEndedAt, latestFullVerificationEndedAt) {
  if (status === 'missing') {
    return 'missing';
  }
  if (status !== 'passed') {
    return 'not-passed';
  }
  const latestFullMs = parseIsoMillis(latestFullVerificationEndedAt);
  const generatedMs = parseIsoMillis(generatedAt);
  const acceptedFullMs = parseIsoMillis(acceptanceVerificationEndedAt);
  if (latestFullMs === null || (generatedMs === null && acceptedFullMs === null)) {
    return 'unknown';
  }
  if ((acceptedFullMs !== null && acceptedFullMs < latestFullMs) || (generatedMs !== null && generatedMs < latestFullMs)) {
    return 'stale';
  }
  return 'current';
}

function buildHandoffPackageCheck(workspaceRoot, releaseAcceptance, handoffManifest, handoffManifestPath, options) {
  const version = handoffManifest?.version ?? releaseAcceptance?.version ?? null;
  const packagePath = resolveHandoffPackagePath(workspaceRoot, version, options);
  const sha256Path = `${packagePath}.sha256`;
  const packageReportPath = `${packagePath}.report.json`;
  const checksumPath = path.join(path.dirname(handoffManifestPath), handoffManifest?.checksumFile ?? 'SHA256SUMS.txt');
  assertInsideRoot(workspaceRoot, packagePath, 'handoff package');
  assertInsideRoot(workspaceRoot, sha256Path, 'handoff package checksum');
  assertInsideRoot(workspaceRoot, packageReportPath, 'handoff package report');
  assertInsideRoot(workspaceRoot, checksumPath, 'handoff checksum file');

  const failures = [];
  const manifestStatus = handoffManifest?.status ?? 'missing';
  const acceptanceGeneratedAt = releaseAcceptance?.generatedAt ?? null;
  const handoffAcceptanceGeneratedAt = handoffManifest?.acceptanceGeneratedAt ?? null;
  const freshnessStatus = computeHandoffFreshness(manifestStatus, handoffAcceptanceGeneratedAt, acceptanceGeneratedAt);
  const sidecar = readSha256Sidecar(sha256Path);
  const packageReport = readJsonIfPresent(packageReportPath);
  const sidecarFile = readFileTransferMetadata(sha256Path);
  const packageReportFile = readFileTransferMetadata(packageReportPath);
  let bytes = null;
  let sha256 = null;
  let packageReportCheck = {
    status: 'not-run',
    generatedAt: null,
    archiveBytes: null,
    archiveSha256: null,
    handoffManifestSha256: null,
    checksumSha256: null,
    checks: null,
    failures: [],
  };
  let archiveVerification = {
    status: 'not-run',
    zipEntryInspectionStatus: 'not-run',
    zipEntries: [],
    archiveDirectories: [],
    archiveFiles: [],
    missingFiles: [],
    unexpectedEntries: [],
    unsafeEntries: [],
    duplicateEntries: [],
    stderrTail: '',
  };

  if (!handoffManifest) {
    failures.push('Handoff manifest is missing; run npm run electron:release:handoff.');
  }
  if (manifestStatus !== 'missing' && manifestStatus !== 'passed') {
    failures.push(`Handoff manifest must be passed, got ${manifestStatus}.`);
  }
  if (!existsSync(packagePath)) {
    failures.push('QA handoff ZIP is missing; run .danbi/electron-release/handoff/package-handoff-for-qa.ps1.');
  } else {
    bytes = statSync(packagePath).size;
    sha256 = hashFile(packagePath);
    if (sidecar.status !== 'present') {
      failures.push('QA handoff ZIP SHA-256 sidecar is missing or invalid.');
    } else if (sidecar.sha256 !== sha256) {
      failures.push('QA handoff ZIP SHA-256 sidecar does not match the ZIP bytes.');
    } else if (sidecar.fileName && sidecar.fileName !== path.basename(packagePath)) {
      failures.push(`QA handoff ZIP SHA-256 sidecar names ${sidecar.fileName}, expected ${path.basename(packagePath)}.`);
    }
    const requiredArchiveFiles = readHandoffPackageRequiredFiles(checksumPath);
    if (requiredArchiveFiles.failures.length > 0) {
      failures.push(...requiredArchiveFiles.failures);
    }
    archiveVerification = inspectHandoffPackageZipEntries(packagePath, requiredArchiveFiles.files);
    if (archiveVerification.zipEntryInspectionStatus !== 'passed') {
      failures.push(`QA handoff ZIP could not be inspected: ${archiveVerification.stderrTail || 'ZIP entry listing failed'}`);
    }
    if (archiveVerification.unsafeEntries.length > 0) {
      failures.push(`QA handoff ZIP contains unsafe entries: ${archiveVerification.unsafeEntries.join(', ')}`);
    }
    if (archiveVerification.duplicateEntries.length > 0) {
      failures.push(`QA handoff ZIP contains duplicate entries: ${archiveVerification.duplicateEntries.join(', ')}`);
    }
    if (archiveVerification.unexpectedEntries.length > 0) {
      failures.push(`QA handoff ZIP contains unexpected entries: ${archiveVerification.unexpectedEntries.join(', ')}`);
    }
    if (archiveVerification.missingFiles.length > 0) {
      failures.push(`QA handoff ZIP is missing required files: ${archiveVerification.missingFiles.join(', ')}`);
    }
  }
  packageReportCheck = validateHandoffPackageReport({
    packageReport,
    packagePath,
    bytes,
    sha256,
    archiveVerification,
    handoffManifestPath,
    handoffManifest,
    checksumPath,
    acceptanceGeneratedAt,
  });
  failures.push(...packageReportCheck.failures);
  if (freshnessStatus === 'stale') {
    failures.push('Handoff manifest was generated from an older release acceptance report.');
  }
  if (freshnessStatus === 'unknown') {
    failures.push('Handoff manifest freshness is unknown; regenerate the handoff from the current release acceptance report.');
  }

  const status = failures.length === 0
    ? 'ready'
    : freshnessStatus === 'stale'
      ? 'stale'
      : freshnessStatus === 'unknown'
        ? 'unknown'
      : packageReportCheck.status === 'stale'
        ? 'stale'
      : existsSync(packagePath) && sidecar.status === 'present' && sidecar.sha256 !== sha256
        ? 'invalid'
      : existsSync(packagePath)
        ? 'invalid'
        : 'missing';

  return {
    status,
    manifestStatus,
    freshnessStatus,
    packagePath: normalizeRelative(workspaceRoot, packagePath),
    sha256Path: normalizeRelative(workspaceRoot, sha256Path),
    packageReportPath: normalizeRelative(workspaceRoot, packageReportPath),
    bytes,
    sha256,
    sidecarStatus: sidecar.status,
    sidecarSha256: sidecar.sha256,
    sidecarBytes: sidecarFile.bytes,
    sidecarFileSha256: sidecarFile.sha256,
    zipEntryInspectionStatus: archiveVerification.zipEntryInspectionStatus,
    archiveDirectories: archiveVerification.archiveDirectories,
    archiveFiles: archiveVerification.archiveFiles,
    archiveMissingFiles: archiveVerification.missingFiles,
    archiveUnexpectedEntries: archiveVerification.unexpectedEntries,
    archiveUnsafeEntries: archiveVerification.unsafeEntries,
    archiveDuplicateEntries: archiveVerification.duplicateEntries,
    packageReportStatus: packageReportCheck.status,
    packageReportBytes: packageReportFile.bytes,
    packageReportSha256: packageReportFile.sha256,
    packageReportChecks: packageReportCheck.checks,
    packageReportFailedChecks: collectFailedChecks(packageReportCheck.checks),
    packageReportGeneratedAt: packageReportCheck.generatedAt,
    packageReportArchiveBytes: packageReportCheck.archiveBytes,
    packageReportArchiveSha256: packageReportCheck.archiveSha256,
    packageReportHandoffManifestSha256: packageReportCheck.handoffManifestSha256,
    packageReportChecksumSha256: packageReportCheck.checksumSha256,
    handoffGeneratedAt: handoffManifest?.generatedAt ?? null,
    handoffAcceptanceGeneratedAt,
    currentAcceptanceGeneratedAt: acceptanceGeneratedAt,
    failureCount: failures.length,
    failures,
  };
}

function resolveHandoffPackagePath(workspaceRoot, version, options) {
  if (options.handoffPackage) {
    return path.resolve(workspaceRoot, options.handoffPackage);
  }
  const safeVersion = String(version || 'unknown-version').replace(/[^a-zA-Z0-9._-]+/g, '-') || 'unknown-version';
  return path.join(workspaceRoot, DEFAULT_RELEASE_ROOT, `danbi-studio-${safeVersion}-fresh-windows-handoff.zip`);
}

function computeHandoffFreshness(manifestStatus, handoffAcceptanceGeneratedAt, acceptanceGeneratedAt) {
  if (manifestStatus === 'missing') {
    return 'missing';
  }
  if (!acceptanceGeneratedAt || !handoffAcceptanceGeneratedAt) {
    return 'unknown';
  }
  return handoffAcceptanceGeneratedAt === acceptanceGeneratedAt ? 'current' : 'stale';
}

function validateHandoffPackageReport(options) {
  const {
    packageReport,
    packagePath,
    bytes,
    sha256,
    archiveVerification,
    handoffManifestPath,
    handoffManifest,
    checksumPath,
    acceptanceGeneratedAt,
  } = options;
  const failures = [];
  const result = {
    status: 'passed',
    generatedAt: packageReport?.generatedAt ?? null,
    archiveBytes: packageReport?.archive?.bytes ?? null,
    archiveSha256: packageReport?.archive?.sha256 ?? null,
    handoffManifestSha256: packageReport?.handoffManifest?.sha256 ?? null,
    checksumSha256: packageReport?.checksumFile?.sha256 ?? null,
    checks: {
      reportPresent: Boolean(packageReport),
      zipEntryInspectionMatchesArchive: null,
    },
    failures,
  };

  if (!packageReport) {
    failures.push('QA handoff ZIP package report is missing; rerun .danbi/electron-release/handoff/package-handoff-for-qa.ps1.');
    result.status = 'missing';
    return result;
  }

  let stale = false;
  if (packageReport.kind !== 'danbi.electron.release-handoff-package-report') {
    failures.push(`QA handoff ZIP package report kind is invalid: ${packageReport.kind}.`);
  }
  if (packageReport.status !== 'passed') {
    failures.push(`QA handoff ZIP package report must be passed, got ${packageReport.status}.`);
  }
  if (packageReport.archive?.fileName !== path.basename(packagePath)) {
    failures.push(`QA handoff ZIP package report archive fileName must be ${path.basename(packagePath)}, got ${packageReport.archive?.fileName}.`);
  }
  if (Number(packageReport.archive?.bytes) !== bytes) {
    failures.push('QA handoff ZIP package report archive bytes do not match the ZIP bytes.');
  }
  if (String(packageReport.archive?.sha256 ?? '').toLowerCase() !== sha256) {
    failures.push('QA handoff ZIP package report archive SHA-256 does not match the ZIP bytes.');
  }

  const manifestStats = statSync(handoffManifestPath, { throwIfNoEntry: false });
  if (!manifestStats?.isFile()) {
    failures.push('QA handoff ZIP package report cannot be checked because handoff-manifest.json is missing.');
  } else {
    const manifestSha256 = hashFile(handoffManifestPath);
    if (Number(packageReport.handoffManifest?.bytes) !== manifestStats.size) {
      stale = true;
      failures.push('QA handoff ZIP package report handoff-manifest.json bytes do not match the current handoff manifest.');
    }
    if (String(packageReport.handoffManifest?.sha256 ?? '').toLowerCase() !== manifestSha256) {
      stale = true;
      failures.push('QA handoff ZIP package report handoff-manifest.json SHA-256 does not match the current handoff manifest.');
    }
  }

  const checksumStats = statSync(checksumPath, { throwIfNoEntry: false });
  if (!checksumStats?.isFile()) {
    failures.push('QA handoff ZIP package report cannot be checked because SHA256SUMS.txt is missing.');
  } else {
    const checksumSha256 = hashFile(checksumPath);
    if (Number(packageReport.checksumFile?.bytes) !== checksumStats.size) {
      stale = true;
      failures.push('QA handoff ZIP package report SHA256SUMS.txt bytes do not match the current handoff checksum file.');
    }
    if (String(packageReport.checksumFile?.sha256 ?? '').toLowerCase() !== checksumSha256) {
      stale = true;
      failures.push('QA handoff ZIP package report SHA256SUMS.txt SHA-256 does not match the current handoff checksum file.');
    }
  }

  if (packageReport.acceptanceGeneratedAt !== acceptanceGeneratedAt) {
    stale = true;
    failures.push('QA handoff ZIP package report acceptance timestamp does not match the current release acceptance report.');
  }
  if (packageReport.handoffGeneratedAt !== (handoffManifest?.generatedAt ?? null)) {
    stale = true;
    failures.push('QA handoff ZIP package report handoff timestamp does not match the current handoff manifest.');
  }
  result.checks.zipEntryInspectionMatchesArchive = packageReportZipEntryInspectionMatchesArchive(
    packageReport.zipEntryInspection,
    archiveVerification,
  );
  if (!result.checks.zipEntryInspectionMatchesArchive) {
    failures.push('QA handoff ZIP package report ZIP entry inspection does not match the current archive.');
  }

  result.status = failures.length === 0 ? 'passed' : stale ? 'stale' : 'failed';
  return result;
}

function readHandoffPackageRequiredFiles(checksumPath) {
  const failures = [];
  const checksumText = existsSync(checksumPath) ? readFileSync(checksumPath, 'utf8') : '';
  const files = [];
  const seen = new Set();
  for (const [index, line] of checksumText.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const match = /^([a-fA-F0-9]{64})\s{2}(.+)$/.exec(trimmed);
    if (!match) {
      failures.push(`QA handoff checksum file has invalid line ${index + 1}.`);
      continue;
    }
    const rawRelativePath = match[2];
    if (!isSafeZipEntryName(rawRelativePath) || rawRelativePath.endsWith('/')) {
      failures.push(`QA handoff checksum file contains unsafe package path: ${rawRelativePath}`);
      continue;
    }
    const relativePath = normalizeSlash(rawRelativePath);
    if (!seen.has(relativePath)) {
      seen.add(relativePath);
      files.push(relativePath);
    }
  }
  for (const required of ['SHA256SUMS.txt', 'handoff-package-summary.json']) {
    if (!seen.has(required)) {
      seen.add(required);
      files.push(required);
    }
  }
  return {
    files: files.sort(),
    failures,
  };
}

function inspectHandoffPackageZipEntries(zipPath, requiredFiles) {
  const inspection = {
    status: 'failed',
    zipEntryInspectionStatus: 'failed',
    zipEntries: [],
    archiveDirectories: [],
    archiveFiles: [],
    missingFiles: [],
    unexpectedEntries: [],
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
      '$archive = [System.IO.Compression.ZipFile]::OpenRead($env:DANBI_HANDOFF_ZIP)',
      'try {',
      '  $entries = @($archive.Entries | ForEach-Object { [string]$_.FullName } | Where-Object { $_.Length -gt 0 })',
      '  $entries | ConvertTo-Json -Compress',
      '} finally {',
      '  $archive.Dispose()',
      '}',
    ].join('; '),
  ], {
    env: {
      ...process.env,
      DANBI_HANDOFF_ZIP: zipPath,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  inspection.stderrTail = tail(result.stderr);
  if (result.error || result.status !== 0) {
    return inspection;
  }

  try {
    const parsed = result.stdout.trim().length > 0 ? JSON.parse(result.stdout) : [];
    const rawEntries = Array.isArray(parsed) ? parsed : [parsed];
    const entries = rawEntries.map((entry) => normalizeSlash(String(entry))).filter(Boolean).sort();
    const files = entries.filter((entry) => !entry.endsWith('/')).sort();
    const directories = entries
      .filter((entry) => entry.endsWith('/'))
      .map((entry) => entry.replace(/\/+$/, ''))
      .filter((entry) => entry.length > 0)
      .sort();
    const required = normalizeStringArray(requiredFiles).filter((entry) => !entry.endsWith('/'));
    const expectedDirectories = collectParentDirectories(required);
    inspection.zipEntries = entries;
    inspection.archiveDirectories = directories;
    inspection.archiveFiles = files;
    inspection.unsafeEntries = rawEntries
      .map((entry) => String(entry))
      .filter((entry) => !isSafeZipEntryName(entry))
      .map((entry) => normalizeSlash(entry))
      .sort();
    inspection.duplicateEntries = collectDuplicateStrings(entries);
    inspection.missingFiles = required.filter((file) => !files.includes(file)).sort();
    inspection.unexpectedEntries = [
      ...directories.filter((directory) => !expectedDirectories.includes(directory)),
      ...files.filter((file) => !required.includes(file)),
    ].sort();
    inspection.status = 'passed';
    inspection.zipEntryInspectionStatus = 'passed';
  } catch (error) {
    inspection.stderrTail = error instanceof Error ? error.message : String(error);
  }
  return inspection;
}

function collectParentDirectories(files) {
  const directories = new Set();
  for (const file of files) {
    const parts = normalizeSlash(file).split('/');
    for (let index = 1; index < parts.length; index += 1) {
      const directory = parts.slice(0, index).join('/');
      if (directory) {
        directories.add(directory);
      }
    }
  }
  return [...directories].sort();
}

function collectDuplicateStrings(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
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
  return pathForSegments.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

function tail(value, maxLength = 4000) {
  const text = String(value ?? '');
  return text.length > maxLength ? text.slice(-maxLength) : text;
}

function computeFinalGateFreshness(status, generatedAt, fullVerificationCheck, releaseAcceptanceCheck, handoffPackageCheck) {
  if (status === 'missing') {
    return 'missing';
  }
  const generatedMs = parseIsoMillis(generatedAt);
  const dependencyTimes = [
    fullVerificationCheck.endedAt,
    releaseAcceptanceCheck.generatedAt,
    handoffPackageCheck.handoffGeneratedAt,
  ];
  const dependencyMs = dependencyTimes.map(parseIsoMillis);
  if (generatedMs === null || dependencyMs.some((value) => value === null)) {
    return 'unknown';
  }
  if (dependencyMs.some((value) => value > generatedMs)) {
    return 'stale';
  }
  return status === 'passed' ? 'current' : 'not-passed';
}

function extractMissingFreshWindowsArtifacts(finalGate) {
  if (!finalGate) {
    return [];
  }
  const failures = [
    ...(finalGate.freshWindowsEvidence?.failures ?? []),
    ...(finalGate.failures ?? []),
  ];
  const missing = new Set();
  for (const failure of failures) {
    const match = /Missing fresh Windows [^:]+:\s*(.+)$/i.exec(String(failure));
    if (match) {
      missing.add(normalizeSlash(match[1]));
    }
  }
  if (missing.size === 0 && finalGate.freshWindowsEvidence?.status !== 'passed') {
    for (const key of ['manualResult', 'basicSmokeResult', 'guiSessionResult']) {
      const value = finalGate.reportPaths?.[key];
      if (value) {
        missing.add(value);
      }
    }
  }
  return [...missing].sort();
}

function isExternalFreshWindowsEvidenceOnly(checks, finalGate, missingFreshWindowsArtifacts, workspace) {
  return Boolean(finalGate)
    && checks.finalGate.status !== 'passed'
    && checks.finalGate.freshnessStatus === 'not-passed'
    && !hasReleaseRelevantWorkspaceChanges(workspace)
    && isCoreVerificationUsable(checks)
    && isFullVerificationUsable(checks)
    && isReleaseAcceptanceUsable(checks)
    && checks.handoffPackage.status === 'ready'
    && !hasFailedEvidencePackage(checks)
    && !hasFailedEvidenceImport(checks)
    && !checks.evidenceImport.awaitingFinalGate
    && checks.freshWindows.checksumStatus === 'passed'
    && checks.freshWindows.status !== 'passed'
    && missingFreshWindowsArtifacts.length > 0;
}

function buildFreshWindowsHandoffReadiness(checks, finalGate, missingFreshWindowsArtifacts, workspace, workspaceRoot) {
  const dirtyWorkspaceBlocksApproval = hasReleaseRelevantWorkspaceChanges(workspace);
  const handoffPackage = buildFreshWindowsHandoffPackageSummary(checks.handoffPackage);
  const commands = buildFreshWindowsHandoffCommands(workspaceRoot);
  const commandArgs = buildFreshWindowsHandoffCommandArgs(workspaceRoot);
  const expectedReturnedEvidence = buildFreshWindowsExpectedReturnedEvidence();
  if (isReleaseApproved(checks)) {
    return {
      status: 'approved',
      externalEvidenceRequired: false,
      dirtyWorkspaceBlocksApproval,
      workspaceReleaseRelevantChangedCount: workspace?.releaseRelevantChangedCount ?? null,
      handoffPackage,
      commands,
      commandArgs,
      expectedReturnedEvidence,
      missingFreshWindowsArtifacts,
      blockers: [],
      actions: [],
    };
  }

  const blockers = [];
  if (!finalGate) {
    blockers.push('Final gate report is missing.');
  } else if (checks.finalGate.status === 'passed') {
    blockers.push('Final gate is already passed; no Fresh Windows handoff is pending.');
  } else if (checks.finalGate.freshnessStatus !== 'not-passed') {
    blockers.push(`Final gate freshness must be not-passed before external Fresh Windows evidence is the only pending gate, got ${checks.finalGate.freshnessStatus}.`);
  }
  if (!isCoreVerificationUsable(checks)) {
    blockers.push('Core release verification is not usable.');
  }
  if (!isFullVerificationUsable(checks)) {
    blockers.push('Full release verification is not usable.');
  }
  if (!isReleaseAcceptanceUsable(checks)) {
    blockers.push('Release acceptance is not usable.');
  }
  if (checks.handoffPackage.status !== 'ready') {
    blockers.push(`QA handoff package must be ready, got ${checks.handoffPackage.status}.`);
  }
  if (hasFailedEvidencePackage(checks)) {
    blockers.push('Fresh Windows evidence package validation has failed.');
  }
  if (hasFailedEvidenceImport(checks)) {
    blockers.push('Fresh Windows evidence import has failed.');
  }
  if (checks.evidenceImport.awaitingFinalGate) {
    blockers.push('Imported Fresh Windows evidence is awaiting final gate approval.');
  }
  if (checks.freshWindows.checksumStatus !== 'passed') {
    blockers.push(`Fresh Windows handoff checksum evidence must be passed, got ${checks.freshWindows.checksumStatus ?? 'missing'}.`);
  }

  const externalEvidenceRequired = checks.freshWindows.status !== 'passed' && missingFreshWindowsArtifacts.length > 0;
  if (checks.freshWindows.status !== 'passed' && missingFreshWindowsArtifacts.length === 0) {
    blockers.push('Fresh Windows evidence is not passed, but the missing evidence files were not reported.');
  }

  return {
    status: blockers.length === 0 && externalEvidenceRequired ? 'ready' : 'not-ready',
    externalEvidenceRequired,
    dirtyWorkspaceBlocksApproval,
    workspaceReleaseRelevantChangedCount: workspace?.releaseRelevantChangedCount ?? null,
    handoffPackage,
    commands,
    commandArgs,
    expectedReturnedEvidence,
    missingFreshWindowsArtifacts,
    blockers,
    actions: blockers.length === 0 && externalEvidenceRequired
      ? buildFreshWindowsEvidenceActions(dirtyWorkspaceBlocksApproval, handoffPackage, commands, expectedReturnedEvidence)
      : [],
  };
}

function buildFreshWindowsHandoffPackageSummary(handoffPackageCheck) {
  const packageStatus = handoffPackageCheck?.status ?? 'missing';
  const packagePath = handoffPackageCheck?.packagePath ?? null;
  const sha256Path = handoffPackageCheck?.sha256Path ?? null;
  const packageReportPath = handoffPackageCheck?.packageReportPath ?? null;
  const bytes = handoffPackageCheck?.bytes ?? null;
  const sha256 = handoffPackageCheck?.sha256 ?? null;
  const sidecarStatus = handoffPackageCheck?.sidecarStatus ?? 'missing';
  const sidecarBytes = handoffPackageCheck?.sidecarBytes ?? null;
  const sidecarFileSha256 = handoffPackageCheck?.sidecarFileSha256 ?? null;
  const packageReportStatus = handoffPackageCheck?.packageReportStatus ?? 'missing';
  const packageReportBytes = handoffPackageCheck?.packageReportBytes ?? null;
  const packageReportSha256 = handoffPackageCheck?.packageReportSha256 ?? null;
  const filesToSend = buildFreshWindowsFilesToSend({
    packageStatus,
    packagePath,
    sha256Path,
    packageReportPath,
    bytes,
    sha256,
    sidecarStatus,
    sidecarBytes,
    sidecarFileSha256,
    packageReportStatus,
    packageReportBytes,
    packageReportSha256,
  });
  const filesToSendRequiredCount = filesToSend.filter((file) => file.required).length;
  const filesToSendReadyCount = filesToSend.filter((file) => file.required && file.ready).length;
  return {
    status: packageStatus,
    packagePath,
    packageFileName: packagePath ? path.basename(packagePath) : null,
    sha256Path,
    packageReportPath,
    bytes,
    sha256,
    sidecarBytes,
    sidecarFileSha256,
    packageReportBytes,
    packageReportSha256,
    filesToSendRequiredCount,
    filesToSendReadyCount,
    filesToSendAllReady: filesToSendReadyCount === filesToSendRequiredCount,
    filesToSend,
  };
}

function buildFreshWindowsFilesToSend({
  packageStatus,
  packagePath,
  sha256Path,
  packageReportPath,
  bytes,
  sha256,
  sidecarStatus,
  sidecarBytes,
  sidecarFileSha256,
  packageReportStatus,
  packageReportBytes,
  packageReportSha256,
}) {
  const zipStatus = bytes === null ? 'missing' : 'present';
  const packageReady = packageStatus === 'ready';
  return [
    {
      role: 'handoff-zip',
      required: true,
      status: zipStatus,
      ready: zipStatus === 'present' && packageReady,
      path: packagePath,
      fileName: packagePath ? path.basename(packagePath) : null,
      bytes,
      sha256,
    },
    {
      role: 'handoff-zip-sha256',
      required: true,
      status: sidecarStatus,
      ready: sidecarStatus === 'present' && packageReady,
      path: sha256Path,
      fileName: sha256Path ? path.basename(sha256Path) : null,
      bytes: sidecarBytes,
      sha256: sidecarFileSha256,
    },
    {
      role: 'handoff-package-report',
      required: true,
      status: packageReportStatus,
      ready: packageReportStatus === 'passed' && packageReady,
      path: packageReportPath,
      fileName: packageReportPath ? path.basename(packageReportPath) : null,
      bytes: packageReportBytes,
      sha256: packageReportSha256,
    },
  ];
}

function buildFreshWindowsHandoffCommands(workspaceRoot) {
  const commandArgs = buildFreshWindowsHandoffCommandArgs(workspaceRoot);
  return {
    qaAcceptance: '.\\run-fresh-windows-acceptance.ps1 -Tester "<name>" -WaitTimeoutSeconds 600',
    fullVerification: formatCliArgs(commandArgs.fullVerification),
    releaseAcceptance: formatCliArgs(commandArgs.releaseAcceptance),
    handoff: formatCliArgs(commandArgs.handoff),
    handoffPackage: formatCliArgs(commandArgs.handoffPackage),
    finalGate: formatCliArgs(commandArgs.finalGate),
    localImport: formatCliArgs(commandArgs.localImport),
  };
}

function buildFreshWindowsHandoffCommandArgs(workspaceRoot) {
  const workspaceRootArg = normalizeSlash(workspaceRoot);
  const handoffPackager = normalizeSlash(path.join(workspaceRoot, DEFAULT_RELEASE_ROOT, 'handoff', 'package-handoff-for-qa.ps1'));
  const npmScriptArgs = (scriptName) => [
    'npm',
    '--prefix',
    workspaceRootArg,
    'run',
    scriptName,
  ];
  return {
    qaAcceptance: [
      '.\\run-fresh-windows-acceptance.ps1',
      '-Tester',
      '<name>',
      '-WaitTimeoutSeconds',
      '600',
    ],
    fullVerification: [
      ...npmScriptArgs('electron:release:verify'),
    ],
    releaseAcceptance: npmScriptArgs('electron:release:acceptance'),
    handoff: npmScriptArgs('electron:release:handoff'),
    handoffPackage: [
      'powershell',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      handoffPackager,
    ],
    finalGate: npmScriptArgs('electron:release:final-gate'),
    localImport: [
      'npm',
      '--prefix',
      workspaceRootArg,
      'run',
      'electron:release:import-evidence',
      '--',
      '--root-dir',
      workspaceRootArg,
      '--evidence-dir',
      '<returned-fresh-windows-evidence-folder>',
      '--run-final-gate',
    ],
  };
}

function buildFreshWindowsExpectedReturnedEvidence() {
  const zip = 'fresh-windows-evidence.zip';
  const sha256 = 'fresh-windows-evidence.zip.sha256';
  const report = 'fresh-windows-evidence.zip.report.json';
  return {
    zip,
    sha256,
    report,
    filesToReturn: [
      {
        role: 'fresh-windows-evidence-zip',
        required: true,
        fileName: zip,
      },
      {
        role: 'fresh-windows-evidence-zip-sha256',
        required: true,
        fileName: sha256,
      },
      {
        role: 'fresh-windows-evidence-package-report',
        required: true,
        fileName: report,
      },
    ],
  };
}

function buildFreshWindowsEvidenceActions(dirtyWorkspaceBlocksApproval, handoffPackage, commands, expectedReturnedEvidence) {
  const handoffZip = handoffPackage.packagePath ?? 'the current handoff ZIP';
  const handoffSha256 = handoffPackage.sha256Path ?? 'the matching .sha256 sidecar';
  const handoffReport = handoffPackage.packageReportPath ?? 'the matching .report.json audit report';
  const sendAction = dirtyWorkspaceBlocksApproval
    ? `Do not send the existing handoff ZIP as final QA evidence while release-relevant workspace changes are present; after affected checks and source freeze, run ${commands.fullVerification}, then ${commands.releaseAcceptance}, then ${commands.handoff}, then ${commands.handoffPackage}; after that send ${handoffZip}, ${handoffSha256}, and ${handoffReport} to the clean Windows QA machine.`
    : `Send ${handoffZip}, ${handoffSha256}, and ${handoffReport} to the clean Windows QA machine.`;
  const actions = [
    sendAction,
    `On the clean Windows QA machine, extract the handoff ZIP and run ${commands.qaAcceptance}.`,
    `Return ${expectedReturnedEvidence.zip}, ${expectedReturnedEvidence.sha256}, and ${expectedReturnedEvidence.report} from the QA machine.`,
    `Run ${commands.localImport}; the adjacent .report.json is required by default.`,
  ];
  if (dirtyWorkspaceBlocksApproval) {
    actions.push(`Release-relevant workspace changes are present; run affected checks for those changes now, then after source freeze run ${commands.fullVerification} and ${commands.finalGate} before approval.`);
  }
  return actions;
}

function hasReleaseRelevantWorkspaceChanges(workspace) {
  return Number.isInteger(workspace?.releaseRelevantChangedCount) && workspace.releaseRelevantChangedCount > 0;
}

function hasFailedEvidencePackage(checks) {
  return checks.evidencePackage.status === 'failed'
    || checks.evidencePackage.zipEntryInspectionStatus === 'failed'
    || checks.evidencePackage.packageReportStatus === 'failed';
}

function hasFailedEvidenceImport(checks) {
  return checks.evidenceImport.status === 'failed'
    || checks.evidenceImport.importStatus === 'failed'
    || checks.evidenceImport.archiveVerificationStatus === 'failed'
    || checks.evidenceImport.packageReportStatus === 'failed'
    || checks.evidenceImport.copyVerificationStatus === 'failed';
}

function isReleaseApproved(checks) {
  return checks.finalGate.status === 'passed'
    && checks.finalGate.freshnessStatus === 'current'
    && isCoreVerificationUsable(checks)
    && isFullVerificationUsable(checks)
    && isReleaseAcceptanceUsable(checks)
    && checks.handoffPackage.status === 'ready'
    && !hasFailedEvidencePackage(checks)
    && !hasFailedEvidenceImport(checks)
    && checks.freshWindows.status === 'passed';
}

function isReleaseAcceptanceUsable(checks) {
  return checks.releaseAcceptance.status === 'passed'
    && checks.releaseAcceptance.freshnessStatus === 'current'
    && checks.releaseAcceptance.installerNamingFailures.length === 0;
}

function isCoreVerificationUsable(checks) {
  return checks.coreVerification.status === 'passed'
    && checks.coreVerification.profile === 'core'
    && checks.coreVerification.validationFailures.length === 0;
}

function isFullVerificationUsable(checks) {
  return checks.fullVerification.status === 'passed'
    && checks.fullVerification.profile === 'full'
    && checks.fullVerification.validationFailures.length === 0;
}

function findPrimaryBlocker(checks) {
  if (!isCoreVerificationUsable(checks)) {
    return 'core-verification';
  }
  if (!isFullVerificationUsable(checks)) {
    return 'full-verification';
  }
  if (!isReleaseAcceptanceUsable(checks)) {
    return 'release-acceptance';
  }
  if (checks.handoffPackage.status !== 'ready') {
    return 'handoff-package';
  }
  if (hasFailedEvidencePackage(checks)) {
    return 'evidence-package';
  }
  if (hasFailedEvidenceImport(checks)) {
    return 'evidence-import';
  }
  if (checks.evidenceImport.awaitingFinalGate) {
    return 'final-gate';
  }
  if (checks.finalGate.freshnessStatus === 'stale' || checks.finalGate.freshnessStatus === 'unknown') {
    return 'final-gate';
  }
  if (checks.freshWindows.status !== 'passed') {
    return 'fresh-windows-evidence';
  }
  if (checks.finalGate.status !== 'passed' || checks.finalGate.freshnessStatus !== 'current') {
    return 'final-gate';
  }
  return 'final-gate';
}

function buildRemainingActions(status, checks, missingFreshWindowsArtifacts, freshWindowsHandoffReadiness, workspaceRoot) {
  if (status === 'approved') {
    return [];
  }
  if (status === 'waiting-for-fresh-windows-evidence') {
    return freshWindowsHandoffReadiness.actions;
  }
  const actions = [];
  if (!isCoreVerificationUsable(checks)) {
    actions.push('Run npm run electron:release:verify:core and fix any failed core gate.');
  }
  if (!isFullVerificationUsable(checks)) {
    actions.push('Run npm run electron:release:verify and fix any failed full release gate.');
  }
  if (!isReleaseAcceptanceUsable(checks)) {
    if (checks.releaseAcceptance.installerNamingStatus === 'stale') {
      if (checks.installerArtifacts.status === 'passed' || checks.installerArtifacts.status === 'stale-verification') {
        actions.push('Rerun npm run electron:release:verify, then rerun npm run electron:release:acceptance so the report uses the current installer artifacts.');
      } else {
        actions.push('Rebuild the Electron installer with the current artifact naming rule, rerun npm run electron:release:verify, then rerun npm run electron:release:acceptance.');
      }
    } else {
      actions.push('Run npm run electron:release:acceptance after full verification passes.');
    }
  }
  if (checks.handoffPackage.status !== 'ready' && checks.releaseAcceptance.status === 'passed') {
    actions.push('Run npm run electron:release:handoff and .danbi/electron-release/handoff/package-handoff-for-qa.ps1 to prepare the QA handoff ZIP.');
  }
  if (hasFailedEvidencePackage(checks)) {
    actions.push('Fix the failed fresh Windows evidence package or rerun npm run electron:release:import-evidence with a valid returned ZIP, matching .sha256 sidecar, and required .report.json.');
  }
  if (hasFailedEvidenceImport(checks)) {
    actions.push('Fix the failed fresh Windows evidence import or re-import a valid returned ZIP with a matching .sha256 sidecar and required .report.json.');
  }
  if (checks.evidenceImport.awaitingFinalGate) {
    actions.push(formatImportedEvidenceFinalGateAction(checks.evidenceImport, workspaceRoot));
  }
  if (checks.finalGate.freshnessStatus === 'stale' || checks.finalGate.freshnessStatus === 'unknown') {
    actions.push('Run npm run electron:release:final-gate so the release status is based on the current verification, acceptance, and handoff reports.');
  }
  if (checks.freshWindows.status !== 'passed' && missingFreshWindowsArtifacts.length > 0) {
    actions.push('Complete the fresh Windows handoff evidence files or import the returned evidence ZIP.');
    if (freshWindowsHandoffReadiness.status === 'ready') {
      actions.push(...freshWindowsHandoffReadiness.actions);
    }
  }
  if (actions.length === 0) {
    actions.push('Run npm run electron:release:final-gate and inspect the generated final gate report.');
  }
  return actions;
}

function formatImportedEvidenceFinalGateAction(evidenceImportCheck, workspaceRoot) {
  if (evidenceImportCheck.finalGateCommand) {
    return `Run ${evidenceImportCheck.finalGateCommand} to approve the imported fresh Windows evidence.`;
  }
  const args = evidenceImportCheck.finalGateArgs.length > 0 ? evidenceImportCheck.finalGateArgs : [
    '--evidence-zip',
    evidenceImportCheck.importedZipPath,
    '--evidence-zip-sha256',
    evidenceImportCheck.importedSha256Path,
  ];
  if (evidenceImportCheck.finalGateArgs.length === 0 && evidenceImportCheck.importedReportPath) {
    args.push('--evidence-report', evidenceImportCheck.importedReportPath);
  }
  return `Run ${formatCliArgs([
    'npm',
    '--prefix',
    normalizeSlash(workspaceRoot),
    'run',
    'electron:release:final-gate',
    '--',
    ...args,
  ])} to approve the imported fresh Windows evidence.`;
}

function normalizeCliArgs(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.every(isSafeCliArg) ? value : [];
}

function isSafeCliArg(value) {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && !/[\x00-\x1F\x7F]/.test(value);
}

function formatCliArgs(args) {
  return args.map((arg) => quoteCliArg(arg)).join(' ');
}

function quoteCliArg(value) {
  return /^[A-Za-z0-9._/:=-]+$/.test(value)
    ? value
    : `'${value.replace(/'/g, "''")}'`;
}

function collectWorkspaceState(workspaceRoot, options) {
  const maxChangedFiles = Number(options.maxChangedFiles ?? 25);
  if (typeof options.gitStatusText === 'string') {
    return buildWorkspaceState(parseGitPorcelain(options.gitStatusText), maxChangedFiles, 'provided');
  }

  const result = spawnSync('git', ['status', '--porcelain=v1'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    return {
      status: 'unavailable',
      gitAvailable: false,
      dirty: null,
      changedCount: null,
      releaseRelevantChangedCount: null,
      changedFiles: [],
      source: 'git',
      error: result.error?.message ?? result.stderr?.trim() ?? null,
    };
  }
  return buildWorkspaceState(parseGitPorcelain(result.stdout), maxChangedFiles, 'git');
}

function buildWorkspaceState(entries, maxChangedFiles, source) {
  const releaseRelevantChangedCount = entries.filter((entry) => entry.releaseRelevant).length;
  return {
    status: entries.length > 0 ? 'dirty' : 'clean',
    gitAvailable: source === 'git' || source === 'provided',
    dirty: entries.length > 0,
    changedCount: entries.length,
    releaseRelevantChangedCount,
    changedFiles: entries.slice(0, maxChangedFiles),
    truncatedChangedFiles: entries.length > maxChangedFiles,
    source,
  };
}

function parseGitPorcelain(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const status = line.slice(0, 2);
      const rawPath = line.slice(3);
      const filePath = normalizeSlash(rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) : rawPath);
      return {
        status,
        path: filePath,
        releaseRelevant: isReleaseRelevantPath(filePath),
      };
    });
}

function isReleaseRelevantPath(filePath) {
  return [
    'package.json',
    'package-lock.json',
    'electron-builder.yml',
    'eslint.config.mjs',
    'next.config.mjs',
    'playwright.config.ts',
    'postcss.config.mjs',
    'tailwind.config.ts',
    'tsconfig.json',
    'vitest.config.ts',
    'scripts/',
    'src/',
    'tests/',
    'public/',
    'prisma/',
  ].some((prefix) => filePath === prefix.replace(/\/$/, '') || filePath.startsWith(prefix));
}

function buildWarnings(workspace, status, checks, workspaceRoot) {
  const warnings = [];
  if (workspace.status === 'unavailable') {
    warnings.push('Workspace git status is unavailable; release report freshness cannot be checked from this summary.');
  }
  if (workspace.status === 'dirty') {
    warnings.push(`Workspace has ${workspace.changedCount} uncommitted or untracked change(s), including ${workspace.releaseRelevantChangedCount} release-relevant path(s); while iterating, run checks only for changed or affected paths. Before final approval on the frozen release tree, run ${formatCliArgs(['npm', '--prefix', normalizeSlash(workspaceRoot), 'run', 'electron:release:verify'])} and ${formatCliArgs(['npm', '--prefix', normalizeSlash(workspaceRoot), 'run', 'electron:release:final-gate'])}.`);
  }
  if (checks.coreVerification.validationFailures.length > 0 && checks.coreVerification.status !== 'missing') {
    warnings.push(`Core release verification is not usable for approval: ${checks.coreVerification.validationFailures.join(' ')}`);
  }
  if (status === 'approved' && workspace.status === 'dirty') {
    warnings.push('Final gate is approved but the workspace is dirty; treat the approval as provisional until the exact release tree is clean or archived.');
  }
  if (checks.releaseAcceptance.freshnessStatus === 'stale') {
    warnings.push('Release acceptance is stale: the latest full verification report ended after the acceptance report; rerun acceptance, handoff, and final gate.');
  }
  if (checks.releaseAcceptance.freshnessStatus === 'unknown') {
    warnings.push('Release acceptance freshness is unknown: rerun npm run electron:release:acceptance after full verification passes.');
  }
  if (checks.releaseAcceptance.installerNamingFailures.length > 0 && checks.releaseAcceptance.status !== 'missing') {
    warnings.push(`Release acceptance installer naming is not usable for approval: ${checks.releaseAcceptance.installerNamingFailures.join(' ')}`);
  }
  if (checks.installerArtifacts.status === 'stale-verification') {
    warnings.push('Current installer artifacts are newer than the full release verification report; rerun npm run electron:release:verify before release acceptance.');
  }
  if (checks.fullVerification.validationFailures.length > 0 && checks.fullVerification.status !== 'missing') {
    warnings.push(`Full release verification is not usable for approval: ${checks.fullVerification.validationFailures.join(' ')}`);
  }
  if (checks.handoffPackage.status !== 'ready' && checks.releaseAcceptance.status === 'passed') {
    warnings.push(`QA handoff package is ${checks.handoffPackage.status}; regenerate the handoff package before sending artifacts to a fresh Windows machine.`);
  }
  if (checks.finalGate.freshnessStatus === 'stale') {
    warnings.push('Final release gate is stale: rerun npm run electron:release:final-gate after the current verification, acceptance, and handoff reports.');
  }
  if (checks.evidenceImport.legacyMissingReport) {
    warnings.push('Fresh Windows evidence import used legacy ZIP-only mode without fresh-windows-evidence.zip.report.json; keep this exception visible in release audit notes.');
  }
  if (checks.evidencePackage.legacyMissingReport) {
    warnings.push('Final gate accepted legacy ZIP-only Fresh Windows evidence without a package report; the current default QA flow requires fresh-windows-evidence.zip.report.json.');
  }
  return warnings;
}

function buildApprovalPolicy(status, workspace, options, checks) {
  const strict = Boolean(options.strict);
  const requireClean = Boolean(options.requireClean);
  const failures = [];
  if (strict && status !== 'approved') {
    failures.push(`Release status must be approved, got ${status}.`);
  }
  if (strict && checks?.evidenceImport?.legacyMissingReport) {
    failures.push('Strict release approval requires fresh-windows-evidence.zip.report.json; evidence import used legacy ZIP-only mode.');
  }
  if (strict && checks?.evidencePackage?.legacyMissingReport) {
    failures.push('Strict release approval requires fresh-windows-evidence.zip.report.json; final gate accepted legacy ZIP-only evidence.');
  }
  if (requireClean && workspace.dirty !== false) {
    failures.push(`Workspace must be clean for release approval, got ${workspace.status}.`);
  }
  return {
    strict,
    requireClean,
    passed: failures.length === 0,
    failures,
  };
}

function readJsonIfPresent(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(stripJsonBom(readFileSync(filePath, 'utf8')));
}

function stripJsonBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function readSha256Sidecar(filePath) {
  if (!existsSync(filePath)) {
    return { status: 'missing', sha256: null, fileName: null };
  }
  const text = stripJsonBom(readFileSync(filePath, 'utf8')).trim();
  const match = /^([a-fA-F0-9]{64})\s+(.+)$/.exec(text);
  if (!match) {
    return { status: 'invalid', sha256: null, fileName: null };
  }
  const fileName = match[2].trim();
  if (!isSafeBasename(fileName) || !/\.zip$/i.test(fileName)) {
    return { status: 'invalid', sha256: null, fileName };
  }
  return {
    status: 'present',
    sha256: match[1].toLowerCase(),
    fileName,
  };
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

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
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

function parseIsoMillis(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

function assertInsideRoot(workspaceRoot, targetPath, label) {
  const relative = path.relative(workspaceRoot, targetPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside workspace: ${targetPath}`);
  }
}

function normalizeRelative(workspaceRoot, targetPath) {
  return normalizeSlash(path.relative(workspaceRoot, targetPath));
}

function normalizeSlash(value) {
  return value.replace(/\\/g, '/');
}

function readLatestYmlReleaseDate(text) {
  const match = /^releaseDate:\s*['"]?(.+?)['"]?\s*$/m.exec(text);
  return match?.[1]?.trim() ?? null;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCliArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--final-gate-report') {
      options.finalGateReport = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--core-verification-report') {
      options.coreVerificationReport = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--full-verification-report') {
      options.fullVerificationReport = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--release-acceptance-report') {
      options.releaseAcceptanceReport = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--evidence-import-report') {
      options.evidenceImportReport = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--handoff-manifest') {
      options.handoffManifest = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--handoff-package') {
      options.handoffPackage = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--root-dir') {
      options.rootDir = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--out') {
      options.reportPath = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--require-clean') {
      options.requireClean = true;
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
    'Usage: node scripts/electron-release-status.mjs [--final-gate-report <path>] [--core-verification-report <path>] [--full-verification-report <path>] [--release-acceptance-report <path>] [--evidence-import-report <path>] [--handoff-manifest <path>] [--handoff-package <path>] [--root-dir <path>] [--out <path>] [--strict] [--require-clean]',
    '',
    'Summarizes the current Electron release state and explains whether the remaining blocker is only the external fresh-Windows evidence package. With --strict, exits non-zero unless the final gate is approved and current Fresh Windows evidence package reports are present. With --require-clean, exits non-zero unless the workspace is clean.',
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
    const status = buildElectronReleaseStatus(options);
    if (options.reportPath) {
      const workspaceRoot = path.resolve(options.rootDir ?? rootDir);
      const reportPath = path.resolve(workspaceRoot, options.reportPath);
      assertInsideRoot(workspaceRoot, reportPath, 'release status report');
      mkdirSync(path.dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
    }
    console.log(JSON.stringify(status, null, 2));
    if (!status.approvalPolicy.passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({
      kind: 'danbi.electron.release-status',
      status: 'failed',
      reportPath: typeof options.reportPath === 'string' ? normalizeSlash(options.reportPath) : null,
      failureCount: 1,
      failures: [message],
    }, null, 2));
    console.error(message);
    process.exit(1);
  }
}
