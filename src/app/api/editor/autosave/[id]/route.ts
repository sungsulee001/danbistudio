import { NextRequest, NextResponse } from 'next/server';
import { deleteEditorAutosave, getEditorAutosave } from '@/electron/main/autosave-store';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const snapshot = await getEditorAutosave(id);
    if (!snapshot) {
      return NextResponse.json(
        { error: 'Autosave snapshot not found' },
        { status: 404 },
      );
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const deleted = await deleteEditorAutosave(id);
    return NextResponse.json({ deleted, id });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
