/**
 * Outscraper CSV import — for bulk discovery beyond the Places free quota
 * (Outscraper is ~$3/1,000 records pay-as-you-go, no subscription).
 *
 *   npm run import-leads -- export.csv --niche dentist
 *
 * Expects Outscraper's Google Maps export columns; recognized headers:
 * name, site/website, phone, city, rating, reviews, place_id, category/type.
 */
import { readFileSync } from "fs";
import { ingestBusinesses } from "../src/lib/growth/pipeline";
import { parseCsv } from "../src/lib/growth/csv";
import { supabaseConfigured } from "../src/lib/supabase";
import type { DiscoveredBusiness } from "../src/lib/growth/discover";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const nicheOverride = flag("niche");
  if (!file) {
    console.error("Usage: npm run import-leads -- <outscraper-export.csv> [--niche dentist]");
    process.exit(1);
  }
  if (!supabaseConfigured()) {
    console.error("Supabase env vars required.");
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(file, "utf8"));
  if (rows.length < 2) {
    console.error("CSV has no data rows.");
    process.exit(1);
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const cName = col("name");
  const cSite = col("site", "website");
  const cPhone = col("phone", "phone_1");
  const cCity = col("city");
  const cRating = col("rating");
  const cReviews = col("reviews", "reviews_count", "review_count");
  const cPlaceId = col("place_id", "google_id");
  const cNiche = col("category", "type", "niche");
  if (cName < 0) {
    console.error(`No "name" column found. Headers: ${headers.join(", ")}`);
    process.exit(1);
  }

  const businesses: DiscoveredBusiness[] = rows.slice(1).map((r) => ({
    placeId: cPlaceId >= 0 ? r[cPlaceId]?.trim() ?? "" : "",
    name: r[cName]?.trim() ?? "",
    website: cSite >= 0 ? r[cSite]?.trim() || null : null,
    phone: cPhone >= 0 ? r[cPhone]?.trim() || null : null,
    city: cCity >= 0 ? r[cCity]?.trim() ?? "" : "",
    niche: nicheOverride ?? (cNiche >= 0 ? r[cNiche]?.trim() ?? "unknown" : "unknown"),
    rating: cRating >= 0 && r[cRating] ? Number(r[cRating]) || null : null,
    reviewCount: cReviews >= 0 && r[cReviews] ? Number(r[cReviews]) || null : null,
  })).filter((b) => b.name);

  console.log(`→ Importing ${businesses.length} rows from ${file} ...`);
  const { inserted, duplicates } = await ingestBusinesses(businesses, "outscraper_csv");
  console.log(`✅ Ingested ${inserted} new leads (${duplicates} duplicates skipped)`);
  console.log("Next: npm run pipeline");
}

main().catch((err) => {
  console.error("❌", err.message ?? err);
  process.exit(1);
});
