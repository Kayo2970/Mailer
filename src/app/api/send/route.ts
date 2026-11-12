import { NextResponse } from 'next/server';
import { enqueueBatch, getEmailSettings, isConfigured } from '@/lib/email-service';
import { applyMailMerge, isValidEmail } from '@/lib/mail-merge';
import { MAX_TOTAL_ATTACHMENT_BYTES } from '@/lib/email-attachments';
import { handle } from '@/lib/api';

const MAX_RECIPIENTS = 5000;

/**
 * POST {
 *   subject, body, bodyIsHtml?, label?, sendAt?,
 *   recipients: [{ email, fields? }],          // fields fill the {{placeholders}}
 *   attachments?: [{ filename, contentBase64, contentType? }]
 * }
 * Personalises the message for each recipient and puts the batch in the send
 * queue; the worker sends it in the background. Returns the queued count.
 */
export function POST(request: Request) {
  return handle(request, async () => {
    const body = await request.json();
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
    const template = typeof body?.body === 'string' ? body.body : '';
    if (!subject || !template.trim()) {
      return NextResponse.json({ error: 'A subject and a message are required.' }, { status: 400 });
    }

    const rawRecipients: unknown[] = Array.isArray(body.recipients) ? body.recipients : [];
    if (rawRecipients.length === 0) return NextResponse.json({ error: 'Add at least one recipient.' }, { status: 400 });
    if (rawRecipients.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `A single batch can have at most ${MAX_RECIPIENTS} recipients.` }, { status: 400 });
    }

    const seen = new Set<string>();
    const messages: Array<{ to: string; subject: string; body: string }> = [];
    for (const raw of rawRecipients) {
      const r = (raw && typeof raw === 'object' ? raw : {}) as { email?: unknown; fields?: unknown };
      const email = typeof r.email === 'string' ? r.email.trim() : '';
      if (!isValidEmail(email)) return NextResponse.json({ error: `"${email}" is not a valid e-mail address.` }, { status: 400 });
      if (seen.has(email.toLowerCase())) continue;
      seen.add(email.toLowerCase());

      const fields: Record<string, string> = {};
      if (r.fields && typeof r.fields === 'object') {
        for (const [k, v] of Object.entries(r.fields as Record<string, unknown>)) fields[k] = typeof v === 'string' ? v : String(v ?? '');
      }
      fields.email = email;
      messages.push({
        to: email,
        // A line break in a merged value must not end up in the Subject header.
        subject: applyMailMerge(subject, fields).replace(/[\r\n]+/g, ' '),
        body: applyMailMerge(template, fields),
      });
    }

    const attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [];
    if (Array.isArray(body.attachments)) {
      for (const a of body.attachments) {
        if (!a || typeof a.filename !== 'string' || typeof a.contentBase64 !== 'string') continue;
        attachments.push({
          filename: a.filename.slice(0, 200),
          content: Buffer.from(a.contentBase64, 'base64'),
          contentType: typeof a.contentType === 'string' ? a.contentType.slice(0, 100) : undefined,
        });
      }
      const total = attachments.reduce((sum, a) => sum + a.content.length, 0);
      if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
        return NextResponse.json({ error: 'The attachments are too large (15 MB in total at most).' }, { status: 400 });
      }
    }

    let sendAt: Date | undefined;
    if (typeof body.sendAt === 'string' && body.sendAt) {
      sendAt = new Date(body.sendAt);
      if (Number.isNaN(sendAt.getTime())) return NextResponse.json({ error: 'The scheduled time is not valid.' }, { status: 400 });
    }

    if (!isConfigured(await getEmailSettings())) {
      return NextResponse.json({ error: 'Connect a mail account in Settings before sending.' }, { status: 400 });
    }

    const queued = await enqueueBatch({
      label: typeof body.label === 'string' ? body.label.trim().slice(0, 120) : undefined,
      bodyIsHtml: body.bodyIsHtml === true,
      messages,
      attachments,
      sendAt,
    });
    return NextResponse.json({ count: queued.length, batchId: queued[0]?.batchId, sendAfter: queued[0]?.sendAfter });
  });
}
