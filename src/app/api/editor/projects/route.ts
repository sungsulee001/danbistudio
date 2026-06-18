import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createDefaultEditorProject } from '@/lib/editor/project';
import {
  formatProjectJsonValidationFailure,
  parseProjectJson,
  stringifyProjectJson,
  summarizeProjectJson,
  validateProjectJson,
  type ProjectJsonValidationResult,
} from '@/electron/shared/project-schema';
import type { EditorProject } from '@/lib/editor/types';

class ProjectSaveValidationError extends Error {
  constructor(readonly validation: ProjectJsonValidationResult) {
    super(formatProjectJsonValidationFailure(validation, 'Cannot save editor project because its JSON is invalid'));
  }
}

export async function GET() {
  try {
    const records = await prisma.editorProjectRecord.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      projects: records.map((record) => {
        const project = parseProjectJson(record.data);
        return summarizeProjectJson(project, record.createdAt, record.updatedAt);
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const project = normalizeProject(body.project);

    const record = await prisma.editorProjectRecord.upsert({
      where: { id: project.id },
      create: {
        id: project.id,
        name: project.name,
        data: stringifyProjectJson(project),
      },
      update: {
        name: project.name,
        data: stringifyProjectJson(project),
      },
    });

    return NextResponse.json({
      project: parseProjectJson(record.data),
      summary: summarizeProjectJson(project, record.createdAt, record.updatedAt),
    });
  } catch (error) {
    const validation = error instanceof ProjectSaveValidationError ? error.validation : undefined;
    return NextResponse.json(
      {
        error: (error as Error).message,
        ...(validation ? { errors: validation.errors, warnings: validation.warnings } : {}),
      },
      { status: 400 },
    );
  }
}

function normalizeProject(project?: EditorProject): EditorProject {
  const fallback = createDefaultEditorProject();
  if (!project) {
    return fallback;
  }

  const validation = validateProjectJson({
    ...fallback,
    ...project,
    schemaVersion: project.schemaVersion ?? fallback.schemaVersion,
    updatedAt: new Date().toISOString(),
  });

  if (!validation.ok || !validation.project) {
    throw new ProjectSaveValidationError(validation);
  }

  return validation.project;
}
