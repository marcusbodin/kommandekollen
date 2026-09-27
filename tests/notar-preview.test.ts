import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { feedSchema } from "../shared/model";
import { parseNotarDom, notarListingUrl, NOTAR_INDEX } from "../scripts/notar-dom";
import { notarRequestRole, notarRobots, renderNotarPreview, BROWSER_LIMITS } from "../scripts/notar-browser";
import { loadCollectionSources } from "../scripts/source-config";

const fixture = readFileSync(new URL("./fixtures/notar-rendered.html", import.meta.url), "utf8");
afterEach(() => { vi.restoreAllMocks(); });

describe("observed Notar rendered DOM (synthetic property facts)", () => {
  it("normalizes facts and IDs without guessing type, price, combined area or missing fee", () => {
    const result = parseNotarDom(fixture);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      id: "notar:FIXTURE-ONLY-1", externalId: "FIXTURE-ONLY-1", sourceId: "notar", status: "upcoming",
      county: "Stockholms län", municipality: "Solna", area: "Exempelområdet", address: "Exempelgatan 1",
      type: null, price: null, rooms: 2.5, size: 65, fee: 3200,
      url: "https://www.notar.se/kopa-bostad/objekt/FIXTURE-ONLY-1",
    });
    expect(result.items[1]).toMatchObject({ price: null, type: null, size: null, fee: null, rooms: 4 });
    expect(result.coverage).toMatchObject({ complete: false, totalAvailable: null, renderedCards: 2, unknownPropertyTypes: 2, unrecognizedFacts: 1 });
    expect(result.ingestible).toBe(false);
    expect(feedSchema.safeParse(result).success).toBe(false);
    expect(loadCollectionSources("[]")).toEqual([]);
  });
  it("ignores image/contact/description content and does not infer type from an address", () => {
    const changed = fixture.replace("Exempelgatan 1", "Villagatan 1").replace("</a>", '<img src="https://images.example.com/house.jpg"><p>Kontakt contact@example.com</p><p>Stor villa med utsikt</p></a>');
    const result = parseNotarDom(changed);
    expect(result.items[0].type).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/images\.example|contact@example|utsikt/);
  });
  it("excludes non-upcoming and non-Stockholm municipality cards explicitly", () => {
    const result = parseNotarDom(fixture.replace("Kommande försäljning ", "Till salu").replace("Stockholm kommun", "Uppsala kommun"));
    expect(result.items).toEqual([]);
    expect(result.coverage).toMatchObject({ renderedCards: 2, excludedStatus: 1, excludedLocation: 1, complete: false, totalAvailable: null });
    expect(parseNotarDom(fixture.replace("Solna kommun", "Solna, Uppsala kommun")).items).toHaveLength(1);
  });
  it("deduplicates stable IDs but rejects conflicting repeats", () => {
    const card = fixture.match(/<a class="v-card card"[\s\S]*?<\/a>/)![0];
    expect(parseNotarDom(fixture.replace("</body>", `${card}</body>`)).coverage.duplicates).toBe(1);
    expect(() => parseNotarDom(fixture.replace("</body>", `${card.replace("65 kvm", "66 kvm")}</body>`))).toThrow("Conflicting");
  });
  it.each([
    fixture.replace("Solna kommun", ""),
    fixture.replace("Exempelgatan 1", ""),
    fixture.replace('href="/kopa-bostad/objekt/FIXTURE-ONLY-1"', 'href="/kopa-bostad/objekt/"'),
    fixture.replace('class="v-card-title"', 'class="changed-title"'),
    fixture.replace("2,5 rok", "2x rok"),
    fixture.replace("2,5 rok", "300 rok"),
    fixture.replace("65 kvm", "NaN kvm"),
    fixture.replace("Kommande försäljning ", "Unknown changed status"),
    fixture.replace("3&nbsp;200&nbsp;kr/mån", "-1 kr/mån"),
  ])("fails visibly on missing identity/facts or changed/malformed markup", html => {
    expect(() => parseNotarDom(html)).toThrow();
  });
  it("rejects failed hydration, a non-selected upcoming tab, and oversized inputs", () => {
    expect(() => parseNotarDom('<button class="custom-tab" role="tab" aria-selected="true">Kommande</button>')).toThrow("No rendered");
    expect(() => parseNotarDom(fixture.replace('aria-selected="true" class="custom-tab"', 'aria-selected="false" class="custom-tab"'))).toThrow("tab");
    expect(() => parseNotarDom(" ".repeat(500_001))).toThrow("500 KB");
    const card = fixture.match(/<a class="v-card card"[\s\S]*?<\/a>/)![0];
    expect(() => parseNotarDom(fixture.replace("</body>", `${card.repeat(49)}</body>`))).toThrow("50");
  });
  it.each([
    "http://www.notar.se/kopa-bostad/objekt/TEST",
    "https://www.notar.se.evil.example/kopa-bostad/objekt/TEST",
    "https://user@www.notar.se/kopa-bostad/objekt/TEST",
    "/kopa-bostad/objekt/TEST?token=example",
    "/kopa-bostad/objekt/TEST#contact",
    "/kopa-bostad/objekt/%2F",
    "/salda/TEST",
  ])("rejects unsafe or differently bound source links", url => {
    expect(() => notarListingUrl(url)).toThrow("link");
  });
});

