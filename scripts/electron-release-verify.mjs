import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { withReleaseOutputLock } from './electron-release-lock.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VALID_PROFILES = new Set(['core', 'packaged', 'full']);

export function buildElectronReleaseVerificationPlan(options = {}) {
  const profile = options.profile ?? 'full';
  if (!VALID_PROFILES.has(profile)) {
    throw new Error(`Unknown release verification profile: ${profile}`);
  }

  const production = Boolean(options.production);
  const env = production ? { DANBI_RELEASE_CHANNEL: 'production' } : {};
  const commands = [
    command('typecheck', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--pretty', 'false'], { timeoutMs: 300_000 }),
    command('unit-tests', process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--reporter=dot'], { timeoutMs: 300_000 }),
    command('git-diff-check', 'git', ['diff', '--check'], { timeoutMs: 120_000 }),
    command('eslint-clean-check', process.execPath, ['node_modules/eslint/bin/eslint.js', '.', '--max-warnings', '0'], { timeoutMs: 300_000 }),
    command('architecture-check', process.execPath, ['scripts/check-electron-boundaries.mjs'], { timeoutMs: 120_000 }),
    command('license-check', process.execPath, ['scripts/check-third-party-compliance.mjs'], { timeoutMs: 120_000 }),
    command('plugin-signing-readiness', process.execPath, ['scripts/plugin-signing-readiness.mjs'], { timeoutMs: 120_000 }),
    command('plugin-signing-production-readiness', process.execPath, ['scripts/plugin-signing-readiness.mjs', '--channel', 'production'], {
      timeoutMs: 120_000,
      required: production || profile !== 'core',
    }),
    command('plugin-signing-rotation-drill', process.execPath, ['scripts/plugin-signing-rotation-drill.mjs'], {
      timeoutMs: 120_000,
      required: profile !== 'core',
    }),
    command('plugin-signing-custody-audit', process.execPath, ['scripts/plugin-signing-custody-audit.mjs'], { timeoutMs: 120_000 }),
    command('plugin-signing-production-custody-audit', process.execPath, ['scripts/plugin-signing-custody-audit.mjs', '--forbid-private-key-env'], {
      timeoutMs: 120_000,
      required: production,
    }),
    command('electron-smoke', process.execPath, ['scripts/electron-smoke.mjs'], {
      timeoutMs: 120_000,
      required: profile !== 'core',
      requiresRendererServer: true,
      restartRendererServerAfter: true,
    }),
    command('playwright-chromium', process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--project=chromium'], {
      timeoutMs: 600_000,
      required: profile === 'full',
      requiresRendererServer: true,
    }),
    command('electron-package-smoke', process.execPath, ['scripts/electron-package-smoke.mjs'], {
      timeoutMs: 600_000,
      required: profile !== 'core',
      env,
    }),
    command('electron-gui-smoke', process.execPath, ['scripts/electron-gui-smoke.mjs', '--skip-package'], {
      timeoutMs: 300_000,
      required: profile !== 'core',
      env,
    }),
    command('electron-offline-smoke', process.execPath, ['scripts/electron-offline-smoke.mjs', '--skip-package'], {
      timeoutMs: 300_000,
      required: profile !== 'core',
      env,
    }),
    command('electron-installer-smoke', process.execPath, ['scripts/electron-installer-smoke.mjs'], {
      timeoutMs: 600_000,
      required: profile === 'full',
      env,
    }),
    command('electron-install-smoke', process.execPath, ['scripts/electron-install-smoke.mjs', '--skip-build'], {
      timeoutMs: 600_000,
      required: profile === 'full',
      env,
    }),
  ].filter((item) => item.required);

  return {
    kind: 'danbi.electron.release-verification.plan',
    profile,
    production,
    commandCount: commands.length,
    commands,
  };
}

export async function runElectronReleaseVerification(options = {}) {
  const workspaceRoot = path.resolve(options.rootDir ?? rootDir);
  const plan = buildElectronReleaseVerificationPlan(options);
  const reportPath = path.resolve(workspaceRoot, options.reportPath ?? defaultReportPath(plan, options.reportRoot, workspaceRoot));
  const startedAt = new Date();
  const results = [];
  let status = 'passed';
  const requiresManagedRendererServer = plan.commands.some((step) => step.requiresRendererServer);
  let managedRendererServer = {
    status: requiresManagedRendererServer
      ? (options.dryRun ? 'skipped-dry-run' : 'pending')
      : 'not-required',
  };

  await withReleaseOutputLock(async () => {
    let rendererServer;

    try {
      for (const step of plan.commands) {
        if (options.dryRun) {
          results.push({
            id: step.id,
            status: 'skipped',
            skippedReason: 'dry-run',
            command: step.command,
            args: step.args,
          });
          continue;
        }

        if (step.requiresRendererServer && !rendererServer) {
          try {
            rendererServer = await startManagedRendererServer({ ...options, rootDir: workspaceRoot });
            managedRendererServer = {
              status: 'started',
              port: rendererServer.port,
              url: rendererServer.url,
              pid: rendererServer.pid,
            };
          } catch (error) {
            status = 'failed';
            managedRendererServer = {
              status: 'failed',
              error: error instanceof Error ? error.message : String(error),
            };
            results.push({
              id: 'managed-renderer-server',
              status: 'failed',
              command: 'npm',
              args: ['run', 'dev'],
              durationMs: 0,
              exitCode: null,
              signal: null,
              stdoutTail: '',
              stderrTail: '',
              error: managedRendererServer.error,
            });
            break;
          }
        }

        const result = await runCommand(step, {
          rootDir: workspaceRoot,
          production: plan.production,
          continueOnFailure: Boolean(options.continueOnFailure),
          rendererEnv: step.requiresRendererServer ? rendererServer?.env : undefined,
        });
        results.push(result);
        if (result.status === 'failed') {
          status = 'failed';
          if (!options.continueOnFailure) {
            break;
          }
        }

        if (step.restartRendererServerAfter && rendererServer) {
          managedRendererServer = {
            ...managedRendererServer,
            stdoutTail: rendererServer.stdoutTail(),
            stderrTail: rendererServer.stderrTail(),
            stop: stopManagedRendererServer(rendererServer),
            restartedAfter: step.id,
          };
          rendererServer = undefined;
        }
      }
    } finally {
      if (rendererServer) {
        managedRendererServer = {
          ...managedRendererServer,
          stdoutTail: rendererServer.stdoutTail(),
          stderrTail: rendererServer.stderrTail(),
          stop: stopManagedRendererServer(rendererServer),
        };
      }
    }
  }, { label: `electron:release:verify:${plan.profile}${plan.production ? ':production' : ''}` });

  if (managedRendererServer.status === 'pending') {
    managedRendererServer = { status: 'not-started' };
  }

  const endedAt = new Date();
  const report = {
    kind: 'danbi.electron.release-verification',
    status,
    profile: plan.profile,
    production: plan.production,
    dryRun: Boolean(options.dryRun),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    commandCount: plan.commandCount,
    passedCount: results.filter((result) => result.status === 'passed').length,
    failedCount: results.filter((result) => result.status === 'failed').length,
    skippedCount: results.filter((result) => result.status === 'skipped').length,
    managedRendererServer,
    results,
  };

  writeJsonReport(reportPath, report);
  return {
    reportPath,
    report,
  };
}

function command(id, executable, args, options = {}) {
  return {
    id,
    command: executable,
    args,
    timeoutMs: options.timeoutMs ?? 120_000,
    env: options.env ?? {},
    requiresRendererServer: Boolean(options.requiresRendererServer),
    restartRendererServerAfter: Boolean(options.restartRendererServerAfter),
    required: options.required ?? true,
  };
}

function runCommand(step, options) {
  const workspaceRoot = path.resolve(options.rootDir ?? rootDir);
  const startedAt = Date.now();
  const env = {
    ...process.env,
    ...(options.production ? { DANBI_RELEASE_CHANNEL: 'production' } : {}),
    ...(options.rendererEnv ?? {}),
    ...step.env,
  };
  const stdoutBuffer = createTextTailBuffer();
  const stderrBuffer = createTextTailBuffer();

  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let spawnError;
    const child = spawn(step.command, step.args, {
      cwd: workspaceRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      windowsHide: true,
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid);
    }, step.timeoutMs);
    timeout.unref?.();

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdoutBuffer.append(text);
      process.stdout.write(text);
    });
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderrBuffer.append(text);
      process.stderr.write(text);
    });
    child.once('error', (error) => {
      spawnError = error;
    });
    child.once('close', (exitCode, signal) => {
      finish(exitCode, signal);
    });

    function finish(exitCode, signal) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);

      const durationMs = Date.now() - startedAt;
      const failed = Boolean(spawnError) || timedOut || exitCode !== 0;
      const summary = {
        id: step.id,
        status: failed ? 'failed' : 'passed',
        command: step.command,
        args: step.args,
        durationMs,
        exitCode,
        signal,
        stdoutTail: tailText(stdoutBuffer.read()),
        stderrTail: tailText(stderrBuffer.read()),
      };

      if (spawnError) {
        summary.error = spawnError.message;
      } else if (timedOut) {
        summary.error = `Command timed out after ${step.timeoutMs}ms.`;
      }
      if (failed && !options.continueOnFailure) {
        process.stderr.write(`Release verification failed at ${step.id}.\n`);
      }
      resolve(summary);
    }
  });
}

