import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPluginSigningReadiness,
  buildPluginSigningReadiness,
} from './plugin-signing-readiness.mjs';
import { runPluginSigningCustodyAudit } from './plugin-signing-custody-audit.mjs';
import { pruneNextStandaloneReleaseArtifacts } from './prune-next-standalone-release.mjs';
import { withReleaseOutputLock } from './electron-release-lock.mjs';
import {
  cleanStaleNextBuildArtifacts,
  formatPrepareElectronReleaseHelp,
  parsePrepareElectronReleaseArgs,
} from './prepare-electron-release-helpers.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standaloneDir = path.join(rootDir, '.next', 'standalone');
const standaloneServer = path.join(standaloneDir, 'server.js');
const standaloneStaticDir = path.join(standaloneDir, '.next', 'static');
const standalonePublicDir = path.join(standaloneDir, 'public');
const standaloneWorkflowsDir = path.join(standaloneDir, 'workflows');
const releaseManifest = path.join(rootDir, '.danbi', 'electron-release', 'manifest.json');
const releaseSamplesDir = path.join(rootDir, '.danbi', 'electron-release', 'samples');
const sampleProjectPackDir = path.join(releaseSamplesDir, 'getting-started');
const sampleProjectWorkDir = path.join(rootDir, '.danbi', 'electron-release', 'sample-work');
const appIcon = path.join(rootDir, 'build', 'icon.ico');
const sourceWorkflowsDir = path.join(rootDir, 'workflows');
const requiredWorkflowFiles = [
  'broll_i2v.json',
  'broll_reference_i2v.json',
];
const staleElectronReleaseDir = path.join(rootDir, 'release', 'electron');
const pluginSigningReadiness = buildPluginSigningReadiness({
  channel: process.env.DANBI_RELEASE_CHANNEL ?? 'development',
});
let pluginSigningCustodyAudit = null;
let standalonePrune = null;
let staleNextBuildCleanup = null;

try {
  const cliOptions = parsePrepareElectronReleaseArgs(process.argv.slice(2));
  if (cliOptions.help) {
    console.log(formatPrepareElectronReleaseHelp());
    process.exit(0);
  }

  await withReleaseOutputLock(() => {
    cleanStaleElectronReleaseOutput();
    staleNextBuildCleanup = cleanStaleNextBuildArtifacts(rootDir);
    if (!cliOptions.skipNextBuild) {
      run(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack']);
    }
    run(process.execPath, ['scripts/generate-app-icon.mjs']);
    run(process.execPath, ['scripts/build-electron.mjs']);
    assertPluginSigningReadiness(pluginSigningReadiness);
    run(process.execPath, [
      'scripts/sample-project-pack.mjs',
      '--out',
      sampleProjectPackDir,
      '--work',
      sampleProjectWorkDir,
    ]);

    assertFile(standaloneServer, 'Next standalone server is missing. next.config.mjs must keep output: "standalone".');
    assertFile(appIcon, 'Danbi Studio app icon is missing. scripts/generate-app-icon.mjs must create build/icon.ico.');
    assertFile(path.join(sampleProjectPackDir, 'project.danbi-project.json'), 'Sample project package is missing.');
    assertFile(path.join(sampleProjectPackDir, 'tutorial.md'), 'Sample project tutorial is missing.');
    standalonePrune = pruneNextStandaloneReleaseArtifacts({ standaloneDir });
    if (standalonePrune.status !== 'passed') {
      throw new Error(`Next standalone release prune failed with ${standalonePrune.privateKeyTraceEntries.length} private key trace leak(s).`);
    }
    copyNextStatic();
    copyReleasePublicAssets();
    copyReleaseWorkflows();
    writeReleaseManifest();
    pluginSigningCustodyAudit = runPluginSigningCustodyAudit({
      forbidPrivateKeyEnv: pluginSigningReadiness.channel === 'production',
    });
    if (pluginSigningCustodyAudit.status !== 'passed') {
      throw new Error(`Plugin signing custody audit failed with ${pluginSigningCustodyAudit.violations.length} violation(s).`);
    }
    writeReleaseManifest();

    console.log('Electron release preparation passed.');
  }, { label: 'electron:release:prepare' });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify({
    kind: 'danbi.electron.release-prepare',
    status: 'failed',
    failureCount: 1,
    failures: [message],
  }, null, 2));
  console.error(message);
  process.exit(1);
}

function copyNextStatic() {
  const source = path.join(rootDir, '.next', 'static');
  assertDirectory(source, 'Next static assets are missing. Run npm run build first.');
  rmSync(standaloneStaticDir, { recursive: true, force: true });
  mkdirSync(path.dirname(standaloneStaticDir), { recursive: true });
  cpSync(source, standaloneStaticDir, { recursive: true });
}

function copyReleaseWorkflows() {
  assertDirectory(sourceWorkflowsDir, 'ComfyUI workflow directory is missing.');
  rmSync(standaloneWorkflowsDir, { recursive: true, force: true });
  mkdirSync(standaloneWorkflowsDir, { recursive: true });
  cpSync(sourceWorkflowsDir, standaloneWorkflowsDir, { recursive: true });
  for (const workflowFile of requiredWorkflowFiles) {
    assertFile(path.join(standaloneWorkflowsDir, workflowFile), `Required ComfyUI workflow is missing from the standalone renderer: ${workflowFile}`);
  }
}

function cleanStaleElectronReleaseOutput() {
  rmSync(staleElectronReleaseDir, { recursive: true, force: true });
}

function copyReleasePublicAssets() {
  rmSync(standalonePublicDir, { recursive: true, force: true });
  mkdirSync(standalonePublicDir, { recursive: true });

  copyIfExists(path.join(rootDir, 'public', 'editor-preview-worker.js'), path.join(standalonePublicDir, 'editor-preview-worker.js'));
  copyIfExists(path.join(rootDir, 'public', 'luts'), path.join(standalonePublicDir, 'luts'));

  for (const runtimeDir of ['cache', 'imports', 'outputs', 'temp']) {
    mkdirSync(path.join(standalonePublicDir, runtimeDir), { recursive: true });
  }
}

function writeReleaseManifest() {
  mkdirSync(path.dirname(releaseManifest), { recursive: true });
  writeFileSync(releaseManifest, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    electronMain: toRelative(path.join(rootDir, 'dist-electron', 'main', 'electron-app.cjs')),
    electronPreload: toRelative(path.join(rootDir, 'dist-electron', 'preload', 'electron-preload.cjs')),
    nextStandaloneServer: toRelative(standaloneServer),
    nextStatic: toRelative(standaloneStaticDir),
    publicAssets: toRelative(standalonePublicDir),
    workflows: toRelative(standaloneWorkflowsDir),
    sampleProjectPack: toRelative(sampleProjectPackDir),
    appIcon: toRelative(appIcon),
    ...(staleNextBuildCleanup ? { staleNextBuildCleanup } : {}),
    ...(standalonePrune ? { standalonePrune } : {}),
    pluginSigning: {
      ...pluginSigningReadiness,
      sourcePath: toRelative(pluginSigningReadiness.sourcePath),
    },
    ...(pluginSigningCustodyAudit ? { pluginSigningCustodyAudit } : {}),
  }, null, 2)}\n`);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${result.status}.`);
  }
}

function copyIfExists(source, target) {
  if (!existsSync(source)) {
    return;
  }

  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

function assertFile(filePath, message) {
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (!stats?.isFile()) {
    throw new Error(message);
  }
}

function assertDirectory(filePath, message) {
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (!stats?.isDirectory()) {
    throw new Error(message);
  }
}

function toRelative(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}
