import { describe, expect, it } from "vitest";
import { defaultFilters, feedSchema, filterSchema, listingId, listingSchema, matches, stockholmClock } from "../shared/model";
import { demoListings } from "../src/demo";
import { authorizedFeed } from "./fixtures/authorized-feed";

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
    const listing = authorizedFeed().listings[0];
    expect(listingId(listing)).toBe("authorized:fixture-1");
    expect(feedSchema.safeParse({ sourceId: "authorized", observedAt: new Date().toISOString(), listings: [{ ...listing, status: "sold" }] }).success).toBe(false);
    expect(listingSchema.safeParse({ ...listing, county: "Skåne län" }).success).toBe(false);
    expect(feedSchema.safeParse({ sourceId: "authorized", observedAt: new Date().toISOString(), listings: [listing, listing] }).success).toBe(false);
  });
  it("uses Stockholm local dates/hours over both DST changes", () => {
    expect(stockholmClock(new Date("2026-03-29T05:00:00Z"))).toEqual({ day: "2026-03-29", hour: 7 });
    expect(stockholmClock(new Date("2026-10-25T06:00:00Z"))).toEqual({ day: "2026-10-25", hour: 7 });
    expect(stockholmClock(new Date("2026-01-01T23:30:00Z"))).toEqual({ day: "2026-01-02", hour: 0 });
  });
});
describe("structured factual import contract", () => {
  it("retains nullable facts and rejects copied content or unvalidated numeric strings", () => {
    const listing = authorizedFeed().listings[0];
    expect(listingSchema.parse({ ...listing, type: null, price: null, rooms: null, size: null, fee: null })).toMatchObject({
      type: null, price: null, rooms: null, size: null, fee: null,
    });
    for (const extra of [{ description: "Copied text" }, { image: "https://images.example/home.jpg" }, { contact: "agent@example.com" }])
      expect(listingSchema.safeParse({ ...listing, ...extra }).success).toBe(false);
    expect(listingSchema.safeParse({ ...listing, price: "4 250 000" }).success).toBe(false);
  });
});
