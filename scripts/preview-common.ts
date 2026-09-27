import { createHash } from "node:crypto";
import { lstat, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { listingId, listingSchema } from "../shared/model";
import { LIMITS } from "./collector";

export const BROWSER_LIMITS = { allowedRequests: 100, attemptedRequests: 200, decodedBytes: 12_000_000, totalMs: 30_000, navigationMs: 15_000, readinessMs: 10_000 };
export const WINDOW_LIMIT = 50;
export class SourcePreviewError extends Error {
  constructor(public code: "invalid_dom" | "invalid_card" | "invalid_output" | "limit" | "robots" | "access_denied" | "not_ready", message: string) {
    super(message);
    this.name = "SourcePreviewError";
  }
}
export const clean = (text: string) => text.normalize("NFC").replace(/\s+/gu, " ").trim();
export const previewItemSchema = listingSchema.extend({ type: listingSchema.shape.type.nullable() });
export type PreviewItem = z.infer<typeof previewItemSchema>;
export type BrokerId = "husmanhagberg" | "mohv";
export const BROKER_INDEXES = {
  husmanhagberg: "https://www.husmanhagberg.se/kopa/?c=true",
  mohv: "https://www.mohv.se/snart-har/",
} as const;

export function checkDomSize(html: string) {
  if (Buffer.byteLength(html) > LIMITS.bodyBytes) throw new SourcePreviewError("limit", "Results DOM exceeds 500 KB");
}

export function canonicalObjectLink(href: string, source: BrokerId) {
  let url: URL;
  try { url = new URL(href, BROKER_INDEXES[source]); }
  catch { throw new SourcePreviewError("invalid_card", "Invalid source object link"); }
  const pattern = source === "husmanhagberg"
    ? /^\/objekt\/[^/]+\/([a-zA-Z0-9_-]{1,80})\/$/
    : /^\/objekt\/[^/]+\/[^/]+\/([a-zA-Z0-9_-]{1,80})\/$/;
  const match = pattern.exec(url.pathname);
  if (url.origin !== new URL(BROKER_INDEXES[source]).origin || url.username || url.password || url.port || url.hash || url.search
    || /%2f|%5c|%00/i.test(url.pathname) || !match)
    throw new SourcePreviewError("invalid_card", "Unexpected source object link");
  return { url: url.toString(), externalId: match[1] };
}

export function numericFact(text: string) {
  const value = clean(text);
  if (!value) return null;
  if (!/^\d+(?: \d{3})*(?:[,.]\d+)?$/.test(value))
    throw new SourcePreviewError("invalid_card", "Malformed source numeric fact");
  return Number(value.replace(/ /g, "").replace(",", "."));
}

export function validatedItem(value: unknown): PreviewItem {
  const parsed = previewItemSchema.safeParse(value);
  if (!parsed.success) throw new SourcePreviewError("invalid_card", "Source facts failed listing validation");
  return parsed.data;
}

export function previewResult(sourceId: BrokerId, candidates: PreviewItem[], counts: {
  sampledCards: number; excludedStatus: number; excludedLocation: number; unrecognizedFacts: number;
}, renderedCards: number | null = null) {
  if (counts.sampledCards === 0) throw new SourcePreviewError("not_ready", "No rendered cards; not an empty inventory");
  if (counts.sampledCards > WINDOW_LIMIT) throw new SourcePreviewError("limit", "Captured window exceeds 50 cards");
  if (renderedCards !== null && (!Number.isSafeInteger(renderedCards) || renderedCards < counts.sampledCards
    || counts.sampledCards !== Math.min(renderedCards, WINDOW_LIMIT)))
    throw new SourcePreviewError("invalid_dom", "Capture window does not match its rendered-card count");
  const unique = new Map<string, PreviewItem & { id: string }>();
  let duplicates = 0;
  for (const item of candidates) {
    const id = listingId(item), entry = { ...item, id }, previous = unique.get(id);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(entry)) throw new SourcePreviewError("invalid_card", "Conflicting duplicate source object");
      duplicates++;
    } else unique.set(id, entry);
  }
  const items = [...unique.values()];
  return {
    kind: `${sourceId}-rendered-preview` as const, ingestible: false as const, sourceId,
    observationId: null as string | null, observedAt: null as string | null,
    coverage: {
      complete: false as const, scope: "first 50 cards in one public upcoming index" as const,
      totalAvailable: null, renderedCards, ...counts, windowLimit: WINDOW_LIMIT,
      truncated: renderedCards === null ? null : renderedCards > counts.sampledCards,
      duplicates, unknownPropertyTypes: items.filter(item => item.type === null).length,
      countyEvidence: "exact municipality in the shared Stockholm-county allowlist" as const,
    },
    items,
  };
}

export const captureSchema = z.object({
  kind: z.literal("broker-dom-capture"), version: z.literal(1),
  sourceId: z.enum(["husmanhagberg", "mohv"]), observationId: z.string().uuid(),
  observedAt: z.string().datetime().refine(value => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString() === value;
  }),
  renderedCards: z.number().int().positive(),
  html: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type BrokerCapture = z.infer<typeof captureSchema>;
export const domHash = (html: string) => createHash("sha256").update(html).digest("hex");

export function validatedCapture(value: unknown): BrokerCapture {
  const parsed = captureSchema.safeParse(value);
  if (!parsed.success) throw new SourcePreviewError("invalid_dom", "Invalid local capture metadata");
  checkDomSize(parsed.data.html);
  if (domHash(parsed.data.html) !== parsed.data.sha256)
    throw new SourcePreviewError("invalid_dom", "Local capture DOM does not match its recorded hash");
  return parsed.data;
}

export async function privateOutputPath(output: string) {
  if (!isAbsolute(output)) throw new SourcePreviewError("invalid_output", "An absolute private output path outside the repository is required");
  const repository = await realpath(fileURLToPath(new URL("../", import.meta.url)));
  const target = resolve(await realpath(dirname(output)), output.split(sep).at(-1)!);
  const within = relative(repository, target);
  if (!within || (!within.startsWith(`..${sep}`) && !isAbsolute(within)))
    throw new SourcePreviewError("invalid_output", "Real preview data must not be written inside the repository");
  try {
    await lstat(target);
    throw new SourcePreviewError("invalid_output", "Choose a new output file; existing files and symlinks are never overwritten");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  return target;
}

export async function boundedLocalText(path: string, maxBytes = LIMITS.bodyBytes) {
  if ((await stat(path)).size > maxBytes) throw new SourcePreviewError("limit", "Local capture exceeds its byte limit");
  const text = await readFile(path, "utf8");
  if (Buffer.byteLength(text) > maxBytes) throw new SourcePreviewError("limit", "Local capture exceeds its byte limit");
  return text;
}
export async function writePrivateJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
