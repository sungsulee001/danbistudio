import type { EditorProject } from '../../lib/editor/types';
import type { ProjectSummary } from '../shared/project-schema';

export interface EditorProjectRepository {
  list(): Promise<{ projects: ProjectSummary[] }>;
  load(id: string): Promise<{ project: EditorProject; summary?: ProjectSummary } | undefined>;
  save(project: EditorProject): Promise<{ project: EditorProject; summary?: ProjectSummary }>;
  delete(id: string): Promise<{ deleted: true; id: string }>;
}

export function createEditorProjectRepository(repository: EditorProjectRepository): EditorProjectRepository {
  return repository;
}

export function createReadonlyProjectRepository(project: EditorProject, summary?: ProjectSummary): EditorProjectRepository {
  return {
    async list() {
      return { projects: summary ? [summary] : [] };
    },
    async load(id) {
      return id === project.id ? { project, summary } : undefined;
    },
    async save() {
      throw new Error('Project repository is read-only.');
    },
    async delete() {
      throw new Error('Project repository is read-only.');
    },
  };
}
