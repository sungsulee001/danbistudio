import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWindowsInstallerArtifactName } from './electron-release-artifacts.mjs';

const scriptRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const REQUIRED_RENDER_OUTPUTS = [
  '.danbi/electron-package-smoke/sample-render/getting-started.mp4',
  '.danbi/electron-gui-smoke/renders/getting-started-ui-render.mp4',
  '.danbi/electron-offline-smoke/renders/getting-started-offline-render.mp4',
  '.danbi/electron-install-smoke/renders/getting-started-installed-render.mp4',
];

const BLOCKED_STANDALONE_PATHS = [
  '.env',
  '.git',
  '.logs',
  '.next/cache',
  '.next/dev',
  '.next/diagnostics',
  '.next/types',
  '.next-dev.err.log',
  '.next-dev.out.log',
  '.danbi',
  'coverage',
  'dev-server.combined.log',
  'dev-server.err.log',
  'dev-server.out.log',
  'dist-electron',
  'electron-builder.yml',
  'next-env.d.ts',
  'package-lock.json',
  'plan-template.md',
  'playwright-report',
  'release',
  'scripts',
  'src',
  'test-results',
  'tests',
  'third_party',
];

export function buildElectronReleaseAcceptance(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? scriptRootDir);
  const packageJson = readJson(path.join(rootDir, 'package.json'));
  const productName = packageJson.build?.productName ?? 'Danbi Studio';
  const version = packageJson.version;
  const expectedInstallerName = buildWindowsInstallerArtifactName(productName, version);
  const verificationReportPath = path.resolve(
    rootDir,
    options.verificationReportPath ?? path.join('.danbi', 'electron-release', 'release-verification-full.json'),
  );
  const acceptanceReportPath = path.resolve(
    rootDir,
    options.acceptanceReportPath ?? path.join('.danbi', 'electron-release', 'release-acceptance.json'),
  );

  const failures = [];
  const warnings = [];
  const verificationEvidence = checkVerificationReport(verificationReportPath, failures);
  const installerEvidence = checkFileEvidence(rootDir, path.join('release', 'electron', expectedInstallerName), 10_000_000, failures);
  const evidence = {
    verification: verificationEvidence,
    installer: installerEvidence,
    installerBlockmap: checkFileEvidence(rootDir, path.join('release', 'electron', `${expectedInstallerName}.blockmap`), 1_000, failures),
    latestYml: checkLatestYml(
      rootDir,
      path.join('release', 'electron', 'latest.yml'),
      version,
      expectedInstallerName,
      installerEvidence.bytes,
      verificationEvidence.endedAt,
      failures,
    ),
    unpackedExe: checkFileEvidence(rootDir, path.join('release', 'electron', 'win-unpacked', `${productName}.exe`), 10_000_000, failures),
    sampleProject: checkFileEvidence(
      rootDir,
      path.join('release', 'electron', 'win-unpacked', 'resources', 'samples', 'getting-started', 'project.danbi-project.json'),
      1_000,
      failures,
    ),
    sampleTutorial: checkFileEvidence(
      rootDir,
      path.join('release', 'electron', 'win-unpacked', 'resources', 'samples', 'getting-started', 'tutorial.md'),
      500,
      failures,
    ),
    standalone: checkStandaloneRuntime(rootDir, path.join('release', 'electron', 'win-unpacked', 'resources', 'renderer', 'standalone'), failures),
    releaseManifest: checkReleaseManifest(rootDir, failures),
    renderOutputs: REQUIRED_RENDER_OUTPUTS.map((relativePath) => checkRenderOutput(rootDir, relativePath, failures, {
      runFfprobe: options.runFfprobe !== false,
    })),
    compliance: options.runCompliance === false ? { status: 'skipped' } : runComplianceCheck(rootDir, failures),
  };

  const report = {
    kind: 'danbi.electron.release-acceptance',
    generatedAt: new Date().toISOString(),
    status: failures.length === 0 ? 'passed' : 'failed',
    productName,
    version,
    expectedInstallerName,
    evidence,
    warnings,
    failures,
  };

  if (options.writeReport !== false) {
    mkdirSync(path.dirname(acceptanceReportPath), { recursive: true });
    writeFileSync(acceptanceReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  return {
    report,
    reportPath: normalizeRelative(rootDir, acceptanceReportPath),
  };
}

function checkVerificationReport(reportPath, failures) {
  if (!existsSync(reportPath)) {
    failures.push(`Missing full release verification report: ${reportPath}`);
    return { status: 'missing', path: reportPath };
  }

  const report = readJson(reportPath);
  const resultIds = new Set((report.results ?? []).map((result) => result.id));
  const missingGateIds = REQUIRED_FULL_GATE_IDS.filter((id) => !resultIds.has(id));
  const failedGateIds = (report.results ?? [])
    .filter((result) => result.status !== 'passed')
    .map((result) => result.id);

  if (report.status !== 'passed') {
    failures.push(`Full release verification report did not pass: ${report.status}`);
  }
  if (report.profile !== 'full' || report.dryRun !== false) {
    failures.push('Full release verification report must be a non-dry-run full profile report.');
  }
  if (missingGateIds.length > 0) {
    failures.push(`Full release verification report is missing required gate(s): ${missingGateIds.join(', ')}`);
  }
  if (failedGateIds.length > 0) {
    failures.push(`Full release verification report has non-passing gate(s): ${failedGateIds.join(', ')}`);
  }

  return {
    status: report.status,
    profile: report.profile,
    production: report.production,
    dryRun: report.dryRun,
    startedAt: report.startedAt,
    endedAt: report.endedAt,
    durationMs: report.durationMs,
    commandCount: report.commandCount,
    passedCount: report.passedCount,
    failedCount: report.failedCount,
    skippedCount: report.skippedCount,
    requiredGateCount: REQUIRED_FULL_GATE_IDS.length,
    missingGateIds,
    failedGateIds,
    path: normalizeRelative(path.dirname(path.dirname(path.dirname(reportPath))), reportPath),
  };
}

function checkStandaloneRuntime(rootDir, relativeRoot, failures) {
  const standaloneRoot = path.join(rootDir, relativeRoot);
  if (!existsSync(standaloneRoot)) {
    failures.push(`Missing packaged standalone renderer: ${relativeRoot}`);
    return { status: 'missing', root: normalizeSlash(relativeRoot) };
  }

  const leakedPaths = BLOCKED_STANDALONE_PATHS
    .filter((blockedPath) => existsSync(path.join(standaloneRoot, blockedPath)))
    .map(normalizeSlash);
  if (leakedPaths.length > 0) {
    failures.push(`Development-only standalone artifact(s) leaked into package: ${leakedPaths.join(', ')}`);
  }

  const packageJsonPath = path.join(standaloneRoot, 'package.json');
  const serverPath = path.join(standaloneRoot, 'server.js');
  const defaultWorkflowPath = path.join(standaloneRoot, 'workflows', 'broll_i2v.json');
  const referenceWorkflowPath = path.join(standaloneRoot, 'workflows', 'broll_reference_i2v.json');
  const packageJson = existsSync(packageJsonPath) ? readJson(packageJsonPath) : null;
  if (!packageJson) {
    failures.push(`Missing standalone runtime package.json: ${normalizeRelative(rootDir, packageJsonPath)}`);
  } else {
    if (packageJson.main !== 'server.js') {
      failures.push('Standalone package.json must use server.js as main.');
    }
    if (JSON.stringify(packageJson.scripts ?? {}) !== JSON.stringify({ start: 'node server.js' })) {
      failures.push('Standalone package.json must expose only the runtime start script.');
    }
    if (packageJson.devDependencies) {
      failures.push('Standalone package.json must not include devDependencies.');
    }
  }

  const serverBundle = existsSync(serverPath) ? readFileSync(serverPath, 'utf8') : '';
  if (!serverBundle) {
    failures.push(`Missing standalone server.js: ${normalizeRelative(rootDir, serverPath)}`);
  }
  const defaultWorkflowPresent = existsSync(defaultWorkflowPath);
  if (!defaultWorkflowPresent) {
    failures.push(`Missing packaged default ComfyUI workflow: ${normalizeRelative(rootDir, defaultWorkflowPath)}`);
  }
  const referenceWorkflowPresent = existsSync(referenceWorkflowPath);
  if (!referenceWorkflowPresent) {
    failures.push(`Missing packaged reference-image ComfyUI workflow: ${normalizeRelative(rootDir, referenceWorkflowPath)}`);
  }
  const buildRootMarkers = [
    rootDir,
    rootDir.replace(/\\/g, '\\\\'),
    rootDir.replace(/\\/g, '/'),
  ].filter(Boolean);
  const leakedBuildRootMarkers = buildRootMarkers.filter((marker) => serverBundle.includes(marker));
  if (leakedBuildRootMarkers.length > 0) {
    failures.push(`Standalone server.js leaked build-root marker(s): ${leakedBuildRootMarkers.join(', ')}`);
  }

  return {
    status: leakedPaths.length === 0 && packageJson && serverBundle && defaultWorkflowPresent && referenceWorkflowPresent && leakedBuildRootMarkers.length === 0 ? 'passed' : 'failed',
    root: normalizeSlash(relativeRoot),
    leakedPaths,
    packageMain: packageJson?.main ?? null,
    packageScripts: packageJson?.scripts ?? null,
    hasDevDependencies: Boolean(packageJson?.devDependencies),
    defaultWorkflowPresent,
    referenceWorkflowPresent,
    buildRootLeakCount: leakedBuildRootMarkers.length,
  };
}

function checkReleaseManifest(rootDir, failures) {
  const manifestPath = path.join(rootDir, '.danbi', 'electron-release', 'manifest.json');
  if (!existsSync(manifestPath)) {
    failures.push('Missing release manifest: .danbi/electron-release/manifest.json');
    return { status: 'missing' };
  }

  const manifest = readJson(manifestPath);
  if (manifest.standalonePrune?.status !== 'passed') {
    failures.push('Release manifest standalonePrune status must be passed.');
  }
  if (manifest.pluginSigning?.productionReady !== true) {
    failures.push('Release manifest plugin signing readiness must be productionReady.');
  }
  if (manifest.pluginSigningCustodyAudit?.status !== 'passed') {
    failures.push('Release manifest plugin signing custody audit must be passed.');
  }

  return {
    status: manifest.standalonePrune?.status === 'passed' &&
      manifest.pluginSigning?.productionReady === true &&
      manifest.pluginSigningCustodyAudit?.status === 'passed'
      ? 'passed'
      : 'failed',
    generatedAt: manifest.generatedAt,
    standalonePruneStatus: manifest.standalonePrune?.status ?? null,
    removedTraceEntryCount: manifest.standalonePrune?.removedTraceEntryCount ?? null,
    sanitizedPackageJson: Boolean(manifest.standalonePrune?.sanitizedPackageJson),
    sanitizedServerConfig: Boolean(manifest.standalonePrune?.sanitizedServerConfig),
    pluginSigningProductionReady: Boolean(manifest.pluginSigning?.productionReady),
    custodyStatus: manifest.pluginSigningCustodyAudit?.status ?? null,
  };
}

function checkRenderOutput(rootDir, relativePath, failures, options) {
  const fileEvidence = checkFileEvidence(rootDir, relativePath, 10_000, failures);
  if (fileEvidence.status !== 'present') {
    return {
      ...fileEvidence,
      ffprobe: { status: 'skipped' },
    };
  }

  const ffprobe = options.runFfprobe ? probeMedia(fileEvidence.absolutePath, failures) : { status: 'skipped' };
  return {
    ...withoutAbsolutePath(fileEvidence),
    ffprobe,
  };
}

function checkFileEvidence(rootDir, relativePath, minimumBytes, failures) {
  const absolutePath = path.join(rootDir, relativePath);
  const normalizedPath = normalizeSlash(relativePath);
  const stats = statSync(absolutePath, { throwIfNoEntry: false });
  if (!stats?.isFile()) {
    failures.push(`Missing required release file: ${normalizedPath}`);
    return { status: 'missing', path: normalizedPath, absolutePath };
  }
  if (stats.size < minimumBytes) {
    failures.push(`Release file is too small: ${normalizedPath} (${stats.size} bytes, expected >= ${minimumBytes})`);
  }
  return {
    status: stats.size >= minimumBytes ? 'present' : 'too-small',
    path: normalizedPath,
    absolutePath,
    bytes: stats.size,
    sha256: hashFile(absolutePath),
  };
}

function checkLatestYml(rootDir, relativePath, version, expectedInstallerName, installerBytes, fullVerificationEndedAt, failures) {
  const fileEvidence = checkFileEvidence(rootDir, relativePath, 1, failures);
  if (fileEvidence.status === 'missing') {
    return withoutAbsolutePath(fileEvidence);
  }
  const text = readFileSync(fileEvidence.absolutePath, 'utf8');
  const hasVersion = text.includes(`version: ${version}`);
  const installerReferencePattern = new RegExp(`(?:url|path):\\s*["']?${escapeRegExp(expectedInstallerName)}["']?\\s*$`, 'im');
  const hasInstallerReference = installerReferencePattern.test(text);
  const canCheckInstallerSize = Number.isFinite(installerBytes);
  const hasInstallerSize = canCheckInstallerSize && text.includes(`size: ${installerBytes}`);
  const releaseDate = readLatestYmlReleaseDate(text);
  const releaseDateMs = parseIsoMillis(releaseDate);
  const verificationEndedMs = parseIsoMillis(fullVerificationEndedAt);
  let releaseDateFreshnessStatus = 'passed';
  if (!hasVersion) {
    failures.push(`${normalizeSlash(relativePath)} must record release version ${version}.`);
  }
  if (!hasInstallerReference) {
    failures.push(`${normalizeSlash(relativePath)} must reference installer ${expectedInstallerName}.`);
  }
  if (canCheckInstallerSize && !hasInstallerSize) {
    failures.push(`${normalizeSlash(relativePath)} must record installer size ${installerBytes}.`);
  }
  if (!releaseDate) {
    releaseDateFreshnessStatus = 'missing';
    failures.push(`${normalizeSlash(relativePath)} must record releaseDate.`);
  } else if (releaseDateMs === null) {
    releaseDateFreshnessStatus = 'invalid';
    failures.push(`${normalizeSlash(relativePath)} releaseDate must be an ISO-like timestamp.`);
  } else if (verificationEndedMs === null) {
    releaseDateFreshnessStatus = 'unknown';
    failures.push('Full release verification endedAt must be present to compare latest.yml releaseDate.');
  } else if (releaseDateMs > verificationEndedMs) {
    releaseDateFreshnessStatus = 'stale-verification';
    failures.push(`${normalizeSlash(relativePath)} releaseDate is newer than the full release verification report; rerun full release verification after packaging.`);
  }
  return {
    ...withoutAbsolutePath(fileEvidence),
    hasVersion,
    expectedInstallerName,
    hasInstallerReference,
    hasInstallerSize,
    installerSizeCheckStatus: canCheckInstallerSize ? (hasInstallerSize ? 'passed' : 'failed') : 'skipped',
    releaseDate,
    fullVerificationEndedAt,
    releaseDateFreshnessStatus,
  };
}

function probeMedia(filePath, failures) {
  const result = spawnSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height',
    '-of',
    'json',
    filePath,
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error || result.status !== 0) {
    failures.push(`ffprobe failed for ${filePath}: ${result.error?.message ?? result.stderr}`);
    return {
      status: 'failed',
      error: result.error?.message ?? result.stderr,
    };
  }

  const media = JSON.parse(result.stdout);
  const durationSeconds = Number(media.format?.duration ?? 0);
  const videoStreams = (media.streams ?? []).filter((stream) => stream.codec_type === 'video');
  const audioStreams = (media.streams ?? []).filter((stream) => stream.codec_type === 'audio');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    failures.push(`Rendered media has no positive duration: ${filePath}`);
  }
  if (videoStreams.length === 0) {
    failures.push(`Rendered media has no video stream: ${filePath}`);
  }

  return {
    status: durationSeconds > 0 && videoStreams.length > 0 ? 'passed' : 'failed',
    durationSeconds,
    videoStreams: videoStreams.map((stream) => ({
      codecName: stream.codec_name,
      width: stream.width,
      height: stream.height,
    })),
    audioStreams: audioStreams.map((stream) => ({
      codecName: stream.codec_name,
    })),
  };
}

