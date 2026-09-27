import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { load } from "cheerio";
import { feedSchema } from "../shared/model";
import { parseHusmanHagbergDom } from "../scripts/husmanhagberg-dom";
import { parseMohvDom } from "../scripts/mohv-dom";
import { brokerRequestRole, brokerRobots, parseBrokerCapture, renderBrokerPreview, unsupportedFunctionalRead } from "../scripts/broker-browser";
import { BROKER_INDEXES, BROWSER_LIMITS, canonicalObjectLink, domHash } from "../scripts/preview-common";

const hh = readFileSync(new URL("./fixtures/husmanhagberg-rendered.html", import.meta.url), "utf8");
const mohv = readFileSync(new URL("./fixtures/mohv-rendered.html", import.meta.url), "utf8");
afterEach(() => { vi.restoreAllMocks(); });

describe("observed HusmanHagberg DOM with synthetic facts", () => {
  it("normalizes minimal facts and excludes contradictory status and non-county cards", () => {
    const preview = parseHusmanHagbergDom(hh, 4);
    expect(preview.items).toHaveLength(2);
    expect(preview.items[0]).toEqual({
      id: "husmanhagberg:HH-FIXTURE-1", externalId: "HH-FIXTURE-1", sourceId: "husmanhagberg",
      status: "upcoming", county: "Stockholms län", municipality: "Solna", area: "Exempelområdet",
      address: "Exempelgatan 1", type: null, price: 3200000, rooms: 2.5, size: 65.5, fee: null,
      url: "https://www.husmanhagberg.se/objekt/exempelgatan-1/HH-FIXTURE-1/",
    });
    expect(preview.items[1]).toMatchObject({ size: null, price: null, type: null, fee: null });
    expect(preview.coverage).toMatchObject({ sampledCards: 4, renderedCards: 4, excludedStatus: 1, excludedLocation: 1, unrecognizedFacts: 1, truncated: false });
    expect(feedSchema.safeParse(preview).success).toBe(false);
    expect(preview.observedAt).toBeNull();
  });
  it("does not match a municipality prefix, infer a type, or copy image/contact/description text", () => {
    const html = hh.replace("Exempelområdet, Solna", "Exempelområdet, Solna tätort")
      .replace("Testvägen 2", "Villavägen 2").replace("</h3>", '</h3><p>contact@example.com</p><img src="https://images.example/home.jpg">');
    const result = parseHusmanHagbergDom(html);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/contact@example|images.example/);
  });
  it.each([
    ["Kommande®", "Changed status"],
    ["65.5 kvm", "NaN kvm"],
    ["65.5 kvm", "-1 kvm"],
    ["2,5 rum", "300 rum"],
    ["3&nbsp;200&nbsp;000&nbsp;kr", "3&nbsp;20&nbsp;000&nbsp;kr"],
    ["Exempelområdet, Solna", ""],
    ["Exempelgatan 1</h3>", "</h3>"],
    ['class="mt-4"', 'class="changed-details"'],
    ["<span>65.5 kvm</span>", "<span>65.5 kvm</span><span>66 kvm</span>"],
  ])("rejects malformed or changed facts: %s", (old, replacement) => {
    expect(() => parseHusmanHagbergDom(hh.replace(old, replacement))).toThrow();
  });
});

