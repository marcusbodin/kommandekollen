import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { observationAuthorizations, type SourceConfiguration } from "../worker/support";
import { renderBrokerPreview } from "./broker-browser";
import { CollectionError } from "./collector";
import { prepareObservations, sendObservations } from "./import-observations";
import { renderNotarPreview } from "./notar-browser";
import { NOTAR_INDEX, NotarPreviewError } from "./notar-dom";
import { BROKER_INDEXES, SourcePreviewError, type BrokerId } from "./preview-common";

const sourceSchema = z.enum(["notar", "husmanhagberg", "mohv"]);
type PrivateSource = z.infer<typeof sourceSchema>;
type Environment = Partial<Record<"PRIVATE_OBSERVATION_SOURCES" | "AUTHORIZED_SOURCES" | "INGEST_API_URL" | "INGEST_TOKEN", string>>;
type Renderers = {
  renderNotarPreview: () => Promise<unknown>;
  renderBrokerPreview: (source: BrokerId) => Promise<{ preview: unknown }>;
};
const renderers: Renderers = { renderNotarPreview, renderBrokerPreview };
const previewCodes = z.enum([
  "invalid_dom", "invalid_card", "invalid_output", "limit", "robots", "access_denied", "not_ready",
  "fetch_failed", "robots_blocked", "invalid_feed", "authorization_expired",
]);
type FailureCode = z.infer<typeof previewCodes> | "usage" | "source_config" | "source_disabled" | "source_host"
  | "credentials" | "api_target" | "invalid_preview" | "no_items" | "invalid_receipt" | "import_failed"
  | `import_http_${number}`;
class PrivateCollectionError extends Error {
  constructor(readonly code: FailureCode) { super(code); }
}

function preflight(source: PrivateSource, env: Environment) {
  if (!env.PRIVATE_OBSERVATION_SOURCES?.trim()) throw new PrivateCollectionError("source_config");
  const config: SourceConfiguration = {
    AUTHORIZED_SOURCES: env.AUTHORIZED_SOURCES ?? "[]",
    PRIVATE_OBSERVATION_SOURCES: env.PRIVATE_OBSERVATION_SOURCES,
  };
  let grants: ReturnType<typeof observationAuthorizations>;
  try {
    z.array(z.never()).parse(JSON.parse(config.AUTHORIZED_SOURCES));
    grants = observationAuthorizations(config);
  } catch { throw new PrivateCollectionError("source_config"); }
  const grant = grants.find(entry => entry.id === source);
  if (!grant) throw new PrivateCollectionError("source_disabled");
  const host = new URL(source === "notar" ? NOTAR_INDEX : BROKER_INDEXES[source]).hostname;
  if (grant.hosts.length !== 1 || grant.hosts[0] !== host) throw new PrivateCollectionError("source_host");
  const token = env.INGEST_TOKEN;
  if (!token || !/^[\x21-\x7e]{32,}$/.test(token)) throw new PrivateCollectionError("credentials");
  let api: URL;
  try { api = new URL(env.INGEST_API_URL ?? ""); }
  catch { throw new PrivateCollectionError("api_target"); }
  if (api.protocol !== "https:" || api.hostname !== "api.kommandekollen.se" || api.port
    || api.username || api.password || api.pathname !== "/" || api.search || api.hash)
    throw new PrivateCollectionError("api_target");
  return { config, api: api.origin, token };
}

export async function collectPrivate(source: PrivateSource, env: Environment, dependencies: Renderers = renderers) {
  if (!sourceSchema.safeParse(source).success) throw new PrivateCollectionError("usage");
  const { config, api, token } = preflight(source, env);
  let preview: unknown;
  try {
    preview = source === "notar" ? await dependencies.renderNotarPreview()
      : (await dependencies.renderBrokerPreview(source)).preview;
  } catch (error) {
    if (error instanceof NotarPreviewError || error instanceof SourcePreviewError || error instanceof CollectionError) {
      const code = previewCodes.safeParse(error.code);
      if (code.success) throw new PrivateCollectionError(code.data);
    }
    throw new PrivateCollectionError("not_ready");
  }
  let observations: ReturnType<typeof prepareObservations>;
  try { observations = prepareObservations(preview, config); }
  catch { throw new PrivateCollectionError("invalid_preview"); }
  if (observations.sourceId !== source) throw new PrivateCollectionError("invalid_preview");
  if (observations.items.length === 0) throw new PrivateCollectionError("no_items");
  try {
    const receipt = await sendObservations(observations, config, api, token);
    return { ok: true as const, source, count: observations.items.length, receipt };
  } catch (error) {
    if (error instanceof z.ZodError
      || (error instanceof Error && error.message === "The server receipt does not account for the complete submitted batch."))
      throw new PrivateCollectionError("invalid_receipt");
    const status = error instanceof Error
      ? /^Observation import rejected: HTTP ([1-5]\d{2})\. No successful outcome is assumed\.$/.exec(error.message)?.[1] : undefined;
    throw new PrivateCollectionError(status ? `import_http_${Number(status)}` : "import_failed");
  }
}

export async function runPrivateCollection(args: string[], env: Environment, dependencies: Renderers = renderers) {
  try {
    const source = sourceSchema.safeParse(args[1]);
    if (args.length !== 2 || args[0] !== "--source" || !source.success) throw new PrivateCollectionError("usage");
    return await collectPrivate(source.data, env, dependencies);
  } catch (error) {
    return { ok: false as const, code: error instanceof PrivateCollectionError ? error.code : "import_failed" };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await runPrivateCollection(process.argv.slice(2), process.env);
  if (result.ok) console.log(JSON.stringify(result));
  else { console.error(JSON.stringify(result)); process.exitCode = 1; }
}
