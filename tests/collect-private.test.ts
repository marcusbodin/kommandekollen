import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listingId, listingSchema } from "../shared/model";
import { collectPrivate, runPrivateCollection } from "../scripts/collect-private";
import { CollectionError } from "../scripts/collector";
import { NotarPreviewError } from "../scripts/notar-dom";
import { SourcePreviewError } from "../scripts/preview-common";

type Source = "notar" | "husmanhagberg" | "mohv";
const hosts = { notar: "www.notar.se", husmanhagberg: "www.husmanhagberg.se", mohv: "www.mohv.se" };
const grant = (source: Source = "notar") => ({
  id: source, hosts: [hosts[source]], expiresAt: "2099-01-01T00:00:00.000Z",
  basisReference: "Synthetic owner assessment fixture, not source permission",
});
const environment = (source: Source = "notar") => ({
  AUTHORIZED_SOURCES: "[]", PRIVATE_OBSERVATION_SOURCES: JSON.stringify([grant(source)]),
  INGEST_API_URL: "https://api.kommandekollen.se/", INGEST_TOKEN: "synthetic-test-token".repeat(3),
});
function preview(source: Source = "notar") {
  const item = listingSchema.parse({
    sourceId: source, externalId: "synthetic", status: "upcoming", county: "Stockholms län",
    municipality: "Solna", area: "Synthetic area", address: "Synthetic street", type: null,
    price: null, rooms: null, size: null, fee: null, url: `https://${hosts[source]}/objekt/synthetic`,
  });
  return {
    kind: `${source}-rendered-preview`, ingestible: false, sourceId: source,
    observationId: crypto.randomUUID(), observedAt: new Date(Date.now() - 1000).toISOString(),
    coverage: { complete: false, renderedCards: 50, truncated: true },
    items: [{ ...item, id: listingId(item) }], traffic: { secretDiagnostic: "must not leave process" },
  };
}
const receipt = { accepted: true, duplicate: false, coverage: "partial", count: 1, inserted: 1, updated: 0, ignored: 0, retired: 0 };
function renderers(value: unknown = preview()) {
  return {
    renderNotarPreview: vi.fn(async () => value),
    renderBrokerPreview: vi.fn(async (_source: "husmanhagberg" | "mohv") => ({
      preview: value, capture: { html: "private DOM must not leave process" }, traffic: { private: "diagnostics" },
    })),
  };
}
beforeEach(() => { vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network")); });
afterEach(() => { vi.restoreAllMocks(); });

describe("bounded manual private collection", () => {
  it.each([
    { PRIVATE_OBSERVATION_SOURCES: undefined },
    { PRIVATE_OBSERVATION_SOURCES: "" },
    { PRIVATE_OBSERVATION_SOURCES: "not JSON" },
    { PRIVATE_OBSERVATION_SOURCES: "[]" },
    { PRIVATE_OBSERVATION_SOURCES: JSON.stringify([{ ...grant(), expiresAt: "2020-01-01T00:00:00.000Z" }]) },
    { PRIVATE_OBSERVATION_SOURCES: JSON.stringify([grant("mohv")]) },
    { PRIVATE_OBSERVATION_SOURCES: JSON.stringify([{ ...grant(), hosts: ["www.mohv.se"] }]) },
    { PRIVATE_OBSERVATION_SOURCES: JSON.stringify([{ ...grant(), hosts: ["www.notar.se", "unexpected.example.com"] }]) },
    { PRIVATE_OBSERVATION_SOURCES: JSON.stringify([{ ...grant(), basisReference: "" }]) },
    { AUTHORIZED_SOURCES: "[{}]" },
    { AUTHORIZED_SOURCES: "bad" },
    { INGEST_TOKEN: undefined },
    { INGEST_TOKEN: "short" },
    { INGEST_TOKEN: "a".repeat(32) + "\n" },
    { INGEST_API_URL: undefined },
    { INGEST_API_URL: "http://api.kommandekollen.se" },
    { INGEST_API_URL: "https://unexpected.example.com" },
    { INGEST_API_URL: "https://api.kommandekollen.se:8443" },
    { INGEST_API_URL: "https://api.kommandekollen.se/admin/observations" },
    { INGEST_API_URL: "https://api.kommandekollen.se?value=private" },
    { INGEST_API_URL: "https://api.kommandekollen.se#private" },
    { INGEST_API_URL: "https://user:password@api.kommandekollen.se" },
  ])("rejects preflight without rendering or network (%#)", async change => {
    const dependencies = renderers();
    const result = await runPrivateCollection(["--source", "notar"], { ...environment(), ...change }, dependencies);
    expect(result).toMatchObject({ ok: false });
    expect(dependencies.renderNotarPreview).not.toHaveBeenCalled();
    expect(dependencies.renderBrokerPreview).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([[], ["--source", "bjurfors"], ["--source", "notar", "--retry"], ["--url", "https://example.com"]].map(args => ({ args })))(
    "accepts only the single-source CLI shape (%#)", async ({ args }) => {
      const dependencies = renderers();
      expect(await runPrivateCollection(args, environment(), dependencies)).toEqual({ ok: false, code: "usage" });
      expect(dependencies.renderNotarPreview).not.toHaveBeenCalled();
      expect(dependencies.renderBrokerPreview).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });
  it.each<Source>(["notar", "husmanhagberg", "mohv"])("renders %s once and sends only projected facts with original identity/time", async source => {
    const input = preview(source), dependencies = renderers(input);
    vi.mocked(fetch).mockResolvedValue(Response.json(receipt));
    const result = await collectPrivate(source, environment(source), dependencies);
    expect(result).toEqual({ ok: true, source, count: 1, receipt });
    expect(dependencies.renderNotarPreview).toHaveBeenCalledTimes(source === "notar" ? 1 : 0);
    expect(dependencies.renderBrokerPreview).toHaveBeenCalledTimes(source === "notar" ? 0 : 1);
    if (source !== "notar") expect(dependencies.renderBrokerPreview).toHaveBeenCalledWith(source);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("https://api.kommandekollen.se/admin/observations");
    expect(options).toMatchObject({ method: "POST", redirect: "error" });
    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({
      kind: "listing-observations", version: 1, sourceId: source,
      observationId: input.observationId, observedAt: input.observedAt, coverage: "partial",
      items: [expect.objectContaining({ type: null, price: null })],
    });
    expect(body.items[0]).not.toHaveProperty("id");
    expect(body.items[0]).not.toHaveProperty("firstSeen");
    expect(Object.keys(body).sort()).toEqual(["coverage", "items", "kind", "observationId", "observedAt", "sourceId", "version"]);
    expect(JSON.stringify(result)).not.toContain("synthetic");
    expect(JSON.stringify(body)).not.toContain("must not leave");
  });
  it("never sends malformed, stale, future, offline, wrong-source or over-limit previews", async () => {
    const input = preview();
    const candidates: unknown[] = [
      null, { ...input, observationId: null, observedAt: null },
      { ...input, observedAt: new Date(Date.now() - 3600_001).toISOString() },
      { ...input, observedAt: new Date(Date.now() + 60000).toISOString() },
      { ...input, coverage: { complete: true } }, { ...input, ingestible: true },
      { ...input, items: [{ ...input.items[0], id: "notar:wrong" }] },
      { ...input, items: [{ ...input.items[0], firstSeen: input.observedAt }] },
      { ...input, items: [{ ...input.items[0], description: "Do not copy" }] },
      { ...input, items: [{ ...input.items[0], url: "https://unexpected.example.com" }] },
      { ...input, items: Array.from({ length: 51 }, () => input.items[0]) }, preview("mohv"),
    ];
    const env = { ...environment(), PRIVATE_OBSERVATION_SOURCES: JSON.stringify([grant(), grant("mohv")]) };
    for (const candidate of candidates) {
      const dependencies = renderers(candidate);
      expect(await runPrivateCollection(["--source", "notar"], env, dependencies)).toEqual({ ok: false, code: "invalid_preview" });
      expect(dependencies.renderNotarPreview).toHaveBeenCalledOnce();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects valid zero-item observations instead of claiming population", async () => {
    const dependencies = renderers({ ...preview(), items: [] });
    expect(await runPrivateCollection(["--source", "notar"], environment(), dependencies)).toEqual({ ok: false, code: "no_items" });
    expect(dependencies.renderNotarPreview).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    new NotarPreviewError("access_denied", "private provider details"),
    new SourcePreviewError("robots", "private provider details"),
    new SourcePreviewError("not_ready", "private provider details"),
    new NotarPreviewError("limit", "private provider details"),
    new CollectionError("fetch_failed", "private provider details"),
    new CollectionError("robots_blocked", "private provider details"),
  ])("keeps safe source error codes without retry or raw messages (%#)", async error => {
    const dependencies = renderers();
    dependencies.renderNotarPreview.mockRejectedValue(error);
    expect(await runPrivateCollection(["--source", "notar"], environment(), dependencies)).toEqual({ ok: false, code: error.code });
    expect(dependencies.renderNotarPreview).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sanitizes unknown browser failures, including untrusted code properties", async () => {
    const dependencies = renderers();
    dependencies.renderNotarPreview.mockRejectedValue(Object.assign(new Error("private URL and token"), { code: "private token" }));
    expect(await runPrivateCollection(["--source", "notar"], environment(), dependencies)).toEqual({ ok: false, code: "not_ready" });
    expect(dependencies.renderNotarPreview).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { ...receipt, coverage: "complete" }, { ...receipt, retired: 1 },
    { ...receipt, count: 0 }, { ...receipt, inserted: 0 }, { ...receipt, updated: 1 },
    { ...receipt, privateFacts: "must never log" }, { accepted: true },
  ])("delegates exact partial receipt validation to the existing importer (%#)", async invalidReceipt => {
    const dependencies = renderers();
    vi.mocked(fetch).mockResolvedValue(Response.json(invalidReceipt));
    expect(await runPrivateCollection(["--source", "notar"], environment(), dependencies)).toEqual({ ok: false, code: "invalid_receipt" });
    expect(dependencies.renderNotarPreview).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([400, 401, 403, 409, 429, 503])("reports import HTTP %s safely without retrying or reading error bodies", async status => {
    const dependencies = renderers();
    vi.mocked(fetch).mockResolvedValue(new Response("private provider response", { status }));
    expect(await runPrivateCollection(["--source", "notar"], environment(), dependencies)).toEqual({ ok: false, code: `import_http_${status}` });
    expect(dependencies.renderNotarPreview).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("never retries uncertain network delivery or prints arbitrary exceptions", async () => {
    const dependencies = renderers();
    vi.mocked(fetch).mockRejectedValue(new Error("private URL, token and provider details"));
    expect(await runPrivateCollection(["--source", "notar"], environment(), dependencies)).toEqual({ ok: false, code: "import_failed" });
    expect(dependencies.renderNotarPreview).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("keeps the workflow manual, owner-only, serialized and secret-free until the collection step", () => {
    const workflow = readFileSync(".github/workflows/private-observations.yml", "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.repository_owner == 'marcusbodin' && github.actor == 'marcusbodin'");
    expect(workflow).toContain("group: private-ingestion\n  cancel-in-progress: false");
    expect(workflow).toContain("timeout-minutes: 5");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain('run: node --import tsx scripts/collect-private.ts --source "$SOURCE"');
    expect(workflow).toContain("SOURCE: ${{ inputs.source }}");
    expect(workflow).toContain("INGEST_API_URL: ${{ vars.PUBLIC_API_URL }}");
    expect(workflow).toContain('AUTHORIZED_SOURCES: "[]"');
    expect(workflow).toContain("npx playwright install --with-deps chromium");
    expect(workflow.split("- name: Collect one bounded")[0]).not.toContain("secrets.");
    expect(workflow).not.toMatch(/schedule:|upload-artifact|--trace|--debug|run:.*\$\{\{/);
  });
});
