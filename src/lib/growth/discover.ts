// Lead discovery via the official Google Places API (Text Search, v1).
// Free per-SKU quota (10k text-search requests/month) covers early volume at
// $0. For bulk national scrapes, import an Outscraper CSV instead
// (scripts/import-leads.ts) — at $3/1k records it beats API pricing at scale.

export interface DiscoveredBusiness {
  placeId: string;
  name: string;
  website: string | null;
  phone: string | null;
  city: string;
  niche: string;
  rating: number | null;
  reviewCount: number | null;
}

interface PlacesTextSearchResponse {
  places?: Array<{
    id: string;
    displayName?: { text?: string };
    websiteUri?: string;
    nationalPhoneNumber?: string;
    rating?: number;
    userRatingCount?: number;
  }>;
  nextPageToken?: string;
}

export async function discoverBusinesses(
  city: string,
  niche: string,
  maxResults = 20
): Promise<DiscoveredBusiness[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not set");

  const results: DiscoveredBusiness[] = [];
  let pageToken: string | undefined;

  while (results.length < maxResults) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,nextPageToken",
      },
      body: JSON.stringify({
        textQuery: `${niche} in ${city}`,
        pageSize: Math.min(maxResults - results.length, 20),
        ...(pageToken ? { pageToken } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`Places API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as PlacesTextSearchResponse;

    for (const place of data.places ?? []) {
      results.push({
        placeId: place.id,
        name: place.displayName?.text ?? "Unknown",
        website: place.websiteUri ?? null,
        phone: place.nationalPhoneNumber ?? null,
        city,
        niche,
        rating: place.rating ?? null,
        reviewCount: place.userRatingCount ?? null,
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken || !(data.places ?? []).length) break;
  }

  return results.slice(0, maxResults);
}

/** Parses GROWTH_TARGETS env var: "Austin TX:dentist,Denver CO:hvac" */
export function parseGrowthTargets(raw: string | undefined): Array<{ city: string; niche: string }> {
  if (!raw) return [];
  return raw
    .split(",")
    .map((pair) => {
      const [city, niche] = pair.split(":").map((s) => s.trim());
      return city && niche ? { city, niche } : null;
    })
    .filter((t): t is { city: string; niche: string } => t !== null);
}
