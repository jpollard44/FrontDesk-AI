// Minimal scraper: fetches a business's homepage (+ contact page if linked)
// and returns plain text for Claude to extract facts from, plus deterministic
// signals used by the growth engine (emails, chat widget, competitor vendors).
// No headless browser in v1 — most local-business sites are server-rendered enough.

const MAX_CHARS_PER_PAGE = 20_000;
const FETCH_TIMEOUT_MS = 15_000;

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; FrontDeskAI/0.1; +https://frontdesk-ai.example)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  return res.text();
}

function findContactUrl(html: string, baseUrl: string): string | null {
  const match = html.match(
    /href=["']([^"']*(?:contact|about|hours|location)[^"']*)["']/i
  );
  if (!match) return null;
  try {
    return new URL(match[1], baseUrl).toString();
  } catch {
    return null;
  }
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_JUNK = /\.(png|jpe?g|gif|svg|webp|css|js)$|example\.com|sentry|wixpress|godaddy/i;

function extractEmails(...htmls: (string | null)[]): string[] {
  const found = new Set<string>();
  for (const html of htmls) {
    if (!html) continue;
    for (const m of html.match(EMAIL_RE) ?? []) {
      const email = m.toLowerCase();
      if (!EMAIL_JUNK.test(email)) found.add(email);
    }
  }
  return [...found].slice(0, 10);
}

// Known AI-receptionist / answering-service vendors. If one is detected, the
// lead already has a solution — skip or route to a displacement campaign.
const COMPETITOR_SIGNATURES: Array<[string, RegExp]> = [
  ["Ruby", /ruby\.com|ruby\s*receptionist/i],
  ["Smith.ai", /smith\.ai/i],
  ["Dialpad", /dialpad/i],
  ["Numa", /numa\.com|heynuma/i],
  ["Suki", /suki\.ai/i],
  ["Weave", /getweave|weave\s*communications|weaveconnect/i],
  ["Podium", /podium\.com|podium\s*webchat/i],
  ["Birdeye", /birdeye/i],
];

// Generic chat-widget vendors (gap signal, not necessarily a competitor).
const CHAT_WIDGET_RE =
  /intercom|drift\.com|tawk\.to|livechat|zendesk|crisp\.chat|tidio|hubspot.*conversations/i;

export interface ScrapeResult {
  url: string;
  homepageText: string;
  contactPageText: string | null;
  hasChatWidget: boolean;
  /** Emails found in the raw HTML (mailto links, contact pages). */
  emails: string[];
  /** Name of a detected AI-receptionist competitor, if any. */
  competitor: string | null;
}

export async function scrapeBusinessSite(url: string): Promise<ScrapeResult> {
  const normalized = url.startsWith("http") ? url : `https://${url}`;
  const homepageHtml = await fetchPage(normalized);

  let contactPageHtml: string | null = null;
  const contactUrl = findContactUrl(homepageHtml, normalized);
  if (contactUrl && contactUrl !== normalized) {
    try {
      contactPageHtml = await fetchPage(contactUrl);
    } catch {
      // Contact page is best-effort; homepage alone is usually enough.
    }
  }

  const allHtml = homepageHtml + (contactPageHtml ?? "");
  const competitor =
    COMPETITOR_SIGNATURES.find(([, re]) => re.test(allHtml))?.[0] ?? null;
  const hasChatWidget = Boolean(competitor) || CHAT_WIDGET_RE.test(allHtml);

  return {
    url: normalized,
    homepageText: htmlToText(homepageHtml).slice(0, MAX_CHARS_PER_PAGE),
    contactPageText: contactPageHtml
      ? htmlToText(contactPageHtml).slice(0, MAX_CHARS_PER_PAGE)
      : null,
    hasChatWidget,
    emails: extractEmails(homepageHtml, contactPageHtml),
    competitor,
  };
}
