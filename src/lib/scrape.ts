// Minimal scraper: fetches a business's homepage (+ contact page if linked)
// and returns plain text for Claude to extract facts from. No headless
// browser in v1 — most local-business sites are server-rendered enough.

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

export interface ScrapeResult {
  url: string;
  homepageText: string;
  contactPageText: string | null;
  hasChatWidget: boolean;
}

export async function scrapeBusinessSite(url: string): Promise<ScrapeResult> {
  const normalized = url.startsWith("http") ? url : `https://${url}`;
  const homepageHtml = await fetchPage(normalized);

  // Gap detection signal: common chat-widget vendors in the page source.
  const hasChatWidget =
    /intercom|drift\.com|tawk\.to|livechat|zendesk|crisp\.chat|tidio|podium|birdeye.*chat|smith\.ai|hubspot.*conversations/i.test(
      homepageHtml
    );

  let contactPageText: string | null = null;
  const contactUrl = findContactUrl(homepageHtml, normalized);
  if (contactUrl && contactUrl !== normalized) {
    try {
      contactPageText = htmlToText(await fetchPage(contactUrl)).slice(0, MAX_CHARS_PER_PAGE);
    } catch {
      // Contact page is best-effort; homepage alone is usually enough.
    }
  }

  return {
    url: normalized,
    homepageText: htmlToText(homepageHtml).slice(0, MAX_CHARS_PER_PAGE),
    contactPageText,
    hasChatWidget,
  };
}
