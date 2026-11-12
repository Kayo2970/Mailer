import { NextResponse } from 'next/server';
import { EmailLog } from '@/lib/email-service';
import { readCollection } from '@/lib/store';
import { inlineImagesForDisplay } from '@/lib/images';
import { handle } from '@/lib/api';

/** GET — one message in full, including the HTML that was (or will be) sent. */
export function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(request, async () => {
    const { id } = await ctx.params;
    const log = (await readCollection<EmailLog>('emails')).find((l) => l.id === id);
    if (!log) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
    // Embedded images are shown from the batch's own copies while it still has them, then from the library.
    const bodyHtml = await inlineImagesForDisplay(log.bodyHtml, log.inlineImages);
    return NextResponse.json({ ...log, bodyHtml, attachmentKeys: undefined, inlineImages: undefined });
  });
}
