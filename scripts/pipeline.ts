/**
 * Pipeline CLI — run sourced leads through enrich → score → demo → sequence.
 *
 *   npm run pipeline            # process up to 10 sourced leads
 *   npm run pipeline -- --max 25
 *
 * Each qualified lead ends with a live demo page and a queued 5-touch email
 * sequence. Sending happens via the outreach cron (or stays dry-run until
 * RESEND_API_KEY + OUTREACH_FROM_EMAIL are set).
 */
import { processNewLeads } from "../src/lib/growth/pipeline";
import { supabaseConfigured } from "../src/lib/supabase";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!supabaseConfigured()) {
    console.error("Supabase env vars required.");
    process.exit(1);
  }
  const max = Number(flag("max") ?? 10);

  console.log(`→ Processing up to ${max} sourced leads ...\n`);
  const results = await processNewLeads(max);
  if (!results.length) {
    console.log("No sourced leads to process. Run discover/import-leads first.");
    return;
  }

  for (const r of results) {
    const score = r.score != null ? ` [score ${r.score}]` : "";
    switch (r.outcome) {
      case "queued":
        console.log(`✅ ${r.name}${score} → demo + sequence queued: ${r.demoUrl}`);
        break;
      case "parked":
        console.log(`⏸  ${r.name}${score} parked (below threshold): ${r.detail}`);
        break;
      case "disqualified":
        console.log(`🚫 ${r.name}${score} disqualified — ${r.detail}`);
        break;
      case "no_email":
        console.log(`📵 ${r.name}${score} qualified but no email found (phone-only candidate)`);
        break;
      case "no_website":
        console.log(`—  ${r.name} skipped: no website`);
        break;
      case "error":
        console.log(`❌ ${r.name} failed: ${r.detail}`);
        break;
    }
  }

  const queued = results.filter((r) => r.outcome === "queued").length;
  console.log(`\nDone: ${queued}/${results.length} queued for outreach.`);
  console.log("QA each demo before the first touch goes out — it protects reply rates and churn.");
}

main().catch((err) => {
  console.error("❌", err.message ?? err);
  process.exit(1);
});
