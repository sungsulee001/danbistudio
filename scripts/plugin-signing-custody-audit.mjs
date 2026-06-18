import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE_KEY_MARKER_PATTERN = /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/;
const PRIVATE_KEY_PATH_PATTERN = /(?:^|[\\/"'\s])(?:[A-Za-z]:[\\/])?[^"'\s]*\.private\.pem(?:$|[\\/"'\s])/i;
const DEFAULT_SCAN_PATHS = [
  'src',
  'scripts',
  'public/editor-preview-worker.js',
  'public/luts',
  'dist-electron',
  '.next/standalone/server.js',
  '.next/standalone/.next',
  '.danbi/electron-release',
  'release/electron',
  'electron-builder.yml',
  'package.json',
];
const SKIP_DIRECTORY_NAMES = new Set([
  '.git',
  '.next/cache',
  'node_modules',
  'third_party',
  'coverage',
  'test-results',
  'playwright-report',
]);
const BINARY_EXTENSIONS = new Set([
  '.7z',
  '.asar',
  '.bin',
  '.bmp',
  '.db',
  '.dll',
  '.exe',
  '.gif',
  '.ico',
  '.jpg',
  '.jpeg',
  '.mov',
  '.mp3',
  '.mp4',
  '.node',
  '.ogg',
  '.png',
  '.sqlite',
  '.wav',
  '.webm',
  '.zip',
]);
const MAX_TEXT_FILE_BYTES = 8 * 1024 * 1024;

function parseCliArgs(argv) {
  const options = {
    paths: [],
    failOnMissing: false,
    forbidPrivateKeyEnv: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--path') {
      options.paths.push(readRequiredValue(argv, ++index, arg));
    } else if (arg === '--fail-on-missing') {
      options.failOnMissing = true;
    } else if (arg === '--forbid-private-key-env') {
      options.forbidPrivateKeyEnv = true;
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
    'Usage: node scripts/plugin-signing-custody-audit.mjs [--path <file-or-dir>] [--fail-on-missing] [--forbid-private-key-env]',
    '',
    'Scans release-bound Danbi files for PEM private key material and private-key path leaks.',
    'Default paths intentionally exclude tests and .danbi/plugin-signing private-key storage.',
    'Use --forbid-private-key-env for production release preparation, where package signing must already be complete.',
  ].join('\n');
}

export function runPluginSigningCustodyAudit(options = {}) {
  const scanInputs = (options.paths && options.paths.length > 0 ? options.paths : DEFAULT_SCAN_PATHS)
    .map((item) => path.resolve(rootDir, item));
  const failOnMissing = Boolean(options.failOnMissing);
  const forbidPrivateKeyEnv = Boolean(options.forbidPrivateKeyEnv);
  const violations = [];
  const checkedPaths = [];
  let scannedFiles = 0;
  let skippedFiles = 0;
  let missingPaths = 0;

  const envPrivateKeyPath = process.env.DANBI_PLUGIN_SIGNING_PRIVATE_KEY_PATH;
  if (envPrivateKeyPath) {
    if (forbidPrivateKeyEnv) {
      violations.push({
        path: 'DANBI_PLUGIN_SIGNING_PRIVATE_KEY_PATH',
        type: 'forbidden-private-key-env',
        reason: 'Production release preparation must not run with plugin signing private key environment variables set.',
      });
    }
    const envViolation = validatePrivateKeyPathCustody(path.resolve(envPrivateKeyPath));
    if (envViolation) {
      violations.push(envViolation);
    }
  }

  for (const scanPath of scanInputs) {
    const stats = statSync(scanPath, { throwIfNoEntry: false });
    if (!stats) {
      missingPaths += 1;
      if (failOnMissing) {
        violations.push({
          path: toRelative(scanPath),
          type: 'missing-path',
          reason: 'Expected custody audit path is missing.',
        });
      }
      continue;
    }

    checkedPaths.push(toRelative(scanPath));
    if (stats.isDirectory()) {
      walkDirectory(scanPath, (filePath) => {
        const result = scanFile(filePath);
        scannedFiles += result.scanned ? 1 : 0;
        skippedFiles += result.skipped ? 1 : 0;
        violations.push(...result.violations);
      });
    } else if (stats.isFile()) {
      const result = scanFile(scanPath);
      scannedFiles += result.scanned ? 1 : 0;
      skippedFiles += result.skipped ? 1 : 0;
      violations.push(...result.violations);
    }
  }

  return {
    kind: 'danbi.plugin-signing.custody-audit',
    checkedAt: new Date().toISOString(),
    status: violations.length === 0 ? 'passed' : 'failed',
    checkedPaths,
    scannedFiles,
    skippedFiles,
    missingPaths,
    forbidPrivateKeyEnv,
    violations,
    warnings: [
      'Default custody audit scans release-bound source/build outputs and intentionally excludes tests plus .danbi/plugin-signing private-key storage.',
      forbidPrivateKeyEnv
        ? 'Private key environment variables are forbidden in this audit mode; sign plugin packages before production release preparation.'
        : 'Private key environment variables are allowed only for explicit package-signing workflows and still must point to approved custody paths.',
    ],
  };
}

