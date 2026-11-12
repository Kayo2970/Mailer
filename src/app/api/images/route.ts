import { NextResponse } from 'next/server';
import { removeLibraryImage } from '@/lib/email-service';
import { addImage, listImages, toPublicImage } from '@/lib/images';
import { handle } from '@/lib/api';

/** GET — the image library, newest first (no bytes; see /api/images/[id]). */
export function GET(request: Request) {
  return handle(request, async () => NextResponse.json({ images: (await listImages()).map(toPublicImage) }));
}

/**
 * POST { filename, contentBase64 } — adds a PNG/JPEG/GIF to the library → { image }
 * POST { deleteId }               — removes one (and takes it off the letterhead) → { deleted }
 */
export function POST(request: Request) {
  return handle(request, async () => {
    const body = await request.json();
    if (typeof body?.deleteId === 'string') {
      return NextResponse.json({ deleted: await removeLibraryImage(body.deleteId) });
    }
    if (typeof body?.contentBase64 !== 'string' || !body.contentBase64) {
      return NextResponse.json({ error: 'An image file is required.' }, { status: 400 });
    }
    const image = await addImage(typeof body.filename === 'string' ? body.filename : 'image', Buffer.from(body.contentBase64, 'base64'));
    return NextResponse.json({ image: toPublicImage(image) });
  });
}
