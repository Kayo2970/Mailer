import { NextResponse } from 'next/server';
import { getEmailSettings, mergeSettings, renderEmailHtml } from '@/lib/email-service';
import { inlineImagesForDisplay } from '@/lib/images';
import { handle } from '@/lib/api';

/**
 * POST { subject, body, bodyIsHtml?, settings? } → { html }
 * The finished e-mail exactly as it would be sent (same renderer as the send
 * path). `settings` previews an unsaved template from the Settings form.
 * Embedded images are shown from the image library. Nothing is sent or stored.
 */
export function POST(request: Request) {
  return handle(request, async () => {
    const body = await request.json();
    let settings = await getEmailSettings();
    if (body?.settings) settings = mergeSettings(settings, { template: body.settings.template, fromName: body.settings.fromName });
    const html = renderEmailHtml(settings, {
      subject: typeof body?.subject === 'string' ? body.subject.slice(0, 500) : '',
      body: typeof body?.body === 'string' ? body.body.slice(0, 1_000_000) : '',
      bodyIsHtml: body?.bodyIsHtml === true,
    });
    // The real message carries its images inside it (cid: parts). A browser frame can't show
    // those, so for the preview only they are swapped for data: URIs of the same files.
    return NextResponse.json({ html: await inlineImagesForDisplay(html) });
  });
}
