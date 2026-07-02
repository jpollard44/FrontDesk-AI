import { NextRequest } from "next/server";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { sendMorningDigest, type CapturedLeadInfo } from "@/lib/notify";

export const maxDuration = 300;

// Morning digest cron — the retention feature. Every active client with a
// notification email gets a summary of what their assistant handled in the
// last 24 hours. Quiet days send nothing (no-activity email trains owners
// to ignore the digest).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured()) return Response.json({ ok: true, skipped: "no db" });

  const db = supabase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: clients } = await db
    .from("clients")
    .select("id, embed_key, notify_email, config")
    .eq("status", "active")
    .not("notify_email", "is", null);

  let sent = 0;
  let quiet = 0;

  for (const client of clients ?? []) {
    const [{ data: leads }, { count: conversationCount }] = await Promise.all([
      db
        .from("captured_leads")
        .select("name, phone, reason, created_at")
        .eq("client_id", client.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false }),
      db
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id)
        .gte("started_at", since),
    ]);

    const capturedLeads = (leads ?? []) as CapturedLeadInfo[];
    if (!capturedLeads.length && !(conversationCount ?? 0)) {
      quiet += 1;
      continue;
    }

    const businessName =
      (client.config as { business_name?: string } | null)?.business_name ?? "your business";
    const result = await sendMorningDigest({
      to: client.notify_email,
      businessName,
      leads: capturedLeads,
      conversationCount: conversationCount ?? 0,
      dashboardUrl: `${appUrl}/dashboard/${client.embed_key}`,
    });
    if (result.ok) sent += 1;
  }

  return Response.json({ ok: true, sent, quiet, clients: clients?.length ?? 0 });
}
