import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNativeProjectRepository } from '../../src/electron/main/native-project-repository';
import { createDefaultEditorProject } from '../../src/lib/editor/project';

describe('native project repository', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'danbi-native-projects-'));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('stores projects with Windows-reserved or dot-only ids under safe filenames', async () => {
    const repository = createNativeProjectRepository({ rootDir: tempRoot });
    const reservedProject = {
      ...createDefaultEditorProject(),
      id: 'CON',
      name: 'Reserved Project Id',
    };
    const dotOnlyProject = {
      ...createDefaultEditorProject(),
      id: '...',
      name: 'Dot Only Project Id',
    };

    await repository.save(reservedProject);
    await repository.save(dotOnlyProject);

    const filenames = await readdir(tempRoot);
    expect(filenames).not.toContain('CON.json');
    expect(filenames).not.toContain('....json');
    expect(filenames).toEqual(expect.arrayContaining([
      expect.stringMatching(/^project-CON-[a-f0-9]{8}\.json$/),
      expect.stringMatching(/^project-[a-f0-9]{8}\.json$/),
    ]));
    await expect(repository.load('CON')).resolves.toMatchObject({
      project: { id: 'CON', name: 'Reserved Project Id' },
    });
    await expect(repository.load('...')).resolves.toMatchObject({
      project: { id: '...', name: 'Dot Only Project Id' },
    });
  });

  it('stores project ids containing Windows wildcard characters under case-safe filenames', async () => {
    const repository = createNativeProjectRepository({ rootDir: tempRoot });
    const project = {
      ...createDefaultEditorProject(),
      id: 'client*project',
      name: 'Wildcard Project Id',
    };

    await repository.save(project);

    const filenames = await readdir(tempRoot);
    expect(filenames).toEqual([expect.stringMatching(/^client%2aproject-[a-f0-9]{8}\.json$/)]);
    await expect(repository.load('client*project')).resolves.toMatchObject({
      project: { id: 'client*project', name: 'Wildcard Project Id' },
    });
  });

  it('stores case-variant project ids under distinct filenames on Windows filesystems', async () => {
    const repository = createNativeProjectRepository({ rootDir: tempRoot });

    await repository.save({
      ...createDefaultEditorProject(),
      id: 'Project',
      name: 'Uppercase Project Id',
    });
    await repository.save({
      ...createDefaultEditorProject(),
      id: 'project',
      name: 'Lowercase Project Id',
    });

    const filenames = await readdir(tempRoot);
    expect(filenames).toEqual(expect.arrayContaining([
      'project.json',
      expect.stringMatching(/^project-[a-f0-9]{8}\.json$/),
    ]));
    expect(new Set(filenames.map((filename) => filename.toLowerCase())).size).toBe(filenames.length);
    await expect(repository.load('Project')).resolves.toMatchObject({
      project: { id: 'Project', name: 'Uppercase Project Id' },
    });
    await expect(repository.load('project')).resolves.toMatchObject({
      project: { id: 'project', name: 'Lowercase Project Id' },
    });
  });

  it('deletes projects saved under case-safe encoded filenames', async () => {
    const repository = createNativeProjectRepository({ rootDir: tempRoot });
    const project = {
      ...createDefaultEditorProject(),
      id: 'Project*Delete',
      name: 'Case Safe Delete',
    };

    await repository.save(project);

    const filenames = await readdir(tempRoot);
    expect(filenames).toEqual([expect.stringMatching(/^project%2adelete-[a-f0-9]{8}\.json$/)]);

    await expect(repository.delete('Project*Delete')).resolves.toEqual({ deleted: true, id: 'Project*Delete' });
    await expect(readdir(tempRoot)).resolves.toEqual([]);
    await expect(repository.load('Project*Delete')).resolves.toBeUndefined();
  });

  it('loads, migrates, and deletes legacy case-sensitive project filenames by exact project id', async () => {
    const repository = createNativeProjectRepository({ rootDir: tempRoot });
    const legacyProject = {
      ...createDefaultEditorProject(),
      id: 'Project',
      name: 'Legacy Uppercase Project',
    };
    const legacyDeleteProject = {
      ...createDefaultEditorProject(),
      id: 'ProjectDelete',
      name: 'Legacy Delete Project',
    };

    await writeFile(join(tempRoot, 'Project.json'), JSON.stringify(legacyProject), 'utf8');
    await writeFile(join(tempRoot, 'ProjectDelete.json'), JSON.stringify(legacyDeleteProject), 'utf8');

    await expect(repository.load('Project')).resolves.toMatchObject({
      project: { id: 'Project', name: 'Legacy Uppercase Project' },
    });
    await expect(repository.load('project')).resolves.toBeUndefined();

    await repository.save({
      ...legacyProject,
      name: 'Migrated Uppercase Project',
    });
    expect(await readdir(tempRoot)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^project-[a-f0-9]{8}\.json$/),
      'ProjectDelete.json',
    ]));
    expect(await readdir(tempRoot)).not.toContain('Project.json');
    await expect(repository.load('Project')).resolves.toMatchObject({
      project: { id: 'Project', name: 'Migrated Uppercase Project' },
    });

    await expect(repository.delete('ProjectDelete')).resolves.toEqual({ deleted: true, id: 'ProjectDelete' });
    expect(await readdir(tempRoot)).not.toContain('ProjectDelete.json');
  });

  it('does not delete a legacy case-variant project when the requested id differs by case', async () => {
    const repository = createNativeProjectRepository({ rootDir: tempRoot });
    const legacyProject = {
      ...createDefaultEditorProject(),
      id: 'Project',
      name: 'Legacy Uppercase Project',
    };

    await writeFile(join(tempRoot, 'Project.json'), JSON.stringify(legacyProject), 'utf8');

    await expect(repository.delete('project')).resolves.toEqual({ deleted: true, id: 'project' });
    await expect(readFile(join(tempRoot, 'Project.json'), 'utf8')).resolves.toContain('Legacy Uppercase Project');
    await expect(repository.load('Project')).resolves.toMatchObject({
      project: { id: 'Project', name: 'Legacy Uppercase Project' },
    });
  });

  it('saves a lower-case project id without overwriting a legacy upper-case project file', async () => {
    const repository = createNativeProjectRepository({ rootDir: tempRoot });
    const caseInsensitiveRoot = await canReadPathCaseInsensitively(tempRoot);
    const legacyProject = {
      ...createDefaultEditorProject(),
      id: 'Project',
      name: 'Legacy Uppercase Project',
    };
    const lowerCaseProject = {
      ...createDefaultEditorProject(),
      id: 'project',
      name: 'Lowercase Project',
    };

    await writeFile(join(tempRoot, 'Project.json'), JSON.stringify(legacyProject), 'utf8');
    await repository.save(lowerCaseProject);

    const filenames = await readdir(tempRoot);
    expect(filenames).toContain('Project.json');
    expect(filenames).toEqual(expect.arrayContaining([
      caseInsensitiveRoot ? expect.stringMatching(/^project-[a-f0-9]{8}\.json$/) : 'project.json',
    ]));
    await expect(repository.load('Project')).resolves.toMatchObject({
      project: { id: 'Project', name: 'Legacy Uppercase Project' },
    });
    await expect(repository.load('project')).resolves.toMatchObject({
      project: { id: 'project', name: 'Lowercase Project' },
    });
  });

  it('lists legacy upper-case and newly saved lower-case project ids as separate projects', async () => {
    const repository = createNativeProjectRepository({ rootDir: tempRoot });
    const legacyProject = {
      ...createDefaultEditorProject(),
      id: 'Project',
      name: 'Legacy Uppercase Project',
    };
    const lowerCaseProject = {
      ...createDefaultEditorProject(),
      id: 'project',
      name: 'Lowercase Project',
    };

    await writeFile(join(tempRoot, 'Project.json'), JSON.stringify(legacyProject), 'utf8');
    await repository.save(lowerCaseProject);

    await expect(repository.list()).resolves.toMatchObject({
      projects: expect.arrayContaining([
        expect.objectContaining({ id: 'Project', name: 'Legacy Uppercase Project' }),
        expect.objectContaining({ id: 'project', name: 'Lowercase Project' }),
      ]),
    });
  });

  it('deduplicates legacy and case-safe files for the same project id in project lists', async () => {
    const repository = createNativeProjectRepository({ rootDir: tempRoot });
    const savedProject = await repository.save({
      ...createDefaultEditorProject(),
      id: 'Project',
      name: 'Current Uppercase Project',
    });
    const legacyDuplicateProject = {
      ...savedProject.project,
      name: 'Legacy Duplicate Project',
      updatedAt: '2000-01-01T00:00:00.000Z',
    };

    await writeFile(join(tempRoot, 'Project.json'), JSON.stringify(legacyDuplicateProject), 'utf8');

    await expect(repository.list()).resolves.toMatchObject({
      projects: [
        {
          id: 'Project',
          name: 'Current Uppercase Project',
        },
      ],
    });
  });

  it('keeps case-variant project ids separate in project lists', async () => {
    const repository = createNativeProjectRepository({ rootDir: tempRoot });

    await repository.save({
      ...createDefaultEditorProject(),
      id: 'Project',
      name: 'Uppercase Project Id',
    });
    await repository.save({
      ...createDefaultEditorProject(),
      id: 'project',
      name: 'Lowercase Project Id',
    });

    await expect(repository.list()).resolves.toMatchObject({
      projects: expect.arrayContaining([
        expect.objectContaining({ id: 'Project', name: 'Uppercase Project Id' }),
        expect.objectContaining({ id: 'project', name: 'Lowercase Project Id' }),
      ]),
    });
  });

  it('stores long project ids under bounded filenames and replaces saves atomically', async () => {
    const repository = createNativeProjectRepository({ rootDir: tempRoot });
    const longId = `client-${'very-long-project-id-'.repeat(16)}`;
    const firstProject = {
      ...createDefaultEditorProject(),
      id: longId,
      name: 'Long Project Id',
    };
    const secondProject = {
      ...firstProject,
      name: 'Long Project Id Updated',
    };

    await repository.save(firstProject);
    await repository.save(secondProject);

    const filenames = await readdir(tempRoot);
    const projectFiles = filenames.filter((filename) => filename.endsWith('.json'));
    const tempFiles = filenames.filter((filename) => filename.endsWith('.tmp'));

    expect(projectFiles).toHaveLength(1);
    expect(projectFiles[0].length).toBeLessThanOrEqual(125);
    expect(projectFiles[0]).toMatch(/-[a-f0-9]{8}\.json$/);
    expect(tempFiles).toEqual([]);
    await expect(readFile(join(tempRoot, projectFiles[0]), 'utf8')).resolves.toContain('Long Project Id Updated');
    await expect(repository.load(longId)).resolves.toMatchObject({
      project: { id: longId, name: 'Long Project Id Updated' },
    });
  });

  it('lists valid native projects even when unrelated or corrupted json files exist', async () => {
    const repository = createNativeProjectRepository({ rootDir: tempRoot });
    const project = {
      ...createDefaultEditorProject(),
      id: 'recoverable-project',
      name: 'Recoverable Project',
    };

    await repository.save(project);
    await writeFile(join(tempRoot, 'broken.json'), '{', 'utf8');
    await writeFile(join(tempRoot, 'notes.json'), JSON.stringify({ notes: true }), 'utf8');

    await expect(repository.list()).resolves.toMatchObject({
      projects: [
        {
          id: 'recoverable-project',
          name: 'Recoverable Project',
        },
      ],
    });
  });
});

async function canReadPathCaseInsensitively(rootDir: string): Promise<boolean> {
  const probePath = join(rootDir, 'CaseProbe.json');
  await writeFile(probePath, '{}', 'utf8');
  try {
    await readFile(join(rootDir, 'caseprobe.json'), 'utf8');
    return true;
  } catch {
    return false;
  } finally {
    await rm(probePath, { force: true });
  }
}
