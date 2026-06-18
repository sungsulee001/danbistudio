import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HANDOFF_DIR = path.join('.danbi', 'electron-release', 'handoff');
const DEFAULT_RESULT_PATH = path.join(DEFAULT_HANDOFF_DIR, 'fresh-windows-result.json');
const DEFAULT_BASIC_SMOKE_RESULT_NAME = 'fresh-windows-basic-smoke.json';
const DEFAULT_GUI_SESSION_RESULT_NAME = 'fresh-windows-gui-session.json';
const EXPECTED_HANDOFF_OUTPUT_MP4_NAME = 'fresh-windows-gui-render.mp4';
const DEFAULT_REPORT_PATH = path.join('.danbi', 'electron-release', 'fresh-windows-acceptance-report.json');

const REQUIRED_TRUE_PATHS = [
  'artifactVerification.verifyReleaseArtifactsPs1Passed',
  'guiSession.launchedWithFreshUserData',
  'guiSession.automationSavePathSet',
  'guiSession.outputPathMatchesRenderedMp4',
  'postAcceptanceCleanup.processStopped',
  'postAcceptanceCleanup.uninstallerRan',
  'postAcceptanceCleanup.installDirRemoved',
  'postAcceptanceCleanup.installRootRemoved',
  'postAcceptanceCleanup.shortcutCleanup',
  'install.freshWindowsProfile',
  'install.installerCompleted',
  'install.appLaunched',
  'sampleWorkflow.openedPackagedSample',
  'sampleWorkflow.programMonitorRendered',
  'sampleWorkflow.exportPlanReady',
  'sampleWorkflow.guiRenderCompleted',
  'sampleWorkflow.outputMp4Opened',
  'sampleWorkflow.noExternalNetworkRequired',
];

const REQUIRED_NON_EMPTY_PATHS = [
  'tester',
  'checkedAt',
  'machine.windowsVersion',
  'machine.cpu',
  'machine.ramGb',
  'basicSmoke.resultPath',
  'basicSmoke.checkedAt',
  'guiSession.resultPath',
  'guiSession.checkedAt',
  'guiSession.outputMp4Path',
  'guiSession.userDataDir',
  'sampleWorkflow.outputMp4.path',
  'sampleWorkflow.outputMp4.sha256',
  'sampleWorkflow.outputMp4.handoffRelativePath',
  'sampleWorkflow.outputMp4.ffprobePath',
];

const BASIC_SMOKE_REQUIRED_TRUE_PATHS = [
  'checks.verifyReleaseArtifactsPs1Passed',
  'checks.installerCompleted',
  'checks.installedExePresent',
  'checks.packagedSamplePresent',
  'checks.packagedRendererPresent',
  'checks.smokeProcessExitZero',
  'checks.smokeResultWritten',
  'checks.sampleProjectAvailable',
  'checks.ffmpegReady',
  'checks.rendererUrlLocal',
  'checks.userDataIsFreshPath',
  'checks.uninstalled',
  'checks.shortcutCleanup',
];

const BASIC_SMOKE_REQUIRED_NON_EMPTY_PATHS = [
  'checkedAt',
  'machine.windowsVersion',
  'machine.cpu',
  'machine.ramGb',
  'paths.installRoot',
  'paths.installDir',
  'paths.userDataDir',
  'paths.rawSmokeResultPath',
];

const GUI_SESSION_REQUIRED_TRUE_PATHS = [
  'checks.verifyReleaseArtifactsPs1Passed',
  'checks.basicSmokePassed',
  'checks.installerCompleted',
  'checks.installedExePresent',
  'checks.packagedSamplePresent',
  'checks.packagedRendererPresent',
  'checks.appLaunched',
  'checks.freshUserDataPath',
  'checks.automationSavePathSet',
];

const GUI_SESSION_REQUIRED_NON_EMPTY_PATHS = [
  'checkedAt',
  'paths.installRoot',
  'paths.installDir',
  'paths.userDataDir',
  'paths.outputMp4',
];

