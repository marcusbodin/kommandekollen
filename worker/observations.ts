import { feedSchema, type ListingInput, type SourceId } from "../shared/model";
import { observationSchema, OBSERVATION_WINDOW_MS } from "../shared/observations";
import { ApiError, authorizations, observationAuthorizations, hash, json, readJson, type Env } from "./support";

type Receipt = { payload_hash: string; inserted: number; updated: number; ignored: number; retired: number };
export async function ingestBatch(request: Request, env: Env, kind: "complete" | "partial", now: number) {
  const input = await readJson(request, 100_000);
  let sourceId: SourceId, observedAt: string, batchId: string, items: ListingInput[];
  if (kind === "partial") {
    const data = observationSchema.parse(input);
    ({ sourceId, observedAt } = data); batchId = data.observationId; items = data.items;
  } else {
    const data = feedSchema.parse(input);
    sourceId = data.sourceId; observedAt = new Date(data.observedAt).toISOString();
    batchId = `snapshot:${observedAt}`; items = data.listings;
  }
  const grant = (kind === "partial" ? observationAuthorizations(env) : authorizations(env)).find(source => source.id === sourceId);
  if (!grant) throw new ApiError(403, "source_disabled", "Källan saknar aktiv tillåtelse för den här importtypen.");
  if (items.some(item => !grant.hosts.includes(new URL(item.url).hostname)))
    throw new ApiError(400, "source_url", "En objektlänk är inte tillåten för källan.");
  const payload = JSON.stringify([...items].sort((a, b) => a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0));
  const digest = await hash(JSON.stringify({ kind, sourceId, observedAt, payload }));
  const receipt = () => env.DB.prepare("SELECT payload_hash,inserted,updated,ignored,retired FROM ingestion_receipts WHERE source_id=? AND batch_id=?")
    .bind(sourceId, batchId).first<Receipt>();
  const respond = (row: Receipt, duplicate: boolean) => {
    if (row.payload_hash !== digest) throw new ApiError(409, "observation_conflict", "Importens ID hör redan till andra uppgifter.");
    return json({ accepted: true, duplicate, coverage: kind, count: items.length,
      inserted: row.inserted, updated: row.updated, ignored: row.ignored, retired: row.retired });
  };
  const previous = await receipt();
  if (previous) return respond(previous, true);
  if (Date.parse(observedAt) > now || now - Date.parse(observedAt) > OBSERVATION_WINDOW_MS)
    throw new ApiError(400, "feed_age", "Observationen måste vara verkligt tidsstämplad inom den senaste timmen.");
  try {
    const result = await env.DB.prepare(`INSERT OR IGNORE INTO ingestion_receipts(source_id,batch_id,kind,observed_at,payload_hash,received_at,payload)
      VALUES(?,?,?,?,?,?,?)`).bind(sourceId, batchId, kind, observedAt, digest, now, payload).run();
    const stored = await receipt();
    if (!stored) throw new ApiError(503, "ingest_unconfirmed", "Importens kvitto saknas. Ingen framgång kan bekräftas.");
    return respond(stored, result.meta.changes === 0);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (message.includes("observation_conflict")) throw new ApiError(409, "observation_conflict", "Samma observationstid eller import-ID har motstridiga uppgifter.");
    if (message.includes("stale_snapshot")) throw new ApiError(409, "stale_snapshot", "En nyare komplett snapshot är redan registrerad.");
    if (message.includes("source_rate")) throw new ApiError(429, "source_rate", "Vänta fem minuter mellan källans uppdateringar.");
    throw error;
  }
}
