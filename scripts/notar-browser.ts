import { chromium, type Request } from "@playwright/test";
import robotsParser from "robots-parser";
import { boundedText, CollectionError, LIMITS, USER_AGENT } from "./collector";
import { NOTAR_INDEX, NotarPreviewError, parseNotarDom } from "./notar-dom";

export const BROWSER_LIMITS = { allowedRequests: 100, attemptedRequests: 200, decodedBytes: 12_000_000, totalMs: 30_000, navigationMs: 15_000, readinessMs: 10_000 };
const dataParameters: Record<string, readonly string[]> = {
  "/areas": ["country", "types[]"],
  "/objects": ["limit", "sortBy", "sortOrder", "assignmentStatus", "compactObjects"],
};
type Resource = { url: string; method: string; type: string; mainNavigation: boolean };

export function notarRequestRole(request: Resource): "page" | "bootstrap" | "static" | "areas" | "objects" | null {
  let url: URL;
  try { url = new URL(request.url); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || ["image", "font", "media"].includes(request.type)) return null;
  if (url.origin === "https://www.notar.se" && request.method === "GET") {
    if (request.mainNavigation && url.toString() === NOTAR_INDEX) return "page";
    if (!request.mainNavigation && url.pathname.startsWith("/_nuxt/") && ["script", "stylesheet", "fetch", "xhr"].includes(request.type)) return "bootstrap";
  }
  if (url.origin === "https://notar-assets.b-cdn.net" && url.pathname.startsWith("/_nuxt/")
    && request.method === "GET" && ["script", "stylesheet"].includes(request.type)) return "static";
  if (url.origin === "https://data.notar.se" && Object.hasOwn(dataParameters, url.pathname)
    && ["GET", "OPTIONS"].includes(request.method) && ["xhr", "fetch", "other"].includes(request.type)
    && [...url.searchParams.keys()].every(key => dataParameters[url.pathname].includes(key))) {
    return url.pathname === "/areas" ? "areas" : "objects";
  }
  return null;
}

export async function notarRobots(fetcher: typeof fetch = fetch) {
  const pageUrl = "https://www.notar.se/robots.txt", dataUrl = "https://data.notar.se/robots.txt";
  const page = robotsParser(pageUrl, await boundedText(pageUrl, fetcher, LIMITS.robotsBytes));
  if (page.isAllowed(NOTAR_INDEX, USER_AGENT) !== true) throw new NotarPreviewError("robots", "Notar page robots unavailable or excluding the index");
  let dataStatus = 0, dataText: string | null = null;
  try {
    dataText = await boundedText(dataUrl, async (input, init) => {
      const response = await fetcher(input, init); dataStatus = response.status; return response;
    }, LIMITS.robotsBytes);
  } catch (error) {
    // A missing data-host policy is not an authorization grant. Only page-initiated public reads are eligible here.
    if (!(error instanceof CollectionError) || ![403, 404].includes(dataStatus)) throw error;
  }
  const data = dataText === null ? null : robotsParser(dataUrl, dataText);
  const delay = Math.max(LIMITS.delayMs, (page.getCrawlDelay(USER_AGENT) || 0) * 1000, (data?.getCrawlDelay(USER_AGENT) || 0) * 1000);
  if (delay > 60_000) throw new NotarPreviewError("robots", "Crawl delay exceeds the local preview budget");
  return { data, dataStatus, delay };
}

