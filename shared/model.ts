import { z } from "zod";

export const municipalities = [
  "Botkyrka", "Danderyd", "Ekerö", "Haninge", "Huddinge", "Järfälla",
  "Lidingö", "Nacka", "Norrtälje", "Nykvarn", "Nynäshamn", "Salem",
  "Sigtuna", "Sollentuna", "Solna", "Stockholm", "Sundbyberg", "Södertälje",
  "Tyresö", "Täby", "Upplands Väsby", "Upplands-Bro", "Vallentuna",
  "Vaxholm", "Värmdö", "Österåker",
] as const;
export const types = ["Lägenhet", "Villa", "Radhus", "Fritidshus", "Tomt"] as const;
const optionalNumber = (max: number) => z.number().finite().min(0).max(max).nullable();
export const filterSchema = z.object({
  municipality: z.enum(municipalities).nullable(),
  area: z.string().trim().max(60),
  type: z.enum(types).nullable(),
  minPrice: optionalNumber(100_000_000),
  maxPrice: optionalNumber(100_000_000),
  minRooms: optionalNumber(30),
  maxRooms: optionalNumber(30),
  minSize: optionalNumber(10_000),
  maxSize: optionalNumber(10_000),
  maxFee: optionalNumber(100_000),
  includeUnknown: z.boolean(),
}).strict().superRefine((v, ctx) => {
  for (const [min, max] of [[v.minPrice, v.maxPrice], [v.minRooms, v.maxRooms], [v.minSize, v.maxSize]]) {
    if (min !== null && max !== null && min > max) {
      ctx.addIssue({ code: "custom", message: "Minsta värdet får inte vara större än det högsta." });
    }
  }
});
export type Filters = z.infer<typeof filterSchema>;
export const defaultFilters: Filters = {
  municipality: null, area: "", type: null, minPrice: null, maxPrice: null,
  minRooms: null, maxRooms: null, minSize: null, maxSize: null, maxFee: null,
  includeUnknown: false,
};
export const sourceIds = [
  "fastighetsbyran", "svenskfast", "bjurfors", "lansfast", "skandia",
  "husmanhagberg", "notar", "erikolsson", "mohv", "authorized",
] as const;
export type SourceId = typeof sourceIds[number];
export const listingSchema = z.object({
  externalId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  sourceId: z.enum(sourceIds),
  status: z.literal("upcoming"),
  county: z.literal("Stockholms län"),
  municipality: z.enum(municipalities),
  area: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(120),
  type: z.enum(types).nullable(),
  price: optionalNumber(100_000_000),
  rooms: optionalNumber(30),
  size: optionalNumber(10_000),
  fee: optionalNumber(100_000),
  url: z.string().url().max(1000).pipe(z.string().refine(value => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  }, "Endast HTTPS-länkar utan inloggningsuppgifter eller fragment tillåts.")),
}).strict();
export type ListingInput = z.infer<typeof listingSchema>;
export type Listing = ListingInput & { id: string; firstSeen: string; lastSeen: string; coverage?: "complete" | "partial" };
const factNumber = new Intl.NumberFormat("sv-SE");
export function listingFacts(listing: ListingInput | Omit<ListingInput, "externalId">) {
  const fact = (value: number | null, unit = "") => value === null ? "Ej angivet" : `${factNumber.format(value)}${unit}`;
  return { type: listing.type ?? "Ej angivet", price: fact(listing.price, " kr"),
    rooms: fact(listing.rooms), size: fact(listing.size, " m²"), fee: fact(listing.fee, " kr") };
}
export function listingId(listing: Pick<ListingInput, "sourceId" | "externalId">): string {
  return `${listing.sourceId}:${listing.externalId}`;
}
function range(value: number | null, min: number | null, max: number | null, unknown: boolean) {
  if (min === null && max === null) return true;
  if (value === null) return unknown;
  return (min === null || value >= min) && (max === null || value <= max);
}
export function matches(listing: ListingInput, filters: Filters): boolean {
  return (!filters.municipality || listing.municipality === filters.municipality)
    && (!filters.type || listing.type === filters.type)
    && (!filters.area || `${listing.area} ${listing.address}`.toLocaleLowerCase("sv").includes(filters.area.toLocaleLowerCase("sv")))
    && range(listing.price, filters.minPrice, filters.maxPrice, filters.includeUnknown)
    && range(listing.rooms, filters.minRooms, filters.maxRooms, filters.includeUnknown)
    && range(listing.size, filters.minSize, filters.maxSize, filters.includeUnknown)
    && range(listing.fee, null, filters.maxFee, filters.includeUnknown);
}
export function stockholmClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (key: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === key)!.value;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}
export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  filters: filterSchema,
  consent: z.literal(true),
  website: z.string().max(0),
}).strict();
export const feedSchema = z.object({
  sourceId: z.enum(sourceIds),
  observedAt: z.string().datetime(),
  listings: z.array(listingSchema).max(50),
}).strict().superRefine((feed, ctx) => {
  if (feed.listings.some(l => l.sourceId !== feed.sourceId)
    || new Set(feed.listings.map(listingId)).size !== feed.listings.length) {
    ctx.addIssue({ code: "custom", message: "Källan eller objektens unika ID stämmer inte." });
  }
});
