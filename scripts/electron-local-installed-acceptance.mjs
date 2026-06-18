import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWindowsInstallerArtifactName } from './electron-release-artifacts.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRootDir = path.resolve(path.dirname(scriptPath), '..');
const DEFAULT_SMOKE_REPORT = path.join('.danbi', 'electron-install-smoke', 'result.json');
const DEFAULT_ACCEPTANCE_REPORT = path.join('.danbi', 'electron-release', 'local-installed-acceptance.json');

export function buildElectronLocalInstalledAcceptance(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? defaultRootDir);
  if (options.runSmoke) {
    run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'electron:install-smoke'], { cwd: rootDir, timeout: 420_000 });
  }

  const packageJson = readJson(path.join(rootDir, 'package.json'));
  const productName = packageJson.build?.productName ?? 'Danbi Studio';
  const version = packageJson.version;
  const expectedInstallerName = buildWindowsInstallerArtifactName(productName, version);
  const installerPath = path.join(rootDir, 'release', 'electron', expectedInstallerName);
  const smokeReportPath = path.resolve(rootDir, options.smokeReportPath ?? DEFAULT_SMOKE_REPORT);
  const reportPath = normalizeReportPath(rootDir, options.out ?? DEFAULT_ACCEPTANCE_REPORT);
  const failures = [];

  const installerEvidence = inspectRequiredFile(rootDir, installerPath, 'installer', failures, 10_000_000);
  const smokeReportEvidence = inspectRequiredFile(rootDir, smokeReportPath, 'installed-app smoke report', failures, 20);
  const smokeReport = smokeReportEvidence.status === 'present' ? readJson(smokeReportPath, failures) : null;
  const renderOutputPath = smokeReport?.mp4Render?.outputPath
    ? path.resolve(rootDir, smokeReport.mp4Render.outputPath)
    : null;
  const renderOutputEvidence = renderOutputPath
    ? inspectRequiredFile(rootDir, renderOutputPath, 'installed-app MP4 render output', failures, 10_000)
    : { status: 'missing', path: null };

  validateSmokeReport(rootDir, smokeReport, failures);

  const report = {
    kind: 'danbi.electron.local-installed-app-acceptance',
    status: failures.length === 0 ? 'passed' : 'failed',
    generatedAt: new Date().toISOString(),
    productName,
    version,
    expectedInstallerName,
    evidence: {
      installer: installerEvidence,
      installSmoke: {
        path: normalizeSlash(path.relative(rootDir, smokeReportPath)),
        status: smokeReport?.status === 'passed' ? 'passed' : 'failed',
      },
      install: smokeReport?.install ?? null,
      launch: smokeReport?.launch ?? null,
      sampleProject: smokeReport?.sampleProject ?? null,
      mediaImport: smokeReport?.mediaImport ?? null,
      exportPreflight: smokeReport?.exportPreflight ?? null,
      mp4Render: {
        ...(smokeReport?.mp4Render ?? {}),
        output: renderOutputEvidence,
      },
      storage: smokeReport?.storage ?? null,
      externalReleaseGates: {
        freshWindowsQaEvidence: 'EXTERNAL_PENDING',
        returnedEvidenceZip: 'EXTERNAL_PENDING',
        externalManualResultJson: 'EXTERNAL_PENDING',
        finalReleaseApproval: 'EXTERNAL_PENDING',
      },
    },
    failures,
  };

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return {
    report,
    reportPath: normalizeSlash(path.relative(rootDir, reportPath)),
  };
}

function validateSmokeReport(rootDir, smokeReport, failures) {
  if (!smokeReport) {
    return;
  }

  requirePassed(smokeReport.status, 'Installed-app smoke status', failures);
  requirePassed(smokeReport.install?.status, 'Installation', failures);
  requirePassed(smokeReport.launch?.status, 'Installed app launch', failures);
  requirePassed(smokeReport.sampleProject?.status, 'Sample project load', failures);
  requirePassed(smokeReport.sampleProject?.mediaPathCheck?.status, 'Sample project renderPath filesystem check', failures);
  requirePassed(smokeReport.mediaImport?.status, 'Media import', failures);
  requirePassed(smokeReport.exportPreflight?.status, 'Sample export preflight', failures);
  requirePassed(smokeReport.mp4Render?.status, 'MP4 render', failures);
  requirePassed(smokeReport.mp4Render?.ffprobe?.status, 'MP4 ffprobe', failures);
  requirePassed(smokeReport.storage?.status, 'Installed app storage check', failures);
  requirePassed(smokeReport.storage?.runtimePathCheck?.status, 'userData runtime path check', failures);
  requirePassed(smokeReport.storage?.installWriteCheck?.status, 'Program Files/install directory write check', failures);

  if (smokeReport.mediaImport?.importedInsideUserData !== true) {
    failures.push('Imported media was not recorded inside Electron userData.');
  }
  validateSampleMediaPathCheck(rootDir, smokeReport.sampleProject?.mediaPathCheck, failures);
  if (Array.isArray(smokeReport.storage?.installWriteCheck?.violations) && smokeReport.storage.installWriteCheck.violations.length > 0) {
    failures.push(`Install directory storage write violations: ${smokeReport.storage.installWriteCheck.violations.join(', ')}`);
  }
}

