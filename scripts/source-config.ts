import { z } from "zod";
import { sourceIds, type SourceId } from "../shared/model";

export interface CollectionSource {
  id: SourceId;
  format: "json-feed" | "jsonld-page";
  url: string;
  licenseReference: string;
  licenseExpires: string;
  allowedListingHosts: string[];
}
const sourceSchema = z.array(z.object({
  id: z.enum(sourceIds), format: z.enum(["json-feed", "jsonld-page"]),
  url: z.string().url(), licenseReference: z.string().min(10).max(300),
  licenseExpires: z.string().datetime(),
  allowedListingHosts: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).min(1).max(5),
}).strict()).max(4);
// The private CI secret is the server-side exact-URL allowlist; never accept member URLs.
export function loadCollectionSources(value = process.env.COLLECTION_CONFIG): CollectionSource[] {
  if (!value) return [];
  try { return sourceSchema.parse(JSON.parse(value)); }
  catch { throw new Error("Invalid private collection configuration"); }
}
