import { z } from "zod";
import { defaultFilters, filterSchema, listingId, matches, municipalities, types, type Filters, type ListingInput } from "./model";

const readableText = (max: number) => z.string().trim().min(1).max(max)
  .refine(value => !/\uFFFD|√[∂§•]|Ã[¶¤¥©]|Â[° ]/u.test(value), "Texten innehåller skadade tecken; tolka om eller rätta manuellt.");
const scopeSchema = z.object({
  municipalities: z.array(z.enum(municipalities)).max(5),
  types: z.array(z.enum(types)).max(5),
  areas: z.array(z.string().trim().min(1).max(60)).max(5),
}).strict().superRefine((scope, ctx) => {
  if (Object.values(scope).some(values => new Set(values.map(v => v.toLocaleLowerCase("sv"))).size !== values.length)) {
    ctx.addIssue({ code: "custom", message: "Ange varje alternativ en gång." });
  }
});
export const profileSchema = z.object({
  version: z.literal(1),
  filters: filterSchema,
  alternatives: scopeSchema,
  excluded: scopeSchema,
  wishes: z.array(filterSchema).max(4),
  unverified: z.array(z.object({ text: readableText(160), must: z.boolean() }).strict()).max(6),
}).strict().superRefine((p, ctx) => {
  if ((p.filters.municipality && p.alternatives.municipalities.length) || (p.filters.type && p.alternatives.types.length)
    || (p.filters.area && p.alternatives.areas.length)) ctx.addIssue({ code: "custom", message: "Använd antingen ett område eller alternativ, inte båda." });
  if ((p.filters.type && p.excluded.types.includes(p.filters.type)) || (p.filters.municipality && p.excluded.municipalities.includes(p.filters.municipality))
    || p.alternatives.types.some(v => p.excluded.types.includes(v)) || p.alternatives.municipalities.some(v => p.excluded.municipalities.includes(v))
    || [p.filters.area, ...p.alternatives.areas].filter(Boolean).some(v => p.excluded.areas.some(excluded => v.toLocaleLowerCase("sv").includes(excluded.toLocaleLowerCase("sv"))))) {
    ctx.addIssue({ code: "custom", message: "Önskade och uteslutna alternativ motsäger varandra." });
  }
});
export type Profile = z.infer<typeof profileSchema>;
export function manualProfile(filters: Filters = { ...defaultFilters }): Profile {
  return { version: 1, filters, alternatives: { municipalities: [], types: [], areas: [] },
    excluded: { municipalities: [], types: [], areas: [] }, wishes: [], unverified: [] };
}
export const questionSchema = z.object({
  text: readableText(200), choices: z.array(readableText(100)).max(3), required: z.boolean(),
}).strict().nullable();
export const interpretationSchema = z.object({
  profile: profileSchema, question: questionSchema,
  conflicts: z.array(readableText(180)).max(4),
}).strict();
export type Interpretation = z.infer<typeof interpretationSchema>;
export const draftSchema = interpretationSchema.extend({
  id: z.string().uuid(), revision: z.number().int().nonnegative(), baseVersion: z.number().int().nonnegative(),
  turns: z.number().int().min(0).max(3), expiresAt: z.number(),
});
export type Draft = z.infer<typeof draftSchema>;
const numberFormat = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 20 });
const n = (v: number) => numberFormat.format(v);
export function describeFilters(f: Filters): string[] {
  const lines: string[] = [];
  if (f.municipality) lines.push(f.municipality);
  if (f.area) lines.push(`Område/gata innehåller "${f.area}"`);
  if (f.type) lines.push(f.type);
  for (const [key, label, unit] of [
    ["minPrice", "Minst", "kr"], ["maxPrice", "Högst", "kr"], ["minRooms", "Minst", "rum"], ["maxRooms", "Högst", "rum"],
    ["minSize", "Minst", "m²"], ["maxSize", "Högst", "m²"], ["maxFee", "Högst", "kr/mån"],
  ] as const) if (f[key] !== null) lines.push(`${label} ${n(f[key])} ${unit}`);
  if (f.includeUnknown) lines.push("Saknade filtrerade sifferuppgifter får tas med för manuell kontroll");
  return lines;
}
export function hardDescription(p: Profile): string[] {
  const lines = describeFilters(p.filters);
  for (const values of [p.alternatives.municipalities, p.alternatives.types]) if (values.length) lines.push(values.join(" eller "));
  if (p.alternatives.areas.length) lines.push(`Område/gata innehåller: ${p.alternatives.areas.join(" eller ")}`);
  for (const values of [p.excluded.municipalities, p.excluded.types, p.excluded.areas]) if (values.length) lines.push(`Inte: ${values.join(", ")}`);
  return lines.length ? lines : ["Inga faktabaserade begränsningar"];
}
export function assess(listing: ListingInput, profile: Profile) {
  const scope = `${listing.area} ${listing.address}`.toLocaleLowerCase("sv");
  const inArea = (area: string) => scope.includes(area.toLocaleLowerCase("sv"));
  const a = profile.alternatives, e = profile.excluded;
  const eligible = matches(listing, profile.filters)
    && (!a.municipalities.length || a.municipalities.includes(listing.municipality))
    && (!a.types.length || (listing.type !== null && a.types.includes(listing.type))) && (!a.areas.length || a.areas.some(inArea))
    && !e.municipalities.includes(listing.municipality)
    && (!e.types.length || (listing.type !== null && !e.types.includes(listing.type))) && !e.areas.some(inArea);
  const reasons = profile.wishes.filter(wish => describeFilters(wish).length && matches(listing, { ...wish, includeUnknown: false }))
    .map(wish => `Önskemål uppfyllt: ${describeFilters({ ...wish, includeUnknown: false }).join(", ")}`);
  const needsCheck = profile.unverified.length > 0 || !matches(listing, { ...profile.filters, includeUnknown: false });
  return { eligible, reasons, score: reasons.length, needsCheck };
}
export function ranked<T extends ListingInput>(listings: T[], profile: Profile): T[] {
  return listings.map(listing => ({ listing, result: assess(listing, profile) })).filter(item => item.result.eligible)
    .sort((a, b) => b.result.score - a.result.score || listingId(a.listing).localeCompare(listingId(b.listing))).map(item => item.listing);
}
