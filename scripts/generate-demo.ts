/**
 * Demo generator CLI — the spec's "first buildable task".
 *
 * Input: one real business URL. Output: a live demo page URL.
 *
 *   npm run generate-demo -- https://smiledentalpasadena.com
 *   npm run generate-demo -- https://smiledentalpasadena.com --name "Smile Dental" --city "Pasadena" --niche dentist
 *
 * With Supabase configured, this creates the lead + demo rows; without it,
 * the generated config is printed so you can inspect quality.
 */
import { scrapeBusinessSite } from "../src/lib/scrape";
import { enrichLead } from "../src/lib/enrich";
import { generateBusinessConfig } from "../src/lib/generate-config";
import { makeSlug } from "../src/lib/config";
import { supabase, supabaseConfigured } from "../src/lib/supabase";

function parseArgs(argv: string[]) {
  const url = argv.find((a) => !a.startsWith("--"));
  const flag = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return { url, name: flag("name"), city: flag("city"), niche: flag("niche"), phone: flag("phone") };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error("Usage: npm run generate-demo -- <business-url> [--name N] [--city C] [--niche X] [--phone P]");
    process.exit(1);
  }

  console.log(`→ Scraping ${args.url} ...`);
  const scrape = await scrapeBusinessSite(args.url);
  console.log(
    `  homepage: ${scrape.homepageText.length} chars, contact page: ${
      scrape.contactPageText ? scrape.contactPageText.length + " chars" : "not found"
    }, chat widget detected: ${scrape.hasChatWidget}`
  );

  console.log("→ Enriching (gap detection + outreach hook) ...");
  const enrichment = await enrichLead(scrape);
  console.log(`  business: ${enrichment.business_name} (${enrichment.niche}${enrichment.city ? ", " + enrichment.city : ""})`);
  console.log(`  gaps: ${enrichment.gap_notes}`);
  console.log(`  hook: ${enrichment.hook_sentence}`);

  console.log("→ Generating bot config ...");
  const config = await generateBusinessConfig(scrape, {
    name: args.name ?? enrichment.business_name,
    city: args.city ?? enrichment.city ?? undefined,
    niche: args.niche ?? enrichment.niche,
    phone: args.phone ?? enrichment.phone ?? undefined,
  });
  console.log(`  ${config.knowledge_base.length} FAQ pairs, ${config.services.length} services`);

  const slug = makeSlug(config.business_name, config.city);

  if (!supabaseConfigured()) {
    console.log("\nSupabase not configured — printing config instead of saving:\n");
    console.log(JSON.stringify(config, null, 2));
    console.log(`\nSlug would be: ${slug}`);
    return;
  }

  const db = supabase();
  const { data: lead, error: leadError } = await db
    .from("leads")
    .insert({
      name: config.business_name,
      website: scrape.url,
      phone: config.phone,
      city: config.city,
      niche: config.niche,
      gap_notes: enrichment.gap_notes,
      hook_sentence: enrichment.hook_sentence,
      status: "demo_built",
      source: "manual",
    })
    .select("id")
    .single();
  if (leadError) throw leadError;

  const { error: demoError } = await db.from("demos").insert({
    lead_id: lead.id,
    slug,
    config,
  });
  if (demoError) throw demoError;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  console.log(`\n✅ Demo ready: ${appUrl}/demo/${slug}`);
  console.log(`   Outreach hook: "${enrichment.hook_sentence}"`);
}

main().catch((err) => {
  console.error("\n❌ Demo generation failed:", err.message ?? err);
  process.exit(1);
});
