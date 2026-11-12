import { NextResponse } from 'next/server';
import { getImage, readImage } from '@/lib/images';
import { handle } from '@/lib/api';

/** GET — the image file itself, for thumbnails in the app. E-mails never link here: they carry their own copy. */
export function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(request, async () => {
    const { id } = await ctx.params;
    const image = await getImage(id);
    if (!image) return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
    const bytes = await readImage(image);
    return new Response(new Uint8Array(bytes), {
      headers: {
        // Sniffed at upload to be PNG/JPEG/GIF; nosniff stops a browser second-guessing it.
        'Content-Type': image.contentType,
        'X-Content-Type-Options': 'nosniff',
        'Content-Length': String(bytes.length),
      },
    });
  });
}
