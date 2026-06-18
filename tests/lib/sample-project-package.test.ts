import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { createDefaultEditorProject } from '../../src/lib/editor/project';
import { serializeProjectPackage } from '../../src/lib/editor/project-store';
import {
  findSampleProjectPackageDirectory,
  getSampleProjectPackageMetadata,
  readSampleProjectPackage,
  resolveSampleProjectPackageCandidates,
} from '../../src/server/editor/sample-project-package';

describe('sample project package server helpers', () => {
  it('deduplicates candidate package directories from env and local conventions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'danbi-sample-candidates-'));
    const sampleDir = join(root, 'sample');

    const candidates = resolveSampleProjectPackageCandidates({
      cwd: root,
      env: {
        DANBI_SAMPLE_PROJECT_PACKAGE: sampleDir,
      },
      resourcesPath: join(root, 'resources'),
      appPath: join(root, 'app'),
    });

    expect(candidates[0]).toBe(sampleDir);
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(candidates).toEqual(expect.arrayContaining([
      join(root, '.danbi', 'sample-project-pack', 'getting-started'),
      join(root, 'release', 'electron', 'win-unpacked', 'resources', 'samples', 'getting-started'),
    ]));
  });

  it('finds and imports the first valid sample project package', async () => {
    const root = await mkdtemp(join(tmpdir(), 'danbi-sample-package-'));
    const sampleDir = join(root, 'sample');
    const project = {
      ...createDefaultEditorProject(),
      id: 'sample-project-test',
      name: 'Sample Project Test',
    };

    await mkdir(sampleDir, { recursive: true });
    await writeFile(join(sampleDir, 'project.danbi-project.json'), serializeProjectPackage(project), 'utf8');
    await writeFile(join(sampleDir, 'tutorial.md'), '# Tutorial', 'utf8');

    const options = {
      cwd: root,
      env: {
        DANBI_SAMPLE_PROJECT_PACKAGE: sampleDir,
      },
    };

    expect(findSampleProjectPackageDirectory(options)).toBe(sampleDir);
    expect(getSampleProjectPackageMetadata(options)).toMatchObject({
      available: true,
      packageDirectory: sampleDir,
      projectFilePath: join(sampleDir, 'project.danbi-project.json'),
    });
    await expect(readSampleProjectPackage(options)).resolves.toMatchObject({
      project: {
        id: 'sample-project-test',
        name: 'Sample Project Test',
      },
      packageDirectory: sampleDir,
      projectFilePath: join(sampleDir, 'project.danbi-project.json'),
    });
  });

  it('accepts an explicit sample package project file path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'danbi-sample-package-file-'));
    const sampleDir = join(root, 'sample');
    const projectFilePath = join(sampleDir, 'project.danbi-project.json');
    const project = {
      ...createDefaultEditorProject(),
      id: 'sample-project-file-test',
      name: 'Sample Project File Test',
    };

    await mkdir(sampleDir, { recursive: true });
    await writeFile(projectFilePath, serializeProjectPackage(project), 'utf8');
    await writeFile(join(sampleDir, 'tutorial.md'), '# Tutorial', 'utf8');

    const options = {
      cwd: root,
      env: {
        DANBI_SAMPLE_PROJECT_PACKAGE: projectFilePath,
      },
    };

    expect(resolveSampleProjectPackageCandidates(options)[0]).toBe(sampleDir);
    expect(findSampleProjectPackageDirectory(options)).toBe(sampleDir);
    await expect(readSampleProjectPackage(options)).resolves.toMatchObject({
      project: {
        id: 'sample-project-file-test',
        name: 'Sample Project File Test',
      },
      packageDirectory: sampleDir,
      projectFilePath,
    });
  });

  it('skips invalid sample package candidates instead of failing metadata lookup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'danbi-sample-invalid-candidate-'));
    const resourcesPath = join(root, 'resources');
    const validDir = join(resourcesPath, 'samples', 'getting-started');
    const project = {
      ...createDefaultEditorProject(),
      id: 'sample-project-after-invalid-candidate',
      name: 'Sample Project After Invalid Candidate',
    };

    await mkdir(validDir, { recursive: true });
    await writeFile(join(validDir, 'project.danbi-project.json'), serializeProjectPackage(project), 'utf8');
    await writeFile(join(validDir, 'tutorial.md'), '# Tutorial', 'utf8');

    const metadata = getSampleProjectPackageMetadata({
      cwd: root,
      env: {
        DANBI_SAMPLE_PROJECT_PACKAGE: join(root, 'bad\0candidate'),
      },
      resourcesPath,
    });

    expect(metadata).toMatchObject({
      available: true,
      packageDirectory: validDir,
      projectFilePath: join(validDir, 'project.danbi-project.json'),
    });
  });

  it('reports unavailable when no candidate has both the project and tutorial files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'danbi-sample-missing-'));
    const options = {
      cwd: root,
      env: {},
    };

    expect(getSampleProjectPackageMetadata(options)).toMatchObject({
      available: false,
    });
    await expect(readSampleProjectPackage(options)).resolves.toBeNull();
  });
});