describe("observed MOHV DOM with synthetic facts", () => {
  it("uses explicit geographic attributes, visible status, and explicit type labels only", () => {
    const result = parseMohvDom(mohv, 3);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ id: "mohv:MOHV-FIXTURE-1", type: "Villa", price: 3200000, rooms: 2.5, size: 65.5, fee: null, municipality: "Solna" });
    expect(result.items[1]).toMatchObject({ type: null, price: null, size: null });
    expect(result.coverage).toMatchObject({ renderedCards: 3, sampledCards: 3, excludedLocation: 1, unrecognizedFacts: 2, unknownPropertyTypes: 1 });
    expect(feedSchema.safeParse(result).success).toBe(false);
  });
  it("does not substitute a displayed neighborhood for municipality or accept contradictory county/status", () => {
    expect(parseMohvDom(mohv.replace('data-municipality="Solna"', 'data-municipality="Solna tätort"')).items).toHaveLength(1);
    expect(parseMohvDom(mohv.replace('data-county="Stockholm"', 'data-county="Uppsala"')).coverage.excludedLocation).toBe(2);
    expect(parseMohvDom(mohv.replace('is-coming"', 'is-coming is-bidding"')).coverage.excludedStatus).toBe(1);
    expect(parseMohvDom(mohv.replace("estate-listitem-kommande", "estate-listitem-till-salu")).coverage.excludedStatus).toBe(1);
  });
  it.each([
    ["Snart här", "Till salu"],
    ['data-area="Exempelområdet"', ""],
    ['data-municipality="Solna"', ""],
    ['data-area="Exempelområdet"', 'data-area=""'],
    ["65.5 kvm", "65 sqm"],
    ["65.5 kvm", "-65 kvm"],
    ["2,5</span>", "NaN</span>"],
    ["3 200 000 kr", "320000000 kr"],
    ["vitec-estate-list-item-title", "changed-title"],
    ["Exempelgatan 1</h2>", "</h2>"],
  ])("rejects changed or malformed required markup: %s", (old, replacement) => {
    expect(() => parseMohvDom(mohv.replace(old, replacement))).toThrow();
  });
  it("never uses numeric data attributes, plot area, description, images or address-based type guesses", () => {
    const result = parseMohvDom(mohv.replace('data-area="Testområdet"', 'data-area="Testområdet" data-price="999999"')
      .replace("Parhus", "Unknown").replace("Testvägen 2", "Villagatan 2")
      .replace('<span class="vitec-estate-list-item-image"></span>', '<img src="https://images.example/house.jpg"><p>Lovely house. contact@example.com</p>'));
    expect(result.items[1]).toMatchObject({ price: null, type: null, size: null });
    expect(JSON.stringify(result)).not.toMatch(/contact@example|images.example|Lovely/);
  });
});

describe("source binding, duplicates, and honest bounded coverage", () => {
  it.each(["husmanhagberg", "mohv"] as const)("strictly binds %s links to the canonical source", source => {
    const path = source === "mohv" ? "/objekt/solna/example/TEST/" : "/objekt/example/TEST/";
    expect(canonicalObjectLink(path, source).externalId).toBe("TEST");
    for (const href of [
      `http://${new URL(BROKER_INDEXES[source]).hostname}${path}`,
      `https://evil.example${path}`,
      `https://user@${new URL(BROKER_INDEXES[source]).hostname}${path}`,
      `${path}?token=example`, `${path}#contact`, path.replace("example", "%2F"), "/objekt/",
      path.replace("TEST", "%2f"),
    ]) expect(() => canonicalObjectLink(href, source)).toThrow("link");
  });
  it.each([
    [hh, parseHusmanHagbergDom, "body > .grid", "div.group"],
    [mohv, parseMohvDom, "section.vitec-estate-list", "section.vitec-estate-list-item"],
  ] as const)("deduplicates identical IDs, rejects conflicts and refuses oversized/empty windows", (fixture, parse, root, card) => {
    const $ = load(fixture), list = $(root), first = list.children(card).first().clone();
    list.append(first);
    expect(parse($.html()).coverage.duplicates).toBe(1);
    first.find("h2,h3").text("Conflicting address");
    expect(() => parse($.html())).toThrow("Conflicting duplicate");
    list.empty();
    expect(() => parse($.html())).toThrow("No rendered");
    for (let i = 0; i < 51; i++) list.append(first.clone());
    expect(() => parse($.html())).toThrow("50 cards");
    expect(() => parse(" ".repeat(500001))).toThrow("500 KB");
  });
  it("preserves identity/time/count from an original saved capture, but never from a bare DOM", () => {
    const capture = { kind: "broker-dom-capture", version: 1, sourceId: "mohv", observationId: "12345678-1234-4234-8234-123456789012",
      observedAt: "2001-01-01T00:00:00.000Z", renderedCards: 3, html: mohv, sha256: domHash(mohv) };
    expect(parseBrokerCapture(capture)).toEqual(parseBrokerCapture(capture));
    expect(parseBrokerCapture(capture)).toMatchObject({ observedAt: capture.observedAt, observationId: capture.observationId });
    expect(parseMohvDom(mohv)).toMatchObject({ observedAt: null, observationId: null, coverage: { renderedCards: null, sampledCards: 3, truncated: null, totalAvailable: null } });
    expect(() => parseBrokerCapture({ ...capture, html: mohv + " " })).toThrow("hash");
    expect(() => parseBrokerCapture({ ...capture, observedAt: "2001-01-01T00:00:00Z" })).toThrow("metadata");
    expect(() => parseBrokerCapture({ ...capture, observationId: "made-up" })).toThrow("metadata");
    expect(() => parseBrokerCapture({ ...capture, renderedCards: 266 })).toThrow("window");
  });
});

