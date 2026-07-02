/**
 * Discovery CLI — find businesses via Google Places and ingest them (deduped).
 *
 *   npm run discover -- --city "Austin TX" --niche dentist --max 20
 *
 * Requires GOOGLE_PLACES_API_KEY + Supabase env vars.
 */
import { discoverBusinesses } from "../src/lib/growth/discover";
import { ingestBusinesses } from "../src/lib/growth/pipeline";
import { supabaseConfigured } from "../src/lib/supabase";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const city = flag("city");
  const niche = flag("niche");
  const max = Number(flag("max") ?? 20);
  if (!city || !niche) {
    console.error('Usage: npm run discover -- --city "Austin TX" --niche dentist [--max 20]');
    process.exit(1);
  }
  if (!supabaseConfigured()) {
    console.error("Supabase env vars required (leads are stored in the db).");
    process.exit(1);
  }

  console.log(`→ Searching Places API: "${niche} in ${city}" (max ${max}) ...`);
  const found = await discoverBusinesses(city, niche, max);
  console.log(`  found ${found.length} businesses`);

  const { inserted, duplicates } = await ingestBusinesses(found, "places_api");
  console.log(`✅ Ingested ${inserted} new leads (${duplicates} duplicates skipped)`);
  console.log("Next: npm run pipeline");
}

main().catch((err) => {
  console.error("❌", err.message ?? err);
  process.exit(1);
});
