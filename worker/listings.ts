import { z } from "zod";
import { defaultFilters, filterSchema, listingId, listingSchema, matches, type Filters } from "../shared/model";
import { LISTINGS_PAGE_SIZE, publicListingSchema, type PublicListing, type PublicListingsPage } from "../shared/public-listings";
import { ApiError, authorizations, json, serviceReady, sharedAccess, type Env } from "./support";

const timestamp = z.string().datetime();
const cursorSchema = z.object({
  v: z.literal(1),
  firstSeen: timestamp,
  id: publicListingSchema.shape.id,
  filters: filterSchema,
}).strict();
function encode(value: z.infer<typeof cursorSchema>) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function parseFilters(value: string | null): Filters {
  if (value === null) return { ...defaultFilters };
  let input: unknown;
  try { input = JSON.parse(value); }
  catch { throw new ApiError(400, "validation", "Kontrollera objektfiltren och försök igen."); }
  return filterSchema.parse(input);
}
function parseCursor(value: string | null, filters: Filters) {
  if (value === null) return null;
  try {
    if (!/^[A-Za-z0-9_-]{1,1400}$/.test(value)) throw new Error("cursor");
    const bytes = Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
    const cursor = cursorSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    if (encode(cursor) !== value || JSON.stringify(cursor.filters) !== JSON.stringify(filters)) throw new Error("cursor");
    return cursor;
  } catch { throw new ApiError(400, "invalid_cursor", "Sidmarkören är ogiltig eller hör till andra filter. Uppdatera objektlistan."); }
}
export async function publicListings(request: Request, env: Env) {
  const url = new URL(request.url);
  if (url.search.length > 4096 || [...url.searchParams.keys()].some(key =>
    !["filters", "cursor"].includes(key) || url.searchParams.getAll(key).length !== 1)) {
    throw new ApiError(400, "validation", "Ogiltiga parametrar för objektlistan.");
  }
  const filters = parseFilters(url.searchParams.get("filters"));
  const cursor = parseCursor(url.searchParams.get("cursor"), filters);
  sharedAccess(env);
  if (!serviceReady(env)) throw new ApiError(503, "not_ready", "Objektlistan är inte aktiverad just nu. Försök senare.");
  const allowed = authorizations(env);
  const empty = (availability: "no_sources" | "empty"): PublicListingsPage =>
    ({ availability, items: [], total: 0, hasMore: false, nextCursor: null });
  if (!allowed.length) return json(empty("no_sources"));
  const rows = await env.DB.prepare(`SELECT id,source_id,data,first_seen,last_seen FROM listings
    WHERE active=1 AND source_id IN (${allowed.map(() => "?").join(",")}) LIMIT 200`)
    .bind(...allowed.map(source => source.id))
    .all<{ id: string; source_id: string; data: string; first_seen: string; last_seen: string }>();
  const valid: { item: PublicListing; match: boolean }[] = [];
  let excluded = 0;
  for (const row of rows.results) {
    let data: unknown;
    try { data = JSON.parse(row.data); }
    catch { throw new ApiError(503, "listings_unavailable", "Objektlistan kunde inte läsas. Försök senare."); }
    const parsed = listingSchema.safeParse(data);
    if (!parsed.success) { excluded++; continue; }
    const listing = parsed.data;
    const authorization = allowed.find(source => source.id === listing.sourceId);
    if (listing.sourceId !== row.source_id || row.id !== listingId(listing)
      || !authorization?.hosts.includes(new URL(listing.url).hostname)
      || !timestamp.safeParse(row.first_seen).success || !timestamp.safeParse(row.last_seen).success) {
      excluded++; continue;
    }
    // Explicit public projection: never copy arbitrary stored JSON or source metadata.
    const item: PublicListing = {
      id: row.id, sourceId: listing.sourceId, status: listing.status, county: listing.county,
      municipality: listing.municipality, area: listing.area, address: listing.address, type: listing.type,
      price: listing.price, rooms: listing.rooms, size: listing.size, fee: listing.fee, url: listing.url,
      firstSeen: new Date(row.first_seen).toISOString(), lastSeen: new Date(row.last_seen).toISOString(),
    };
    valid.push({ item, match: matches(listing, filters) });
  }
  if (excluded) console.warn(JSON.stringify({ event: "public_listings_excluded", count: excluded }));
  if (!valid.length) return json(empty("empty"));
  const matching = valid.filter(entry => entry.match).map(entry => entry.item)
    .sort((a, b) => a.firstSeen === b.firstSeen ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : (a.firstSeen < b.firstSeen ? 1 : -1));
  const remaining = cursor ? matching.filter(item =>
    item.firstSeen < cursor.firstSeen || (item.firstSeen === cursor.firstSeen && item.id < cursor.id)) : matching;
  const items = remaining.slice(0, LISTINGS_PAGE_SIZE), last = items.at(-1);
  const hasMore = remaining.length > LISTINGS_PAGE_SIZE;
  const page: PublicListingsPage = { availability: "ready", items, total: matching.length, hasMore,
    nextCursor: hasMore && last ? encode({ v: 1, firstSeen: last.firstSeen, id: last.id, filters }) : null };
  return json(page);
}
