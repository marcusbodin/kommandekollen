import { z } from "zod";
import { listingSchema } from "./model";

export const LISTINGS_PAGE_SIZE = 12;
export const publicListingSchema = listingSchema.omit({ externalId: true }).extend({
  id: z.string().max(128).regex(/^[a-z]+:[a-zA-Z0-9_-]+$/),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  coverage: z.enum(["complete", "partial"]),
}).strict();
export type PublicListing = z.infer<typeof publicListingSchema>;
export const publicListingsSchema = z.object({
  availability: z.enum(["ready", "no_sources", "empty"]),
  items: z.array(publicListingSchema).max(LISTINGS_PAGE_SIZE),
  total: z.number().int().min(0).max(200),
  hasMore: z.boolean(),
  nextCursor: z.string().min(1).max(1400).nullable(),
}).strict().superRefine((page, ctx) => {
  if (page.hasMore !== (page.nextCursor !== null) || page.items.length > page.total
    || (page.hasMore && !page.items.length)
    || (page.availability !== "ready" && (page.total || page.items.length || page.hasMore))
    || new Set(page.items.map(item => item.id)).size !== page.items.length) {
    ctx.addIssue({ code: "custom", message: "Ogiltig objektsida." });
  }
});
export type PublicListingsPage = z.infer<typeof publicListingsSchema>;