const MINIMUM_RENDERED_OUTPUT_BYTES = 10_000;
const REQUIRED_HANDOFF_CHECKSUM_TARGETS = [
  'handoff-manifest.json',
  'verify-release-artifacts.ps1',
  'run-installed-basic-smoke.ps1',
  'launch-gui-acceptance.ps1',
  'record-fresh-windows-result.ps1',
  'verify-fresh-windows-result.ps1',
  'package-fresh-windows-evidence.ps1',
  'run-fresh-windows-acceptance.ps1',
  'package-handoff-for-qa.ps1',
  'FRESH_WINDOWS_ACCEPTANCE_KR.md',
  'fresh-windows-result-template.json',
];

export function validateFreshWindowsManualAcceptance(options = {}) {
  const workspaceRoot = path.resolve(options.rootDir ?? rootDir);
  const handoffDir = path.resolve(workspaceRoot, options.handoffDir ?? DEFAULT_HANDOFF_DIR);
  const resultPath = path.resolve(workspaceRoot, options.resultPath ?? DEFAULT_RESULT_PATH);
  const basicSmokeResultPath = path.resolve(workspaceRoot, options.basicSmokeResultPath ?? path.join(handoffDir, DEFAULT_BASIC_SMOKE_RESULT_NAME));
  const guiSessionResultPath = path.resolve(workspaceRoot, options.guiSessionResultPath ?? path.join(handoffDir, DEFAULT_GUI_SESSION_RESULT_NAME));
  const reportPath = path.resolve(workspaceRoot, options.reportPath ?? DEFAULT_REPORT_PATH);

  assertInsideRoot(workspaceRoot, handoffDir, 'handoff directory');
  assertInsideRoot(workspaceRoot, resultPath, 'manual result path');
  assertInsideRoot(workspaceRoot, basicSmokeResultPath, 'basic smoke result path');
  assertInsideRoot(workspaceRoot, guiSessionResultPath, 'GUI session result path');
  assertInsideRoot(workspaceRoot, reportPath, 'manual acceptance report path');

  const failures = [];
  const warnings = [];
  const handoffManifestPath = path.join(handoffDir, 'handoff-manifest.json');
  const handoffManifest = readJsonIfPresent(handoffManifestPath, failures, 'handoff manifest');
  const manualResult = readJsonIfPresent(resultPath, failures, 'fresh Windows manual result');
  const basicSmokeResult = readJsonIfPresent(basicSmokeResultPath, failures, 'fresh Windows basic smoke result');
  const guiSessionResult = readJsonIfPresent(guiSessionResultPath, failures, 'fresh Windows GUI session result');

  if (handoffManifest && handoffManifest.status !== 'passed') {
    failures.push(`Handoff manifest must be passed, got ${handoffManifest.status}.`);
  }
  if (handoffManifest) {
    validateHandoffManifestToolDeclarations(handoffManifest, failures);
  }

  if (handoffManifest && manualResult) {
    validateManualResultAgainstHandoff(manualResult, handoffManifest, failures);
  }
  if (manualResult && basicSmokeResult) {
    validateManualResultAgainstBasicSmoke(manualResult, basicSmokeResult, basicSmokeResultPath, handoffDir, failures);
  }
  if (manualResult && guiSessionResult) {
    validateManualResultAgainstGuiSession(manualResult, guiSessionResult, guiSessionResultPath, handoffDir, failures);
  }
  const basicSmokeEvidence = basicSmokeResult
    ? validateBasicSmokeEvidence(basicSmokeResult, handoffManifest, failures)
    : { status: 'missing' };
  const guiSessionEvidence = guiSessionResult
    ? validateGuiSessionEvidence(guiSessionResult, handoffManifest, failures)
    : { status: 'missing' };
  const cleanupEvidence = manualResult
    ? validatePostAcceptanceCleanup(manualResult, failures)
    : { status: 'skipped' };
  const outputEvidence = manualResult
    ? validateOutputMp4Evidence(manualResult, handoffDir, failures)
    : { status: 'skipped' };

  const checksumEvidence = handoffManifest
    ? validateHandoffChecksums(handoffDir, handoffManifest, failures)
    : { status: 'skipped', files: [] };

  const report = {
    kind: 'danbi.electron.fresh-windows-manual-acceptance-report',
    generatedAt: new Date().toISOString(),
    status: failures.length === 0 ? 'passed' : 'failed',
    handoffDir: normalizeRelative(workspaceRoot, handoffDir),
    resultPath: normalizeRelative(workspaceRoot, resultPath),
    productName: handoffManifest?.productName ?? manualResult?.productName ?? null,
    version: handoffManifest?.version ?? manualResult?.version ?? null,
    tester: manualResult?.tester ?? null,
    checkedAt: manualResult?.checkedAt ?? null,
    checksumEvidence,
    basicSmokeEvidence,
    guiSessionEvidence,
    cleanupEvidence,
    outputEvidence,
    requiredTrueChecks: REQUIRED_TRUE_PATHS.map((fieldPath) => ({
      fieldPath,
      passed: getByPath(manualResult, fieldPath) === true,
    })),
    requiredTextChecks: REQUIRED_NON_EMPTY_PATHS.map((fieldPath) => ({
      fieldPath,
      passed: isNonEmptyString(getByPath(manualResult, fieldPath)),
    })),
    failures,
    warnings,
  };

  if (options.writeReport !== false) {
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  return {
    report,
    reportPath: normalizeRelative(workspaceRoot, reportPath),
  };
}

function validateHandoffManifestToolDeclarations(handoff, failures) {
  const expected = {
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
  for (const [field, fileName] of Object.entries(expected)) {
    if (handoff[field] !== fileName) {
      failures.push(`Handoff manifest ${field} must be ${fileName}, got ${handoff[field]}.`);
    }
  }
}

function validateManualResultAgainstHandoff(result, handoff, failures) {
  if (result.kind !== 'danbi.electron.fresh-windows-manual-acceptance') {
    failures.push(`Unexpected manual result kind: ${result.kind}`);
  }
  if (result.productName !== handoff.productName) {
    failures.push(`Manual result productName mismatch. Expected ${handoff.productName}, got ${result.productName}.`);
  }
  if (result.version !== handoff.version) {
    failures.push(`Manual result version mismatch. Expected ${handoff.version}, got ${result.version}.`);
  }
  const installer = handoff.files?.find((file) => file.role === 'installer')?.target;
  if (installer && result.installer !== installer) {
    failures.push(`Manual result installer mismatch. Expected ${installer}, got ${result.installer}.`);
  }
  if (result.result !== 'passed') {
    failures.push(`Manual result must be "passed", got ${result.result}.`);
  }
  if (!isIsoDateLike(result.checkedAt)) {
    failures.push('Manual result checkedAt must be an ISO-like timestamp.');
  }
  if (result.basicSmoke?.status !== 'passed') {
    failures.push(`Manual result basicSmoke.status must be "passed", got ${result.basicSmoke?.status}.`);
  }
  if (!isIsoDateLike(result.basicSmoke?.checkedAt)) {
    failures.push('Manual result basicSmoke.checkedAt must be an ISO-like timestamp.');
  }
  if (result.guiSession?.status !== 'launched') {
    failures.push(`Manual result guiSession.status must be "launched", got ${result.guiSession?.status}.`);
  }
  if (!isIsoDateLike(result.guiSession?.checkedAt)) {
    failures.push('Manual result guiSession.checkedAt must be an ISO-like timestamp.');
  }
  if (Array.isArray(result.postAcceptanceCleanup?.remainingNewShortcuts) && result.postAcceptanceCleanup.remainingNewShortcuts.length > 0) {
    failures.push('Manual result postAcceptanceCleanup must not leave new shortcuts behind.');
  }

  for (const fieldPath of REQUIRED_NON_EMPTY_PATHS) {
    if (!isNonEmptyString(getByPath(result, fieldPath))) {
      failures.push(`Manual result must include ${fieldPath}.`);
    }
  }
  for (const fieldPath of REQUIRED_TRUE_PATHS) {
    if (getByPath(result, fieldPath) !== true) {
      failures.push(`Manual result must mark ${fieldPath} as true.`);
    }
  }
}

function validateManualResultAgainstBasicSmoke(result, basicSmoke, basicSmokeResultPath, handoffDir, failures) {
  const referencePath = result.basicSmoke?.resultPath;
  if (isNonEmptyString(referencePath)) {
    const resolvedReferencePath = resolveResultReferencePath(referencePath, handoffDir);
    if (normalizeResolvedPath(resolvedReferencePath) !== normalizeResolvedPath(basicSmokeResultPath)) {
      failures.push(`Manual result basicSmoke.resultPath must point to ${normalizeSlash(path.relative(handoffDir, basicSmokeResultPath))}.`);
    }
  }
  if (result.basicSmoke?.status !== basicSmoke.status) {
    failures.push(`Manual result basicSmoke.status must match basic smoke status ${basicSmoke.status}.`);
  }
  if (result.basicSmoke?.checkedAt !== basicSmoke.checkedAt) {
    failures.push('Manual result basicSmoke.checkedAt must match the basic smoke result checkedAt.');
  }
}

function validateManualResultAgainstGuiSession(result, guiSession, guiSessionResultPath, handoffDir, failures) {
  const referencePath = result.guiSession?.resultPath;
  if (isNonEmptyString(referencePath)) {
    const resolvedReferencePath = resolveResultReferencePath(referencePath, handoffDir);
    if (normalizeResolvedPath(resolvedReferencePath) !== normalizeResolvedPath(guiSessionResultPath)) {
      failures.push(`Manual result guiSession.resultPath must point to ${normalizeSlash(path.relative(handoffDir, guiSessionResultPath))}.`);
    }
  }
  if (result.guiSession?.status !== guiSession.status) {
    failures.push(`Manual result guiSession.status must match GUI session status ${guiSession.status}.`);
  }
  if (result.guiSession?.checkedAt !== guiSession.checkedAt) {
    failures.push('Manual result guiSession.checkedAt must match the GUI session checkedAt.');
  }
  if (!sameResolvedPath(result.guiSession?.outputMp4Path, guiSession.paths?.outputMp4)) {
    failures.push('Manual result guiSession.outputMp4Path must match the GUI session output MP4 path.');
  }
  if (!sameResolvedPath(result.sampleWorkflow?.outputMp4?.path, guiSession.paths?.outputMp4)) {
    failures.push('Manual result sampleWorkflow.outputMp4.path must match the GUI session output MP4 path.');
  }
  if (!sameResolvedPath(result.guiSession?.userDataDir, guiSession.paths?.userDataDir)) {
    failures.push('Manual result guiSession.userDataDir must match the GUI session userDataDir.');
  }
}

function validateBasicSmokeEvidence(result, handoff, failures) {
  const startFailureCount = failures.length;
  if (result.kind !== 'danbi.electron.fresh-windows-basic-smoke') {
    failures.push(`Unexpected basic smoke result kind: ${result.kind}`);
  }
  if (handoff) {
    if (result.productName !== handoff.productName) {
      failures.push(`Basic smoke productName mismatch. Expected ${handoff.productName}, got ${result.productName}.`);
    }
    if (result.version !== handoff.version) {
      failures.push(`Basic smoke version mismatch. Expected ${handoff.version}, got ${result.version}.`);
    }
    const installer = handoff.files?.find((file) => file.role === 'installer')?.target;
    if (installer && result.installer !== installer) {
      failures.push(`Basic smoke installer mismatch. Expected ${installer}, got ${result.installer}.`);
    }
  }
  if (result.status !== 'passed') {
    failures.push(`Basic smoke status must be "passed", got ${result.status}.`);
  }
  if (!isIsoDateLike(result.checkedAt)) {
    failures.push('Basic smoke checkedAt must be an ISO-like timestamp.');
  }

  for (const fieldPath of BASIC_SMOKE_REQUIRED_NON_EMPTY_PATHS) {
    if (!isNonEmptyString(getByPath(result, fieldPath))) {
      failures.push(`Basic smoke result must include ${fieldPath}.`);
    }
  }
  const trueChecks = BASIC_SMOKE_REQUIRED_TRUE_PATHS.map((fieldPath) => {
    const passed = getByPath(result, fieldPath) === true;
    if (!passed) {
      failures.push(`Basic smoke result must mark ${fieldPath} as true.`);
    }
    return { fieldPath, passed };
  });

  const smokeResult = result.smokeResult;
  const smokeDiagnostics = smokeResult?.diagnostics;
  const remainingNewShortcuts = Array.isArray(result.shortcuts?.remainingNew)
    ? result.shortcuts.remainingNew
    : [];
  const smokeChecks = {
    hasRawSmokeResult: Boolean(smokeResult && typeof smokeResult === 'object'),
    rawRendererUrlLocal: isLocalRendererUrl(smokeResult?.rendererUrl),
    rawFfmpegReady: smokeDiagnostics?.ffmpeg?.ready === true,
    rawSampleAvailable: smokeDiagnostics?.samples?.available === true,
    noRemainingNewShortcuts: remainingNewShortcuts.length === 0,
  };
  if (!smokeChecks.hasRawSmokeResult) {
    failures.push('Basic smoke result must include the raw Electron smokeResult.');
  }
  if (!smokeChecks.rawRendererUrlLocal) {
    failures.push('Basic smoke raw renderer URL must be local.');
  }
  if (!smokeChecks.rawFfmpegReady) {
    failures.push('Basic smoke raw diagnostics must confirm FFmpeg readiness.');
  }
  if (!smokeChecks.rawSampleAvailable) {
    failures.push('Basic smoke raw diagnostics must confirm the packaged sample is available.');
  }
  if (!smokeChecks.noRemainingNewShortcuts) {
    failures.push('Basic smoke result must not leave new shortcuts behind.');
  }

  return {
    status: failures.length === startFailureCount ? 'passed' : 'failed',
    checkedAt: result.checkedAt ?? null,
    machine: result.machine ?? null,
    rendererUrl: smokeResult?.rendererUrl ?? null,
    ffmpegPath: smokeDiagnostics?.ffmpeg?.ffmpegPath ?? null,
    sampleProjectPackagePath: smokeDiagnostics?.samples?.gettingStartedPackagePath ?? null,
    requiredTrueChecks: trueChecks,
    rawSmokeChecks: smokeChecks,
  };
}

function validateGuiSessionEvidence(result, handoff, failures) {
  const startFailureCount = failures.length;
  if (result.kind !== 'danbi.electron.fresh-windows-gui-session') {
    failures.push(`Unexpected GUI session result kind: ${result.kind}`);
  }
  if (handoff) {
    if (result.productName !== handoff.productName) {
      failures.push(`GUI session productName mismatch. Expected ${handoff.productName}, got ${result.productName}.`);
    }
    if (result.version !== handoff.version) {
      failures.push(`GUI session version mismatch. Expected ${handoff.version}, got ${result.version}.`);
    }
    const installer = handoff.files?.find((file) => file.role === 'installer')?.target;
    if (installer && result.installer !== installer) {
      failures.push(`GUI session installer mismatch. Expected ${installer}, got ${result.installer}.`);
    }
  }
  if (result.status !== 'launched') {
    failures.push(`GUI session status must be "launched", got ${result.status}.`);
  }
  if (!isIsoDateLike(result.checkedAt)) {
    failures.push('GUI session checkedAt must be an ISO-like timestamp.');
  }

  for (const fieldPath of GUI_SESSION_REQUIRED_NON_EMPTY_PATHS) {
    if (!isNonEmptyString(getByPath(result, fieldPath))) {
      failures.push(`GUI session result must include ${fieldPath}.`);
    }
  }
  const trueChecks = GUI_SESSION_REQUIRED_TRUE_PATHS.map((fieldPath) => {
    const passed = getByPath(result, fieldPath) === true;
    if (!passed) {
      failures.push(`GUI session result must mark ${fieldPath} as true.`);
    }
    return { fieldPath, passed };
  });

  return {
    status: failures.length === startFailureCount ? 'passed' : 'failed',
    checkedAt: result.checkedAt ?? null,
    processId: result.processId ?? null,
    outputMp4Path: result.paths?.outputMp4 ?? null,
    userDataDir: result.paths?.userDataDir ?? null,
    requiredTrueChecks: trueChecks,
  };
}

function validatePostAcceptanceCleanup(result, failures) {
  const cleanup = result.postAcceptanceCleanup;
  if (!cleanup || typeof cleanup !== 'object') {
    failures.push('Manual result must include postAcceptanceCleanup evidence.');
    return { status: 'missing' };
  }

  const remainingNewShortcuts = Array.isArray(cleanup.remainingNewShortcuts)
    ? cleanup.remainingNewShortcuts
    : [];
  const checks = {
    processStopped: cleanup.processStopped === true,
    uninstallerRan: cleanup.uninstallerRan === true,
    installDirRemoved: cleanup.installDirRemoved === true,
    installRootRemoved: cleanup.installRootRemoved === true,
    shortcutCleanup: cleanup.shortcutCleanup === true,
    noRemainingNewShortcuts: remainingNewShortcuts.length === 0,
  };

  for (const [name, passed] of Object.entries(checks)) {
    if (!passed) {
      failures.push(`Manual result postAcceptanceCleanup.${name} must be true.`);
    }
  }

  return {
    status: Object.values(checks).every(Boolean) ? 'passed' : 'failed',
    checks,
    remainingNewShortcuts,
  };
}

function validateOutputMp4Evidence(result, handoffDir, failures) {
  const output = result.sampleWorkflow?.outputMp4;
  if (!output || typeof output !== 'object') {
    failures.push('Manual result must include sampleWorkflow.outputMp4 evidence.');
    return { status: 'missing' };
  }

  const bytes = Number(output.bytes ?? 0);
  const durationSeconds = output.durationSeconds === null || output.durationSeconds === undefined
    ? null
    : Number(output.durationSeconds);
  const checks = {
    hasPath: isNonEmptyString(output.path),
    hasMinimumBytes: Number.isFinite(bytes) && bytes >= MINIMUM_RENDERED_OUTPUT_BYTES,
    hasSha256: isSha256(output.sha256),
    hasHandoffRelativePath: isSafeRelativePath(output.handoffRelativePath),
    handoffRelativePathMatchesExpected: output.handoffRelativePath === EXPECTED_HANDOFF_OUTPUT_MP4_NAME,
    hasPositiveDuration: Number.isFinite(durationSeconds) && durationSeconds > 0,
    hasVideo: output.hasVideo === true,
    hasAudio: output.hasAudio === true,
    hasFfprobePath: isNonEmptyString(output.ffprobePath),
    handoffFilePresent: false,
    handoffBytesMatch: false,
    handoffSha256Match: false,
  };
  const handoffOutputPath = checks.hasHandoffRelativePath
    ? path.resolve(handoffDir, output.handoffRelativePath)
    : null;
  if (handoffOutputPath) {
    const stats = statSync(handoffOutputPath, { throwIfNoEntry: false });
    checks.handoffFilePresent = Boolean(stats?.isFile());
    if (stats?.isFile()) {
      const handoffSha256 = hashFile(handoffOutputPath);
      checks.handoffBytesMatch = stats.size === bytes;
      checks.handoffSha256Match = handoffSha256 === String(output.sha256).toLowerCase();
    }
  }

  if (!checks.hasPath) {
    failures.push('Manual result must include sampleWorkflow.outputMp4.path.');
  }
  if (!checks.hasMinimumBytes) {
    failures.push(`Manual result output MP4 must be at least ${MINIMUM_RENDERED_OUTPUT_BYTES} bytes.`);
  }
  if (!checks.hasSha256) {
    failures.push('Manual result output MP4 must include a valid SHA-256 hash.');
  }
  if (!checks.hasHandoffRelativePath) {
    failures.push('Manual result output MP4 must include a safe handoff-relative MP4 path.');
  }
  if (checks.hasHandoffRelativePath && !checks.handoffRelativePathMatchesExpected) {
    failures.push(`Manual result output MP4 handoff-relative path must be ${EXPECTED_HANDOFF_OUTPUT_MP4_NAME}.`);
  }
  if (!checks.handoffFilePresent) {
    failures.push('Manual result output MP4 handoff file must exist next to the handoff evidence.');
  }
  if (checks.handoffFilePresent && !checks.handoffBytesMatch) {
    failures.push('Manual result output MP4 handoff file byte count must match the recorded output evidence.');
  }
  if (checks.handoffFilePresent && !checks.handoffSha256Match) {
    failures.push('Manual result output MP4 handoff file SHA-256 must match the recorded output evidence.');
  }
  if (!checks.hasPositiveDuration) {
    failures.push('Manual result output MP4 duration must be positive when provided.');
  }
  if (!checks.hasVideo) {
    failures.push('Manual result output MP4 must confirm a video stream.');
  }
  if (!checks.hasAudio) {
    failures.push('Manual result output MP4 must confirm an audio stream.');
  }
  if (!checks.hasFfprobePath) {
    failures.push('Manual result output MP4 must include the ffprobe path used for stream evidence.');
  }

  return {
    status: Object.values(checks).every(Boolean) ? 'passed' : 'failed',
    path: output.path ?? null,
    bytes,
    sha256: output.sha256 ?? null,
    handoffPath: handoffOutputPath ? normalizeSlash(handoffOutputPath) : null,
    handoffRelativePath: output.handoffRelativePath ?? null,
    durationSeconds,
    hasVideo: output.hasVideo ?? null,
    hasAudio: output.hasAudio ?? null,
    ffprobePath: output.ffprobePath ?? null,
    checks,
  };
}

function validateHandoffChecksums(handoffDir, handoff, failures) {
  const files = [];
  const checksumPath = path.join(handoffDir, handoff.checksumFile ?? 'SHA256SUMS.txt');
  const checksumEntries = readChecksumEntries(checksumPath, failures);
  const manifestFiles = new Map(
    [...(handoff.files ?? []), ...(handoff.handoffFiles ?? [])]
      .filter((file) => isNonEmptyString(file.target))
      .map((file) => [normalizeSlash(file.target), file]),
  );
  const checksumTargets = new Set(checksumEntries.map((entry) => normalizeSlash(entry.path)));

  for (const [target] of manifestFiles) {
    if (!checksumTargets.has(target)) {
      failures.push(`Handoff checksum file must include ${target}.`);
      files.push({ path: target, status: 'missing-checksum' });
    }
  }
  for (const target of REQUIRED_HANDOFF_CHECKSUM_TARGETS) {
    if (!checksumTargets.has(target)) {
      failures.push(`Handoff checksum file must include required handoff entry ${target}.`);
      files.push({ path: target, status: 'missing-checksum' });
    }
  }

  for (const entry of checksumEntries) {
    if (!isSafeRelativePath(entry.path)) {
      failures.push(`Handoff checksum path must stay relative: ${entry.path}`);
      files.push({ path: entry.path, status: 'unsafe-path' });
      continue;
    }
    const target = path.join(handoffDir, entry.path);
    const stats = statSync(target, { throwIfNoEntry: false });
    if (!stats?.isFile()) {
      failures.push(`Missing handoff file for manual acceptance: ${entry.path}`);
      files.push({ path: entry.path, status: 'missing' });
      continue;
    }
    const sha256 = hashFile(target);
    const bytes = stats.size;
    const manifestFile = manifestFiles.get(normalizeSlash(entry.path));
    const expectedSha256 = entry.sha256.toLowerCase();
    let passed = true;
    if (sha256 !== expectedSha256) {
      failures.push(`Handoff file SHA-256 mismatch: ${entry.path}`);
      passed = false;
    }
    if (manifestFile && manifestFile.sha256 && manifestFile.sha256.toLowerCase() !== expectedSha256) {
      failures.push(`Handoff manifest SHA-256 does not match checksum entry: ${entry.path}`);
      passed = false;
    }
    if (manifestFile && Number.isFinite(Number(manifestFile.bytes)) && bytes !== manifestFile.bytes) {
      failures.push(`Handoff file byte size mismatch: ${entry.path}`);
      passed = false;
    }
    files.push({
      path: entry.path,
      status: passed ? 'passed' : 'failed',
      bytes,
      sha256,
    });
  }
  return {
    status: files.length > 0 && files.every((file) => file.status === 'passed') ? 'passed' : 'failed',
    files,
  };
}

function readChecksumEntries(checksumPath, failures) {
  if (!existsSync(checksumPath)) {
    failures.push(`Missing handoff checksum file: ${checksumPath}`);
    return [];
  }
  const entries = [];
  const lines = readFileSync(checksumPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  for (const line of lines) {
    const match = /^([a-f0-9]{64})\s{2}(.+)$/i.exec(line);
    if (!match) {
      failures.push(`Invalid handoff checksum line: ${line}`);
      continue;
    }
    entries.push({
      sha256: match[1].toLowerCase(),
      path: match[2],
    });
  }
  return entries;
}

function readJsonIfPresent(filePath, failures, label) {
  if (!existsSync(filePath)) {
    failures.push(`Missing ${label}: ${filePath}`);
    return null;
  }
  try {
    return JSON.parse(stripJsonBom(readFileSync(filePath, 'utf8')));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`Invalid ${label} JSON: ${message}`);
    return null;
  }
}

function stripJsonBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function getByPath(value, fieldPath) {
  return fieldPath.split('.').reduce((current, segment) => current?.[segment], value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function isSafeRelativePath(value) {
  if (!isNonEmptyString(value) || value !== value.trim() || value.includes('\0')) {
    return false;
  }
  const slashPath = normalizeSlash(value);
  if (slashPath.startsWith('/') || /^[A-Za-z]:/.test(slashPath)) {
    return false;
  }
  const segments = slashPath.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    return false;
  }
  return path.posix.normalize(slashPath) === slashPath;
}

function isIsoDateLike(value) {
  return isNonEmptyString(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

function isLocalRendererUrl(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }
  const hostname = url.hostname.toLowerCase();
  return hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost');
}

function resolveResultReferencePath(referencePath, handoffDir) {
  if (path.isAbsolute(referencePath)) {
    return referencePath;
  }
  return path.resolve(handoffDir, referencePath);
}

function normalizeResolvedPath(value) {
  const normalized = normalizeSlash(path.resolve(value));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function sameResolvedPath(left, right) {
  if (!isNonEmptyString(left) || !isNonEmptyString(right)) {
    return false;
  }
  return normalizeResolvedPath(left) === normalizeResolvedPath(right);
}

function assertInsideRoot(workspaceRoot, targetPath, label) {
  const relative = path.relative(workspaceRoot, targetPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside workspace: ${targetPath}`);
  }
}

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function normalizeRelative(workspaceRoot, targetPath) {
  return normalizeSlash(path.relative(workspaceRoot, targetPath));
}

function normalizeSlash(value) {
  return value.replace(/\\/g, '/');
}

function parseCliArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--handoff-dir') {
      options.handoffDir = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--result') {
      options.resultPath = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--basic-smoke-result') {
      options.basicSmokeResultPath = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--gui-session-result') {
      options.guiSessionResultPath = readRequiredValue(argv, ++index, arg);
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
    'Usage: node scripts/electron-release-manual-acceptance.mjs [--handoff-dir <path>] [--result <path>] [--basic-smoke-result <path>] [--gui-session-result <path>] [--root-dir <path>] [--out <path>]',
    '',
    'Validates a completed fresh-Windows manual acceptance JSON plus installed basic-smoke and GUI-session evidence against the release handoff manifest and checksums.',
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
    const { report, reportPath } = validateFreshWindowsManualAcceptance(options);
    console.log(JSON.stringify({
      status: report.status,
      reportPath,
      tester: report.tester,
      checkedAt: report.checkedAt,
      checksumStatus: report.checksumEvidence.status,
      basicSmokeStatus: report.basicSmokeEvidence.status,
      guiSessionStatus: report.guiSessionEvidence.status,
      cleanupStatus: report.cleanupEvidence.status,
      failureCount: report.failures.length,
      failures: report.failures,
    }, null, 2));
    if (report.status !== 'passed') {
      console.error(`Fresh Windows manual acceptance failed with ${report.failures.length} issue(s).`);
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
