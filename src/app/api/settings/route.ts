import { NextResponse } from 'next/server';
import { getEmailSettings, toPublicSettings, updateEmailSettings } from '@/lib/email-service';
import { handle } from '@/lib/api';

export function GET(request: Request) {
  return handle(request, async () => NextResponse.json(toPublicSettings(await getEmailSettings())));
}

/** POST { settings } — saves the form. An empty password / DKIM key keeps the stored one. */
export function POST(request: Request) {
  return handle(request, async () => {
    const body = await request.json();
    if (!body?.settings || typeof body.settings !== 'object') {
      return NextResponse.json({ error: 'Settings are required.' }, { status: 400 });
    }
    return NextResponse.json(toPublicSettings(await updateEmailSettings(body.settings)));
  });
}
