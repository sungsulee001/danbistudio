import { rmSync } from 'node:fs';
import path from 'node:path';

export const STALE_NEXT_BUILD_ARTIFACTS = [
  path.join('.next', 'dev'),
  path.join('.next', 'types'),
  path.join('.next', 'diagnostics'),
];

export function cleanStaleNextBuildArtifacts(workspaceRoot, artifacts = STALE_NEXT_BUILD_ARTIFACTS) {
  const root = path.resolve(workspaceRoot);
  const removed = [];

  for (const artifact of artifacts) {
    const target = path.resolve(root, artifact);
    assertInsideRoot(root, target, artifact);
    rmSync(target, { recursive: true, force: true });
    removed.push(normalizeSlash(path.relative(root, target)));
  }

  return {
    kind: 'danbi.electron.release-stale-next-build-cleanup',
    status: 'passed',
    removed,
  };
}

export function parsePrepareElectronReleaseArgs(argv) {
  const options = {
    help: false,
    skipNextBuild: false,
  };

  for (const arg of argv) {
    if (arg === '--skip-next-build') {
      options.skipNextBuild = true;
    } else if (arg === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export function formatPrepareElectronReleaseHelp() {
  return [
    'Usage: node scripts/prepare-electron-release.mjs [--skip-next-build] [--help]',
    '',
    'Prepares the packaged Electron release inputs, standalone renderer assets, sample project pack, plugin signing readiness, and release manifest.',
    '',
    'Options:',
    '  --skip-next-build  Reuse the existing .next standalone build and only refresh Electron release assets.',
    '  --help             Show this help message.',
  ].join('\n');
}

function assertInsideRoot(root, target, label) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean stale Next artifact outside workspace: ${label}`);
  }
}

function normalizeSlash(value) {
  return value.replace(/\\/g, '/');
}
