import { z } from "zod";
import { listingId, listingSchema, sourceIds } from "./model";

export const OBSERVATION_WINDOW_MS = 3600_000;
export const RECEIPT_RETENTION_MS = 48 * 3600_000;
export const captureTimeSchema = z.string().datetime().refine(value => new Date(value).toISOString() === value, "Use canonical UTC timestamps.");
export const observationSchema = z.object({
  kind: z.literal("listing-observations"),
  version: z.literal(1),
  observationId: z.string().uuid(),
  sourceId: z.enum(sourceIds),
  observedAt: captureTimeSchema,
  coverage: z.literal("partial"),
  items: z.array(listingSchema).max(50),
}).strict().superRefine((data, ctx) => {
  if (data.items.some(item => item.sourceId !== data.sourceId)
    || new Set(data.items.map(listingId)).size !== data.items.length) {
    ctx.addIssue({ code: "custom", message: "Observation source or unique IDs do not match." });
  }
});
export type Observation = z.infer<typeof observationSchema>;
