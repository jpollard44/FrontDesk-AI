import { z } from "zod";

// The per-business config that powers both demo and production bots.
// One codebase, per-client config — this is the whole product.
export const BusinessConfigSchema = z.object({
  business_name: z.string(),
  niche: z.string().describe("Business category, e.g. dentist, hvac, med spa, plumber"),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  tone: z
    .string()
    .describe("One sentence describing the voice of the assistant, derived from the business's own site copy"),
  hours: z
    .array(z.object({ days: z.string(), hours: z.string() }))
    .describe("Business hours, e.g. [{days: 'Mon-Fri', hours: '8am-5pm'}]"),
  services: z.array(z.string()),
  knowledge_base: z
    .array(z.object({ q: z.string(), a: z.string() }))
    .describe("FAQ pairs the assistant may answer from. Only include facts found on the business's site."),
  insurance_payment: z
    .array(z.string())
    .describe("Accepted insurance plans / payment options, only if stated on their site"),
  escalation_message: z
    .string()
    .describe("What the bot says when it doesn't know the answer"),
  suggested_questions: z
    .array(z.string())
    .describe("3 questions a visitor is likely to ask, used as chat starters"),
  widget_color: z.string().describe("Hex accent color, e.g. #2563eb"),
});

export type BusinessConfig = z.infer<typeof BusinessConfigSchema>;

export const LEAD_CAPTURE_FIELDS = ["name", "phone", "reason"] as const;

/**
 * Builds the runtime system prompt for a business's assistant.
 * Guardrails here are non-negotiable and apply to every generated bot:
 * no medical/legal/financial advice, no invented prices or availability,
 * never claims to be human staff (California bot-disclosure law).
 */
export function buildSystemPrompt(config: BusinessConfig): string {
  const hours = config.hours.map((h) => `${h.days}: ${h.hours}`).join("\n");
  const kb = config.knowledge_base.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
  const services = config.services.join(", ");
  const insurance = config.insurance_payment.length
    ? config.insurance_payment.join(", ")
    : "Not listed — use the escalation message if asked.";

  return `You are the AI receptionist for ${config.business_name}${config.city ? ` in ${config.city}` : ""}, a ${config.niche} business. You chat with website visitors 24/7, answering questions about the business and helping them get in touch.

Voice: ${config.tone}

## Business facts (your ONLY source of truth)

Hours:
${hours || "Not listed."}

Services: ${services || "Not listed."}

Insurance / payment: ${insurance}

Phone: ${config.phone ?? "Not listed."}

FAQ:
${kb || "None."}

## Hard rules — never break these

1. You are an AI assistant, not a human. If asked, say so plainly. Never claim to be the business's staff.
2. Never give medical, dental, legal, or financial advice. For any clinical or "should I…" health question, say: "That's a great question for the team — please call the office${config.phone ? ` at ${config.phone}` : ""}."
3. Only state facts that appear in the business facts above. Never invent prices, availability, appointment slots, or insurance coverage determinations. If you don't know, say: "${config.escalation_message}"
4. When you can't answer, or the visitor wants to be contacted, offer to take their name, phone number, and reason for contacting — the team will follow up. Encourage this warmly; captured contact details are how the business helps them.
5. Keep replies short and friendly — 1-3 sentences. This is a chat widget, not email.
6. Stay on topic: this business and its services. Politely decline anything unrelated.`;
}

export function makeSlug(businessName: string, city?: string | null): string {
  return [businessName, city ?? ""]
    .join(" ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}
