import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { listingId, listingSchema } from "../shared/model";
import { captureTimeSchema, observationSchema, OBSERVATION_WINDOW_MS, type Observation } from "../shared/observations";
import { observationAuthorizations, type SourceConfiguration } from "../worker/support";

const previewSchema = z.object({
  kind: z.enum(["notar-rendered-preview", "husmanhagberg-rendered-preview", "mohv-rendered-preview"]),
  ingestible: z.literal(false),
  sourceId: z.enum(["notar", "husmanhagberg", "mohv"]),
  observationId: z.string().uuid(),
  observedAt: captureTimeSchema,
  coverage: z.object({ complete: z.literal(false) }).passthrough(),
  items: z.array(listingSchema.extend({ id: z.string() }).strict()).max(50),
}).passthrough();
function authorized(data: Observation, config: SourceConfiguration) {
  const grant = observationAuthorizations(config).find(source => source.id === data.sourceId);
  if (!grant || data.items.some(item => !grant.hosts.includes(new URL(item.url).hostname)))
    throw new Error("No active owner-configured private observation grant for this source and its hosts.");
}
export function prepareObservations(input: unknown, config: SourceConfiguration, now = Date.now()): Observation {
  const preview = previewSchema.parse(input);
  if (preview.kind !== `${preview.sourceId}-rendered-preview` || preview.items.some(item => item.id !== listingId(item)))
    throw new Error("Preview source or stable identity does not match.");
  const items = preview.items.map(item => ({
    externalId: item.externalId, sourceId: item.sourceId, status: item.status, county: item.county,
    municipality: item.municipality, area: item.area, address: item.address, type: item.type,
    price: item.price, rooms: item.rooms, size: item.size, fee: item.fee, url: item.url,
  }));
  const data = observationSchema.parse({ kind: "listing-observations", version: 1, observationId: preview.observationId,
    sourceId: preview.sourceId, observedAt: preview.observedAt, coverage: "partial", items });
  authorized(data, config);
  if (Date.parse(data.observedAt) > now || now - Date.parse(data.observedAt) > OBSERVATION_WINDOW_MS)
    throw new Error("Capture evidence is outside the one-hour import window; it must not be retimestamped.");
  return data;
}
export async function sendObservations(input: unknown, config: SourceConfiguration, api: string, token: string, local = false) {
  const data = observationSchema.parse(input);
  authorized(data, config);
  const target = new URL(api);
  if (target.username || target.password || target.search || target.hash || target.pathname !== "/"
    || (local ? target.protocol !== "http:" || target.hostname !== "127.0.0.1" : target.protocol !== "https:")
    || token.length < 32) throw new Error("An explicit HTTPS admin origin and private token are required; only --local permits loopback HTTP.");
  const body = JSON.stringify(data);
  if (Buffer.byteLength(body) > 100_000) throw new Error("Observation envelope exceeds the request bound.");
  const response = await fetch(new URL("/admin/observations", target), {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body, redirect: "error", signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Observation import rejected: HTTP ${response.status}. No successful outcome is assumed.`);
  const receipt = z.object({
    accepted: z.literal(true), duplicate: z.boolean(), coverage: z.literal("partial"), count: z.number().int().min(0).max(50),
    inserted: z.number().int().min(0).max(50), updated: z.number().int().min(0).max(50),
    ignored: z.number().int().min(0).max(50), retired: z.literal(0),
  }).strict().parse(await response.json());
  if (receipt.count !== data.items.length || receipt.inserted + receipt.updated + receipt.ignored !== receipt.count)
    throw new Error("The server receipt does not account for the complete submitted batch.");
  return receipt;
}
async function privatePath(path: string, output: boolean) {
  if (!isAbsolute(path)) throw new Error("Use absolute private file paths.");
  const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  const actual = output ? resolve(await realpath(dirname(path)), path.split("/").at(-1)!) : await realpath(path);
  const within = relative(root, actual);
  if (!within || (!within.startsWith("../") && !isAbsolute(within)))
    throw new Error("Real capture and observation files must stay outside the checkout.");
  return actual;
}
export async function readPrivateInput(path: string) {
  await privatePath(path, false);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 100_000) throw new Error("Expected a bounded private JSON file.");
    const buffer = Buffer.alloc(100_001);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 100_000) throw new Error("Private JSON file exceeds the bound.");
    return JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")) as unknown;
  } finally { await file.close(); }
}
export async function writePrivateEnvelope(path: string, data: Observation) {
  const actual = await privatePath(path, true);
  const body = JSON.stringify(observationSchema.parse(data), null, 2) + "\n";
  if (Buffer.byteLength(body) > 100_000) throw new Error("Prepared envelope exceeds the file bound.");
  const file = await open(actual, "wx", 0o600);
  try { await file.writeFile(body); } finally { await file.close(); }
}
async function main() {
  const args = process.argv.slice(2);
  const config = { AUTHORIZED_SOURCES: process.env.AUTHORIZED_SOURCES || "[]",
    PRIVATE_OBSERVATION_SOURCES: process.env.PRIVATE_OBSERVATION_SOURCES || "[]" };
  if (args.length === 4 && args[0] === "--prepare" && args[2] === "--output") {
    const data = prepareObservations(await readPrivateInput(args[1]), config);
    await writePrivateEnvelope(args[3], data);
    console.log(`Prepared ${data.items.length} partial observations privately. Nothing was sent.`);
  } else if ((args.length === 2 || (args.length === 3 && args[2] === "--local")) && args[0] === "--send") {
    const result = await sendObservations(await readPrivateInput(args[1]), config,
      process.env.INGEST_API_URL || "", process.env.INGEST_TOKEN || "", args[2] === "--local");
    console.log(JSON.stringify(result));
  } else throw new Error("Use --prepare /private/preview.json --output /private/new-envelope.json OR --send /private/envelope.json [--local].");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof z.ZodError ? "Invalid observation or capture evidence; nothing can be confirmed." :
      "Observation preparation/import failed. Check private paths, capture evidence, owner grants and authenticated server status; no automatic retry.");
    process.exitCode = 1;
  });
}
