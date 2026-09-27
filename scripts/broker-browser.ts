import { randomUUID } from "node:crypto";
import { chromium, type Request } from "@playwright/test";
import robotsParser from "robots-parser";
import { boundedText, CollectionError, LIMITS, USER_AGENT } from "./collector";
import { HUSMANHAGBERG_RESULTS, parseHusmanHagbergDom } from "./husmanhagberg-dom";
import { MOHV_RESULTS, parseMohvDom } from "./mohv-dom";
import {
  BROKER_INDEXES, BROWSER_LIMITS, domHash, SourcePreviewError, validatedCapture, WINDOW_LIMIT,
  type BrokerCapture, type BrokerId,
} from "./preview-common";

export type BrowserResource = { url: string; method: string; type: string; mainNavigation: boolean };
const HH_DATA = "https://api.husmanhagberg.se";
const searchParameters = ["c", "ps", "onlyCoordinates"];
type Role = "page" | "runtime" | "style" | "public-search";
const safeUrl = (request: BrowserResource) => {
  let url: URL;
  try { url = new URL(request.url); } catch { return null; }
  return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash ? url : null;
};

export function brokerRequestRole(source: BrokerId, request: BrowserResource): Role | null {
  const url = safeUrl(request);
  if (!url || ["image", "media", "font"].includes(request.type)) return null;
  const origin = new URL(BROKER_INDEXES[source]).origin;
  if (request.method === "GET" && request.mainNavigation && url.href === BROKER_INDEXES[source]) return "page";
  if (request.mainNavigation) return null;
  if (source === "husmanhagberg") {
    if (url.origin === HH_DATA && url.pathname === "/object/api/objects/"
      && ["GET", "OPTIONS"].includes(request.method) && ["xhr", "fetch", "other"].includes(request.type)
      && [...url.searchParams.keys()].every(key => searchParameters.includes(key))) return "public-search";
    if (request.method === "GET" && ["script", "stylesheet"].includes(request.type)
      && ((url.origin === "https://assets.cdn.husmanhagberg.se" && url.pathname.startsWith("/assets-production/_next/static/"))
        || (url.origin === origin && url.pathname.startsWith("/_next/static/")))) return "runtime";
    return null;
  }
  if (url.origin !== origin || request.method !== "GET" || [...url.searchParams.keys()].some(key => key !== "ver")) return null;
  if (request.type === "stylesheet" && /^\/wp-(content|includes)\//.test(url.pathname)) return "style";
  if (request.type === "script" && (/^\/wp-includes\/js\/(jquery|dist)\//.test(url.pathname)
    || url.pathname.startsWith("/wp-content/themes/Divi/")
    || /^\/wp-content\/plugins\/vitec-wp-plugin\/assets\/script\/(vitec|ractive|search|glideinit)\.js$/.test(url.pathname)
    || url.pathname.startsWith("/wp-content/plugins/vitec-wp-plugin/assets/script/glide-3.4.1/"))) return "runtime";
  return null;
}

function optionalBlockedRead(source: BrokerId, request: BrowserResource) {
  if (source !== "husmanhagberg" || request.method !== "GET") return false;
  const url = safeUrl(request);
  if (!url) return false;
  if (url.origin === "https://cms.husmanhagberg.se" && url.pathname === "/wp-json/bra/v1/fastighetsmaklare/" && !url.search) return true;
  if (url.origin !== "https://www.husmanhagberg.se") return false;
  if (url.pathname === "/api/auth/session/" && [...url.searchParams.keys()].every(key => key === "renew")) return true;
  // Next's observed navigation/detail prefetches are not needed for this fixed index; never follow them.
  return /^\/_next\/data\/[a-zA-Z0-9_-]+\/(index|kopa|fastighetsmaklare|mina-sidor|kategori\/inspiration|objekt\/[^/]+\/[a-zA-Z0-9_-]+)\.json$/.test(url.pathname)
    && [...url.searchParams.keys()].every(key => ["lang", "slug"].includes(key));
}

export function unsupportedFunctionalRead(source: BrokerId, request: BrowserResource) {
  if (brokerRequestRole(source, request)) return false;
  if (["xhr", "fetch"].includes(request.type)) return !optionalBlockedRead(source, request);
  const url = safeUrl(request);
  if (!url) return false;
  if (source === "husmanhagberg" && url.origin === HH_DATA) return true;
  if (request.mainNavigation) return true;
  if (request.type !== "script") return false;
  if (source === "husmanhagberg")
    return ["https://assets.cdn.husmanhagberg.se", "https://www.husmanhagberg.se"].includes(url.origin);
  if (url.origin !== "https://www.mohv.se") return false;
  return !(/^\/wp-content\/plugins\/(contact-form-7|wpcf7-redirect|divi-assistant|divi-carousel-maker)\//.test(url.pathname)
    || /^\/wp-content\/plugins\/vitec-wp-plugin\/assets\/script\/(interest-form|leads-form)\.js$/.test(url.pathname)
    || url.pathname.startsWith("/wp-includes/js/mediaelement/"));
}

export async function brokerRobots(source: BrokerId, fetcher: typeof fetch = fetch) {
  const robotsUrl = new URL("/robots.txt", BROKER_INDEXES[source]).href;
  const page = robotsParser(robotsUrl, await boundedText(robotsUrl, fetcher, LIMITS.robotsBytes));
  if (page.isAllowed(BROKER_INDEXES[source], USER_AGENT) !== true)
    throw new SourcePreviewError("robots", "Page robots unavailable or excluding the index");
  if ((page.getCrawlDelay(USER_AGENT) || 0) > 0)
    throw new SourcePreviewError("robots", "Positive per-request crawl delay is incompatible with browser mode");
  let data: ReturnType<typeof robotsParser> | null = null, dataStatus: number | null = null;
  if (source === "husmanhagberg") {
    const dataUrl = `${HH_DATA}/robots.txt`;
    try {
      const body = await boundedText(dataUrl, async (input, init) => {
        const response = await fetcher(input, init); dataStatus = response.status; return response;
      }, LIMITS.robotsBytes);
      data = robotsParser(dataUrl, body);
    } catch (error) {
      // Observed 404 is a missing policy, not a reuse grant or a denied application operation.
      if (!(error instanceof CollectionError) || dataStatus !== 404) throw error;
    }
    if ((data?.getCrawlDelay(USER_AGENT) || 0) > 0)
      throw new SourcePreviewError("robots", "Positive per-request crawl delay is incompatible with browser mode");
  }
  return { page, data, dataStatus };
}

export function parseBrokerHtml(source: BrokerId, html: string, renderedCards: number | null = null) {
  return source === "husmanhagberg" ? parseHusmanHagbergDom(html, renderedCards) : parseMohvDom(html, renderedCards);
}
export function parseBrokerCapture(value: unknown) {
  const capture = validatedCapture(value);
  return {
    ...parseBrokerHtml(capture.sourceId, capture.html, capture.renderedCards),
    observationId: capture.observationId, observedAt: capture.observedAt,
    evidence: "saved DOM capture; original observation identity and time preserved",
  };
}

export async function renderBrokerPreview(source: BrokerId) {
  const policy = await brokerRobots(source);
  await new Promise(resolve => setTimeout(resolve, LIMITS.delayMs));
  const browser = await chromium.launch({ timeout: BROWSER_LIMITS.navigationMs });
  let failure: SourcePreviewError | null = null;
  const stop = (code: SourcePreviewError["code"], message: string) => {
    failure ??= new SourcePreviewError(code, message);
    void browser.close();
  };
  const timeout = setTimeout(() => stop("limit", "Browser preview exceeded its deadline"), BROWSER_LIMITS.totalMs);
  const metrics = {
    attemptedRequests: 0, allowedRequests: 0, blockedRequests: 0, decodedBytes: 0, encodedBytes: 0, tabClicks: 0,
    successfulSearchResponses: 0,
    operations: [] as { role: Role | "blocked-optional" | "unsupported"; method: string; parameterNames: string[] }[],
    robots: { page: "allowed", dataStatus: policy.dataStatus, dataPolicy: source === "mohv" ? "not used" : policy.data ? "published" : "404; no reuse grant" },
  };
  const intentionalAborts = new WeakSet<Request>();
  try {
    const context = await browser.newContext({ serviceWorkers: "block" }), page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    cdp.on("Network.dataReceived", event => {
      metrics.decodedBytes += event.dataLength;
      if (metrics.decodedBytes > BROWSER_LIMITS.decodedBytes) stop("limit", "Browser traffic exceeded its decoded-byte budget");
    });
    cdp.on("Network.loadingFinished", event => { metrics.encodedBytes += event.encodedDataLength; });
    const resource = (request: Request): BrowserResource => ({
      url: request.url(), method: request.method(), type: request.resourceType(),
      mainNavigation: request.isNavigationRequest() && request.frame() === page.mainFrame(),
    });
    page.on("response", response => {
      const role = brokerRequestRole(source, resource(response.request())), status = response.status();
      if (role && [401, 403, 429].includes(status)) stop("access_denied", "Public site denied access; no retry or workaround");
      else if (role && status >= 300 && status !== 304) stop("not_ready", "A required page dependency failed or redirected; retained cards are not fresh evidence");
      else if (role === "public-search" && response.request().method() === "GET" && status === 200
        && !new URL(response.url()).searchParams.has("onlyCoordinates")) metrics.successfulSearchResponses++;
    });
    page.on("requestfailed", request => {
      if (!intentionalAborts.has(request) && brokerRequestRole(source, resource(request)))
        stop("not_ready", "A required page dependency failed; no successful retained-card preview");
    });
    await context.route("**/*", async route => {
      const request = route.request(), input = resource(request), url = new URL(input.url), role = brokerRequestRole(source, input);
      const abort = () => { intentionalAborts.add(request); return route.abort(); };
      if (++metrics.attemptedRequests > BROWSER_LIMITS.attemptedRequests) { await abort(); stop("limit", "Attempted-request budget exceeded"); return; }
      if (["xhr", "fetch"].includes(input.type) && metrics.operations.length < 20)
        metrics.operations.push({ role: role ?? (optionalBlockedRead(source, input) ? "blocked-optional" : "unsupported"),
          method: input.method, parameterNames: [...new Set(url.searchParams.keys())].slice(0, 20) });
      if (!role) {
        metrics.blockedRequests++;
        await abort();
        if (unsupportedFunctionalRead(source, input)) stop("not_ready", "Unsupported functional operation blocked; retained cards are not fresh evidence");
        return;
      }
      const robots = url.origin === new URL(BROKER_INDEXES[source]).origin ? policy.page : role === "public-search" ? policy.data : null;
      if (robots && robots.isAllowed(url.href, USER_AGENT) !== true) { await abort(); stop("robots", "Robots excludes a page dependency"); return; }
      if (++metrics.allowedRequests > BROWSER_LIMITS.allowedRequests) { await abort(); stop("limit", "Allowed-request budget exceeded"); return; }
      await route.continue();
    });
    await page.goto(BROKER_INDEXES[source], { waitUntil: "domcontentloaded", timeout: BROWSER_LIMITS.navigationMs });
    const checkChallenge = async () => {
      if (/verify you are human|access denied|checking your browser|captcha.{0,30}required|complete.{0,30}captcha/i.test(await page.locator("body").innerText()))
        throw new SourcePreviewError("access_denied", "Public page shows an access challenge; no workaround");
    };
    await checkChallenge();
    const selector = source === "husmanhagberg" ? HUSMANHAGBERG_RESULTS : MOHV_RESULTS;
    await page.locator(selector).waitFor({ state: "attached", timeout: BROWSER_LIMITS.readinessMs });
    await page.waitForLoadState("networkidle", { timeout: BROWSER_LIMITS.readinessMs });
    await checkChallenge();
    if (source === "husmanhagberg" && metrics.successfulSearchResponses === 0)
      throw new SourcePreviewError("not_ready", "No successful public card search observed; retained cards are not fresh evidence");
    const region = await page.locator(selector).evaluate((element, options) => {
      const children = [...element.children].filter(child => child.matches(options.cardSelector));
      const clone = element.cloneNode(false) as Element;
      for (const child of children.slice(0, options.windowLimit)) clone.appendChild(child.cloneNode(true));
      clone.querySelectorAll("script,style,img,svg,picture,video,audio,iframe,form,button,input").forEach(node => node.remove());
      for (const node of [clone, ...clone.querySelectorAll("*")]) {
        for (const attribute of [...node.attributes]) {
          if (!["class", "href", "data-municipality", "data-county", "data-area"].includes(attribute.name)) node.removeAttribute(attribute.name);
        }
      }
      return { html: clone.outerHTML, renderedCards: children.length };
    }, { windowLimit: WINDOW_LIMIT, cardSelector: source === "husmanhagberg" ? "div.group" : "section.vitec-estate-list-item" });
    if (failure) throw failure;
    const capture: BrokerCapture = {
      kind: "broker-dom-capture", version: 1, sourceId: source, observationId: randomUUID(),
      observedAt: new Date().toISOString(), ...region, sha256: domHash(region.html),
    };
    const preview = parseBrokerCapture(capture);
    return { preview, capture, traffic: metrics };
  } catch (error) {
    if (failure) throw failure;
    if (error instanceof SourcePreviewError) throw error;
    throw new SourcePreviewError("not_ready", "Public page did not become ready within the bounded preview");
  } finally {
    clearTimeout(timeout);
    await browser.close();
  }
}
