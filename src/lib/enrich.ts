import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CONFIG_MODEL } from "./anthropic";
import type { ScrapeResult } from "./scrape";

const EnrichmentSchema = z.object({
  business_name: z.string(),
  city: z.string().nullable(),
  niche: z.string(),
  phone: z.string().nullable(),
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

// Lead Engine step 3: extract business facts + detect the visible gap that
// makes this lead worth a demo. Feeds leads.gap_notes / leads.hook_sentence.
export async function enrichLead(scrape: ScrapeResult): Promise<Enrichment> {
  const prompt = `Analyze this local service business's website text for a sales-qualification pass.

Facts to note: the site ${scrape.hasChatWidget ? "DOES" : "does NOT"} appear to have a live chat widget installed.

Identify:
1. The business name, city, niche (dentist / hvac / med spa / plumber / other), and phone.
2. Visible gaps a prospect would recognize: no chat widget, no after-hours way to get answers, buried hours, no FAQ.
3. A one-sentence personalized outreach hook naming the most compelling specific gap.

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
  return response.parsed_output;
}
