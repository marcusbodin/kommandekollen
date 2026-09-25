import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { loadCollectionSources } from "./source-config";
import { collectSource, CollectionError, LIMITS } from "./collector";

function publicIp(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0))
      || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  return isIP(ip) === 6 && /^[23][0-9a-f]{3}:/i.test(ip) && !ip.includes(".");
}
const api = process.env.INGEST_API_URL, token = process.env.INGEST_TOKEN;
const collectionSources = loadCollectionSources();
if (!collectionSources.length) {
  console.log("No sources enabled. No agency was fetched and no live collection occurred.");
} else {
  if (!api || !token || token.length < 32 || new URL(api).protocol !== "https:") throw new Error("Private ingestion credentials and HTTPS API URL are required");
  if (collectionSources.length > LIMITS.sources) throw new Error("Source count exceeds conservative free job limit");
  const hosts = new Set<string>();
  let failures = 0;
  for (const source of collectionSources) {
    const hostname = new URL(source.url).hostname;
    if (hosts.has(hostname)) throw new Error("Only one exact source URL per host per run is allowed");
    hosts.add(hostname);
    try {
      const addresses = await lookup(hostname, { all: true });
      if (!addresses.length || addresses.some(address => !publicIp(address.address))) throw new CollectionError("fetch_failed", "Non-public source address");
      const feed = await collectSource(source);
      const response = await fetch(`${api.replace(/\/$/, "")}/admin/ingest`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(feed), redirect: "error", signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new CollectionError("invalid_feed", `Ingestion rejected: HTTP ${response.status}`);
    } catch (error) {
      failures++;
      const code = error instanceof CollectionError ? error.code : "fetch_failed";
      console.error("Collection failed. Review authenticated API source status; private details are not logged.");
      const response = await fetch(`${api.replace(/\/$/, "")}/admin/source-failure`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: source.id, code }), redirect: "error", signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Could not record source failure: HTTP ${response.status}`);
    }
  }
  if (failures) process.exitCode = 1;
}
