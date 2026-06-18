import { NextRequest, NextResponse } from 'next/server';

import {
  getSampleProjectPackageMetadata,
  readSampleProjectPackage,
} from '@/server/editor/sample-project-package';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const metadataOnly = request.nextUrl.searchParams.get('metadata') === '1';
    if (metadataOnly) {
      return NextResponse.json(getSampleProjectPackageMetadata());
    }

    const importedPackage = await readSampleProjectPackage();
    if (!importedPackage) {
      return NextResponse.json(
        getSampleProjectPackageMetadata(),
        { status: 404 },
      );
    }

    return NextResponse.json({
      ...importedPackage,
      available: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
