import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireReleaseOutputLock } from './electron-release-lock.mjs';
import { buildWindowsInstallerArtifactName, cleanWindowsInstallerArtifacts } from './electron-release-artifacts.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(rootDir, 'release', 'electron');
const packageJson = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const productName = 'Danbi Studio';
const version = packageJson.version;
const expectedInstallerName = buildWindowsInstallerArtifactName(productName, version);
const installerPath = path.join(releaseDir, expectedInstallerName);
const installerBlockmapPath = `${installerPath}.blockmap`;
const unpackedRoot = path.join(releaseDir, 'win-unpacked');
const unpackedExe = path.join(unpackedRoot, 'Danbi Studio.exe');
const unpackedStandaloneRoot = path.join(unpackedRoot, 'resources', 'renderer', 'standalone');
const unpackedNextPackage = path.join(unpackedStandaloneRoot, 'node_modules', 'next', 'package.json');
const unpackedSampleDir = path.join(unpackedRoot, 'resources', 'samples', 'getting-started');
const releaseOutputLock = await acquireReleaseOutputLock({ label: 'electron:installer-smoke' });

run(process.execPath, ['scripts/prepare-electron-release.mjs'], { timeout: 300_000 });
cleanWindowsInstallerArtifacts(releaseDir);
const packageBuild = run(process.execPath, ['node_modules/electron-builder/out/cli/cli.js', '--win', '--x64'], {
  timeout: 360_000,
});
assertNoPackagingMetadataWarnings(packageBuild);

assertFile(installerPath, 10_000_000);
assertFile(installerBlockmapPath, 1_000);
assertNoUnexpectedTopLevelInstallers();
assertFile(unpackedExe, 10_000_000);
assertFile(unpackedNextPackage, 1_000);
assertFile(path.join(unpackedSampleDir, 'project.danbi-project.json'), 1_000);
assertFile(path.join(unpackedSampleDir, 'tutorial.md'), 500);
assertNoDevelopmentStandaloneArtifacts(unpackedStandaloneRoot);
assertStandaloneReleaseMetadata(unpackedStandaloneRoot);

const custodyAudit = run(process.execPath, ['scripts/plugin-signing-custody-audit.mjs'], { timeout: 120_000 });
const custodySummary = JSON.parse(custodyAudit.stdout);
if (custodySummary.status !== 'passed' || custodySummary.violations?.length > 0) {
  throw new Error(`Installer release custody audit failed: ${custodyAudit.stdout}`);
}

console.log(JSON.stringify({
  status: 'passed',
  installer: path.relative(rootDir, installerPath).replace(/\\/g, '/'),
  installerBytes: statSync(installerPath).size,
  blockmap: path.relative(rootDir, installerBlockmapPath).replace(/\\/g, '/'),
  blockmapBytes: statSync(installerBlockmapPath).size,
  unpackedExe: path.relative(rootDir, unpackedExe).replace(/\\/g, '/'),
  sampleProject: path.relative(rootDir, path.join(unpackedSampleDir, 'project.danbi-project.json')).replace(/\\/g, '/'),
  custodyStatus: custodySummary.status,
}, null, 2));
releaseOutputLock.release();

function assertNoUnexpectedTopLevelInstallers() {
  const installers = readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
    .map((entry) => entry.name);
  if (installers.length !== 1 || installers[0] !== expectedInstallerName) {
    throw new Error(`Unexpected installer artifacts: ${installers.join(', ') || '(none)'}`);
  }
}

function assertNoPackagingMetadataWarnings(result) {
  const output = `${result.stdout}\n${result.stderr}`;
  const blockedWarnings = [
    /author is missed/i,
    /default Electron icon is used/i,
    /application icon is not set/i,
  ];

  for (const warning of blockedWarnings) {
    if (warning.test(output)) {
      throw new Error(`Electron installer metadata warning regressed: ${warning}`);
    }
  }
}

function assertNoDevelopmentStandaloneArtifacts(standaloneRoot) {
  const blockedPaths = [
    '.env',
    '.git',
    '.logs',
    path.join('.next', 'cache'),
    path.join('.next', 'dev'),
    path.join('.next', 'diagnostics'),
    path.join('.next', 'types'),
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

  for (const blockedPath of blockedPaths) {
    const target = path.join(standaloneRoot, blockedPath);
    if (existsSync(target)) {
      throw new Error(`Development-only standalone artifact leaked into installer package: ${path.relative(rootDir, target)}`);
    }
  }
}

function assertStandaloneReleaseMetadata(standaloneRoot) {
  const packageJsonPath = path.join(standaloneRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (packageJson.main !== 'server.js') {
    throw new Error(`Standalone package main must be server.js: ${path.relative(rootDir, packageJsonPath)}`);
  }
  if (packageJson.devDependencies) {
    throw new Error(`Standalone package.json must not include devDependencies: ${path.relative(rootDir, packageJsonPath)}`);
  }
  if (JSON.stringify(packageJson.scripts ?? {}) !== JSON.stringify({ start: 'node server.js' })) {
    throw new Error(`Standalone package.json must only expose the runtime start script: ${path.relative(rootDir, packageJsonPath)}`);
  }
  const serverBundle = readFileSync(path.join(standaloneRoot, 'server.js'), 'utf8');
  const buildRootMarkers = [
    rootDir,
    rootDir.replace(/\\/g, '\\\\'),
    rootDir.replace(/\\/g, '/'),
  ];
  for (const marker of buildRootMarkers) {
    if (marker && serverBundle.includes(marker)) {
      throw new Error(`Standalone server.js leaked build root marker ${marker}: ${path.relative(rootDir, standaloneRoot)}`);
    }
  }
}

function assertFile(filePath, minimumBytes) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing installer release file: ${path.relative(rootDir, filePath)}`);
  }

  const stats = statSync(filePath);
  if (!stats.isFile() || stats.size < minimumBytes) {
    throw new Error(`Installer release file is unexpectedly small: ${path.relative(rootDir, filePath)} (${stats.size} bytes)`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
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

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}
