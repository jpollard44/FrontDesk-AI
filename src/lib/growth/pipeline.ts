import { supabase } from "../supabase";
import { scrapeBusinessSite } from "../scrape";
import { enrichLead } from "../enrich";
import { generateBusinessConfig } from "../generate-config";
import { makeSlug } from "../config";
import { normalizeBusinessName, normalizeEmail, normalizePhone } from "./normalize";
import { scoreLead, QUALIFICATION_THRESHOLD } from "./score";
import { generateSequence } from "./pitch";
import { createSequence, isSuppressed } from "./sequencer";
import type { DiscoveredBusiness } from "./discover";

// The in-house replacement for the n8n discovery + enrichment + outreach
// pipeline: ingest (dedup) → enrich (Claude) → score (deterministic) →
// build demo (Claude) → write sequence (Claude) → queue for the send cron.

export interface IngestSummary {
  inserted: number;
  duplicates: number;
}

/** Dedup-safe insert of discovered businesses into leads (status: sourced). */
export async function ingestBusinesses(
  businesses: DiscoveredBusiness[],
  source: string
): Promise<IngestSummary> {
  const db = supabase();
  const summary: IngestSummary = { inserted: 0, duplicates: 0 };

  for (const biz of businesses) {
    const phoneNorm = normalizePhone(biz.phone);
    const nameNorm = normalizeBusinessName(biz.name);

    // Dedup order per design: place_id → phone → business name + city.
    let query = db.from("leads").select("id").limit(1);
    const checks: string[] = [];
    if (biz.placeId) checks.push(`place_id.eq.${biz.placeId}`);
    if (phoneNorm) checks.push(`phone_normalized.eq.${phoneNorm}`);
    if (checks.length) {
      const { data: existing } = await query.or(checks.join(","));
      if (existing?.length) {
        summary.duplicates += 1;
        continue;
      }
    }
    if (nameNorm && biz.city) {
      const { data: existing } = await db
        .from("leads")
        .select("id")
        .eq("name_normalized", nameNorm)
        .eq("city", biz.city)
        .limit(1);
      if (existing?.length) {
        summary.duplicates += 1;
        continue;
      }
    }

    const { error } = await db.from("leads").insert({
      name: biz.name,
      website: biz.website,
      phone: biz.phone,
      city: biz.city,
      niche: biz.niche,
      review_count: biz.reviewCount,
      rating: biz.rating,
      status: "sourced",
      source,
      place_id: biz.placeId || null,
      phone_normalized: phoneNorm,
      name_normalized: nameNorm,
    });
    if (error) {
      // Unique-index race → still a duplicate, not a failure.
      summary.duplicates += 1;
    } else {
      summary.inserted += 1;
    }
  }
  return summary;
}

export interface ProcessResult {
  leadId: string;
  name: string;
  outcome: "queued" | "parked" | "disqualified" | "no_website" | "no_email" | "error";
  score?: number;
  detail?: string;
  demoUrl?: string;
}

/** Runs one sourced lead through enrich → score → demo → sequence. */
export async function processLead(lead: {
  id: string;
  name: string;
  website: string | null;
  city: string | null;
  niche: string | null;
  phone: string | null;
  review_count: number | null;
  rating: number | null;
}): Promise<ProcessResult> {
  const db = supabase();

  if (!lead.website) {
    // Per the qualification filter: no website → nothing to hook a demo to.
    await db.from("leads").update({ status: "dead", gap_notes: "no website" }).eq("id", lead.id);
    return { leadId: lead.id, name: lead.name, outcome: "no_website" };
  }

  try {
    const scrape = await scrapeBusinessSite(lead.website);
    const enrichment = await enrichLead(scrape);
    const { score, reasons, disqualified } = scoreLead({
      scrape,
      enrichment,
      reviewCount: lead.review_count,
      rating: lead.rating,
    });

    const email = normalizeEmail(enrichment.best_email);
    await db
      .from("leads")
      .update({
        email,
        contact_name: enrichment.owner_name,
        score,
        gap_notes: enrichment.gap_notes,
        hook_sentence: enrichment.hook_sentence,
        has_chat_widget: scrape.hasChatWidget,
        competitor: scrape.competitor,
        niche: lead.niche ?? enrichment.niche,
        status: "enriched",
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    if (disqualified) {
      await db.from("leads").update({ status: "dead" }).eq("id", lead.id);
      return {
        leadId: lead.id,
        name: lead.name,
        outcome: "disqualified",
        score,
        detail: `existing solution: ${disqualified}`,
      };
    }
    if (score < QUALIFICATION_THRESHOLD) {
      return {
        leadId: lead.id,
        name: lead.name,
        outcome: "parked",
        score,
        detail: reasons.join(", "),
      };
    }
    if (!email || (await isSuppressed(email))) {
      // Qualified but unreachable by email — future phone-channel candidate.
      return { leadId: lead.id, name: lead.name, outcome: "no_email", score };
    }

    // Build their personalized demo — the artifact every touch links to.
    const config = await generateBusinessConfig(scrape, {
      name: enrichment.business_name,
      city: enrichment.city ?? undefined,
      niche: enrichment.niche,
      phone: enrichment.phone ?? undefined,
    });
    const slug = makeSlug(config.business_name, config.city);
    const { error: demoError } = await db
      .from("demos")
      .upsert({ lead_id: lead.id, slug, config }, { onConflict: "slug" });
    if (demoError) throw demoError;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const demoUrl = `${appUrl}/demo/${slug}`;

    const sequence = await generateSequence({
      enrichment,
      demoUrl,
      reviewCount: lead.review_count,
      rating: lead.rating,
    });
    await createSequence({ leadId: lead.id, demoSlug: slug, sequence });

    await db.from("leads").update({ status: "demo_built" }).eq("id", lead.id);
    return { leadId: lead.id, name: lead.name, outcome: "queued", score, demoUrl };
  } catch (err) {
    return {
      leadId: lead.id,
      name: lead.name,
      outcome: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Processes a bounded batch of sourced leads (cost control). */
export async function processNewLeads(maxLeads: number): Promise<ProcessResult[]> {
  const { data: leads } = await supabase()
    .from("leads")
    .select("id, name, website, city, niche, phone, review_count, rating")
    .eq("status", "sourced")
    .order("created_at", { ascending: true })
    .limit(maxLeads);

  const results: ProcessResult[] = [];
  for (const lead of leads ?? []) {
    results.push(await processLead(lead));
  }
  return results;
}
