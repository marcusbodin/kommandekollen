import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm, rmdir, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { prepareObservations, readPrivateInput, sendObservations, writePrivateEnvelope } from "../scripts/import-observations";
import { listingSchema } from "../shared/model";

const directories: string[] = [];
const config = { AUTHORIZED_SOURCES: "[]", PRIVATE_OBSERVATION_SOURCES: JSON.stringify([
  { id: "notar", hosts: ["www.notar.se"], basisReference: "Synthetic local observation and policy fixture", expiresAt: "2099-01-01T00:00:00.000Z" },
]) };
function observation() {
  const item = listingSchema.parse({ sourceId: "notar", externalId: "synthetic", status: "upcoming", county: "Stockholms län",
    municipality: "Solna", area: "Fiktivt", address: "Fiktiva gatan", type: null, price: null, rooms: null, size: null, fee: null,
    url: "https://www.notar.se/kopa-bostad/objekt/synthetic" });
  return { kind: "listing-observations", version: 1, sourceId: "notar", observationId: crypto.randomUUID(),
    observedAt: new Date(Date.now() - 1000).toISOString(), coverage: "partial", items: [item] };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    for (const file of await readdir(directory)) await rm(join(directory, file));
    await rmdir(directory);
  }
});
describe("explicit private observation importer", () => {
  it("validates structured facts without changing identity/time or turning partial data into a snapshot", () => {
    const input = observation(), data = prepareObservations(input, config);
    expect(data).toEqual(input);
    expect(data.observationId).toBe(input.observationId);
    expect(data.observedAt).toBe(input.observedAt);
    expect(data.coverage).toBe("partial");
    expect(data.items[0].type).toBeNull();
    expect(data.items[0]).not.toHaveProperty("id");
    expect(data.items[0]).not.toHaveProperty("firstSeen");
    expect(data).not.toHaveProperty("renderedCards");
  });
  it("requires observation evidence, known source binding and active owner configuration", () => {
    const input = observation();
    for (const changed of [
      { observationId: undefined }, { observationId: null, observedAt: null }, { observedAt: undefined },
      { observedAt: new Date(Date.now() - 3600_001).toISOString() }, { observedAt: new Date(Date.now() + 60000).toISOString() },
      { kind: "notar-rendered-preview" }, { coverage: "complete" }, { sourceId: "mohv" },
      { items: [{ ...input.items[0], id: "notar:wrong" }] },
      { items: [{ ...input.items[0], firstSeen: input.observedAt }] },
      { items: [{ ...input.items[0], url: "https://other.example.com/object" }] },
    ]) expect(() => prepareObservations({ ...input, ...changed }, config)).toThrow();
    expect(() => prepareObservations(input, { AUTHORIZED_SOURCES: "[]" })).toThrow();
    expect(() => prepareObservations(input, { ...config, AUTHORIZED_SOURCES: JSON.stringify([
      { id: "notar", hosts: ["www.notar.se"], licenseReference: "Synthetic licensed policy", expiresAt: "2099-01-01T00:00:00.000Z" },
    ]) })).toThrow();
  });
  it("keeps the exact freshness boundary and refuses raw HTML or legacy preview envelopes", () => {
    const input = observation(), now = Date.parse(input.observedAt) + 3600_000;
    expect(prepareObservations(input, config, now)).toEqual(input);
    expect(() => prepareObservations(input, config, now + 1)).toThrow("one-hour");
    expect(() => prepareObservations("<html>not structured observations</html>", config)).toThrow();
    expect(() => prepareObservations({ ...input, kind: "notar-rendered-preview", ingestible: false, coverage: { complete: false } }, config)).toThrow();
    const network = vi.spyOn(globalThis, "fetch");
    prepareObservations(input, config);
    expect(network).not.toHaveBeenCalled();
  });
  it("writes only new private files with mode 0600 and rejects checkout paths, symlinks and overwrites", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kk-observation-import-")); directories.push(directory);
    const path = join(directory, "envelope.json"), data = prepareObservations(observation(), config);
    await writePrivateEnvelope(path, data);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readPrivateInput(path)).toEqual(data);
    await expect(writePrivateEnvelope(path, data)).rejects.toThrow();
    await expect(writePrivateEnvelope(resolve("should-not-write.json"), data)).rejects.toThrow("outside");
    await expect(readPrivateInput(resolve("package.json"))).rejects.toThrow("outside");
    await symlink(path, join(directory, "linked.json"));
    await expect(readPrivateInput(join(directory, "linked.json"))).rejects.toThrow();
    await expect(writePrivateEnvelope(join(directory, "linked.json"), data)).rejects.toThrow();
    const checkoutFile = resolve("package.json");
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    await expect(readPrivateInput(checkoutFile)).rejects.toThrow("outside");
  });
  it("sends only on explicit invocation, enforces target constraints and refuses success-shaped failures", async () => {
    const data = prepareObservations(observation(), config);
    const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      accepted: true, duplicate: false, coverage: "partial", count: 1, inserted: 1, updated: 0, ignored: 0, retired: 0,
    }));
    for (const url of ["http://api.example.com", "https://api.example.com?x=1", "https://api.example.com/path",
      "https://user:password@api.example.com", "https://api.example.com#token"]) {
      await expect(sendObservations(data, config, url, "synthetic-token".repeat(3))).rejects.toThrow();
    }
    expect(network).not.toHaveBeenCalled();
    await expect(sendObservations(data, config, "https://api.example.com", "synthetic-token".repeat(3))).resolves.toMatchObject({ retired: 0 });
    expect(network).toHaveBeenCalledOnce();
    expect(network.mock.calls[0][1]).toMatchObject({ method: "POST", redirect: "error", body: JSON.stringify(data) });
    network.mockResolvedValueOnce(Response.json({ accepted: true }, { status: 503 }));
    await expect(sendObservations(data, config, "https://api.example.com", "synthetic-token".repeat(3))).rejects.toThrow("HTTP 503");
  });
  it.each([
    { accepted: false }, { coverage: "complete" }, { retired: 1 }, { count: 0 },
    { inserted: 0 }, { updated: 1 }, { ignored: -1 }, { duplicate: "true" },
  ])("rejects a malformed or incompletely accounted receipt: %j", async change => {
    const data = prepareObservations(observation(), config);
    const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      accepted: true, duplicate: false, coverage: "partial", count: 1, inserted: 1, updated: 0, ignored: 0, retired: 0, ...change,
    }));
    await expect(sendObservations(data, config, "https://api.example.com", "synthetic-token".repeat(3))).rejects.toThrow();
    expect(network).toHaveBeenCalledOnce();
  });
  it("checks credentials and source grants before sending and permits only explicit loopback local mode", async () => {
    const data = prepareObservations(observation(), config);
    const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      accepted: true, duplicate: true, coverage: "partial", count: 1, inserted: 1, updated: 0, ignored: 0, retired: 0,
    }));
    await expect(sendObservations(data, config, "https://api.example.com", "short")).rejects.toThrow();
    await expect(sendObservations(data, { AUTHORIZED_SOURCES: "[]" }, "https://api.example.com", "synthetic-token".repeat(3))).rejects.toThrow();
    await expect(sendObservations(data, config, "http://127.0.0.1:8787", "synthetic-token".repeat(3))).rejects.toThrow();
    await expect(sendObservations(data, config, "http://api.example.com", "synthetic-token".repeat(3), true)).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
    await expect(sendObservations(data, config, "http://127.0.0.1:8787", "synthetic-token".repeat(3), true)).resolves.toMatchObject({ duplicate: true });
    expect(network).toHaveBeenCalledOnce();
  });
});
