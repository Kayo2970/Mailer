/**
 * api.ts — shared guard + error handling for the API routes.
 *
 * The app has no login: it is meant to be reached only from this machine. But
 * "listening on localhost" alone doesn't stop a web page open in the same
 * browser from firing requests at http://127.0.0.1:3040 (CSRF), or from
 * reaching it under its own domain name (DNS rebinding) — and this API can
 * send mail from the user's account. So every request must:
 *   - be addressed to a local host name (defeats DNS rebinding),
 *   - come from this app's own pages if the browser says where it came from,
 *   - carry a JSON content type when it has a body (a cross-site page cannot
 *     send that without a CORS preflight, which is never granted).
 * Extra host names (e.g. a LAN name you deliberately expose the app under) can
 * be allowed with MAILER_ALLOWED_HOSTS=name1,name2.
 */
import { NextResponse } from 'next/server';
import { SettingsError } from './email-service';
import { ImageError } from './images';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const extraHosts = (process.env.MAILER_ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

function hostnameOf(hostHeader: string): string {
  const h = hostHeader.trim().toLowerCase();
  return h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0];
}

function isAllowedHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  const name = hostnameOf(hostHeader);
  return LOCAL_HOSTS.has(name) || extraHosts.includes(name);
}

class ForbiddenError extends Error {}

export function assertLocalRequest(request: Request): void {
  const host = request.headers.get('host');
  if (!isAllowedHost(host)) throw new ForbiddenError('This app only answers requests addressed to this computer.');

  const origin = request.headers.get('origin');
  if (origin && origin !== 'null') {
    let originHost = '';
    try { originHost = new URL(origin).host; } catch { /* malformed → rejected below */ }
    if (originHost.toLowerCase() !== host!.trim().toLowerCase()) throw new ForbiddenError('Cross-site requests are not allowed.');
  } else if (origin === 'null') {
    throw new ForbiddenError('Cross-site requests are not allowed.');
  }
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new ForbiddenError('Cross-site requests are not allowed.');

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const type = request.headers.get('content-type') || '';
    if (!type.toLowerCase().startsWith('application/json')) throw new ForbiddenError('Requests must be JSON.');
  }
}

/** Runs a route handler behind the local-request guard, turning thrown errors into JSON responses. */
export async function handle(request: Request, fn: () => Promise<Response>): Promise<Response> {
  try {
    assertLocalRequest(request);
    return await fn();
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof SettingsError || err instanceof ImageError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof SyntaxError) return NextResponse.json({ error: 'The request was not valid JSON.' }, { status: 400 });
    console.error('[mailer] API error:', err);
    return NextResponse.json({ error: (err as Error)?.message || 'Something went wrong.' }, { status: 500 });
  }
}
