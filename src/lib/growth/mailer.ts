// Pluggable outbound mailer. Resend when configured (free 3k emails/month,
// then $20/mo — vs $97/mo for a sequencer SaaS); dry-run logging otherwise so
// the whole pipeline can be exercised before any real email leaves.
//
// Deliverability reality check: raw sending works for the manual-validation
// phase (~hundreds of emails from a warmed domain). At real volume, inbox
// placement depends on domain warmup — either warm domains slowly (20-30
// days, low daily caps) or export sequences to a dedicated sending tool.

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  /** Override sender. Default is OUTREACH_FROM_EMAIL (cold-outreach domain);
   *  transactional client email should pass NOTIFY_FROM_EMAIL instead. */
  from?: string;
  replyTo?: string;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
  dryRun?: boolean;
}

export function mailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.OUTREACH_FROM_EMAIL);
}

export async function sendEmail(email: OutboundEmail): Promise<SendResult> {
  const from = email.from ?? process.env.OUTREACH_FROM_EMAIL;
  if (!process.env.RESEND_API_KEY || !from) {
    console.log(`[dry-run] would send to ${email.to}: "${email.subject}"`);
    return { ok: true, dryRun: true };
  }

  const replyTo = email.replyTo ?? process.env.OUTREACH_REPLY_TO;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
  }
  const data = (await res.json()) as { id?: string };
  return { ok: true, id: data.id };
}

/**
 * CAN-SPAM footer appended to every outreach email: real physical address +
 * working one-click unsubscribe. Both are legal requirements, not options.
 */
export function complianceFooter(unsubscribeUrl: string): string {
  const address = process.env.OUTREACH_PHYSICAL_ADDRESS ?? "[SET OUTREACH_PHYSICAL_ADDRESS]";
  return `\n\n—\nFrontDesk AI · ${address}\nDon't want to hear from me again? Unsubscribe: ${unsubscribeUrl}`;
}
