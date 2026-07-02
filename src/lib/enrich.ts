import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CONFIG_MODEL } from "./anthropic";
import type { ScrapeResult } from "./scrape";

const EnrichmentSchema = z.object({
  business_name: z.string(),
  city: z.string().nullable(),
  niche: z.string(),
  phone: z.string().nullable(),
  owner_name: z
    .string()
    .nullable()
    .describe("Owner / practice manager name if visible on the site (e.g. 'Dr. Maria Martinez'), else null"),
  best_email: z
    .string()
    .nullable()
    .describe(
      "The best outreach email chosen ONLY from the candidate list provided (prefer a personal address over info@/contact@), or null if the list is empty"
    ),
  gap_notes: z
    .string()
    .describe(
      "Visible gaps: no chat widget, no after-hours contact option, no online booking, hours hard to find, etc."
    ),
  hook_sentence: z
    .string()
    .describe(
      "One personalized outreach sentence naming a specific observed gap, e.g. 'your site has no way for patients to get answers after 5pm'"
    ),
});

export type Enrichment = z.infer<typeof EnrichmentSchema>;

// Lead Engine enrichment: extract business facts, the decision-maker if
// visible, the best contact email from scraped candidates, and the visible
// gap that makes this lead worth a demo. In-house replacement for
// Apollo/Hunter enrichment on local SMBs (their emails usually live on the
// site itself; personal addresses beat generic info@ when present).
export async function enrichLead(scrape: ScrapeResult): Promise<Enrichment> {
  const prompt = `Analyze this local service business's website text for a sales-qualification pass.

Deterministic facts already detected:
- Live chat widget installed: ${scrape.hasChatWidget ? "YES" : "NO"}
- Existing AI receptionist / answering vendor detected: ${scrape.competitor ?? "none"}
- Candidate emails found in the site HTML: ${scrape.emails.length ? scrape.emails.join(", ") : "(none)"}

Identify:
1. The business name, city, niche (dentist / hvac / med spa / plumber / law firm / salon / other), and phone.
2. The owner or practice manager's name, if visible anywhere in the text.
3. best_email: pick the single best outreach address FROM THE CANDIDATE LIST ONLY (personal beats generic like info@); null if the list is empty. Never invent an email.
4. Visible gaps a prospect would recognize: no chat widget, no after-hours way to get answers, buried hours, no FAQ, no online booking.
5. A one-sentence personalized outreach hook naming the most compelling specific gap.

Website URL: ${scrape.url}

=== HOMEPAGE TEXT ===
${scrape.homepageText}
${scrape.contactPageText ? `\n=== CONTACT PAGE TEXT ===\n${scrape.contactPageText}` : ""}`;

  const response = await anthropic().messages.parse({
    model: CONFIG_MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(EnrichmentSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Enrichment returned no parseable output");
  }
  const enrichment = response.parsed_output;
  // Belt and suspenders: the chosen email must come from the scraped set.
  if (enrichment.best_email && !scrape.emails.includes(enrichment.best_email.toLowerCase())) {
    enrichment.best_email = scrape.emails[0] ?? null;
  }
  return enrichment;
}
