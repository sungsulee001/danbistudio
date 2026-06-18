import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

export function buildWindowsInstallerArtifactName(productName, version) {
  return `${toArtifactFileStem(productName)}-${version}-win-x64.exe`;
}

export function toArtifactFileStem(productName) {
  const normalized = String(productName ?? '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'Danbi-Studio';
}

export function cleanWindowsInstallerArtifacts(releaseDir) {
  let removed = [];
  try {
    removed = readdirSync(releaseDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isWindowsInstallerArtifact(entry.name))
      .map((entry) => entry.name);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  for (const fileName of removed) {
    rmSync(path.join(releaseDir, fileName), { force: true });
  }
  return removed.sort();
}

function isWindowsInstallerArtifact(fileName) {
  const normalized = String(fileName).toLowerCase();
  return normalized.endsWith('.exe')
    || normalized.endsWith('.exe.blockmap')
    || normalized === 'latest.yml';
}