function runComplianceCheck(rootDir, failures) {
  const result = spawnSync(process.execPath, ['scripts/check-third-party-compliance.mjs'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    failures.push(`Third-party compliance check failed during release acceptance: ${result.error?.message ?? result.stderr}`);
  }
  return {
    status: result.status === 0 ? 'passed' : 'failed',
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr),
  };
}

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function withoutAbsolutePath(evidence) {
  const { absolutePath: _absolutePath, ...publicEvidence } = evidence;
  return publicEvidence;
}

function normalizeRelative(rootDir, filePath) {
  return normalizeSlash(path.relative(rootDir, filePath));
}

function normalizeSlash(filePath) {
  return filePath.replace(/\\/g, '/');
}

function tail(text, maxLength = 2_000) {
  if (!text) {
    return '';
  }
  return text.length > maxLength ? text.slice(-maxLength) : text;
}

function readLatestYmlReleaseDate(text) {
  const match = /^releaseDate:\s*['"]?(.+?)['"]?\s*$/m.exec(text);
  return match?.[1]?.trim() ?? null;
}

function parseIsoMillis(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCliArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--verification-report') {
      options.verificationReportPath = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--root-dir') {
      options.rootDir = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--out') {
      options.acceptanceReportPath = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--skip-compliance') {
      options.runCompliance = false;
    } else if (arg === '--skip-ffprobe') {
      options.runFfprobe = false;
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
    'Usage: node scripts/electron-release-acceptance.mjs [--verification-report <path>] [--root-dir <path>] [--out <path>] [--skip-compliance] [--skip-ffprobe]',
    '',
    'Validates the latest full release verification report against installer, sample render, standalone, and license-boundary artifacts.',
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
    const { report, reportPath } = buildElectronReleaseAcceptance(options);
    console.log(JSON.stringify({
      status: report.status,
      reportPath,
      installer: report.evidence.installer.path,
      installerBytes: report.evidence.installer.bytes,
      renderOutputCount: report.evidence.renderOutputs.length,
      verificationPassedCount: report.evidence.verification.passedCount,
      failureCount: report.failures.length,
      failures: report.failures,
    }, null, 2));
    if (report.status !== 'passed') {
      console.error(`Electron release acceptance failed with ${report.failures.length} issue(s).`);
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({
      status: 'failed',
      reportPath: typeof options.acceptanceReportPath === 'string' ? normalizeSlash(options.acceptanceReportPath) : null,
      failureCount: 1,
      failures: [message],
    }, null, 2));
    console.error(message);
    process.exit(1);
  }
}