export async function renderNotarPreview() {
  const policy = await notarRobots();
  await new Promise(resolve => setTimeout(resolve, policy.delay));
  const browser = await chromium.launch({ timeout: BROWSER_LIMITS.navigationMs });
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const metrics = {
    attemptedRequests: 0, allowedRequests: 0, blockedRequests: 0, encodedBytes: 0, decodedBytes: 0, tabClicks: 0,
    operations: [] as { path: string; method: string; parameterNames: string[]; role: string | null }[],
    robots: { page: "allowed", dataStatus: policy.dataStatus, dataPolicy: policy.data ? "published" : "unavailable; no reuse grant" },
  };
  let failure: NotarPreviewError | null = null;
  const intentionalAborts = new WeakSet<Request>();
  const stop = (code: ConstructorParameters<typeof NotarPreviewError>[0], message: string) => {
    failure ??= new NotarPreviewError(code, message);
    void browser.close();
  };
  const timeout = setTimeout(() => stop("limit", "Notar browser preview exceeded its deadline"), BROWSER_LIMITS.totalMs);
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    cdp.on("Network.dataReceived", event => {
      metrics.decodedBytes += event.dataLength;
      if (metrics.decodedBytes > BROWSER_LIMITS.decodedBytes) stop("limit", "Notar browser traffic exceeded its byte budget");
    });
    cdp.on("Network.loadingFinished", event => { metrics.encodedBytes += event.encodedDataLength; });
    const roleOf = (request: Request) => notarRequestRole({
      url: request.url(), method: request.method(), type: request.resourceType(),
      mainNavigation: request.isNavigationRequest() && request.frame() === page.mainFrame(),
    });
    page.on("response", response => {
      const role = roleOf(response.request()), status = response.status();
      if (role && [401, 403, 429].includes(status))
        stop("access_denied", "The public site denied or challenged access; no retry or workaround");
      else if ((role === "areas" || role === "objects") && status >= 300 && status !== 304)
        stop("not_ready", "A required public search response failed or redirected; retained cards are not a fresh preview");
    });
    page.on("requestfailed", request => {
      const role = roleOf(request);
      if (!intentionalAborts.has(request) && (role === "areas" || role === "objects"))
        stop("not_ready", "A required public search request failed; no successful empty preview");
    });
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url()), role = roleOf(request);
      const abort = () => { intentionalAborts.add(request); return route.abort(); };
      metrics.attemptedRequests++;
      if (metrics.attemptedRequests > BROWSER_LIMITS.attemptedRequests) { await abort(); stop("limit", "Notar attempted-request budget exceeded"); return; }
      if (url.origin === "https://data.notar.se" && metrics.operations.length < 20) {
        metrics.operations.push({
          path: Object.hasOwn(dataParameters, url.pathname) ? url.pathname : "unrecognized",
          method: request.method(), parameterNames: [...new Set(url.searchParams.keys())].slice(0, 20), role,
        });
      }
      if (!role) { metrics.blockedRequests++; await abort(); return; }
      if ((role === "areas" || role === "objects") && policy.data && policy.data.isAllowed(url.toString(), USER_AGENT) !== true) {
        await abort(); stop("robots", "Data-host robots excludes the page's public operation"); return;
      }
      if (++metrics.allowedRequests > BROWSER_LIMITS.allowedRequests) { await abort(); stop("limit", "Notar allowed-request budget exceeded"); return; }
      await route.continue();
    });
    await page.goto(NOTAR_INDEX, { waitUntil: "domcontentloaded", timeout: BROWSER_LIMITS.navigationMs });
    const checkChallenge = async () => {
      if (/verify you are human|access denied|captcha|checking your browser/i.test(await page.locator("body").innerText()))
        throw new NotarPreviewError("access_denied", "Public page shows an access challenge; no workaround");
    };
    await checkChallenge();
    const tab = page.getByRole("tab", { name: /^Kommande$/ });
    await tab.waitFor({ state: "visible", timeout: BROWSER_LIMITS.readinessMs });
    if (await tab.getAttribute("aria-selected") !== "true") {
      await tab.click({ timeout: 5000 }); metrics.tabClicks++;
    }
    await page.waitForLoadState("networkidle", { timeout: BROWSER_LIMITS.readinessMs });
    await checkChallenge();
    if (failure) throw failure;
    const preview = parseNotarDom(await page.content());
    return { ...preview, capturedAt: new Date().toISOString(), traffic: metrics };
  } catch (error) {
    if (failure) throw failure;
    if (error instanceof NotarPreviewError) throw error;
    throw new NotarPreviewError("not_ready", "Public Notar page did not become ready within the bounded preview");
  } finally {
    clearTimeout(timeout);
    await browser.close();
  }
}
