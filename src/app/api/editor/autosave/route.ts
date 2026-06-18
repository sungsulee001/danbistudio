import { NextRequest, NextResponse } from 'next/server';
import { listEditorAutosaves, saveEditorAutosave } from '@/electron/main/autosave-store';
import { createDefaultEditorProject } from '@/lib/editor/project';
import type { EditorProject } from '@/lib/editor/types';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json({ autosaves: await listEditorAutosaves() });
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
    const project = (body.project ?? createDefaultEditorProject()) as EditorProject;
    const reason = typeof body.reason === 'string' ? body.reason : 'autosave';
    const snapshot = await saveEditorAutosave(project, reason);
    return NextResponse.json({ autosave: snapshot.summary });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