describe("common normal-browser request and robots safeguards", () => {
  const request = { url: BROKER_INDEXES.husmanhagberg, method: "GET", type: "document", mainNavigation: true };
  it("allows only page-generated evidenced HH search and source-declared runtime", () => {
    expect(brokerRequestRole("husmanhagberg", request)).toBe("page");
    const data = { ...request, url: "https://api.husmanhagberg.se/object/api/objects/?c=true&ps=18&onlyCoordinates=true", type: "fetch", mainNavigation: false };
    expect(brokerRequestRole("husmanhagberg", data)).toBe("public-search");
    for (const changed of [{ ...data, method: "POST" }, { ...data, url: data.url + "&changed=1" }, { ...data, url: "https://api.husmanhagberg.se/changed" }]) {
      expect(brokerRequestRole("husmanhagberg", changed)).toBeNull();
      expect(unsupportedFunctionalRead("husmanhagberg", changed)).toBe(true);
    }
    expect(brokerRequestRole("husmanhagberg", { ...data, url: "https://assets.cdn.husmanhagberg.se/assets-production/_next/static/app.js", type: "script" })).toBe("runtime");
    expect(unsupportedFunctionalRead("husmanhagberg", { ...data, url: "https://www.husmanhagberg.se/api/auth/session/?renew=true" })).toBe(false);
    expect(unsupportedFunctionalRead("husmanhagberg", { ...data, url: "https://www.husmanhagberg.se/_next/data/build/objekt/example/TEST.json?lang=sv&slug=example" })).toBe(false);
  });
  it("does not allow MOHV forms, maps, WordPress admin, or any unobserved functional data operation", () => {
    const req = { ...request, url: "https://www.mohv.se/wp-content/plugins/vitec-wp-plugin/assets/script/search.js?ver=1", type: "script", mainNavigation: false };
    expect(brokerRequestRole("mohv", req)).toBe("runtime");
    for (const url of ["https://www.mohv.se/wp-admin/admin-ajax.php", "https://www.mohv.se/wp-json/changed",
      "https://www.mohv.se/wp-content/plugins/vitec-wp-plugin/assets/script/leads-form.js",
      "https://maps.googleapis.com/maps/api/js", "https://www.mohv.se/wp-content/photo.jpg"]) {
      expect(brokerRequestRole("mohv", { ...req, url })).toBeNull();
    }
    expect(unsupportedFunctionalRead("mohv", { ...req, type: "fetch", url: "https://www.mohv.se/wp-admin/admin-ajax.php" })).toBe(true);
    expect(brokerRequestRole("mohv", { ...req, type: "image" })).toBeNull();
    expect(brokerRequestRole("mohv", { ...req, url: req.url + "&token=changed" })).toBeNull();
  });
  it.each(["husmanhagberg", "mohv"] as const)("rejects %s page exclusion and positive per-request delay before launch", async source => {
    const denied = vi.fn<typeof fetch>().mockResolvedValue(new Response("User-agent: *\nDisallow: /"));
    await expect(brokerRobots(source, denied)).rejects.toMatchObject({ code: "robots" });
    expect(denied).toHaveBeenCalledTimes(1);
    const delayed = vi.fn<typeof fetch>().mockResolvedValue(new Response("User-agent: *\nAllow: /\nCrawl-delay: 1"));
    await expect(brokerRobots(source, delayed)).rejects.toThrow("per-request");
    expect(delayed).toHaveBeenCalledTimes(1);
  });
  it("records only the observed missing HH data policy and rejects other failures/delays", async () => {
    const fetcher = (status: number, text = "") => vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("User-agent: *\nAllow: /"))
      .mockResolvedValueOnce(new Response(text, { status }));
    expect(await brokerRobots("husmanhagberg", fetcher(404))).toMatchObject({ data: null, dataStatus: 404 });
    for (const status of [403, 429, 500]) await expect(brokerRobots("husmanhagberg", fetcher(status))).rejects.toThrow();
    await expect(brokerRobots("husmanhagberg", fetcher(200, "User-agent: *\nAllow: /\nCrawl-delay: 3"))).rejects.toThrow("per-request");
  });
});

