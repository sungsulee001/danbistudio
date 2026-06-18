import { mkdir, writeFile } from 'fs/promises';
import path, { extname, join } from 'path';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SUPPORTED_LUT_EXTENSIONS = new Set(['.cube', '.3dl', '.dat', '.m3d', '.csp']);
const MAX_LUT_SIZE_BYTES = 64 * 1024 * 1024;
const MAX_UNIQUE_LUT_FILENAME_ATTEMPTS = 10000;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No LUT file was uploaded.' }, { status: 400 });
    }

    const extension = extname(file.name).toLowerCase();
    if (!SUPPORTED_LUT_EXTENSIONS.has(extension)) {
      return NextResponse.json({ error: 'Unsupported LUT format. Use .cube, .3dl, .dat, .m3d, or .csp.' }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_LUT_SIZE_BYTES) {
      return NextResponse.json({ error: 'LUT file size is invalid or too large.' }, { status: 400 });
    }

    const lutDir = join(process.cwd(), 'public', 'luts');
    await mkdir(lutDir, { recursive: true });

    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await writeLutFileToUniquePath(bytes, lutDir, `${Date.now()}-${sanitizeFilename(file.name)}`);

    return NextResponse.json({
      lut: {
        originalName: file.name,
        name: uploaded.filename,
        source: `/luts/${uploaded.filename}`,
        renderPath: uploaded.filePath,
        size: file.size,
        interpolation: 'tetrahedral',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

function sanitizeFilename(value: string): string {
  const extension = extname(value).toLowerCase();
  const cleaned = value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');

  if (!cleaned) {
    return `grade${SUPPORTED_LUT_EXTENSIONS.has(extension) ? extension : '.cube'}`;
  }

  return SUPPORTED_LUT_EXTENSIONS.has(extension) && !cleaned.toLowerCase().endsWith(extension)
    ? `${cleaned}${extension}`
    : cleaned;
}

async function writeLutFileToUniquePath(
  bytes: Buffer,
  lutDir: string,
  requestedFilename: string,
): Promise<{ filePath: string; filename: string }> {
  const parsed = path.parse(requestedFilename);
  const stem = parsed.name || 'grade';
  const extension = parsed.ext;

  for (let attempt = 0; attempt < MAX_UNIQUE_LUT_FILENAME_ATTEMPTS; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt}`;
    const filename = `${stem}${suffix}${extension}`;
    const filePath = join(lutDir, filename);

    try {
      await writeFile(filePath, bytes, { flag: 'wx' });
      return { filePath, filename };
    } catch (error) {
      if (isFileAlreadyExistsError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Could not reserve a unique LUT filename for ${requestedFilename}.`);
}

function isFileAlreadyExistsError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'EEXIST';
}
