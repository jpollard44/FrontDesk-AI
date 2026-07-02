import { NextRequest } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { runOutreach } from "@/lib/growth/sequencer";

export const maxDuration = 300;

// Hourly outreach cron: drains due sequence touches inside the send window,
// bounded by OUTREACH_DAILY_CAP. Suppression list is checked on every send.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured()) return Response.json({ ok: true, skipped: "no db" });

  const summary = await runOutreach();
  return Response.json({ ok: true, ...summary });
}