describe("bounded normal-browser preview policy", () => {
  const request = { url: NOTAR_INDEX, method: "GET", type: "document", mainNavigation: true };
  it("allows only the official page, static runtime, and evidenced public data operations", () => {
    expect(notarRequestRole(request)).toBe("page");
    expect(notarRequestRole({ ...request, url: "https://notar-assets.b-cdn.net/_nuxt/app.js", type: "script", mainNavigation: false })).toBe("static");
    expect(notarRequestRole({ ...request, url: "https://data.notar.se/areas?country=example&types[]=example", type: "xhr", mainNavigation: false })).toBe("areas");
    expect(notarRequestRole({ ...request, url: "https://data.notar.se/objects?limit=24&assignmentStatus=example", type: "xhr", mainNavigation: false })).toBe("objects");
    for (const url of ["https://data.notar.se/account", "https://data.notar.se/objects?token=example",
      "https://www.notar.se/contact", "https://notar-assets.b-cdn.net/tracker.js", "http://127.0.0.1/"]) {
      expect(notarRequestRole({ ...request, url, mainNavigation: false })).toBeNull();
    }
    expect(notarRequestRole({ ...request, url: "https://data.notar.se/objects", method: "POST", type: "xhr" })).toBeNull();
    expect(notarRequestRole({ ...request, type: "image" })).toBeNull();
    expect(notarRequestRole({ ...request, url: "https://notar-assets.b-cdn.net/_nuxt/font.woff", type: "font" })).toBeNull();
  });
  it("fails on page-robots exclusions and records missing data policy without inventing permission", async () => {
    const blocked = vi.fn<typeof fetch>().mockResolvedValue(new Response("User-agent: *\nDisallow: /"));
    await expect(notarRobots(blocked)).rejects.toThrow("robots");
    expect(blocked).toHaveBeenCalledTimes(1);
    const missingData = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("User-agent: *\nAllow: /"))
      .mockResolvedValueOnce(new Response("", { status: 403 }));
    expect(await notarRobots(missingData)).toMatchObject({ dataStatus: 403, data: null, delay: 2000 });
  });
  it("honors published delays and rejects unavailable or over-budget robot policies", async () => {
    const delayed = vi.fn<typeof fetch>().mockImplementation(async () => new Response("User-agent: *\nAllow: /\nCrawl-delay: 3"));
    expect((await notarRobots(delayed)).delay).toBe(3000);
    const excessive = vi.fn<typeof fetch>().mockImplementation(async () => new Response("User-agent: *\nAllow: /\nCrawl-delay: 61"));
    await expect(notarRobots(excessive)).rejects.toThrow("delay");
    const failed = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 500 }));
    await expect(notarRobots(failed)).rejects.toThrow("500");
  });
});

async function syntheticBrowser(html: string, dataStatus = 200) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("User-agent: *\nAllow: /"));
  const launch = chromium.launch.bind(chromium);
  vi.spyOn(chromium, "launch").mockImplementation(async options => {
    const browser = await launch(options), createContext = browser.newContext.bind(browser);
    vi.spyOn(browser, "newContext").mockImplementation(async options => {
      const context = await createContext(options), installRoute = context.route.bind(context);
      vi.spyOn(context, "route").mockImplementation(async (pattern, handler, options) => {
        await installRoute(pattern, async (route, request) => {
          vi.spyOn(route, "continue").mockImplementation(async () => {
            await route.fulfill({ status: new URL(request.url()).origin === "https://data.notar.se" ? dataStatus : 200,
              contentType: "text/html; charset=utf-8", body: request.isNavigationRequest() ? html : "",
              headers: { "Access-Control-Allow-Origin": "*" } });
          });
          await handler(route, request);
        }, options);
      });
      return context;
    });
    return browser;
  });
}

