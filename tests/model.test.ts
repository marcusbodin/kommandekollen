import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { defaultFilters, feedSchema, filterSchema, listingId, matches, stockholmClock } from "../shared/model";
import { demoListings } from "../src/demo";
import { collectSource, parseJsonLd, boundedText } from "../scripts/collector";
import type { CollectionSource } from "../scripts/source-config";

const fixture = readFileSync(new URL("./fixtures/authorized-page.html", import.meta.url), "utf8");
const source: CollectionSource = { id: "authorized", format: "jsonld-page", url: "https://listings.example.com/upcoming",
  licenseReference: "Synthetic fixture licensed for tests", licenseExpires: "2099-01-01T00:00:00Z", allowedListingHosts: ["listings.example.com"] };
describe("filters and normalized inventory", () => {
  it("excludes unknown facts only when that fact is filtered, unless explicitly included", () => {
    const listing = demoListings[2];
    expect(matches(listing, defaultFilters)).toBe(true);
    expect(matches(listing, { ...defaultFilters, maxPrice: 5_000_000 })).toBe(false);
    expect(matches(listing, { ...defaultFilters, maxPrice: 5_000_000, includeUnknown: true })).toBe(true);
    expect(matches(listing, { ...defaultFilters, municipality: "Nacka" })).toBe(false);
    expect(matches(listing, { ...defaultFilters, area: "RÅSUNDA" })).toBe(true);
  });
  it("validates intervals, status, county and stable source IDs", () => {
    expect(filterSchema.safeParse({ ...defaultFilters, minPrice: 5, maxPrice: 2 }).success).toBe(false);
    const listing = parseJsonLd(fixture, source)[0];
    expect(listingId(listing)).toBe("authorized:fixture-1");
    expect(feedSchema.safeParse({ sourceId: "authorized", observedAt: new Date().toISOString(), listings: [{ ...listing, status: "sold" }] }).success).toBe(false);
    expect(feedSchema.safeParse({ sourceId: "authorized", observedAt: new Date().toISOString(), listings: [listing, listing] }).success).toBe(false);
  });
  it("uses Stockholm local dates/hours over both DST changes", () => {
    expect(stockholmClock(new Date("2026-03-29T05:00:00Z"))).toEqual({ day: "2026-03-29", hour: 7 });
    expect(stockholmClock(new Date("2026-10-25T06:00:00Z"))).toEqual({ day: "2026-10-25", hour: 7 });
    expect(stockholmClock(new Date("2026-01-01T23:30:00Z"))).toEqual({ day: "2026-01-02", hour: 0 });
  });
});
describe("bounded collector (synthetic permitted fixtures, not a live agency)", () => {
  it("extracts only factual fields with explicit upcoming status", () => {
    const result = parseJsonLd(fixture, source);
    expect(result[0]).toMatchObject({ price: 4250000, rooms: 2.5, size: 56, fee: 3200, municipality: "Stockholm" });
    expect(Object.keys(result[0])).not.toContain("description");
    expect(() => parseJsonLd(fixture.replace("Kommande", "Till salu"), source)).toThrow();
    expect(() => parseJsonLd(fixture.replace("Stockholms län", "Skåne län"), source)).toThrow();
  });
  it("checks fresh robots before every fetch; honors crawl delay and exact two-request bound", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("User-agent: *\nAllow: /\nCrawl-delay: 3")).mockResolvedValueOnce(new Response(fixture));
    const pause = vi.fn(async () => {});
    const data = await collectSource(source, fetcher, pause);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe("https://listings.example.com/robots.txt");
    expect(pause).toHaveBeenCalledWith(3000);
    expect(data.listings).toHaveLength(1);
  });
  it("stops on robots exclusions, expired permissions, redirects and oversized responses", async () => {
    const blocked = vi.fn<typeof fetch>().mockResolvedValue(new Response("User-agent: *\nDisallow: /"));
    await expect(collectSource(source, blocked)).rejects.toThrow("Robots");
    expect(blocked).toHaveBeenCalledTimes(1);
    await expect(collectSource({ ...source, licenseExpires: "2020-01-01T00:00:00Z" }, blocked)).rejects.toThrow("expired");
    await expect(boundedText(source.url, vi.fn<typeof fetch>().mockResolvedValue(new Response("12345")), 4)).rejects.toThrow("limit");
    const redirect = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302 }));
    await expect(boundedText(source.url, redirect, 100)).rejects.toThrow("302");
  });
});