function validatePrivateKeyPathCustody(privateKeyPath) {
  const relativePath = path.relative(rootDir, privateKeyPath).replace(/\\/g, '/');
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }
  if (relativePath.startsWith('.danbi/plugin-signing/')) {
    return null;
  }
  return {
    path: relativePath,
    type: 'unsafe-private-key-env-path',
    reason: 'DANBI_PLUGIN_SIGNING_PRIVATE_KEY_PATH inside the repository must stay under .danbi/plugin-signing/.',
  };
}

function walkDirectory(directory, onFile) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entryPath, entry.name)) {
        continue;
      }
      walkDirectory(entryPath, onFile);
    } else if (entry.isFile()) {
      onFile(entryPath);
    }
  }
}

function shouldSkipDirectory(directoryPath, name) {
  if (SKIP_DIRECTORY_NAMES.has(name)) {
    return true;
  }
  const relativePath = toRelative(directoryPath);
  return [...SKIP_DIRECTORY_NAMES].some((item) => relativePath === item || relativePath.endsWith(`/${item}`));
}

function scanFile(filePath) {
  const relativePath = toRelative(filePath);
  const extension = path.extname(filePath).toLowerCase();
  let stats;
  try {
    stats = statSync(filePath);
  } catch (error) {
    if (isMissingPathError(error)) {
      return { scanned: false, skipped: true, violations: [] };
    }
    throw error;
  }
  if (BINARY_EXTENSIONS.has(extension) || stats.size > MAX_TEXT_FILE_BYTES) {
    return { scanned: false, skipped: true, violations: [] };
  }

  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return { scanned: false, skipped: true, violations: [] };
    }
    throw error;
  }
  const violations = [];
  if (PRIVATE_KEY_MARKER_PATTERN.test(text)) {
    violations.push({
      path: relativePath,
      type: 'private-key-material',
      reason: 'File contains PEM private key material.',
    });
  }
  if (shouldFlagPrivateKeyPathLeak(relativePath) && PRIVATE_KEY_PATH_PATTERN.test(text)) {
    violations.push({
      path: relativePath,
      type: 'private-key-path',
      reason: 'File contains a .private.pem path reference.',
    });
  }
  if (/\.private\.pem$/i.test(relativePath)) {
    violations.push({
      path: relativePath,
      type: 'private-key-file',
      reason: 'Release-bound scan path contains a private key file name.',
    });
  }

  return { scanned: true, skipped: false, violations };
}

function shouldFlagPrivateKeyPathLeak(relativePath) {
  return relativePath.startsWith('.danbi/electron-release/') ||
    relativePath.startsWith('release/electron/') ||
    relativePath.startsWith('dist-electron/') ||
    relativePath.startsWith('.next/standalone/') ||
    relativePath.endsWith('manifest.json') ||
    relativePath.endsWith('package.json') ||
    relativePath.endsWith('.yml') ||
    relativePath.endsWith('.yaml');
}

function isMissingPathError(error) {
  return error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

function toRelative(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log(formatHelp());
      process.exit(0);
    }
    const report = runPluginSigningCustodyAudit(options);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'passed') {
      throw new Error(`Plugin signing custody audit failed with ${report.violations.length} violation(s).`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
