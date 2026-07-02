import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CONFIG_MODEL } from "../anthropic";
import type { Enrichment } from "../enrich";

// One Claude call writes the entire 5-touch / 14-day sequence up front,
// grounded in the lead's real gaps and pointing at THEIR personalized demo —
// the demo link is the whole pitch, not a generic case-study blast.

const TouchSchema = z.object({
  day: z.number().describe("Send day offset: 1, 3, 7, 10, or 14"),
  subject: z.string().describe("Subject line, under 60 chars, no clickbait"),
  body: z
    .string()
    .describe(
      "Plain-text email body, 60-130 words, ending with the signature placeholder {{signature}}"
    ),
});

const SequenceSchema = z.object({
  touches: z.array(TouchSchema).describe("Exactly 5 touches on days 1, 3, 7, 10, 14"),
  phone_hook: z
    .string()
    .describe("A 1-2 sentence opener for a future phone follow-up call"),
});

export type GeneratedSequence = z.infer<typeof SequenceSchema>;

export const TOUCH_DAYS = [1, 3, 7, 10, 14];

export async function generateSequence(args: {
  enrichment: Enrichment;
  demoUrl: string;
  reviewCount?: number | null;
  rating?: number | null;
}): Promise<GeneratedSequence> {
  const { enrichment } = args;
  const prompt = `Write a 5-touch cold email sequence (days 1, 3, 7, 10, 14) for FrontDesk AI — a $150/month AI receptionist that answers a local business's website visitors 24/7 and captures after-hours leads. No contract, cancel anytime, live in a day.

The prospect:
- Business: ${enrichment.business_name} (${enrichment.niche}${enrichment.city ? ", " + enrichment.city : ""})
- Contact: ${enrichment.owner_name ?? "unknown — write to the owner without using a name"}
- Their observed gaps: ${enrichment.gap_notes}
- Personalized hook: ${enrichment.hook_sentence}
- Reviews: ${args.reviewCount ?? "unknown"} reviews${args.rating ? `, ${args.rating} stars` : ""}

The centerpiece: we already built them a WORKING demo loaded with their own hours, services, and info. Demo link: ${args.demoUrl}

Sequence structure:
- Day 1: the hook + demo link ("I built this for you — try asking it anything").
- Day 3: a different angle on their specific pain (after-hours calls, staff interruptions) + demo link.
- Day 7: cost framing (missed inquiries vs $150/mo, less than one lost customer) + demo link.
- Day 10: reduce friction (5-minute setup, no contract, we handle everything) + demo link.
- Day 14: polite breakup ("last note from me — the demo stays live a few more days").

Rules:
- Plain-spoken, specific, zero marketing fluff. Reference THEIR gaps, not generic stats.
- Do NOT invent statistics, case studies, customer counts, or dollar figures about results we haven't achieved. Frame value honestly (e.g. "one missed customer likely costs more than a month of this").
- Each body 60-130 words, ends with {{signature}}.
- Greet with the contact's name if known, else a natural no-name greeting.
- Subject lines under 60 characters, lowercase-casual is fine, no clickbait or ALL CAPS.
- Every touch includes the demo link once.`;

  const response = await anthropic().messages.parse({
    model: CONFIG_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(SequenceSchema) },
  });

  if (!response.parsed_output) throw new Error("Sequence generation returned no parseable output");
  const sequence = response.parsed_output;
  // Normalize day offsets in case the model drifted.
  sequence.touches = sequence.touches
    .slice(0, 5)
    .map((t, i) => ({ ...t, day: TOUCH_DAYS[i] ?? t.day }));
  return sequence;
}
