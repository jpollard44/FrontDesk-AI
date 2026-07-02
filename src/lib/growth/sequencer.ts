import { randomBytes } from "crypto";
import { supabase } from "../supabase";
import { normalizeEmail } from "./normalize";
import { complianceFooter, sendEmail } from "./mailer";
import { TOUCH_DAYS, type GeneratedSequence } from "./pitch";

// The in-house sequence engine (replaces a sequencer SaaS for early volume):
// sequences are generated up front, stored in Supabase, and drained by the
// outreach cron inside a send window with a global daily cap.

const SEND_WINDOW_START_H = 9; // send between 9am and 4pm server time
const SEND_WINDOW_END_H = 16;

function dailyCap(): number {
  return Number(process.env.OUTREACH_DAILY_CAP ?? 30);
}

export async function createSequence(args: {
  leadId: string;
  demoSlug: string | null;
  sequence: GeneratedSequence;
}): Promise<void> {
  const db = supabase();
  const { error } = await db.from("sequences").insert({
    lead_id: args.leadId,
    demo_slug: args.demoSlug,
    touches: args.sequence.touches,
    current_step: 0,
    // First touch is eligible immediately; the cron enforces the send window.
    next_send_at: new Date().toISOString(),
    status: "ready",
    unsubscribe_token: randomBytes(16).toString("hex"),
  });
  if (error) throw error;
}

export async function isSuppressed(email: string): Promise<boolean> {
  const emailLower = normalizeEmail(email);
  if (!emailLower) return true;
  const { data } = await supabase()
    .from("suppression_list")
    .select("email_lower")
    .eq("email_lower", emailLower)
    .maybeSingle();
  return Boolean(data);
}

export async function suppress(email: string, reason: string): Promise<void> {
  const emailLower = normalizeEmail(email);
  if (!emailLower) return;
  await supabase()
    .from("suppression_list")
    .upsert({ email_lower: emailLower, reason }, { onConflict: "email_lower" });
}

interface DueSequence {
  id: string;
  lead_id: string;
  touches: Array<{ day: number; subject: string; body: string }>;
  current_step: number;
  status: string;
  unsubscribe_token: string;
}

/** Sends every due touch (bounded by the daily cap). Returns a run summary. */
export async function runOutreach(): Promise<{ sent: number; skipped: number; errors: number }> {
  const summary = { sent: 0, skipped: 0, errors: 0 };

  const hour = new Date().getHours();
  if (hour < SEND_WINDOW_START_H || hour >= SEND_WINDOW_END_H) return summary;

  const db = supabase();
  const { data: due } = await db
    .from("sequences")
    .select("id, lead_id, touches, current_step, status, unsubscribe_token")
    .in("status", ["ready", "active"])
    .lte("next_send_at", new Date().toISOString())
    .order("next_send_at", { ascending: true })
    .limit(dailyCap());

  for (const seq of (due ?? []) as DueSequence[]) {
    try {
      const outcome = await sendTouch(seq);
      summary[outcome] += 1;
    } catch (err) {
      console.error(`sequence ${seq.id} failed`, err);
      summary.errors += 1;
    }
  }
  return summary;
}

async function sendTouch(seq: DueSequence): Promise<"sent" | "skipped"> {
  const db = supabase();
  const touch = seq.touches[seq.current_step];
  if (!touch) {
    await db.from("sequences").update({ status: "completed" }).eq("id", seq.id);
    return "skipped";
  }

  const { data: lead } = await db
    .from("leads")
    .select("id, email, name, status, contact_name")
    .eq("id", seq.lead_id)
    .single();

  // Stop conditions: no email, converted, dead, or suppressed.
  if (!lead?.email || lead.status === "client" || lead.status === "dead") {
    await db.from("sequences").update({ status: "stopped" }).eq("id", seq.id);
    return "skipped";
  }
  if (await isSuppressed(lead.email)) {
    await db.from("sequences").update({ status: "suppressed" }).eq("id", seq.id);
    return "skipped";
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const unsubscribeUrl = `${appUrl}/api/unsubscribe?token=${seq.unsubscribe_token}`;
  const signature = process.env.OUTREACH_SIGNATURE ?? "— The FrontDesk AI team";
  const body =
    touch.body.replace(/\{\{signature\}\}/g, signature) + complianceFooter(unsubscribeUrl);

  const result = await sendEmail({ to: lead.email, subject: touch.subject, text: body });
  if (!result.ok) {
    console.error(`send failed for sequence ${seq.id}: ${result.error}`);
    return "skipped";
  }

  const nextStep = seq.current_step + 1;
  const isLast = nextStep >= seq.touches.length;
  const currentDay = TOUCH_DAYS[seq.current_step] ?? 0;
  const nextDay = TOUCH_DAYS[nextStep] ?? currentDay;
  const gapMs = Math.max(nextDay - currentDay, 1) * 24 * 60 * 60 * 1000;

  await db
    .from("sequences")
    .update({
      current_step: nextStep,
      status: isLast ? "completed" : "active",
      next_send_at: isLast ? null : new Date(Date.now() + gapMs).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", seq.id);

  await db.from("outreach_log").insert({
    lead_id: seq.lead_id,
    channel: "email",
    template_id: `touch-${seq.current_step + 1}`,
  });
  if (lead.status === "demo_built" || lead.status === "enriched") {
    await db.from("leads").update({ status: "contacted" }).eq("id", seq.lead_id);
  }

  return "sent";
}
