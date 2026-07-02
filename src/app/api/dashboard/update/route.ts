import { NextRequest } from "next/server";
import { z } from "zod";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { BusinessConfigSchema } from "@/lib/config";

const UpdateSchema = z.object({
  key: z.string().min(8),
  notify_email: z.string().email().nullable().optional(),
  widget_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  knowledge_base: z
    .array(z.object({ q: z.string().min(1).max(500), a: z.string().min(1).max(2000) }))
    .max(50)
    .optional(),
});

// Client self-service: edit KB answers, widget color, and where lead alerts
// go. Auth is the embed key itself (magic-link model) — same secret that
// already gates their widget.
export async function POST(req: NextRequest) {
  if (!supabaseConfigured()) return Response.json({ error: "Not configured" }, { status: 503 });

  let parsed;
  try {
    parsed = UpdateSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = supabase();
  const { data: client } = await db
    .from("clients")
    .select("id, config, status")
    .eq("embed_key", parsed.key)
    .maybeSingle();
  if (!client || client.status !== "active") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const config = BusinessConfigSchema.parse(client.config);
  if (parsed.knowledge_base) config.knowledge_base = parsed.knowledge_base;
  if (parsed.widget_color) config.widget_color = parsed.widget_color;

  const update: Record<string, unknown> = {
    config,
    updated_at: new Date().toISOString(),
  };
  if (parsed.notify_email !== undefined) update.notify_email = parsed.notify_email;

  const { error } = await db.from("clients").update(update).eq("id", client.id);
  if (error) {
    console.error("dashboard update failed", error);
    return Response.json({ error: "Could not save" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
