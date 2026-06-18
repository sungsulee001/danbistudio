import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mirrorRoot = path.join(rootDir, 'third_party', 'source-mirrors');
const lockPath = path.join(rootDir, 'third_party', 'source-mirrors.lock.json');
const dryRun = process.argv.includes('--dry-run');

function readLock() {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (!Array.isArray(lock.mirrors)) {
    throw new Error('third_party/source-mirrors.lock.json must contain a mirrors array.');
  }
  return lock.mirrors;
}

function normalizeRemoteUrl(remoteUrl) {
  return remoteUrl.trim().replace(/\/$/, '');
}

function resolveMirrorPath(localPath) {
  const absolutePath = path.resolve(rootDir, localPath);
  const relativeToMirrorRoot = path.relative(mirrorRoot, absolutePath);
  if (
    relativeToMirrorRoot === '' ||
    relativeToMirrorRoot.startsWith('..') ||
    path.isAbsolute(relativeToMirrorRoot)
  ) {
    throw new Error(`Mirror path must stay under third_party/source-mirrors: ${localPath}`);
  }
  return absolutePath;
}

function run(command, args, options = {}) {
  if (dryRun) {
    console.log(`[dry-run] ${command} ${args.join(' ')}`);
    return { stdout: '', stderr: '', status: 0 };
  }

  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }

  return result;
}

function git(args, cwd) {
  return run('git', args, { cwd });
}

function requireGit() {
  run('git', ['--version']);
}

function verifyLicenseTerms(mirror, mirrorPath) {
  const licensePath = path.join(mirrorPath, mirror.licenseFile);
  if (!existsSync(licensePath)) {
    throw new Error(`${mirror.name} is missing license file ${mirror.licenseFile}.`);
  }

  const licenseText = readFileSync(licensePath, 'utf8');
  for (const term of mirror.requiredLicenseTerms ?? []) {
    if (!licenseText.includes(term)) {
      throw new Error(`${mirror.name} license file is missing required term: ${term}`);
    }
  }
}

function ensureMirror(mirror) {
  const mirrorPath = resolveMirrorPath(mirror.localPath);
  const expectedRemote = normalizeRemoteUrl(mirror.remoteUrl);

  if (!existsSync(mirrorPath)) {
    mkdirSync(path.dirname(mirrorPath), { recursive: true });
    console.log(`Cloning ${mirror.name} into ${mirror.localPath}`);
    git(['clone', '--filter=blob:none', '--no-checkout', mirror.remoteUrl, mirrorPath], rootDir);
  } else {
    const gitDir = path.join(mirrorPath, '.git');
    if (!existsSync(gitDir)) {
      throw new Error(`${mirror.localPath} exists but is not a Git mirror clone.`);
    }

    const actualRemote = normalizeRemoteUrl(git(['remote', 'get-url', 'origin'], mirrorPath).stdout);
    if (actualRemote !== expectedRemote) {
      throw new Error(`${mirror.name} origin mismatch. Expected ${expectedRemote}, got ${actualRemote}.`);
    }
  }

  console.log(`Fetching ${mirror.name}`);
  git(['fetch', '--tags', '--prune', 'origin'], mirrorPath);
  git(['checkout', '--detach', mirror.auditCommit], mirrorPath);

  const actualHead = git(['rev-parse', 'HEAD'], mirrorPath).stdout.trim();
  if (actualHead !== mirror.auditCommit) {
    throw new Error(`${mirror.name} commit mismatch. Expected ${mirror.auditCommit}, got ${actualHead}.`);
  }

  verifyLicenseTerms(mirror, mirrorPath);
  console.log(`${mirror.name}: pinned at ${actualHead}`);
}

function main() {
  requireGit();
  mkdirSync(mirrorRoot, { recursive: true });

  for (const mirror of readLock()) {
    ensureMirror(mirror);
  }

  console.log('Source mirrors are synchronized to third_party/source-mirrors.lock.json.');
  console.log('Run npm run license:check before using any mirrored source.');
}

main();
