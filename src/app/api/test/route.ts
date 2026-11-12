import { NextResponse } from 'next/server';
import { testEmailConnection } from '@/lib/email-service';
import { isValidEmail } from '@/lib/mail-merge';
import { handle } from '@/lib/api';

/** POST { testRecipient, settings? } — verifies the connection and sends one test message, using the unsaved form if given. */
export function POST(request: Request) {
  return handle(request, async () => {
    const body = await request.json();
    const testRecipient = typeof body?.testRecipient === 'string' ? body.testRecipient.trim() : '';
    if (!isValidEmail(testRecipient)) {
      return NextResponse.json({ success: false, message: 'Enter a valid e-mail address to send the test to.' }, { status: 400 });
    }
    return NextResponse.json(await testEmailConnection(testRecipient, body.settings));
  });
}
