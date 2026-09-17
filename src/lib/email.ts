import 'server-only';
import { env } from '@/lib/env';
import { logError } from '@/lib/logError';

/**
 * Transactional email via Resend (plain HTTPS API — no SDK needed).
 * Returns true when the provider accepted the send, false when email is not
 * configured or the send failed. Callers must treat false as best-effort and
 * keep responses generic to avoid account enumeration.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  if (!env.resendApiKey) {
    console.warn('[email] RESEND_API_KEY not configured — email not sent');
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
      }),
    });
    return res.ok;
  } catch (err) {
    logError(err, { route: 'email/send' });
    return false;
  }
}
