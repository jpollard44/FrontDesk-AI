import { NextRequest } from "next/server";
import { z } from "zod";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { sendInstantLeadAlert } from "@/lib/notify";

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
  let clientNotify: { email: string; businessName: string } | null = null;

  if (parsed.embedKey) {
    const { data } = await db
      .from("clients")
      .select("id, notify_email, config")
      .eq("embed_key", parsed.embedKey)
      .maybeSingle();
    clientId = data?.id ?? null;
    if (data?.notify_email) {
      clientNotify = {
        email: data.notify_email,
        businessName:
          (data.config as { business_name?: string } | null)?.business_name ?? "your business",
      };
    }
  } else if (parsed.slug) {
    const { data } = await db.from("demos").select("id").eq("slug", parsed.slug).maybeSingle();
    demoId = data?.id ?? null;
  }
  if (!demoId && !clientId) {
    return Response.json({ error: "Unknown widget" }, { status: 404 });
  }

  const { data: inserted, error } = await db
    .from("captured_leads")
    .insert({
      demo_id: demoId,
      client_id: clientId,
      name: parsed.name,
      phone: parsed.phone,
      reason: parsed.reason ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("capture-lead insert failed", error);
    return Response.json({ error: "Could not save" }, { status: 500 });
  }

  // The product promise: the owner hears about the lead immediately.
  if (clientNotify && parsed.embedKey) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const result = await sendInstantLeadAlert({
      to: clientNotify.email,
      businessName: clientNotify.businessName,
      lead: { name: parsed.name, phone: parsed.phone, reason: parsed.reason ?? null },
      dashboardUrl: `${appUrl}/dashboard/${parsed.embedKey}`,
    });
    if (result.ok && !result.dryRun) {
      await db
        .from("captured_leads")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", inserted.id);
    }
  }

  return Response.json({ ok: true });
}
