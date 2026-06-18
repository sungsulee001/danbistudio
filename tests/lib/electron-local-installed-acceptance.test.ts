import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildElectronLocalInstalledAcceptance,
} from '../../scripts/electron-local-installed-acceptance.mjs';

const tempRoots: string[] = [];

describe('Electron local installed-app acceptance audit', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
  });

  it('accepts installed-app smoke evidence without approving the Fresh Windows final gate', async () => {
    const rootDir = await makeFixtureRoot();

    const { report, reportPath } = buildElectronLocalInstalledAcceptance({ rootDir });

    expect(report.status).toBe('passed');
    expect(reportPath).toBe('.danbi/electron-release/local-installed-acceptance.json');
    expect(report.evidence.installer).toMatchObject({
      path: 'release/electron/Danbi-Studio-0.1.0-win-x64.exe',
      status: 'present',
    });
    expect(report.evidence.mediaImport).toMatchObject({
      status: 'passed',
      importedInsideUserData: true,
    });
    expect(report.evidence.exportPreflight).toMatchObject({ status: 'passed' });
    expect(report.evidence.sampleProject).toMatchObject({
      mediaPathCheck: {
        status: 'passed',
        renderMediaCount: 1,
      },
    });
    expect(report.evidence.mp4Render).toMatchObject({
      status: 'passed',
      ffprobe: { status: 'passed' },
      output: { status: 'present' },
    });
    expect(report.evidence.storage).toMatchObject({
      status: 'passed',
      runtimePathCheck: { status: 'passed' },
      installWriteCheck: {
        status: 'passed',
        violations: [],
      },
    });
    expect(report.evidence.externalReleaseGates).toEqual({
      freshWindowsQaEvidence: 'EXTERNAL_PENDING',
      returnedEvidenceZip: 'EXTERNAL_PENDING',
      externalManualResultJson: 'EXTERNAL_PENDING',
      finalReleaseApproval: 'EXTERNAL_PENDING',
    });

    const written = JSON.parse(await readFile(join(rootDir, reportPath), 'utf8'));
    expect(written.status).toBe('passed');
  });

  it('fails when imported media evidence is outside Electron userData', async () => {
    const rootDir = await makeFixtureRoot({
      importedInsideUserData: false,
    });

    const { report } = buildElectronLocalInstalledAcceptance({
      rootDir,
      out: '.danbi/electron-release/local-installed-failed.json',
    });

    expect(report.status).toBe('failed');
    expect(report.failures).toContain('Imported media was not recorded inside Electron userData.');
    expect(report.evidence.externalReleaseGates.finalReleaseApproval).toBe('EXTERNAL_PENDING');
  });
});

async function makeFixtureRoot(options: { importedInsideUserData?: boolean } = {}): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'danbi-local-installed-acceptance-'));
  tempRoots.push(rootDir);

  await writeJson(join(rootDir, 'package.json'), {
    name: 'danbistudio',
    version: '0.1.0',
    build: {
      productName: 'Danbi Studio',
    },
  });
  await writeFixtureFile(join(rootDir, 'release', 'electron', 'Danbi-Studio-0.1.0-win-x64.exe'), Buffer.alloc(10_000_001, 1));
  await writeFixtureFile(join(rootDir, '.danbi', 'electron-install-smoke', 'renders', 'getting-started-installed-render.mp4'), Buffer.alloc(10_001, 2));
  await writeFixtureFile(join(rootDir, '.danbi', 'electron-install-smoke', 'app', 'resources', 'samples', 'getting-started', 'media', 'asset-sample-intro', 'render-danbi-sample-intro.mp4'), Buffer.alloc(10_001, 3));
  await writeJson(join(rootDir, '.danbi', 'electron-install-smoke', 'result.json'), buildSmokeReport(rootDir, options));

  return rootDir;
}

function buildSmokeReport(rootDir: string, options: { importedInsideUserData?: boolean }) {
  const userDataPath = join(rootDir, '.danbi', 'electron-install-smoke', 'user-data');
  const outputPath = join(rootDir, '.danbi', 'electron-install-smoke', 'renders', 'getting-started-installed-render.mp4');

  return {
    kind: 'danbi.electron.installed-app-smoke',
    status: 'passed',
    install: {
      status: 'passed',
      installDir: join(rootDir, '.danbi', 'electron-install-smoke', 'app'),
      installedExe: join(rootDir, '.danbi', 'electron-install-smoke', 'app', 'Danbi Studio.exe'),
    },
    launch: {
      status: 'passed',
      userDataPath,
    },
    sampleProject: {
      status: 'passed',
      packagePath: join(rootDir, '.danbi', 'electron-install-smoke', 'app', 'resources', 'samples', 'getting-started'),
      mediaPathCheck: {
        status: 'passed',
        packageDirectory: join(rootDir, '.danbi', 'electron-install-smoke', 'app', 'resources', 'samples', 'getting-started'),
        renderMediaCount: 1,
        files: [
          {
            assetId: 'asset-sample-intro',
            assetName: 'Generated intro pattern',
            packagePath: 'media/asset-sample-intro/render-danbi-sample-intro.mp4',
            filesystemPath: join(rootDir, '.danbi', 'electron-install-smoke', 'app', 'resources', 'samples', 'getting-started', 'media', 'asset-sample-intro', 'render-danbi-sample-intro.mp4'),
            bytes: 10001,
          },
        ],
      },
    },
    mediaImport: {
      status: 'passed',
      importedPath: join(userDataPath, 'imports', '1800000000000-0-local-installed-import.wav'),
      importedInsideUserData: options.importedInsideUserData ?? true,
    },
    exportPreflight: {
      status: 'passed',
    },
    mp4Render: {
      status: 'passed',
      outputPath,
      ffprobe: {
        status: 'passed',
        format: 'mov,mp4,m4a,3gp,3g2,mj2',
        videoStreams: 1,
        audioStreams: 1,
      },
    },
    storage: {
      status: 'passed',
      runtimePathCheck: {
        status: 'passed',
        checkedRoot: userDataPath,
      },
      installWriteCheck: {
        status: 'passed',
        violations: [],
      },
    },
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFixtureFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeFixtureFile(filePath: string, value: string | Buffer): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
}