async function interceptedBrowser(html: string, dependencyStatus = 200) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("User-agent: *\nAllow: /"));
  const launch = chromium.launch.bind(chromium);
  vi.spyOn(chromium, "launch").mockImplementation(async options => {
    const browser = await launch(options), create = browser.newContext.bind(browser);
    vi.spyOn(browser, "newContext").mockImplementation(async options => {
      const context = await create(options), install = context.route.bind(context);
      vi.spyOn(context, "route").mockImplementation(async (pattern, handler, options) => {
        await install(pattern, async (route, request) => {
          vi.spyOn(route, "continue").mockImplementation(async () => {
            await route.fulfill({ status: request.isNavigationRequest() ? 200 : dependencyStatus,
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

describe("actual Chromium, with all network intercepted", () => {
  it.each(["husmanhagberg", "mohv"] as const)("renders %s once, preserves capture metadata, and stores only the card region", async source => {
    const html = (source === "mohv" ? mohv : hh.replace("</body>", '<script>fetch("https://api.husmanhagberg.se/object/api/objects/?c=true").then(response=>response.text()).catch(()=>{})</script></body>'))
      .replace("</body>", '<p>Unrelated private contact text</p><img src="https://images.example/photo.jpg"></body>');
    await interceptedBrowser(html);
    const result = await renderBrokerPreview(source);
    expect(result.preview.items).toHaveLength(2);
    expect(result.traffic).toMatchObject({ allowedRequests: source === "mohv" ? 1 : 2, blockedRequests: 1, tabClicks: 0 });
    expect(result.traffic.decodedBytes).toBeGreaterThan(0);
    expect(result.capture.html).not.toMatch(/Unrelated private|images.example|promotional panel/);
    expect(result.preview.observationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.preview.observedAt).toBe(result.capture.observedAt);
    expect(parseBrokerCapture(result.capture)).toEqual(result.preview);
  }, 15000);
  it("does not report retained HH cards when its primary public search never succeeds", async () => {
    await interceptedBrowser(hh);
    await expect(renderBrokerPreview("husmanhagberg")).rejects.toThrow("No successful public card search");
  }, 15000);
  it("takes exactly the first 50 of 266 cards, with truthful pre-window counts", async () => {
    const $ = load(mohv), list = $("section.vitec-estate-list"), first = list.children().first().clone();
    list.empty();
    for (let i = 0; i < 266; i++) {
      const card = first.clone();
      card.children("a").attr("href", `/objekt/solna/example/TEST-${i}/`);
      list.append(card);
    }
    await interceptedBrowser($.html());
    const result = await renderBrokerPreview("mohv");
    expect(result.preview.coverage).toMatchObject({ renderedCards: 266, sampledCards: 50, windowLimit: 50, truncated: true, totalAvailable: null, complete: false });
    expect(result.preview.items).toHaveLength(50);
    expect(result.preview.items.at(-1)?.externalId).toBe("TEST-49");
    expect(result.capture.html).not.toContain("TEST-50/");
  }, 15000);
  it.each([
    ["husmanhagberg", "https://api.husmanhagberg.se/object/api/objects/?c=true&newParameter=1"],
    ["husmanhagberg", "https://api.husmanhagberg.se/changed-search"],
    ["husmanhagberg", "https://www.husmanhagberg.se/api/changed-search"],
    ["mohv", "https://www.mohv.se/wp-admin/admin-ajax.php"],
    ["mohv", "https://new-data.example/changed-search"],
  ] as const)("fails on unsupported %s functional reads rather than returning retained cards", async (source, url) => {
    await interceptedBrowser((source === "mohv" ? mohv : hh).replace("</body>", `<script>fetch("${url}").catch(()=>{})</script></body>`));
    await expect(renderBrokerPreview(source)).rejects.toMatchObject({ code: "not_ready" });
  }, 15000);
  it.each([403, 503, 302])("fails on required public-search HTTP %s", async status => {
    await interceptedBrowser(hh.replace("</body>", '<script>fetch("https://api.husmanhagberg.se/object/api/objects/?c=true").catch(()=>{})</script></body>'), status);
    await expect(renderBrokerPreview("husmanhagberg")).rejects.toMatchObject({ code: status === 403 ? "access_denied" : "not_ready" });
  }, 15000);
  it("honors a published HH data-path robots exclusion", async () => {
    await interceptedBrowser(hh.replace("</body>", '<script>fetch("https://api.husmanhagberg.se/object/api/objects/?c=true").catch(()=>{})</script></body>'));
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => new Response(String(input).startsWith("https://api.")
      ? "User-agent: *\nDisallow: /object/" : "User-agent: *\nAllow: /"));
    await expect(renderBrokerPreview("husmanhagberg")).rejects.toMatchObject({ code: "robots" });
  }, 15000);
  it("stops on a visible challenge", async () => {
    await interceptedBrowser("<body>Verify you are human. CAPTCHA required.</body>");
    await expect(renderBrokerPreview("mohv")).rejects.toMatchObject({ code: "access_denied" });
  }, 15000);
  it("enforces actual decoded-byte limits", async () => {
    await interceptedBrowser(mohv.replace("</body>", `<!--${"x".repeat(BROWSER_LIMITS.decodedBytes + 1)}--></body>`));
    await expect(renderBrokerPreview("mohv")).rejects.toMatchObject({ code: "limit" });
  }, 15000);
  it("enforces request limits independently of the small extracted card region", async () => {
    await interceptedBrowser(hh.replace("</body>", `<script>for(let i=0;i<105;i++){const s=document.createElement("script");s.src="/_next/static/fixture"+i+".js";document.head.appendChild(s)}</script></body>`));
    await expect(renderBrokerPreview("husmanhagberg")).rejects.toMatchObject({ code: "limit" });
  }, 15000);
  it("counts blocked images toward the attempted-request cap", async () => {
    await interceptedBrowser(mohv.replace("</body>", `<script>for(let i=0;i<205;i++){const image=new Image();image.src="https://images.example/"+i+".jpg";document.body.appendChild(image)}</script></body>`));
    await expect(renderBrokerPreview("mohv")).rejects.toMatchObject({ code: "limit" });
  }, 15000);
  it("fails rather than returning retained MOHV cards after a required script HTTP failure", async () => {
    await interceptedBrowser(mohv.replace("</body>", '<script src="/wp-content/plugins/vitec-wp-plugin/assets/script/search.js"></script></body>'), 503);
    await expect(renderBrokerPreview("mohv")).rejects.toMatchObject({ code: "not_ready" });
  }, 15000);
});

it("CLI is offline, count-only and private; replay never renews capture time or identity", () => {
  const dir = mkdtempSync(join(tmpdir(), "broker-preview-test-"));
  try {
    const cli = resolve("scripts/preview-broker.ts"), output = join(dir, "preview.json");
    const args = ["--import", "tsx", cli, "--source", "mohv", "--from-html", resolve("tests/fixtures/mohv-rendered.html"), "--output", output];
    const stdout = execFileSync(process.execPath, args, { encoding: "utf8" });
    expect(stdout).toContain('"matchedItems":2');
    expect(stdout).not.toMatch(/Exempelgatan|MOHV-FIXTURE/);
    expect(statSync(output).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({ observedAt: null, observationId: null, coverage: { renderedCards: null, truncated: null } });
    expect(spawnSync(process.execPath, args).status).toBe(1);
    const inside = resolve("broker-preview-must-not-exist.json");
    expect(spawnSync(process.execPath, [...args.slice(0, -1), inside]).status).toBe(1);
    expect(existsSync(inside)).toBe(false);
    const symlink = join(dir, "checkout");
    symlinkSync(resolve("."), symlink, "dir");
    expect(spawnSync(process.execPath, [...args.slice(0, -1), join(symlink, "broker-preview-must-not-exist.json")]).status).toBe(1);
    const capture = { kind: "broker-dom-capture", version: 1, sourceId: "mohv", observationId: "12345678-1234-4234-8234-123456789012",
      observedAt: "2001-01-01T00:00:00.000Z", renderedCards: 3, html: mohv, sha256: domHash(mohv) };
    const captureFile = join(dir, "capture.json");
    writeFileSync(captureFile, JSON.stringify(capture), { mode: 0o600 });
    for (const name of ["replay-a.json", "replay-b.json"]) {
      execFileSync(process.execPath, ["--import", "tsx", cli, "--source", "mohv", "--from-capture", captureFile, "--output", join(dir, name)]);
      expect(JSON.parse(readFileSync(join(dir, name), "utf8"))).toMatchObject({ observedAt: capture.observedAt, observationId: capture.observationId });
    }
    expect(spawnSync(process.execPath, ["--import", "tsx", cli, "--source", "husmanhagberg", "--from-capture", captureFile, "--output", join(dir, "wrong-source.json")]).status).toBe(1);
  } finally { rmSync(dir, { recursive: true }); }
});