function validateSampleMediaPathCheck(rootDir, mediaPathCheck, failures) {
  const files = Array.isArray(mediaPathCheck?.files) ? mediaPathCheck.files : [];
  if (files.length === 0) {
    failures.push('Sample project renderPath filesystem evidence is missing.');
    return;
  }

  for (const file of files) {
    const filesystemPath = typeof file?.filesystemPath === 'string' && file.filesystemPath.trim()
      ? file.filesystemPath
      : typeof mediaPathCheck?.packageDirectory === 'string' && typeof file?.packagePath === 'string'
        ? path.join(mediaPathCheck.packageDirectory, file.packagePath)
        : undefined;
    if (!filesystemPath) {
      failures.push(`Sample project renderPath filesystem evidence is incomplete for ${file?.assetId ?? 'unknown asset'}.`);
      continue;
    }
    if (existsSync(filesystemPath)) {
      inspectRequiredFile(rootDir, path.resolve(filesystemPath), `sample project render media ${file?.assetId ?? filesystemPath}`, failures, 44);
      continue;
    }
    if (typeof file?.bytes !== 'number' || file.bytes < 44) {
      failures.push(`Sample project renderPath filesystem evidence is missing for ${file?.assetId ?? filesystemPath}.`);
    }
  }
}

function requirePassed(value, label, failures) {
  if (value !== 'passed') {
    failures.push(`${label} did not pass.`);
  }
}

function inspectRequiredFile(rootDir, filePath, label, failures, minimumBytes = 1) {
  const relativePath = normalizeSlash(path.relative(rootDir, filePath));
  if (!existsSync(filePath)) {
    failures.push(`Missing required ${label}: ${relativePath}`);
    return {
      path: relativePath,
      status: 'missing',
    };
  }

  const stats = statSync(filePath);
  if (!stats.isFile() || stats.size < minimumBytes) {
    failures.push(`Required ${label} is unexpectedly small: ${relativePath} (${stats.size} bytes)`);
    return {
      path: relativePath,
      status: 'invalid',
      bytes: stats.size,
    };
  }

  return {
    path: relativePath,
    status: 'present',
    bytes: stats.size,
  };
}

function readJson(filePath, failures = []) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    failures.push(`Could not read JSON ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function normalizeReportPath(rootDir, value) {
  const requested = path.resolve(rootDir, value);
  const relativePath = path.relative(rootDir, requested);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Local installed-app acceptance report must stay inside the workspace: ${value}`);
  }
  return requested;
}

function normalizeSlash(value) {
  return value.replace(/\\/g, '/');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    timeout: options.timeout,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${result.status}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root-dir') {
      options.rootDir = argv[++index];
    } else if (arg === '--smoke-report') {
      options.smokeReportPath = argv[++index];
    } else if (arg === '--out') {
      options.out = argv[++index];
    } else if (arg === '--run-smoke') {
      options.runSmoke = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

if (path.resolve(process.argv[1] ?? '') === scriptPath) {
  try {
    const { report, reportPath } = buildElectronLocalInstalledAcceptance(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify({
      status: report.status,
      reportPath,
      installer: report.evidence.installer.path,
      smokeStatus: report.evidence.installSmoke.status,
      importStatus: report.evidence.mediaImport?.status ?? 'missing',
      preflightStatus: report.evidence.exportPreflight?.status ?? 'missing',
      mp4RenderStatus: report.evidence.mp4Render?.status ?? 'missing',
      storageStatus: report.evidence.storage?.status ?? 'missing',
      externalReleaseGates: report.evidence.externalReleaseGates,
      failureCount: report.failures.length,
      failures: report.failures,
    }, null, 2));
    if (report.status !== 'passed') {
      process.exitCode = 1;
    }
  } catch (error) {
    console.log(JSON.stringify({
      status: 'failed',
      reportPath: null,
      failureCount: 1,
      failures: [error instanceof Error ? error.message : String(error)],
    }, null, 2));
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
