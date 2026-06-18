import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const record = await prisma.editorProjectRecord.findUnique({
      where: { id },
    });

    if (!record) {
      return NextResponse.json(
        { error: 'Editor project not found' },
        { status: 404 },
      );
    }

    const project = parseProjectJson(record.data);
    return NextResponse.json({
      project,
      summary: summarizeProjectJson(project, record.createdAt, record.updatedAt),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const project = body.project as EditorProject | undefined;

    if (!project || project.id !== id) {
      return NextResponse.json(
        { error: 'Request project id must match route id.' },
        { status: 400 },
      );
    }

    const validation = validateProjectJson({
      ...project,
      updatedAt: new Date().toISOString(),
    });

    if (!validation.ok || !validation.project) {
      throw new ProjectSaveValidationError(validation);
    }

    const updatedProject = validation.project;
    const record = await prisma.editorProjectRecord.upsert({
      where: { id },
      create: {
        id,
        name: updatedProject.name,
        data: stringifyProjectJson(updatedProject),
      },
      update: {
        name: updatedProject.name,
        data: stringifyProjectJson(updatedProject),
      },
    });

    const savedProject = parseProjectJson(record.data);
    return NextResponse.json({
      project: savedProject,
      summary: summarizeProjectJson(savedProject, record.createdAt, record.updatedAt),
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prisma.editorProjectRecord.delete({
      where: { id },
    });

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
