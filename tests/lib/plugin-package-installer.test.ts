import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createEditorIpcHandlers } from '../../src/electron/main/ipc-handlers';
import {
  DEFAULT_PLUGIN_PACKAGE_MANIFEST_FILE_NAME,
  PLUGIN_PACKAGE_KIND,
  PLUGIN_PACKAGE_VERSION,
  installEditorPluginPackageFolder,
} from '../../src/electron/main/plugin-package-installer';
import { EDITOR_IPC_CHANNELS } from '../../src/electron/shared/ipc-contract';
import { validateProjectJson } from '../../src/electron/shared/project-schema';
import {
  buildPluginManifestSignatureFingerprint,
  verifyPluginManifestSignature,
} from '../../src/lib/editor/plugin-signature';
import { createDefaultEditorProject } from '../../src/lib/editor/project';
import type { EditorPluginManifest, EditorProject } from '../../src/lib/editor/types';

const PACKAGE_PLUGIN_ROOT = 'plugins/external-package-auditor';
const PACKAGE_INDEX_CONTENT = 'module.exports = { name: "External Package Auditor" };\n';
const PACKAGE_WRITER_CONTENT = '@echo off\nnode writer.js %*\n';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('plugin package installer', () => {
  it('installs and updates a verified local plugin package folder', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-package-'));

    try {
      const packageDirectory = join(tempRoot, 'package');
      const installRootDirectory = join(tempRoot, 'installed');
      const project = createDefaultEditorProject();
      const plugin = buildSignedPackagePlugin('0.1.0');
      await writePluginPackageFixture(packageDirectory, plugin);

      const installed = await installEditorPluginPackageFolder({
        project,
        packageDirectory,
        installRootDirectory,
        installedAt: '2026-06-16T00:00:00.000Z',
        mode: 'install',
      });

      expect(installed).toMatchObject({
        status: 'installed',
        pluginId: plugin.id,
        pluginVersion: '0.1.0',
        signature: {
          status: 'verified',
          trustLevel: 'fingerprint-only',
        },
      });
      expect(installed.warnings).toEqual([
        'Plugin package manifest has only a fingerprint signature; trusted-signer provenance is not available.',
      ]);
      expect(installed.copiedFiles).toHaveLength(2);
      expect(validateProjectJson(installed.project).ok).toBe(true);
      expect(installed.project.plugins.some((candidate) => candidate.id === plugin.id)).toBe(true);
      expect(await readFile(join(installRootDirectory, PACKAGE_PLUGIN_ROOT, 'writer.cmd'), 'utf8')).toBe(PACKAGE_WRITER_CONTENT);

      const updatedPlugin = buildSignedPackagePlugin('0.2.0');
      await writePluginPackageFixture(packageDirectory, updatedPlugin, {
        indexContent: 'module.exports = { name: "External Package Auditor", version: "0.2.0" };\n',
      });
      const updated = await installEditorPluginPackageFolder({
        project: installed.project,
        packageDirectory,
        installRootDirectory,
        installedAt: '2026-06-16T00:01:00.000Z',
        mode: 'update',
      });

      expect(updated.status).toBe('updated');
      expect(updated.project.plugins.find((candidate) => candidate.id === plugin.id)?.version).toBe('0.2.0');
      expect(await readFile(join(installRootDirectory, PACKAGE_PLUGIN_ROOT, 'index.js'), 'utf8')).toContain('0.2.0');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks tampered package files before copying them to the install root', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-package-tampered-'));

    try {
      const packageDirectory = join(tempRoot, 'package');
      const installRootDirectory = join(tempRoot, 'installed');
      const plugin = buildSignedPackagePlugin('0.1.0');
      await writePluginPackageFixture(packageDirectory, plugin, {
        writerSha256: `sha256-${'0'.repeat(64)}`,
      });

      await expect(installEditorPluginPackageFolder({
        project: createDefaultEditorProject(),
        packageDirectory,
        installRootDirectory,
        mode: 'install',
      })).rejects.toThrow('sha256');

      await expect(readFile(join(installRootDirectory, PACKAGE_PLUGIN_ROOT, 'writer.cmd'), 'utf8')).rejects.toThrow();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects case-colliding package file paths before staging install files', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-package-case-collision-'));

    try {
      const packageDirectory = join(tempRoot, 'package');
      const installRootDirectory = join(tempRoot, 'installed');
      const plugin = buildSignedPackagePlugin('0.1.0');
      const manifestPath = join(packageDirectory, DEFAULT_PLUGIN_PACKAGE_MANIFEST_FILE_NAME);
      await writePluginPackageFixture(packageDirectory, plugin);
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        files: Array<{ path: string; sha256: string; bytes: number }>;
      };
      manifest.files.push({
        ...manifest.files[0],
        path: `${PACKAGE_PLUGIN_ROOT}/INDEX.js`,
      });
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      await expect(installEditorPluginPackageFolder({
        project: createDefaultEditorProject(),
        packageDirectory,
        installRootDirectory,
        mode: 'install',
      })).rejects.toThrow('case-collides');

      await expect(readFile(join(installRootDirectory, PACKAGE_PLUGIN_ROOT, 'index.js'), 'utf8')).rejects.toThrow();
      expect(await listPluginPackageStageDirectories(installRootDirectory)).toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('refuses fresh install target collisions before promoting staged package files', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-package-collision-'));

    try {
      const packageDirectory = join(tempRoot, 'package');
      const installRootDirectory = join(tempRoot, 'installed');
      const plugin = buildSignedPackagePlugin('0.1.0');
      const existingIndexPath = join(installRootDirectory, PACKAGE_PLUGIN_ROOT, 'index.js');

      await writePluginPackageFixture(packageDirectory, plugin);
      await mkdir(dirname(existingIndexPath), { recursive: true });
      await writeFile(existingIndexPath, 'existing local plugin file\n', 'utf8');

      await expect(installEditorPluginPackageFolder({
        project: createDefaultEditorProject(),
        packageDirectory,
        installRootDirectory,
        mode: 'install',
      })).rejects.toThrow('already exists');

      expect(await readFile(existingIndexPath, 'utf8')).toBe('existing local plugin file\n');
      await expect(readFile(join(installRootDirectory, PACKAGE_PLUGIN_ROOT, 'writer.cmd'), 'utf8')).rejects.toThrow();
      expect(await listPluginPackageStageDirectories(installRootDirectory)).toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('preflights update targets before replacing any installed plugin files', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-package-preflight-'));

    try {
      const packageDirectory = join(tempRoot, 'package');
      const installRootDirectory = join(tempRoot, 'installed');
      const project = createDefaultEditorProject();
      const plugin = buildSignedPackagePlugin('0.1.0');

      await writePluginPackageFixture(packageDirectory, plugin);
      const installed = await installEditorPluginPackageFolder({
        project,
        packageDirectory,
        installRootDirectory,
        mode: 'install',
      });

      const updatedPlugin = buildSignedPackagePlugin('0.2.0');
      await writePluginPackageFixture(packageDirectory, updatedPlugin, {
        indexContent: 'module.exports = { name: "External Package Auditor", version: "0.2.0" };\n',
      });

      const writerTargetPath = join(installRootDirectory, PACKAGE_PLUGIN_ROOT, 'writer.cmd');
      await rm(writerTargetPath, { force: true });
      await mkdir(writerTargetPath);

      await expect(installEditorPluginPackageFolder({
        project: installed.project,
        packageDirectory,
        installRootDirectory,
        mode: 'update',
      })).rejects.toThrow('not a regular file');

      expect(await readFile(join(installRootDirectory, PACKAGE_PLUGIN_ROOT, 'index.js'), 'utf8')).toBe(PACKAGE_INDEX_CONTENT);
      expect(await listPluginPackageStageDirectories(installRootDirectory)).toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('exposes plugin package installation through the typed Electron IPC handler and saves the project', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-package-ipc-'));

    try {
      const packageDirectory = join(tempRoot, 'package');
      const installRootDirectory = join(tempRoot, 'installed');
      const project = createDefaultEditorProject();
      const plugin = buildSignedPackagePlugin('0.1.0');
      let savedProject: EditorProject | undefined;
      await writePluginPackageFixture(packageDirectory, plugin);

      const handlers = createEditorIpcHandlers({
        projects: {
          async list() {
            return { projects: [] };
          },
          async load() {
            return undefined;
          },
          async save(nextProject) {
            savedProject = nextProject;
            return { project: nextProject };
          },
          async delete(id) {
            return { deleted: true, id };
          },
        },
        pluginPackageInstallRoot: installRootDirectory,
      });
      const response = await handlers[EDITOR_IPC_CHANNELS.pluginPackageInstall]({
        project,
        packageDirectory,
        mode: 'install',
        installedAt: '2026-06-16T00:00:00.000Z',
      });

      expect(response.status).toBe('installed');
      expect(response.installRootDirectory).toBe(installRootDirectory);
      expect(savedProject?.plugins.some((candidate) => candidate.id === plugin.id)).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('signs a package manifest with RSA and refreshes package file metadata', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-package-sign-'));

    try {
      const keyDirectory = join(tempRoot, 'keys');
      const packageDirectory = join(tempRoot, 'package');
      const keyId = 'danbi-production-plugin-rsa-sign-test-2026';
      const keygen = spawnSync(process.execPath, [
        join(REPO_ROOT, 'scripts', 'plugin-signing-keygen.mjs'),
        '--key-id',
        keyId,
        '--label',
        'Danbi Studio production plugin signing key sign test',
        '--valid-from',
        '2026-06-01T00:00:00.000Z',
        '--out-dir',
        keyDirectory,
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      expect(keygen.status).toBe(0);
      const keygenResult = JSON.parse(keygen.stdout) as {
        privateKeyPath: string;
        trustedKeyPath: string;
      };
      const trustedKey = JSON.parse(await readFile(keygenResult.trustedKeyPath, 'utf8'));
      const plugin = buildUnsignedPackagePlugin('0.1.0');
      await writePluginPackageFixture(packageDirectory, plugin, {
        writerContent: `${PACKAGE_WRITER_CONTENT}REM signed package\n`,
        writerSha256: `sha256-${'0'.repeat(64)}`,
      });

      const sign = spawnSync(process.execPath, [
        join(REPO_ROOT, 'scripts', 'plugin-package-sign.mjs'),
        '--manifest',
        join(packageDirectory, DEFAULT_PLUGIN_PACKAGE_MANIFEST_FILE_NAME),
        '--private-key',
        keygenResult.privateKeyPath,
        '--key-id',
        keyId,
        '--signed-at',
        '2026-06-16T00:00:00.000Z',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      expect(sign.status).toBe(0);
      expect(sign.stdout).not.toContain('BEGIN PRIVATE KEY');
      const signResult = JSON.parse(sign.stdout) as {
        status: string;
        manifestFingerprint: string;
        fileCount: number;
      };
      expect(signResult).toMatchObject({
        status: 'signed',
        fileCount: 2,
      });
      const signedManifest = JSON.parse(await readFile(join(packageDirectory, DEFAULT_PLUGIN_PACKAGE_MANIFEST_FILE_NAME), 'utf8')) as {
        plugin: EditorPluginManifest;
        files: Array<{ path: string; sha256: string; bytes: number }>;
      };
      const verification = verifyPluginManifestSignature(signedManifest.plugin, {
        trustedSigningKeys: [trustedKey],
        verificationTime: '2026-06-16T00:00:00.000Z',
      });
      const writerFile = signedManifest.files.find((file) => file.path.endsWith('/writer.cmd'));
      const runtimeWriterFile = signedManifest.plugin.exporterWriters?.[0]?.runtimePackage?.files[0];

      expect(verification).toMatchObject({
        status: 'verified',
        trustLevel: 'trusted-signer',
        keyId,
        manifestFingerprint: signResult.manifestFingerprint,
      });
      expect(writerFile).toMatchObject({
        sha256: hashText(`${PACKAGE_WRITER_CONTENT}REM signed package\n`),
        bytes: Buffer.byteLength(`${PACKAGE_WRITER_CONTENT}REM signed package\n`, 'utf8'),
      });
      expect(runtimeWriterFile).toMatchObject({
        sha256: writerFile?.sha256,
        bytes: writerFile?.bytes,
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('refuses to sign when the private key is stored inside the plugin package folder', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-plugin-package-sign-custody-'));

    try {
      const packageDirectory = join(tempRoot, 'package');
      const plugin = buildUnsignedPackagePlugin('0.1.0');
      await writePluginPackageFixture(packageDirectory, plugin);
      const privateKeyPath = join(packageDirectory, 'plugins', 'external-package-auditor', 'leaked.private.pem');
      await mkdir(dirname(privateKeyPath), { recursive: true });
      await writeFile(privateKeyPath, '-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----\n', 'utf8');

      const sign = spawnSync(process.execPath, [
        join(REPO_ROOT, 'scripts', 'plugin-package-sign.mjs'),
        '--manifest',
        join(packageDirectory, DEFAULT_PLUGIN_PACKAGE_MANIFEST_FILE_NAME),
        '--private-key',
        privateKeyPath,
        '--key-id',
        'danbi-production-plugin-rsa-sign-test-2026',
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      expect(sign.status).toBe(1);
      expect(sign.stderr).toContain('must not be stored inside the plugin package directory');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

function buildUnsignedPackagePlugin(version: string): EditorPluginManifest {
  return {
    id: 'plugin-external-package-auditor',
    name: 'External Package Auditor',
    version,
    entry: `${PACKAGE_PLUGIN_ROOT}/index.js`,
    permissions: ['project'],
    contributes: ['exporter'],
    exporterWriters: [
      {
        id: 'package-writer',
        label: 'Package Writer',
        executable: `${PACKAGE_PLUGIN_ROOT}/writer.cmd`,
        args: ['--manifest', '{manifest}', '--output', '{output}'],
        cwd: PACKAGE_PLUGIN_ROOT,
        runtimePackage: {
          packageId: 'external-package-auditor-win-x64',
          runtime: 'native',
          root: PACKAGE_PLUGIN_ROOT,
          entry: 'writer.cmd',
          packagedAt: '2026-06-16T00:00:00.000Z',
          files: [
            {
              path: 'writer.cmd',
              sha256: hashText(PACKAGE_WRITER_CONTENT),
              bytes: Buffer.byteLength(PACKAGE_WRITER_CONTENT, 'utf8'),
            },
          ],
        },
      },
    ],
  };
}

function buildSignedPackagePlugin(version: string): EditorPluginManifest {
  const unsignedPlugin = buildUnsignedPackagePlugin(version);

  return {
    ...unsignedPlugin,
    signature: {
      algorithm: 'manifest-sha256-v1',
      keyId: 'test-local-key',
      manifestFingerprint: buildPluginManifestSignatureFingerprint(unsignedPlugin),
      signedAt: '2026-06-16T00:00:00.000Z',
    },
  };
}

async function writePluginPackageFixture(
  packageDirectory: string,
  plugin: EditorPluginManifest,
  options: {
    indexContent?: string;
    writerContent?: string;
    writerSha256?: string;
  } = {},
): Promise<void> {
  const indexContent = options.indexContent ?? PACKAGE_INDEX_CONTENT;
  const writerContent = options.writerContent ?? PACKAGE_WRITER_CONTENT;
  const files = [
    {
      path: `${PACKAGE_PLUGIN_ROOT}/index.js`,
      sha256: hashText(indexContent),
      bytes: Buffer.byteLength(indexContent, 'utf8'),
      content: indexContent,
    },
    {
      path: `${PACKAGE_PLUGIN_ROOT}/writer.cmd`,
      sha256: options.writerSha256 ?? hashText(writerContent),
      bytes: Buffer.byteLength(writerContent, 'utf8'),
      content: writerContent,
    },
  ];

  for (const file of files) {
    const filePath = join(packageDirectory, ...file.path.split('/'));
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content, 'utf8');
  }

  await writeFile(
    join(packageDirectory, DEFAULT_PLUGIN_PACKAGE_MANIFEST_FILE_NAME),
    JSON.stringify({
      kind: PLUGIN_PACKAGE_KIND,
      packageVersion: PLUGIN_PACKAGE_VERSION,
      createdAt: '2026-06-16T00:00:00.000Z',
      plugin,
      files: files.map(({ content: _content, ...file }) => file),
    }, null, 2),
    'utf8',
  );
}

function hashText(value: string): string {
  return `sha256-${createHash('sha256').update(value).digest('hex')}`;
}

async function listPluginPackageStageDirectories(installRootDirectory: string): Promise<string[]> {
  const entries = await readdir(installRootDirectory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  });

  return entries.filter((entry) => entry.startsWith('.danbi-plugin-package-stage-'));
}
