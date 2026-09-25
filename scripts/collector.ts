import { load } from "cheerio";
import robotsParser from "robots-parser";
import { feedSchema, listingSchema, type ListingInput } from "../shared/model";
import type { CollectionSource } from "./source-config";

export const USER_AGENT = "Kommandekollen/0.1 (minimal-facts; permission-required)";
export const LIMITS = { sources: 4, requestsPerSource: 2, bodyBytes: 500_000, robotsBytes: 64_000, timeoutMs: 12_000, delayMs: 2000 };
type Fetch = typeof fetch;
export class CollectionError extends Error {
  constructor(public code: "fetch_failed" | "robots_blocked" | "invalid_feed" | "authorization_expired", message: string) { super(message); }
}
export async function boundedText(url: string, fetcher: Fetch, maxBytes: number) {
  const response = await fetcher(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json,text/html,text/plain" }, redirect: "error", signal: AbortSignal.timeout(LIMITS.timeoutMs) });
  if (!response.ok || !response.body) throw new CollectionError("fetch_failed", `HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > maxBytes) throw new CollectionError("fetch_failed", "Response exceeds byte limit");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let total = 0, text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new CollectionError("fetch_failed", "Response exceeds byte limit"); }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CollectionError("invalid_feed", "Expected structured data");
  return value as Record<string, unknown>;
}
function numeric(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !/^\d[\d \u00a0]*(?:[,.]\d+)?$/.test(value)) throw new CollectionError("invalid_feed", "Invalid number");
  return Number(value.replace(/[ \u00a0]/g, "").replace(",", "."));
}
export function parseJsonLd(html: string, source: CollectionSource): ListingInput[] {
  const $ = load(html);
  const nodes: Record<string, unknown>[] = [];
  $("script[type='application/ld+json']").each((_i, element) => {
    const value: unknown = JSON.parse($(element).text());
    const root = Array.isArray(value) ? value : [value];
    for (const node of root) {
      const item = record(node);
      if (Array.isArray(item["@graph"])) nodes.push(...item["@graph"].map(record));
      else nodes.push(item);
    }
  });
  const listings = nodes.filter(node => node["@type"] === "RealEstateListing");
  if (!listings.length || listings.length > 50) throw new CollectionError("invalid_feed", "No supported real-estate listing data");
  return listings.map(node => {
    const about = record(node.about), address = record(about.address);
    const properties = Array.isArray(about.additionalProperty) ? about.additionalProperty.map(record) : [];
    const property = (name: string) => properties.find(prop => prop.name === name)?.value;
    // A source must explicitly label upcoming status; never infer it from a URL or missing price.
    if (property("Försäljningsstatus") !== "Kommande" || address.addressRegion !== "Stockholms län") {
      throw new CollectionError("invalid_feed", "Listing is not explicitly upcoming in Stockholm county");
    }
    const offers = node.offers === undefined ? {} : record(node.offers);
    const floor = about.floorSize === undefined ? {} : record(about.floorSize);
    if (floor.unitCode !== undefined && floor.unitCode !== "MTK") throw new CollectionError("invalid_feed", "Unsupported area unit");
    if (offers.price !== undefined && offers.priceCurrency !== "SEK") throw new CollectionError("invalid_feed", "Unsupported price currency");
    const type = about["@type"] === "House" ? property("Bostadstyp")
      : { Apartment: "Lägenhet", SingleFamilyResidence: "Villa" }[String(about["@type"])];
    return listingSchema.parse({
      externalId: node.identifier, sourceId: source.id, status: "upcoming", county: "Stockholms län",
      municipality: address.addressLocality, area: property("Område"), address: address.streetAddress,
      type, price: numeric(offers.price), rooms: numeric(about.numberOfRooms),
      size: numeric(floor.value), fee: numeric(property("Månadsavgift")), url: node.url,
    });
  });
}
export async function collectSource(source: CollectionSource, fetcher: Fetch = fetch, pause: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  if (!source.licenseReference || Date.parse(source.licenseExpires) <= Date.now() || !Number.isFinite(Date.parse(source.licenseExpires))) {
    throw new CollectionError("authorization_expired", "Missing or expired source authorization");
  }
  const url = new URL(source.url);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new CollectionError("fetch_failed", "Only exact public HTTPS source URLs are supported");
  const robotsUrl = new URL("/robots.txt", url).toString();
  const robots = robotsParser(robotsUrl, await boundedText(robotsUrl, fetcher, LIMITS.robotsBytes));
  if (robots.isAllowed(url.toString(), USER_AGENT) !== true) throw new CollectionError("robots_blocked", "Robots excludes or does not authorize this path");
  const delay = Math.max(LIMITS.delayMs, (robots.getCrawlDelay(USER_AGENT) || 0) * 1000);
  if (delay > 60_000) throw new CollectionError("robots_blocked", "Crawl delay exceeds job budget");
  await pause(delay);
  const body = await boundedText(url.toString(), fetcher, LIMITS.bodyBytes);
  let listings: ListingInput[];
  let observedAt = new Date().toISOString();
  try {
    if (source.format === "json-feed") {
      const feed = feedSchema.parse(JSON.parse(body));
      if (feed.sourceId !== source.id || Math.abs(Date.now() - Date.parse(feed.observedAt)) > 3600_000) {
        throw new Error("Feed source mismatch or stale snapshot");
      }
      listings = feed.listings;
      observedAt = feed.observedAt;
    } else listings = parseJsonLd(body, source);
  } catch { throw new CollectionError("invalid_feed", "Source data failed normalization"); }
  if (listings.some(listing => listing.sourceId !== source.id || !source.allowedListingHosts.includes(new URL(listing.url).hostname))) {
    throw new CollectionError("invalid_feed", "Listing source or hostname mismatch");
  }
  return feedSchema.parse({ sourceId: source.id, observedAt, listings });
}
