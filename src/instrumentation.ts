// Runs once when the server starts: resumes the send queue, so messages that
// were still waiting (or scheduled) when the app was last closed go out without
// anyone having to open the page first.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { kickWorker } = await import('./lib/email-service');
    kickWorker();
  }
}
