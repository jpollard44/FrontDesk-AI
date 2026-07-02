import type { ScrapeResult } from "../scrape";
import type { Enrichment } from "../enrich";

// Qualification scoring (0-100), adapted from the growth-system design.
// Deterministic — no AI spend. Threshold gates the expensive steps
// (demo generation, pitch writing) so Claude only runs on real prospects.

export const QUALIFICATION_THRESHOLD = 40;

const HIGH_VALUE_NICHES = /dent|medical|med spa|law|attorney|legal|ortho|vet/i;
const BOOKING_RE = /book online|book now|schedule online|calendly|zocdoc|vagaro|booksy|acuity|square appointments/i;

export interface ScoreInput {
  scrape: ScrapeResult | null; // null = no website
  enrichment: Enrichment | null;
  reviewCount?: number | null;
  rating?: number | null;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
  disqualified: string | null; // e.g. existing competitor solution
}

export function scoreLead(input: ScoreInput): ScoreResult {
  const reasons: string[] = [];
  let score = 0;

  if (input.scrape?.competitor) {
    return {
      score: 0,
      reasons: [`already uses ${input.scrape.competitor}`],
      disqualified: input.scrape.competitor,
    };
  }

  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(`+${points} ${reason}`);
  };

  if (input.scrape) add(15, "has a website");
  if ((input.reviewCount ?? 0) >= 10) add(10, "established (10+ reviews)");
  if (input.rating != null && input.rating > 0 && input.rating < 4.5)
    add(5, "rating below 4.5 (customer-experience pain)");
  if (input.scrape && !BOOKING_RE.test(input.scrape.homepageText + (input.scrape.contactPageText ?? "")))
    add(15, "no online booking detected");
  if (input.scrape && !input.scrape.hasChatWidget) add(20, "no chat widget on site");
  if (input.enrichment && HIGH_VALUE_NICHES.test(input.enrichment.niche))
    add(15, "high-value niche");
  if (input.enrichment?.best_email) add(10, "outreach email found");
  if (input.enrichment?.owner_name) add(10, "decision-maker identified");

  return { score: Math.min(score, 100), reasons, disqualified: null };
}
