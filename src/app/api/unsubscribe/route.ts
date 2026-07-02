import { NextRequest } from "next/server";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { suppress } from "@/lib/growth/sequencer";

// CAN-SPAM one-click unsubscribe. Suppresses the email permanently and stops
// the sequence immediately — honored on the very next send attempt.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || !supabaseConfigured()) {
    return new Response("Invalid unsubscribe link.", { status: 400 });
  }

  const db = supabase();
  const { data: seq } = await db
    .from("sequences")
    .select("id, lead_id")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (!seq) return new Response("Invalid unsubscribe link.", { status: 404 });

  await db.from("sequences").update({ status: "suppressed" }).eq("id", seq.id);

  const { data: lead } = await db
    .from("leads")
    .select("email")
    .eq("id", seq.lead_id)
    .maybeSingle();
  if (lead?.email) await suppress(lead.email, "unsubscribed");
  await db.from("leads").update({ status: "dead" }).eq("id", seq.lead_id);
  await db
    .from("outreach_log")
    .update({ opted_out: true })
    .eq("lead_id", seq.lead_id);

  return new Response(
    "<html><body style='font-family:sans-serif;text-align:center;padding-top:80px'><h2>You're unsubscribed.</h2><p>You won't hear from us again. Sorry for the interruption.</p></body></html>",
    { headers: { "Content-Type": "text/html" } }
  );
}