describe("actual Chromium with intercepted synthetic pages only", () => {
  it("loads one page, selects the visible tab once, and returns a non-ingestable DOM preview", async () => {
    const html = fixture.replace('aria-selected="true" class="custom-tab"',
      'aria-selected="false" class="custom-tab" onclick="this.setAttribute(\'aria-selected\', \'true\')"');
    await syntheticBrowser(html);
    const result = await renderNotarPreview();
    expect(result.items).toHaveLength(2);
    expect(result.traffic.tabClicks).toBe(1);
    expect(result.traffic.allowedRequests).toBe(1);
    expect(result.traffic.decodedBytes).toBeGreaterThan(0);
    expect(result.ingestible).toBe(false);
  }, 15_000);
  it("stops at the request cap without a retry or empty-success fallback", async () => {
    await syntheticBrowser(fixture.replace("</body>", `<script>for(let i=0;i<${BROWSER_LIMITS.allowedRequests + 5};i++)fetch('/_nuxt/synthetic.js?i='+i).catch(()=>{});</script></body>`));
    await expect(renderNotarPreview()).rejects.toMatchObject({ code: "limit" });
  }, 15_000);
  it("stops on a visible challenge", async () => {
    await syntheticBrowser("<body>Access denied. Verify you are human.</body>");
    await expect(renderNotarPreview()).rejects.toMatchObject({ code: "access_denied" });
  }, 15_000);
  it("stops on an actual denied public-data response", async () => {
    await syntheticBrowser(fixture.replace("</body>", '<script>fetch("https://data.notar.se/objects?limit=24").catch(()=>{})</script></body>'), 403);
    await expect(renderNotarPreview()).rejects.toMatchObject({ code: "access_denied" });
  }, 15_000);
  it("does not return retained cards when the public search request fails", async () => {
    await syntheticBrowser(fixture.replace("</body>", '<script>fetch("https://data.notar.se/objects?limit=24").catch(()=>{})</script></body>'), 503);
    await expect(renderNotarPreview()).rejects.toMatchObject({ code: "not_ready" });
  }, 15_000);
  it("honors a published data-host robots exclusion", async () => {
    await syntheticBrowser(fixture.replace("</body>", '<script>fetch("https://data.notar.se/objects?limit=24").catch(()=>{})</script></body>'));
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => new Response(
      String(input).startsWith("https://data.notar.se") ? "User-agent: *\nDisallow: /objects" : "User-agent: *\nAllow: /"));
    await expect(renderNotarPreview()).rejects.toMatchObject({ code: "robots" });
  }, 15_000);
  it("stops when the actual decoded browser traffic exceeds its byte budget", async () => {
    await syntheticBrowser(fixture.replace("</body>", `<!--${"x".repeat(BROWSER_LIMITS.decodedBytes + 1)}--></body>`));
    await expect(renderNotarPreview()).rejects.toThrow("traffic exceeded its byte budget");
  }, 15_000);
});

it("CLI keeps facts in an exclusive private file, emits counts only, and rejects in-repository output", () => {
  const dir = mkdtempSync(join(tmpdir(), "notar-preview-test-"));
  try {
    const output = join(dir, "preview.json"), cli = resolve("scripts/preview-notar.ts");
    const args = ["--import", "tsx", cli, "--from-html", resolve("tests/fixtures/notar-rendered.html"), "--output", output];
    const stdout = execFileSync(process.execPath, args, { encoding: "utf8" });
    expect(stdout).toContain('"matchedItems":2');
    expect(stdout).not.toContain("Exempelgatan");
    expect(statSync(output).mode & 0o777).toBe(0o600);
    expect(feedSchema.safeParse(JSON.parse(readFileSync(output, "utf8"))).success).toBe(false);
    expect(spawnSync(process.execPath, args).status).toBe(1);
    const inRepo = resolve("notar-preview-must-not-exist.json");
    expect(spawnSync(process.execPath, [...args.slice(0, -1), inRepo]).status).toBe(1);
    expect(existsSync(inRepo)).toBe(false);
  } finally { rmSync(dir, { recursive: true }); }
});
