import { NextResponse } from 'next/server';
import { EmailLog } from '@/lib/email-service';
import { readCollection } from '@/lib/store';
import { handle } from '@/lib/api';

/** GET — one message in full, including the HTML that was (or will be) sent. */
export function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(request, async () => {
    const { id } = await ctx.params;
    const log = (await readCollection<EmailLog>('emails')).find((l) => l.id === id);
    if (!log) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
    return NextResponse.json({ ...log, attachmentKeys: undefined });
  });
}
