import { sendEmail, type SendResult } from "./growth/mailer";

// Transactional email to paying clients (lead alerts, digests, day-1).
// Sent from the primary domain (NOTIFY_FROM_EMAIL), never the cold-outreach
// domain — mixing the two would tie client deliverability to outreach
// reputation.

function notifyFrom(): string | undefined {
  return process.env.NOTIFY_FROM_EMAIL ?? process.env.OUTREACH_FROM_EMAIL;
}

export interface CapturedLeadInfo {
  name: string;
  phone: string;
  reason: string | null;
  created_at?: string;
}

export async function sendInstantLeadAlert(args: {
  to: string;
  businessName: string;
  lead: CapturedLeadInfo;
  dashboardUrl: string;
}): Promise<SendResult> {
  const { lead } = args;
  return sendEmail({
    to: args.to,
    from: notifyFrom(),
    subject: `New lead from your website: ${lead.name}`,
    text: `Your FrontDesk AI assistant just captured a lead on the ${args.businessName} website:

Name:   ${lead.name}
Phone:  ${lead.phone}
Reason: ${lead.reason ?? "(not given)"}

They're expecting a call back — reaching out within the hour dramatically improves conversion.

All captured leads and conversations: ${args.dashboardUrl}

— FrontDesk AI`,
  });
}

export async function sendMorningDigest(args: {
  to: string;
  businessName: string;
  leads: CapturedLeadInfo[];
  conversationCount: number;
  dashboardUrl: string;
}): Promise<SendResult> {
  const leadLines = args.leads
    .map((l) => `• ${l.name} — ${l.phone}${l.reason ? ` — "${l.reason}"` : ""}`)
    .join("\n");

  return sendEmail({
    to: args.to,
    from: notifyFrom(),
    subject: `${args.businessName}: ${args.leads.length} lead${args.leads.length === 1 ? "" : "s"} captured yesterday`,
    text: `Good morning! Here's what your FrontDesk AI assistant handled in the last 24 hours for ${args.businessName}:

Conversations answered: ${args.conversationCount}
Leads captured: ${args.leads.length}
${leadLines ? `\n${leadLines}\n` : ""}
Follow up with these folks today while the inquiry is still warm.

Full details: ${args.dashboardUrl}

— FrontDesk AI`,
  });
}

export async function sendDayOneEmail(args: {
  to: string;
  businessName: string;
  embedKey: string;
  appUrl: string;
}): Promise<SendResult> {
  const snippet = `<script src="${args.appUrl}/embed.js" data-client="${args.embedKey}" async></script>`;
  const dashboardUrl = `${args.appUrl}/dashboard/${args.embedKey}`;

  return sendEmail({
    to: args.to,
    from: notifyFrom(),
    subject: `Your AI receptionist for ${args.businessName} is ready to install`,
    text: `Welcome aboard! Your FrontDesk AI assistant for ${args.businessName} is live and ready to go on your website.

INSTALL (2 minutes)
Paste this single line into your website's HTML, just before the closing </body> tag:

${snippet}

Not the technical type? Forward this email to whoever manages your website with the note: "Please add this script tag to our site." That's all they need.

YOUR DASHBOARD
See every conversation and captured lead, edit your assistant's answers, and manage billing here:
${dashboardUrl}
(Keep this link private — it's your access key.)

WHAT HAPPENS NEXT
- The chat bubble appears on your site as soon as the script is added.
- When a visitor wants a callback, you get an instant email with their details.
- Every morning you'll get a summary of what your assistant handled overnight.

Questions? Just reply to this email.

— FrontDesk AI`,
  });
}