async function startManagedRendererServer(options = {}) {
  const workspaceRoot = path.resolve(options.rootDir ?? rootDir);
  const port = options.devServerPort ?? await findOpenPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const url = `${baseUrl}/editor`;
  const commandName = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm.cmd run dev -- --hostname 127.0.0.1 --port ${port}`]
    : ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(port)];
  const stdoutBuffer = createTextTailBuffer();
  const stderrBuffer = createTextTailBuffer();
  const startedAt = Date.now();
  let exitState;
  const child = spawn(commandName, args, {
    cwd: workspaceRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  });

  child.stdout?.on('data', (chunk) => stdoutBuffer.append(chunk));
  child.stderr?.on('data', (chunk) => stderrBuffer.append(chunk));
  child.once('exit', (code, signal) => {
    exitState = { code, signal };
  });

  while (Date.now() - startedAt < (options.devServerTimeoutMs ?? 120_000)) {
    if (exitState) {
      throw new Error(`Managed renderer dev server exited before it was ready: code=${exitState.code} signal=${exitState.signal}\nstdout:\n${tailText(stdoutBuffer.read())}\nstderr:\n${tailText(stderrBuffer.read())}`);
    }

    if (await canReadHttp(url)) {
      return {
        child,
        pid: child.pid,
        port,
        url,
        stdoutTail: () => tailText(stdoutBuffer.read()),
        stderrTail: () => tailText(stderrBuffer.read()),
        env: {
          DANBI_STUDIO_URL: url,
          PLAYWRIGHT_PORT: String(port),
          PLAYWRIGHT_SKIP_WEBSERVER: '1',
        },
      };
    }

    await delay(500);
  }

  const stop = stopManagedRendererServer({ child });
  throw new Error(`Timed out waiting for managed renderer dev server at ${url}; stop=${stop.status}\nstdout:\n${tailText(stdoutBuffer.read())}\nstderr:\n${tailText(stderrBuffer.read())}`);
}

function stopManagedRendererServer(server) {
  const pid = server.child?.pid;
  if (!pid) {
    return { status: 'not-started' };
  }

  if (server.child.exitCode !== null || server.child.signalCode !== null) {
    return {
      status: 'already-exited',
      exitCode: server.child.exitCode,
      signal: server.child.signalCode,
    };
  }

  if (process.platform === 'win32') {
    const result = spawnSync('taskkill.exe', ['/pid', String(pid), '/T', '/F'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    return {
      status: result.status === 0 ? 'stopped' : 'stop-failed',
      exitCode: result.status,
      signal: result.signal,
      stdoutTail: tailText(result.stdout ?? ''),
      stderrTail: tailText(result.stderr ?? ''),
    };
  }

  try {
    process.kill(-pid, 'SIGTERM');
    return { status: 'stopped' };
  } catch (error) {
    return {
      status: 'stop-failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function findOpenPort() {
  for (let port = 3100; port < 4100; port += 1) {
    if (await canBindPort(port)) {
      return port;
    }
  }

  return findSystemOpenPort();
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

function findSystemOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('Could not allocate a local renderer dev server port.'));
        }
      });
    });
  });
}

function canReadHttp(url) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: 5_000 }, (response) => {
      response.resume();
      resolve((response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 500);
    });
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function killProcessTree(pid) {
  if (!pid) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(pid), '/T', '/F'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Best-effort timeout cleanup; the command result records the timeout.
  }
}

function createTextTailBuffer(maxLength = 40_000) {
  let text = '';

  return {
    append(chunk) {
      text += chunk.toString();
      if (text.length > maxLength) {
        text = text.slice(-maxLength);
      }
    },
    read() {
      return text;
    },
  };
}

function tailText(text) {
  const normalized = text.trim();
  if (!normalized) {
    return '';
  }
  return normalized.split(/\r?\n/).slice(-20).join('\n');
}

function writeJsonReport(reportPath, report) {
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function defaultReportPath(plan, reportRoot, workspaceRoot = rootDir) {
  const suffix = plan.production ? '-production' : '';
  return path.join(path.resolve(workspaceRoot, reportRoot ?? path.join('.danbi', 'electron-release')), `release-verification-${plan.profile}${suffix}.json`);
}

function parseCliArgs(argv) {
  const options = {
    profile: 'full',
    production: false,
    dryRun: false,
    continueOnFailure: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') {
      options.profile = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--production') {
      options.production = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--continue-on-failure') {
      options.continueOnFailure = true;
    } else if (arg === '--root-dir') {
      options.rootDir = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--report') {
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
    'Usage: node scripts/electron-release-verify.mjs [--profile core|packaged|full] [--production] [--dry-run] [--continue-on-failure] [--root-dir <path>] [--report <path>]',
    '',
    'Runs the release verification command set and writes a JSON report under .danbi/electron-release by default.',
    'Profiles:',
    '  core      TypeScript, unit tests, warning-free ESLint, architecture/license checks, plugin signing readiness/custody.',
    '  packaged  Core checks plus Electron/package GUI/offline smoke coverage.',
    '  full      Packaged checks plus Chromium e2e, installer artifact smoke, and installed-app smoke.',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log(formatHelp());
      process.exit(0);
    }
    const { reportPath, report } = await runElectronReleaseVerification(options);
    const workspaceRoot = path.resolve(options.rootDir ?? rootDir);
    console.log(JSON.stringify({
      status: report.status,
      profile: report.profile,
      production: report.production,
      reportPath: path.relative(workspaceRoot, reportPath).replace(/\\/g, '/'),
      passedCount: report.passedCount,
      failedCount: report.failedCount,
      skippedCount: report.skippedCount,
      durationMs: report.durationMs,
      failureCount: report.results.filter((result) => result.status === 'failed').length,
      failures: report.results
        .filter((result) => result.status === 'failed')
        .map((result) => `${result.id}: ${result.error ?? `exit ${result.exitCode ?? 'unknown'}`}`),
    }, null, 2));
    if (report.status !== 'passed') {
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({
      status: 'failed',
      failureCount: 1,
      failures: [message],
    }, null, 2));
    console.error(message);
    process.exit(1);
  }
}
