import { NextResponse } from 'next/server';
import { listWorkflowSummaries } from '@/lib/workflow-loader';

export async function GET() {
  try {
    return NextResponse.json({
      workflows: listWorkflowSummaries(),
    });
  } catch (error) {
    console.error('Error listing workflows:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
