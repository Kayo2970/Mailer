import { NextResponse } from 'next/server';
import { cancelQueued, deleteHistory, retryFailed, sendQueuedNow } from '@/lib/email-service';
import { handle } from '@/lib/api';

/**
 * POST { action: 'send-now' | 'cancel' | 'retry' | 'delete', id? | batchId? | all? }
 *   send-now — skip the remaining wait of queued messages
 *   cancel   — cancel queued messages
 *   retry    — put failed messages back in the queue
 *   delete   — remove finished messages from the history
 */
export function POST(request: Request) {
  return handle(request, async () => {
    const body = await request.json();
    const scope =
      typeof body?.id === 'string' && body.id ? { id: body.id as string }
      : typeof body?.batchId === 'string' && body.batchId ? { batchId: body.batchId as string }
      : body?.all === true ? { all: true as const }
      : null;
    if (!scope) return NextResponse.json({ error: 'id, batchId or all is required.' }, { status: 400 });

    switch (body.action) {
      case 'send-now': return NextResponse.json({ count: await sendQueuedNow(scope) });
      case 'cancel': return NextResponse.json({ count: await cancelQueued(scope) });
      case 'retry': return NextResponse.json({ count: await retryFailed(scope) });
      case 'delete': return NextResponse.json({ count: await deleteHistory(scope) });
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
  });
}
