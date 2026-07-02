import { NextRequest } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { discoverBusinesses, parseGrowthTargets } from "@/lib/growth/discover";
import { ingestBusinesses, processNewLeads } from "@/lib/growth/pipeline";

export const maxDuration = 300;

// Daily growth cron (replaces the n8n discovery + enrichment loops):
// 1. Discover businesses for each GROWTH_TARGETS city:niche pair.
// 2. Run a bounded batch of sourced leads through enrich → score → demo →
//    sequence. The batch cap bounds daily Claude spend.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured()) return Response.json({ ok: true, skipped: "no db" });

  const summary: Record<string, unknown> = {};

  const targets = parseGrowthTargets(process.env.GROWTH_TARGETS);
  if (targets.length && process.env.GOOGLE_PLACES_API_KEY) {
    const perTarget = Number(process.env.GROWTH_DISCOVER_PER_TARGET ?? 20);
    let inserted = 0;
    let duplicates = 0;
    for (const target of targets) {
      try {
        const found = await discoverBusinesses(target.city, target.niche, perTarget);
        const result = await ingestBusinesses(found, "places_api");
        inserted += result.inserted;
        duplicates += result.duplicates;
      } catch (err) {
        console.error(`discovery failed for ${target.niche} in ${target.city}`, err);
      }
    }
    summary.discovery = { inserted, duplicates };
  } else {
    summary.discovery = "skipped (set GROWTH_TARGETS + GOOGLE_PLACES_API_KEY)";
  }

  const batch = Number(process.env.GROWTH_PIPELINE_BATCH ?? 15);
  const results = await processNewLeads(batch);
  summary.pipeline = {
    processed: results.length,
    queued: results.filter((r) => r.outcome === "queued").length,
    parked: results.filter((r) => r.outcome === "parked").length,
    disqualified: results.filter((r) => r.outcome === "disqualified").length,
    errors: results.filter((r) => r.outcome === "error").length,
  };

  return Response.json({ ok: true, ...summary });
}
