import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BLOCKED_STANDALONE_PATHS = [
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

export function pruneNextStandaloneReleaseArtifacts(options = {}) {
  const workspaceRoot = path.resolve(options.rootDir ?? DEFAULT_ROOT_DIR);
  const standaloneDir = resolveWorkspacePath(
    workspaceRoot,
    options.standaloneDir ?? path.join(workspaceRoot, '.next', 'standalone'),
  );
  const blockedPaths = (options.blockedPaths ?? DEFAULT_BLOCKED_STANDALONE_PATHS)
    .map((item) => normalizeRelativePath(item))
    .filter(Boolean);
  const removedDirectories = [];
  const removedFiles = [];
  let sanitizedPackageJson = false;
  let sanitizedServerConfig = false;

  for (const blockedPath of blockedPaths) {
    const target = path.join(standaloneDir, blockedPath);
    const stats = statSync(target, { throwIfNoEntry: false });
    if (!stats) {
      continue;
    }
    rmSync(target, { recursive: true, force: true });
    if (stats.isDirectory()) {
      removedDirectories.push(blockedPath);
    } else {
      removedFiles.push(blockedPath);
    }
  }

  const traceFiles = existsSync(standaloneDir)
    ? findFiles(standaloneDir, (filePath) => filePath.endsWith('.nft.json'))
    : [];
  const rewrittenTraceFiles = [];
  let removedTraceEntryCount = 0;
  const privateKeyTraceEntries = [];

  for (const traceFile of traceFiles) {
    const trace = JSON.parse(readFileSync(traceFile, 'utf8'));
    if (!Array.isArray(trace.files)) {
      continue;
    }

    const traceDir = path.dirname(traceFile);
    const keptFiles = [];
    const removedFromTrace = [];

    for (const entry of trace.files) {
      if (typeof entry !== 'string') {
        keptFiles.push(entry);
        continue;
      }

      if (shouldPruneTraceEntry(entry, traceDir, standaloneDir, workspaceRoot, blockedPaths)) {
        removedFromTrace.push(entry);
      } else {
        keptFiles.push(entry);
      }
    }

    if (removedFromTrace.length > 0) {
      trace.files = keptFiles;
      writeFileSync(traceFile, JSON.stringify(trace));
      const relativeTraceFile = normalizeRelativePath(path.relative(workspaceRoot, traceFile));
      rewrittenTraceFiles.push(relativeTraceFile);
      removedTraceEntryCount += removedFromTrace.length;
    }

    for (const entry of trace.files) {
      if (typeof entry === 'string' && /\.private\.pem(?:$|[\\/])/i.test(entry)) {
        privateKeyTraceEntries.push({
          traceFile: normalizeRelativePath(path.relative(workspaceRoot, traceFile)),
          entry,
        });
      }
    }
  }

  sanitizedPackageJson = sanitizeStandalonePackageJson(path.join(standaloneDir, 'package.json'));
  sanitizedServerConfig = sanitizeStandaloneServerConfig(path.join(standaloneDir, 'server.js'));

  return {
    kind: 'danbi.next-standalone.release-prune',
    standaloneDir: normalizeRelativePath(path.relative(workspaceRoot, standaloneDir)),
    blockedPaths,
    removedDirectories,
    removedFiles,
    sanitizedPackageJson,
    sanitizedServerConfig,
    rewrittenTraceFiles,
    removedTraceEntryCount,
    privateKeyTraceEntries,
    status: privateKeyTraceEntries.length === 0 ? 'passed' : 'failed',
  };
}

function findFiles(directory, predicate) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...findFiles(entryPath, predicate));
    } else if (entry.isFile() && predicate(entryPath)) {
      files.push(entryPath);
    }
  }
  return files;
}

function sanitizeStandalonePackageJson(packageJsonPath) {
  const stats = statSync(packageJsonPath, { throwIfNoEntry: false });
  if (!stats?.isFile()) {
    return false;
  }

  const originalText = readFileSync(packageJsonPath, 'utf8');
  const source = JSON.parse(originalText);
  const sanitized = {
    name: source.name,
    version: source.version,
    private: source.private ?? true,
    author: source.author,
    license: source.license,
    description: source.description,
    main: 'server.js',
    scripts: {
      start: 'node server.js',
    },
    dependencies: source.dependencies ?? {},
    ...(source.overrides ? { overrides: source.overrides } : {}),
  };
  const nextText = `${JSON.stringify(sanitized, null, 2)}\n`;
  if (nextText === originalText) {
    return false;
  }
  writeFileSync(packageJsonPath, nextText, 'utf8');
  return true;
}

function sanitizeStandaloneServerConfig(serverPath) {
  const stats = statSync(serverPath, { throwIfNoEntry: false });
  if (!stats?.isFile()) {
    return false;
  }

  const originalText = readFileSync(serverPath, 'utf8');
  const nextText = originalText
    .replace(/"outputFileTracingRoot":"[^"]*"/g, '"outputFileTracingRoot":"."')
    .replace(/"turbopack":\{"root":"[^"]*"\}/g, '"turbopack":{"root":"."}');
  if (nextText === originalText) {
    return false;
  }
  writeFileSync(serverPath, nextText, 'utf8');
  return true;
}

function isBlockedReleasePath(relativePath, blockedPaths) {
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return false;
  }
  return blockedPaths.some((blockedPath) => (
    relativePath === blockedPath || relativePath.startsWith(`${blockedPath}/`)
  ));
}

function shouldPruneTraceEntry(entry, traceDir, standaloneDir, workspaceRoot, blockedPaths) {
  const normalizedEntry = stripParentSegments(normalizeRelativePath(entry));
  if (isBlockedReleasePath(normalizedEntry, blockedPaths)) {
    return true;
  }

  const resolvedEntryPath = path.resolve(traceDir, entry);
  const relativeToStandalone = normalizeRelativePath(path.relative(standaloneDir, resolvedEntryPath));
  if (isBlockedReleasePath(relativeToStandalone, blockedPaths)) {
    return true;
  }

  const relativeToRoot = normalizeRelativePath(path.relative(workspaceRoot, resolvedEntryPath));
  return isBlockedReleasePath(relativeToRoot, blockedPaths);
}

function resolveWorkspacePath(workspaceRoot, inputPath) {
  return path.resolve(workspaceRoot, inputPath);
}

function stripParentSegments(filePath) {
  return filePath.replace(/^(?:\.\.\/)+/, '');
}

function normalizeRelativePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function parseCliArgs(argv) {
  const options = {
    rootDir: DEFAULT_ROOT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--standalone-dir') {
      options.standaloneDir = readRequiredValue(argv, ++index, arg);
    } else if (arg === '--root-dir') {
      options.rootDir = path.resolve(readRequiredValue(argv, ++index, arg));
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
    'Usage: node scripts/prune-next-standalone-release.mjs [--root-dir <path>] [--standalone-dir <path>]',
    '',
    'Removes development-only files from Next standalone release output and prunes matching .nft.json trace entries.',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log(formatHelp());
      process.exit(0);
    }
    const summary = pruneNextStandaloneReleaseArtifacts(options);
    console.log(JSON.stringify(summary, null, 2));
    if (summary.status !== 'passed') {
      throw new Error(`Next standalone release prune failed with ${summary.privateKeyTraceEntries.length} private key trace leak(s).`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
