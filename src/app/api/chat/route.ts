import { NextRequest } from "next/server";
import { anthropic, CHAT_MODEL } from "@/lib/anthropic";
import { buildSystemPrompt, BusinessConfigSchema, type BusinessConfig } from "@/lib/config";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { SAMPLE_CONFIG, SAMPLE_SLUG } from "@/lib/sample-demo";
import {
  checkRateLimit,
  CLIENT_VISITOR_LIMIT,
  DEMO_TOTAL_LIMIT,
  DEMO_VISITOR_LIMIT,
} from "@/lib/rate-limit";

export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  slug?: string; // demo mode
  embedKey?: string; // production widget mode
  messages: ChatMessage[];
}

const MAX_HISTORY = 30;
const MAX_MESSAGE_CHARS = 2000;

async function resolveConfig(
  body: ChatRequest
): Promise<{ config: BusinessConfig; demoId?: string; clientId?: string } | { error: string; status: number }> {
  if (body.embedKey) {
    if (!supabaseConfigured()) return { error: "Not configured", status: 500 };
    const { data } = await supabase()
      .from("clients")
      .select("id, config, status")
      .eq("embed_key", body.embedKey)
      .maybeSingle();
    if (!data || data.status !== "active") return { error: "Unknown widget", status: 404 };
    return { config: BusinessConfigSchema.parse(data.config), clientId: data.id };
  }

  if (body.slug) {
    if (!supabaseConfigured()) {
      if (body.slug === SAMPLE_SLUG) return { config: SAMPLE_CONFIG };
      return { error: "Demo not found", status: 404 };
    }
    const { data } = await supabase()
      .from("demos")
      .select("id, config, expires_at, message_count")
      .eq("slug", body.slug)
      .maybeSingle();
    if (!data) {
      if (body.slug === SAMPLE_SLUG) return { config: SAMPLE_CONFIG };
      return { error: "Demo not found", status: 404 };
    }
    if (new Date(data.expires_at) < new Date()) {
      return { error: "This demo has expired", status: 410 };
    }
    if (data.message_count >= DEMO_TOTAL_LIMIT) {
      return { error: "This demo has reached its message limit", status: 429 };
    }
    return { config: BusinessConfigSchema.parse(data.config), demoId: data.id };
  }

  return { error: "Missing slug or embedKey", status: 400 };
}

export async function POST(req: NextRequest) {
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages required" }, { status: 400 });
  }

  const resolved = await resolveConfig(body);
  if ("error" in resolved) {
    return Response.json({ error: resolved.error }, { status: resolved.status });
  }
  const { config, demoId, clientId } = resolved;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limitKey = `${ip}:${body.slug ?? body.embedKey}`;
  const perVisitorLimit = demoId || !clientId ? DEMO_VISITOR_LIMIT : CLIENT_VISITOR_LIMIT;
  if (!checkRateLimit(limitKey, perVisitorLimit)) {
    return Response.json(
      { error: "Message limit reached — leave your contact details and the team will follow up!" },
      { status: 429 }
    );
  }

  const history = body.messages
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: String(m.content).slice(0, MAX_MESSAGE_CHARS),
    }));

  const stream = anthropic().messages.stream({
    model: CHAT_MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: buildSystemPrompt(config),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: history,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        const reply = final.content
          .filter((b): b is Extract<(typeof final.content)[number], { type: "text" }> => b.type === "text")
          .map((b) => b.text)
          .join("");
        await logConversation({ demoId, clientId, history, reply });
      } catch (err) {
        controller.error(err);
        return;
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function logConversation(args: {
  demoId?: string;
  clientId?: string;
  history: ChatMessage[];
  reply: string;
}) {
  if (!supabaseConfigured() || (!args.demoId && !args.clientId)) return;
  const messages = [...args.history, { role: "assistant", content: args.reply }].map((m) => ({
    ...m,
    at: new Date().toISOString(),
  }));
  try {
    const db = supabase();
    await db.from("conversations").insert({
      demo_id: args.demoId ?? null,
      client_id: args.clientId ?? null,
      messages,
    });
    if (args.demoId) {
      // Engagement signal: a lead playing with their demo is the hottest lead.
      const { data } = await db.from("demos").select("message_count").eq("id", args.demoId).single();
      await db
        .from("demos")
        .update({
          message_count: (data?.message_count ?? 0) + 1,
          last_visited_at: new Date().toISOString(),
        })
        .eq("id", args.demoId);
    }
  } catch (err) {
    console.error("conversation logging failed", err);
  }
}
