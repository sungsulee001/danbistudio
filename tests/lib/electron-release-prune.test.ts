import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pruneScriptPath = fileURLToPath(new URL('../../scripts/prune-next-standalone-release.mjs', import.meta.url));

describe('Next standalone release prune', () => {
  it('removes development-only standalone directories and trace entries', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-next-standalone-prune-'));
    try {
      const standaloneDir = join(tempRoot, '.next', 'standalone');
      const traceFile = join(standaloneDir, '.next', 'server', 'app', 'api', 'generate', 'route.js.nft.json');
      await writeStandaloneFile(standaloneDir, '.danbi/plugin-signing/leaked.private.pem', 'private-key-path-only\n');
      await writeStandaloneFile(standaloneDir, '.git/config', 'repo metadata\n');
      await writeStandaloneFile(standaloneDir, '.next/dev/server.js', 'dev server\n');
      await writeStandaloneFile(standaloneDir, '.next/types/app/page.ts', 'type output\n');
      await writeStandaloneFile(standaloneDir, 'dev-server.out.log', 'dev log\n');
      await writeStandaloneFile(standaloneDir, 'src/electron/main/electron-app.ts', 'source\n');
      await writeStandaloneFile(standaloneDir, 'third_party/source-mirrors.lock.json', '{}\n');
      await writeStandaloneFile(standaloneDir, 'tests/lib/plugin-signing-readiness.test.ts', 'test fixture\n');
      await writeStandaloneFile(standaloneDir, 'server/runtime.js', 'module.exports = true;\n');
      await writeStandaloneFile(standaloneDir, 'package.json', JSON.stringify({
        name: 'danbistudio',
        version: '0.1.0',
        private: true,
        main: 'dist-electron/main/electron-app.cjs',
        scripts: {
          start: 'next start',
          'electron:start': 'electron dist-electron/main/electron-app.cjs',
        },
        dependencies: {
          next: '^16.2.9',
        },
        devDependencies: {
          electron: '^42.4.0',
        },
      }));
      await writeStandaloneFile(
        standaloneDir,
        'server.js',
        'const nextConfig = {"outputFileTracingRoot":"E:\\\\repo\\\\danbi","turbopack":{"root":"E:\\\\repo\\\\danbi"},"distDirRoot":".next"};\n',
      );
      await writeTraceFile(standaloneDir, traceFile, [
        '.danbi/plugin-signing/leaked.private.pem',
        '.git/config',
        '.next/dev/server.js',
        '.next/types/app/page.ts',
        'dev-server.out.log',
        'src/electron/main/electron-app.ts',
        'third_party/source-mirrors.lock.json',
        'tests/lib/plugin-signing-readiness.test.ts',
        'server/runtime.js',
      ]);

      const result = runPruneScript(standaloneDir);

      expect(result.status).toBe(0);
      const summary = JSON.parse(result.stdout) as {
        status: string;
        removedDirectories: string[];
        removedFiles: string[];
        removedTraceEntryCount: number;
        privateKeyTraceEntries: unknown[];
        sanitizedPackageJson: boolean;
        sanitizedServerConfig: boolean;
      };
      expect(summary).toMatchObject({
        status: 'passed',
        privateKeyTraceEntries: [],
        sanitizedPackageJson: true,
        sanitizedServerConfig: true,
      });
      expect(summary.removedDirectories).toEqual(expect.arrayContaining(['.danbi', '.git', 'src', 'tests', 'third_party']));
      expect(summary.removedFiles).toEqual(expect.arrayContaining(['dev-server.out.log']));
      expect(summary.removedTraceEntryCount).toBe(8);
      expect(existsSync(join(standaloneDir, '.danbi'))).toBe(false);
      expect(existsSync(join(standaloneDir, '.git'))).toBe(false);
      expect(existsSync(join(standaloneDir, '.next', 'dev'))).toBe(false);
      expect(existsSync(join(standaloneDir, '.next', 'types'))).toBe(false);
      expect(existsSync(join(standaloneDir, 'src'))).toBe(false);
      expect(existsSync(join(standaloneDir, 'tests'))).toBe(false);
      expect(existsSync(join(standaloneDir, 'third_party'))).toBe(false);

      const trace = JSON.parse(await readFile(traceFile, 'utf8')) as { files: string[] };
      expect(trace.files).toHaveLength(1);
      expect(trace.files[0]).toContain('server/runtime.js');
      expect(trace.files.join('\n')).not.toContain('.private.pem');
      expect(trace.files.join('\n')).not.toContain('.git');
      expect(trace.files.join('\n')).not.toContain('.next/dev');
      expect(trace.files.join('\n')).not.toContain('third_party');
      expect(trace.files.join('\n')).not.toContain('tests/');

      const packageJson = JSON.parse(await readFile(join(standaloneDir, 'package.json'), 'utf8')) as {
        main: string;
        scripts: Record<string, string>;
        dependencies: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      expect(packageJson.main).toBe('server.js');
      expect(packageJson.scripts).toEqual({ start: 'node server.js' });
      expect(packageJson.dependencies).toEqual({ next: '^16.2.9' });
      expect(packageJson.devDependencies).toBeUndefined();
      expect(JSON.stringify(packageJson)).not.toContain('dist-electron');

      const serverJs = await readFile(join(standaloneDir, 'server.js'), 'utf8');
      expect(serverJs).toContain('"outputFileTracingRoot":"."');
      expect(serverJs).toContain('"turbopack":{"root":"."}');
      expect(serverJs).not.toContain('E:\\\\repo\\\\danbi');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('prunes release trace entries that escape standalone into blocked custody paths', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-next-standalone-prune-escape-'));
    try {
      const standaloneDir = join(tempRoot, '.next', 'standalone');
      const traceFile = join(standaloneDir, '.next', 'server', 'app', 'api', 'generate', 'route.js.nft.json');
      await mkdir(dirname(traceFile), { recursive: true });
      await writeFile(traceFile, JSON.stringify({
        version: 1,
        files: [
          '../../../../../../.danbi/plugin-signing/danbi-production-plugin-rsa-2026.private.pem',
          '../../../../../../.danbi/electron-release/manifest.json',
          '../../../../../scripts/prepare-electron-release.mjs',
          'server.js',
        ],
      }), 'utf8');

      const result = runPruneScript(standaloneDir);

      expect(result.status).toBe(0);
      const summary = JSON.parse(result.stdout) as {
        status: string;
        removedTraceEntryCount: number;
        privateKeyTraceEntries: unknown[];
      };
      expect(summary).toMatchObject({
        status: 'passed',
        removedTraceEntryCount: 3,
        privateKeyTraceEntries: [],
      });

      const trace = JSON.parse(await readFile(traceFile, 'utf8')) as { files: string[] };
      expect(trace.files).toEqual(['server.js']);
      expect(trace.files.join('\n')).not.toContain('.private.pem');
      expect(trace.files.join('\n')).not.toContain('.danbi');
      expect(trace.files.join('\n')).not.toContain('scripts/');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails when a private key trace entry remains outside pruned release-only paths', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-next-standalone-prune-leak-'));
    try {
      const standaloneDir = join(tempRoot, '.next', 'standalone');
      const traceFile = join(standaloneDir, '.next', 'server', 'app', 'api', 'generate', 'route.js.nft.json');
      await writeStandaloneFile(standaloneDir, 'runtime/leaked.private.pem', 'not a real key\n');
      await writeTraceFile(standaloneDir, traceFile, ['runtime/leaked.private.pem']);

      const result = runPruneScript(standaloneDir);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('private key trace leak');
      const summary = JSON.parse(result.stdout) as {
        status: string;
        privateKeyTraceEntries: Array<{ entry: string }>;
      };
      expect(summary.status).toBe('failed');
      expect(summary.privateKeyTraceEntries).toEqual(expect.arrayContaining([
        expect.objectContaining({ entry: expect.stringContaining('runtime/leaked.private.pem') }),
      ]));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('runs the prune CLI against a supplied root directory', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'danbi-next-standalone-prune-root-'));
    try {
      const standaloneDir = join(tempRoot, '.next', 'standalone');
      await writeStandaloneFile(standaloneDir, '.git/config', 'repo metadata\n');
      await writeStandaloneFile(standaloneDir, 'server/runtime.js', 'module.exports = true;\n');

      const result = runPruneScriptArgs(['--root-dir', tempRoot]);

      expect(result.status).toBe(0);
      const summary = JSON.parse(result.stdout) as {
        status: string;
        standaloneDir: string;
        removedDirectories: string[];
      };
      expect(summary).toMatchObject({
        status: 'passed',
        standaloneDir: '.next/standalone',
        removedDirectories: ['.git'],
      });
      expect(existsSync(join(standaloneDir, '.git'))).toBe(false);
      expect(existsSync(join(standaloneDir, 'server', 'runtime.js'))).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

async function writeStandaloneFile(standaloneDir: string, relativePath: string, text: string): Promise<void> {
  const filePath = join(standaloneDir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, text, 'utf8');
}

async function writeTraceFile(standaloneDir: string, traceFile: string, releaseRelativeEntries: string[]): Promise<void> {
  await mkdir(dirname(traceFile), { recursive: true });
  const traceDir = dirname(traceFile);
  await writeFile(traceFile, JSON.stringify({
    version: 1,
    files: releaseRelativeEntries.map((entry) => toTracePath(relative(traceDir, join(standaloneDir, entry)))),
  }), 'utf8');
}

function runPruneScript(standaloneDir: string): { status: number | null; stdout: string; stderr: string } {
  return runPruneScriptArgs([
    '--standalone-dir',
    standaloneDir,
  ]);
}

function runPruneScriptArgs(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [
    pruneScriptPath,
    ...args,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function toTracePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}
