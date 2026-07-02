import { NextRequest } from "next/server";
import { supabase, supabaseConfigured } from "@/lib/supabase";

// Vercel cron: nightly demo-expiry cleanup. Expired demos already refuse
// chat traffic; this prunes rows past a 30-day grace window so engagement
// data sticks around long enough for the sales funnel to use it.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured()) return Response.json({ ok: true, skipped: "no db" });

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await supabase()
    .from("demos")
    .delete({ count: "exact" })
    .lt("expires_at", cutoff);

  if (error) {
    console.error("cleanup failed", error);
    return Response.json({ error: "cleanup failed" }, { status: 500 });
  }
  return Response.json({ ok: true, deleted: count ?? 0 });
}
