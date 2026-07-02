import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CONFIG_MODEL } from "./anthropic";
import { BusinessConfigSchema, type BusinessConfig } from "./config";
import type { ScrapeResult } from "./scrape";

// The demo generator's core: scraped site text in, per-business bot config out.
// This is the single highest-leverage artifact in the product.
export async function generateBusinessConfig(
  scrape: ScrapeResult,
  hints?: { name?: string; city?: string; niche?: string; phone?: string }
): Promise<BusinessConfig> {
  const prompt = `You are configuring an AI receptionist for a local service business, using ONLY the text scraped from their website below. Extract real facts — do not invent hours, prices, services, or insurance information that isn't in the text. If something isn't stated, leave it out (empty array) or null.

Guidance:
- tone: infer from their own copy (formal vs. friendly, family-oriented, upscale, etc.) in one sentence.
- knowledge_base: 8-15 Q&A pairs a real visitor would ask, answered strictly from the site text. Include hours, location/parking, services, new-patient/new-customer process, insurance/payment — whatever the text supports.
- escalation_message: a warm one-liner for when the bot doesn't know, pointing to the phone number if available.
- suggested_questions: the 3 questions this business's visitors most likely ask, phrased casually, answerable from the knowledge base.
- widget_color: pick a professional hex color fitting the niche.
${hints?.name ? `\nKnown business name: ${hints.name}` : ""}${hints?.city ? `\nKnown city: ${hints.city}` : ""}${hints?.niche ? `\nKnown niche: ${hints.niche}` : ""}${hints?.phone ? `\nKnown phone: ${hints.phone}` : ""}

Website URL: ${scrape.url}

=== HOMEPAGE TEXT ===
${scrape.homepageText}
${scrape.contactPageText ? `\n=== CONTACT PAGE TEXT ===\n${scrape.contactPageText}` : ""}`;

  const response = await anthropic().messages.parse({
    model: CONFIG_MODEL,
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(BusinessConfigSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Config generation returned no parseable output");
  }
  return response.parsed_output;
}
