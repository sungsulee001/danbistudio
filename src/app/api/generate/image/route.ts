import { NextRequest, NextResponse } from 'next/server';
import { saveGenerateImageUpload } from '@/server/generate-image-upload';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No image file was uploaded.' }, { status: 400 });
    }

    const image = await saveGenerateImageUpload(file);
    return NextResponse.json({ image });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
