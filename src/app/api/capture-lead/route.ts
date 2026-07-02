import { NextRequest } from "next/server";
import { z } from "zod";
import { supabase, supabaseConfigured } from "@/lib/supabase";

const CaptureSchema = z.object({
  slug: z.string().optional(),
  embedKey: z.string().optional(),
  name: z.string().min(1).max(200),
  phone: z.string().min(7).max(40),
  reason: z.string().max(1000).optional(),
});

// The retention feature: every captured lead is a line item in the monthly
// "your assistant captured N leads" email that keeps clients subscribed.
export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = CaptureSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!supabaseConfigured()) {
    // Dev mode without a database — accept and log so the UI flow works.
    console.log("captured lead (no db):", parsed);
    return Response.json({ ok: true });
  }

  const db = supabase();
  let demoId: string | null = null;
  let clientId: string | null = null;

  if (parsed.embedKey) {
    const { data } = await db.from("clients").select("id").eq("embed_key", parsed.embedKey).maybeSingle();
    clientId = data?.id ?? null;
  } else if (parsed.slug) {
    const { data } = await db.from("demos").select("id").eq("slug", parsed.slug).maybeSingle();
    demoId = data?.id ?? null;
  }
  if (!demoId && !clientId) {
    return Response.json({ error: "Unknown widget" }, { status: 404 });
  }

  const { error } = await db.from("captured_leads").insert({
    demo_id: demoId,
    client_id: clientId,
    name: parsed.name,
    phone: parsed.phone,
    reason: parsed.reason ?? null,
  });
  if (error) {
    console.error("capture-lead insert failed", error);
    return Response.json({ error: "Could not save" }, { status: 500 });
  }

  // TODO(week 3): instant/morning-digest email to clients.notify_email.
  return Response.json({ ok: true });
}
