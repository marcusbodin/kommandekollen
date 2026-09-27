import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import worker from "../../worker/index";
import { hash, keyed, type Env } from "../../worker/support";
import { dispatchOne } from "../../worker/mail";
import { defaultFilters } from "../../shared/model";
import { manualProfile, type Interpretation } from "../../shared/preferences";
import { readableContrast } from "./contrast";
import { brandAssets } from "./brand";
import { publicFixtures } from "../fixtures/public-listings";
import { prepareObservations, sendObservations } from "../../scripts/import-observations";

const frontend = "http://127.0.0.1:5174";
const api = "http://127.0.0.1:8787";
let mf: Miniflare, server: Server, env: Env, base: string;
let memberId: string, cookie: string, output: unknown, calls: number;
let gatePosts: number, submittedTexts: string[];
const interpretation: Interpretation = {
  profile: manualProfile({ ...defaultFilters, municipality: "Solna", type: "Lägenhet", maxPrice: 4000000 }),
  question: null, conflicts: [],
};
test.beforeEach(async ({ page }) => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('DB fixture only', {status:404}); } };",
    compatibilityDate: "2025-09-24", d1Databases: ["DB"] });
  const DB = await mf.getD1Database("DB");
  for (const file of readdirSync("worker/migrations").filter(file => file.endsWith(".sql")).sort()) {
    await DB.exec(readFileSync(`worker/migrations/${file}`, "utf8").replaceAll("\n", " "));
  }
  output = interpretation; calls = 0; gatePosts = 0; submittedTexts = [];
  env = {
    DB, TOKEN_SECRET: "synthetic-network-secret-".repeat(3), ADMIN_TOKEN: "synthetic-admin-".repeat(3),
    RESEND_API_KEY: "not-a-real-provider-key", MAIL_FROM: "alerts@example.com", OWNER_EMAIL: "owner@example.com",
    PUBLIC_URL: frontend, ALLOWED_ORIGINS: frontend, PRIVACY_CONTACT: "privacy@example.com",
    SERVICE_ENABLED: "true", AUTHORIZED_SOURCES: "[]", AI_ENABLED: "true",
    AI: { run: async () => { calls++; return Response.json({ response: output, choices: [], tool_calls: [] }); } },
  };
  memberId = crypto.randomUUID();
  const token = "a".repeat(64);
  cookie = `kk_session=${token}`;
  await DB.prepare(`INSERT INTO subscriptions(id,email,email_hash,filters,state,application,token_hash,token_expires,created_at,expires_at,consent_version)
    VALUES(?,?,?,?,'approved','Synthetic browser fixture','fixture-token',?,?,?,'fixture')`)
    .bind(memberId, "owner@example.com", await keyed(env.TOKEN_SECRET, "email:owner@example.com"),
      JSON.stringify(defaultFilters), Date.now() + 60000, Date.now(), Date.now() + 3600000).run();
  await DB.prepare("INSERT INTO sessions VALUES(?,?,?)").bind(await hash(token), memberId, Date.now() + 3600000).run();
  server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      if (req.method === "POST" && req.url === "/api/gate") gatePosts++;
      if (req.method === "POST" && req.url?.endsWith("/interpret")) submittedTexts.push(JSON.parse(body.toString()).text);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(key, value);
      const response = await worker.fetch(new Request(`${base}${req.url}`, {
        method: req.method, headers, body: body.length ? body : undefined,
      }), env);
      res.writeHead(response.status, {
        ...Object.fromEntries([...response.headers].filter(([name]) => name !== "set-cookie")),
        ...(response.headers.getSetCookie().length ? { "Set-Cookie": response.headers.getSetCookie() } : {}),
      });
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error("Synthetic HTTP bridge failed", error);
      res.writeHead(500); res.end("Synthetic HTTP bridge failed");
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing local HTTP fixture address");
  base = `http://127.0.0.1:${address.port}`;
  await page.context().addCookies([{ name: "kk_session", value: token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Strict" }]);
  await page.route(`${api}/**`, async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${base}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
});
test.afterEach(async ({ page }) => {
  if (!page.isClosed()) {
    await page.goto("about:blank");
    await page.unrouteAll({ behavior: "wait" });
  }
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await mf?.dispose();
});
async function enterPrompt(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Inga liveobjekt att visa ännu" })).toBeVisible();
  await expect(page.locator(".preference-flow")).toContainText("Högst sex försök per medlem/IP och sex totalt i piloten per dygn (UTC)");
  await page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true }).fill("Lägenhet i Solna, högst 4 miljoner.");
  await page.getByLabel("Jag vill använda AI-texthjälpen").check();
}
async function seedCompletedAttempts(count: number) {
  const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
  for (let i = 0; i < count; i++) await env.DB.prepare("INSERT INTO ai_attempts VALUES(?,?,?,?,?,1000,'done')")
    .bind(crypto.randomUUID(), await keyed(env.TOKEN_SECRET, `ai:${memberId}`), await keyed(env.TOKEN_SECRET, "ip:local"), day, now).run();
}
test("real Worker HTTP/D1 allows a fourth attempt and explicit save leaves a persisted receipt", async ({ page }) => {
  await seedCompletedAttempts(3);
  await enterPrompt(page);
  await page.getByRole("button", { name: "Hitta bostad" }).click();
  await expect(page.getByRole("heading", { name: "Stämmer det här?" })).toBeFocused();
  expect(await env.DB.prepare("SELECT search_version FROM subscriptions").first()).toEqual({ search_version: 0 });
  await page.getByLabel("Jag godkänner den här sökningen").check();
  await page.getByRole("button", { name: "Spara pausad sökning" }).click();
  const receipt = page.getByRole("heading", { name: "Din sökning är sparad och pausad", exact: true });
  await expect(receipt).toBeVisible();
  await expect(receipt).toBeInViewport();
  await expect(page.locator(".save-receipt")).toContainText("Solna");
  await expect(page.locator(".save-receipt")).toContainText("4 000 000 kr");
  await page.locator(".preference-flow").screenshot({ path: test.info().outputPath("saved-receipt.png") });
  expect(await env.DB.prepare("SELECT search_version,alerts_enabled FROM subscriptions").first()).toEqual({ search_version: 1, alerts_enabled: 0 });
  expect(calls).toBe(1);
  expect(await env.DB.prepare("SELECT count(*) AS n,sum(reserved) AS total FROM ai_attempts").first()).toEqual({ n: 4, total: 4000 });
  await page.reload();
  await page.locator(".saved-profile > summary").click();
  await expect(page.locator(".saved-profile")).toContainText("Solna");
});
test("real rejected AI output is visible, focused and retains text; recovery does not infer again", async ({ page }) => {
  output = { ...interpretation, profile: { ...manualProfile(), unverified: [{ text: "", must: true }] } };
  await enterPrompt(page);
  const before = await page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true }).inputValue();
  const response = page.waitForResponse(response => response.url().endsWith("/api/preferences/interpret"));
  await page.getByRole("button", { name: "Hitta bostad" }).click();
  expect((await response).status()).toBe(502);
  const error = page.locator(".preference-flow [role=alert]");
  await expect(error).toContainText("Texthjälpens svar gick inte att kontrollera");
  await expect(error).toBeFocused();
  await expect(error).toBeInViewport();
  await page.locator(".preference-flow").screenshot({ path: test.info().outputPath("visible-error.png") });
  await expect(page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true })).toHaveValue(before);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM search_drafts").first()).toEqual({ n: 0 });
  expect(await env.DB.prepare("SELECT state,reserved FROM ai_attempts").first()).toEqual({ state: "done", reserved: 1000 });
  await page.getByRole("button", { name: "Läs in utkast", exact: true }).click();
  await expect(page.locator(".preference-flow [role=status]")).toContainText("Inget färdigt utkast");
  expect(calls).toBe(1);
  expect(await env.DB.prepare("SELECT search_version FROM subscriptions").first()).toEqual({ search_version: 0 });
});
test("a late initial draft GET cannot overwrite manual changes already in progress", async ({ page }) => {
  const id = crypto.randomUUID();
  const seed = await worker.fetch(new Request(`${api}/api/preferences/draft`, {
    method: "POST", headers: { Origin: frontend, "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ id, expectedVersion: 0, previousId: null, resolveQuestions: false,
      profile: manualProfile({ ...defaultFilters, maxPrice: 2000000 }) }),
  }), env);
  expect(seed.status).toBe(200);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${api}/api/preferences/draft`, async route => {
    const response = await route.fetch({ url: `${base}/api/preferences/draft` });
    await held;
    await route.fulfill({ response });
  });
  await page.goto("/");
  await page.locator(".manual-search > summary").click();
  const price = page.getByRole("slider", { name: "Högsta pris", exact: true });
  await price.press("Home");
  await price.press("ArrowRight");
  await expect(price).toHaveAttribute("aria-valuetext", "100 000 kr");
  release();
  await expect(page.locator(".preference-flow [role=status]")).toContainText("tidigare utkast");
  await expect(price).toHaveAttribute("aria-valuetext", "100 000 kr");
});

test("six exhausted attempts explain the shared budget and manual saving remains available", async ({ page }) => {
  await seedCompletedAttempts(6);
  await enterPrompt(page);
  await page.getByRole("button", { name: "Hitta bostad" }).click();
  const error = page.locator(".preference-flow [role=alert]");
  await expect(error).toContainText("gratisgräns");
  await expect(error).toBeFocused();
  await expect(error).toBeInViewport();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Använd vanliga filter", exact: true }).click();
  await page.getByRole("combobox", { name: "Kommun", exact: true }).selectOption("Solna");
  await page.getByRole("button", { name: "Granska ändringarna" }).click();
  await page.getByLabel("Jag godkänner den här sökningen").check();
  await page.getByRole("button", { name: "Spara pausad sökning" }).click();
  await expect(page.getByRole("heading", { name: "Din sökning är sparad och pausad", exact: true })).toBeVisible();
  expect(calls).toBe(0);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM ai_attempts").first()).toEqual({ n: 6 });
});

test("a non-JSON gateway response is actionable instead of exposing a parser exception", async ({ page }) => {
  await page.route(`${api}/api/preferences/interpret`, route => route.fulfill({
    status: 503, contentType: "text/html", body: "<html><body>Upstream unavailable</body></html>",
  }));
  await enterPrompt(page);
  await page.getByRole("button", { name: "Hitta bostad" }).click();
  const error = page.locator(".preference-flow [role=alert]");
  await expect(error).toContainText("HTTP 503");
  await expect(error).toContainText("Resultatet kunde inte bekräftas");
  await expect(error).toBeFocused();
  await expect(error).not.toContainText("Unexpected token");
  await expect(page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true })).toHaveValue("Lägenhet i Solna, högst 4 miljoner.");
  expect(calls).toBe(0);
});

test("an external saved-version refresh warns without erasing local edits or the prompt", async ({ page }) => {
  await enterPrompt(page);
  await page.locator(".manual-search > summary").click();
  const price = page.getByRole("slider", { name: "Högsta pris", exact: true });
  await price.press("Home");
  await price.press("ArrowRight");
  const response = await worker.fetch(new Request(`${api}/api/search`, {
    method: "POST", headers: { Origin: frontend, "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ filters: { ...defaultFilters, maxPrice: 3000000 }, expectedVersion: 0, consent: true, enabled: false }),
  }), env);
  expect(response.status).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".preference-flow [role=alert]")).toContainText("ändrades under arbetet");
  await expect(price).toHaveAttribute("aria-valuetext", "100 000 kr");
  await expect(page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true })).toHaveValue("Lägenhet i Solna, högst 4 miljoner.");
  const saved = await env.DB.prepare("SELECT filters,search_version FROM subscriptions").first<{ filters: string; search_version: number }>();
  expect(saved?.search_version).toBe(1);
  expect(JSON.parse(saved!.filters).maxPrice).toBe(3000000);
});

const gatePassword = "a".repeat(64);
async function sharedGuest(page: Page, keepAccount = false) {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  if (!keepAccount) await page.context().clearCookies();
  await page.goto("/");
  await more(page, "Konto");
  await page.getByLabel("Gemensamt lösenord").fill(gatePassword);
  await page.getByRole("button", { name: "Fortsätt utan AI", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ditt konto", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tillbaka till texten" }).click();
  await expect(page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true })).toBeVisible();
}
async function more(page: Page, name: string) {
  if (await page.getByRole("button", { name: "Meny", exact: true }).getAttribute("aria-expanded") !== "true")
    await page.getByRole("button", { name: "Meny", exact: true }).click();
  const nav = page.locator("#site-navigation");
  const button = nav.getByRole("button", { name, exact: true });
  if (await button.count()) await button.click();
  else await nav.getByRole("link", { name, exact: true }).click();
}
async function websiteSurface(page: Page) {
  await expect(page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true })).toBeVisible();
  await expect(page.locator("textarea:visible")).toHaveCount(1);
  await expect(page.locator("input:visible")).toHaveCount(0);
  await expect(page.locator(".preference-flow .primary:visible")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Hitta bostad", exact: true })).toBeVisible();
  await expect(page.locator("header:visible")).toHaveCount(1);
  await expect(page.locator("footer:visible")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "kommandekollen. – till sökningen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Meny", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vad är viktigt i ditt nästa hem?" })).toBeVisible();
  await expect(page.locator(".home-value")).toHaveText("Hitta kommande bostäder före andra.");
  await expect(page.locator(".home-intro p:not(.home-value)")).toHaveText("Vi bygger en samlad koll direkt från mäklarna.");
  await expect(page.locator(".pilot-note,.public-listings-heading p")).toHaveCount(0);
  for (const removed of [
    "Målet: hitta ditt nästa hem innan annonsen når de stora bostadssajterna.",
    "Just nu sparas sökningar pausade – inga bostadsmejl ännu.",
    "Kommande bostäder i Stockholms län. Bläddra och filtrera utan lösenord eller AI.",
  ]) await expect(page.getByText(removed, { exact: false })).toHaveCount(0);
  await expect(page.locator("footer:visible").getByRole("link", { name: "Kontakt", exact: true })).toHaveAttribute("href", "mailto:kontakt@kommandekollen.se");
  await expect(page.locator("footer:visible")).toContainText("©");
  await expect(page.locator(".home-photo,.inspiration")).toHaveCount(0);
  await expect(page.locator(".hero-backdrop")).toHaveCount(1);
  await expect(page.locator("img:visible:not(.brand-mark):not(.hero-backdrop)")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Senaste kommande bostäder" })).toBeVisible();
  await expect(page.locator(".privacy:visible, .results:visible, .saved-profile:visible, .draft-review:visible")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function heroGeometry(page: Page) {
  const heading = (await page.locator("#home-title").boundingBox())!;
  const prompt = (await page.locator("#housing-prompt").boundingBox())!;
  const intro = (await page.locator(".home-intro").boundingBox())!;
  const form = (await page.locator(".prompt-form").boundingBox())!;
  const hero = (await page.locator(".home-hero").boundingBox())!;
  const feed = (await page.locator(".public-listings").boundingBox())!;
  const photo = (await page.locator(".hero-picture").boundingBox())!;
  expect(hero.x).toBeCloseTo(0);
  expect(hero.width).toBeCloseTo(await page.evaluate(() => document.documentElement.clientWidth));
  expect(photo.x).toBeCloseTo(hero.x);
  expect(photo.y).toBeCloseTo(hero.y);
  expect(photo.width).toBeCloseTo(hero.width);
  expect(photo.height).toBeLessThanOrEqual(680);
  expect(photo.height).toBeGreaterThan(300);
  for (const box of [intro, form]) {
    expect(box.x).toBeGreaterThan(photo.x);
    expect(box.x + box.width).toBeLessThan(photo.x + photo.width);
    expect(box.y).toBeGreaterThan(photo.y);
  }
  if (page.viewportSize()!.width > 960) {
    expect(heading.x).toBeGreaterThan(prompt.x + prompt.width);
    const overlap = Math.min(heading.y + heading.height, prompt.y + prompt.height) - Math.max(heading.y, prompt.y);
    expect(overlap).toBeGreaterThan(Math.min(heading.height, prompt.height) * .4);
  } else {
    expect(form.y).toBeGreaterThanOrEqual(intro.y + intro.height);
    expect(prompt.y).toBeGreaterThan(heading.y + heading.height);
  }
  expect(feed.y).toBeGreaterThanOrEqual(hero.y + hero.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await test.info().attach(`hero-geometry-${page.viewportSize()!.width}`, {
    body: JSON.stringify({ viewport: page.viewportSize(), hero, photo, heading, intro, prompt, form, feed }),
    contentType: "application/json",
  });
}
async function heroAssets(page: Page) {
  const image = page.locator(".hero-backdrop");
  await expect(image).toHaveAttribute("alt", "");
  await expect(image).toHaveAttribute("width", "1374");
  await expect(image).toHaveAttribute("height", "1145");
  await expect(image).toHaveAttribute("fetchpriority", "high");
  await expect(page.locator(".hero-picture")).toHaveAttribute("aria-hidden", "true");
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const width = page.viewportSize()!.width <= 960 ? 800 : 1374;
  const asset = await image.evaluate((el: HTMLImageElement) => ({ width: el.naturalWidth, height: el.naturalHeight, src: el.currentSrc }));
  expect(asset.width).toBe(width); expect(asset.height).toBe(width === 800 ? 667 : 1145);
  expect(new URL(asset.src).origin).toBe(new URL(page.url()).origin);
  expect(new URL(asset.src).pathname).toBe(`/assets/autumn-home-${width}.webp`);
  const response = await page.request.get(asset.src);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/webp");
  expect((await response.body()).length).toBeLessThan(width === 800 ? 150_000 : 300_000);
  const credit = page.locator("footer:visible").getByRole("link", { name: "Bakgrundsbild & ursprung" });
  await expect(credit).toHaveAttribute("href", "/assets/ATTRIBUTION.md");
  const notice = await page.request.get((await credit.getAttribute("href"))!);
  expect(notice.status()).toBe(200);
  const text = await notice.text();
  const current = text.split("## Historical unused house photograph")[0];
  for (const value of ["tillhandahöll bilden", "1374 x 1145", "resize", "WebP",
    "autumn-home-800.webp", "autumn-home-1374.webp", "inte ett bostadsobjekt till salu"]) expect(current).toContain(value);
  expect(current).not.toContain("Holger Ellgaard");
  expect(current).not.toContain("stockholm-hero-");
  await expect(page.locator(".public-listings img")).toHaveCount(0);
}
async function expandedHeroPanels(page: Page) {
  const flow = (await page.locator(".home-composition .preference-flow").boundingBox())!;
  const intro = (await page.locator(".home-intro").boundingBox())!;
  const form = (await page.locator(".prompt-form").boundingBox())!;
  const panels = page.locator(".home-composition .draft-review:visible,.home-composition .manual-search[open],.home-composition .save-receipt:visible,.home-composition .saved-profile:visible");
  expect(await panels.count()).toBeGreaterThan(0);
  for (const panel of await panels.all()) {
    const box = (await panel.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(Math.max(intro.y + intro.height, form.y + form.height));
    expect(box.x).toBeCloseTo(flow.x);
    expect(box.width).toBeCloseTo(flow.width, 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function borderlessSurfaces(page: Page, selectors: string, elevated = false) {
  const surfaces = await page.locator(selectors).evaluateAll(elements => elements
    .filter(el => el.getClientRects().length)
    .map(el => {
      const style = getComputedStyle(el);
      return { element: el.className, borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth], shadow: style.boxShadow };
    }));
  expect(surfaces.length).toBeGreaterThan(0);
  for (const surface of surfaces) {
    expect(surface.borders, surface.element).toEqual(["0px", "0px", "0px", "0px"]);
    if (elevated) {
      expect(surface.shadow, surface.element).not.toBe("none");
      expect(surface.shadow).not.toContain("inset");
      const lengths = surface.shadow.replace(/rgba?\([^)]+\)/g, "").match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
      expect(lengths).toHaveLength(4);
      expect(lengths[1]).toBeGreaterThanOrEqual(2);
      expect(lengths[2]).toBeGreaterThanOrEqual(8);
      expect(lengths[3]).toBeLessThanOrEqual(0);
    }
  }
}
async function heroGlass(page: Page, theme: "light" | "dark") {
  for (const surface of [".home-intro", ".prompt-form"]) {
    await expect(page.locator(surface)).toHaveCSS("background-color",
      theme === "light" ? "rgba(255, 255, 255, 0.66)" : "rgba(34, 34, 34, 0.72)");
    await expect(page.locator(surface)).toHaveCSS("backdrop-filter", "blur(10px) saturate(1.15)");
    await expect(page.locator(surface)).toHaveCSS("box-shadow", /inset/);
  }
  for (const surface of [".prompt-shell", "#housing-prompt"])
    await expect(page.locator(surface)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator("#prompt-helper")).toHaveCSS("color",
    theme === "light" ? "rgb(32, 32, 32)" : "rgb(245, 245, 245)");
}
async function neutralOutsideButtons(page: Page) {
  const colored = await page.locator(".website-shell *").evaluateAll(elements => elements.flatMap(el => {
    if (!el.getClientRects().length || el.closest("button,.button") || el.tagName === "IMG") return [];
    const style = getComputedStyle(el);
    return ["color", "background-color", "border-top-color", "text-decoration-color"].flatMap(property => {
      const color = style.getPropertyValue(property);
      const channels = color.match(/[\d.]+/g)?.map(Number);
      if (!channels || channels[3] === 0) return [];
      return Math.max(...channels.slice(0, 3)) - Math.min(...channels.slice(0, 3)) > 1
        ? [{ element: el.tagName, classes: el.className, property, color }] : [];
    });
  }));
  expect(colored).toEqual([]);
}
async function consentToInterpret(page: Page, password = false) {
  await page.getByRole("button", { name: /^(Hitta bostad|Uppdatera sökförslaget)$/ }).click();
  if (password) await page.getByLabel("Gemensamt lösenord").fill(gatePassword);
  await page.getByLabel("Jag vill använda AI-texthjälpen").check();
  await page.getByRole("button", { name: "Skapa med AI", exact: true }).click();
}
async function deliverVerification() {
  let delivered = "";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input) !== "https://api.resend.com/emails") throw new Error("Unexpected fixture provider URL");
    delivered = (JSON.parse(String(init?.body)) as { text: string }).text;
    return Response.json({ id: "synthetic-email-provider-id" });
  };
  try { await dispatchOne(env); } finally { globalThis.fetch = realFetch; }
  expect(delivered).toContain("samma webbläsare");
  return delivered.match(/http:\/\/127\.0\.0\.1:5174\/#guest-confirm=[a-f0-9]{64}/)![0];
}
test("shared password guest can try AI then verify email and explicitly confirm a paused search", async ({ page }) => {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  await page.context().clearCookies();
  await page.goto("/");
  await websiteSurface(page);
  await heroGeometry(page);
  await expect(page.getByRole("heading", { name: "Ansök om medlemskap" })).toHaveCount(0);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM subscriptions").first()).toEqual({ n: 1 });
  await page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true }).fill("Lägenhet i Solna, högst 4 miljoner.");
  await consentToInterpret(page, true);
  await expect(page.getByRole("heading", { name: "Stämmer det här?" })).toBeFocused();
  await expandedHeroPanels(page);
  if (process.env.VISUAL_REVIEW === "1" && test.info().project.name === "desktop")
    await page.locator(".home-hero").screenshot({ path: test.info().outputPath("photo-hero-review.png"), animations: "disabled" });
  await page.getByLabel("Jag godkänner den här sökningen").check();
  await page.getByRole("button", { name: "Fortsätt till e-post", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verifiera e-post för att spara" })).toBeFocused();
  await page.getByLabel("E-postadress", { exact: true }).first().fill("new-browser@example.com");
  await page.getByRole("button", { name: "Begär verifieringslänk" }).click();
  await expect(page.locator(".preference-flow [role=status]")).toContainText("Inget har sparats ännu");
  const link = await deliverVerification();
  await page.reload();
  await websiteSurface(page);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Bekräfta och logga in" })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  expect(await env.DB.prepare("SELECT state,search_version FROM subscriptions WHERE email='new-browser@example.com'").first())
    .toEqual({ state: "unverified", search_version: 0 });
  await page.getByRole("button", { name: "Bekräfta e-post", exact: true }).click();
  await expect(page.locator(".action-page [role=status]")).toContainText("Sökningen är inte sparad");
  await page.getByRole("link", { name: "Till sökningen och granskningen" }).click();
  await expect(page.getByText("E-postadressen är verifierad. Granska den här sammanfattningen", { exact: false })).toBeVisible();
  const confirm = page.getByRole("button", { name: "Bekräfta och spara pausad sökning" });
  await expect(confirm).toBeDisabled();
  expect(await env.DB.prepare("SELECT state,search_version,alerts_enabled FROM subscriptions WHERE email='new-browser@example.com'").first())
    .toEqual({ state: "approved", search_version: 0, alerts_enabled: 0 });
  await page.getByLabel("Jag godkänner den här sökningen").check();
  await confirm.click();
  await expect(page.getByRole("heading", { name: "Din sökning är sparad och pausad", exact: true })).toBeInViewport();
  expect(await env.DB.prepare("SELECT search_version,alerts_enabled FROM subscriptions WHERE email='new-browser@example.com'").first())
    .toEqual({ search_version: 1, alerts_enabled: 0 });
  expect(calls).toBe(1);
  expect(gatePosts).toBe(1);
  expect(submittedTexts).toEqual(["Lägenhet i Solna, högst 4 miljoner."]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await readableContrast(page);
  await page.locator(".preference-flow").screenshot({ path: test.info().outputPath("guest-saved.png"), animations: "disabled" });
});
test("wrong-password errors are visible and a separate browser cannot claim the verification", async ({ page, browser }) => {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  await page.context().clearCookies();
  await page.goto("/");
  const prompt = page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true });
  await prompt.fill("Villa i Nacka. Gärna stor trädgård.");
  await page.getByRole("button", { name: /^(Hitta bostad|Uppdatera sökförslaget)$/ }).click();
  await expect(page.getByLabel("Gemensamt lösenord")).toBeFocused();
  await page.getByLabel("Gemensamt lösenord").fill("wrong");
  await page.getByLabel("Jag vill använda AI-texthjälpen").check();
  await page.getByRole("button", { name: "Skapa med AI", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Lösenordet kunde inte godkännas");
  await expect(page.getByRole("alert")).toBeFocused();
  await readableContrast(page, ".access-dialog [role=alert]");
  await expect(prompt).toHaveValue("Villa i Nacka. Gärna stor trädgård.");
  await page.keyboard.press("Escape");
  await expect(prompt).toBeFocused();
  expect(calls).toBe(0);
  await more(page, "Använd vanliga filter");
  await page.getByRole("combobox", { name: "Kommun", exact: true }).selectOption("Solna");
  await page.getByRole("button", { name: "Granska ändringarna" }).click();
  await page.getByLabel("Gemensamt lösenord").fill(gatePassword);
  await expect(page.getByLabel("Jag vill använda AI-texthjälpen")).toHaveCount(0);
  await page.getByRole("button", { name: "Fortsätt utan AI", exact: true }).click();
  await page.getByLabel("Jag godkänner den här sökningen").check();
  await page.getByRole("button", { name: "Fortsätt till e-post", exact: true }).click();
  await page.getByLabel("E-postadress", { exact: true }).first().fill("device@example.com");
  await page.getByRole("button", { name: "Begär verifieringslänk" }).click();
  await expect(page.locator(".preference-flow [role=status]")).toContainText("Inget har sparats ännu");
  const link = await deliverVerification();
  const other = await browser.newContext();
  try {
    const second = await other.newPage();
    await second.route(`${api}/**`, async route => {
      await route.fulfill({ response: await route.fetch({ url: `${base}${new URL(route.request().url()).pathname}` }) });
    });
    await second.goto(link);
    await second.getByRole("button", { name: "Bekräfta e-post", exact: true }).click();
    await expect(second.locator(".action-page [role=alert]")).toContainText("Åtkomsten är stängd");
    await expect(second.locator(".action-page [role=alert]")).not.toContainText("Kunde inte nå tjänsten");
    await expect(second.locator(".action-page [role=alert]")).toBeFocused();
    await expect(second.locator(".action-page [role=alert]")).toBeInViewport();
    await expect(second.getByText("Om länken öppnades på en annan enhet:", { exact: false })).toBeVisible();
  } finally { await other.close(); }
  await page.reload();
  await websiteSurface(page);
  await more(page, "Fortsätt utkast");
  await expect(page.getByRole("heading", { name: "Stämmer det här?" })).toBeVisible();
  expect(await env.DB.prepare("SELECT verified,consumed FROM guest_saves").first()).toEqual({ verified: 0, consumed: 0 });
  expect(calls).toBe(0);
});
test("gate rotation blocks an existing owner session while keeping its saved profile unchanged", async ({ page }) => {
  const saved = manualProfile({ ...defaultFilters, maxPrice: 4250123 });
  await env.DB.prepare("UPDATE subscriptions SET preference_profile=?,filters=?,search_version=4").bind(JSON.stringify(saved), JSON.stringify(saved.filters)).run();
  await sharedGuest(page, true);
  await more(page, "Min sökning");
  await expect(page.locator(".saved-profile")).toContainText("4 250 123 kr");
  await borderlessSurfaces(page, ".saved-profile");
  await more(page, "Konto & ägarverktyg");
  await borderlessSurfaces(page, ".membership,.owner-panel", true);
  await borderlessSurfaces(page, ".account-content button,.member-row,.member-actions button");
  await expect(page.getByRole("heading", { name: "Hantera medlemskap" })).toBeVisible();
  await page.getByRole("button", { name: "Tillbaka till texten" }).click();
  await page.locator("#housing-prompt").fill("Lägenhet i Solna, högst 4 miljoner.");
  await consentToInterpret(page);
  await expect(page.getByRole("heading", { name: "Stämmer det här?" })).toBeFocused();
  expect(await env.DB.prepare("SELECT base_version FROM search_drafts").first()).toEqual({ base_version: 4 });
  env.SHARED_ACCESS_PASSWORD = "b".repeat(64);
  await page.reload();
  await websiteSurface(page);
  await page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true }).fill("Solna, gärna balkong");
  await page.getByRole("button", { name: /^(Hitta bostad|Uppdatera sökförslaget)$/ }).click();
  await expect(page.getByLabel("Gemensamt lösenord")).toBeVisible();
  expect(await env.DB.prepare("SELECT preference_profile,search_version FROM subscriptions").first()).toEqual({ preference_profile: JSON.stringify(saved), search_version: 4 });
  expect(calls).toBe(1);
});
test("a guest with exhausted shared AI can still review manually without spending or activating anything", async ({ page }) => {
  await seedCompletedAttempts(6);
  await sharedGuest(page);
  await page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true }).fill("Lägenhet i Solna.");
  await consentToInterpret(page);
  await expect(page.getByRole("dialog").getByRole("alert")).toBeFocused();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("gemensamma AI-kvot är slut");
  await page.getByRole("button", { name: "Tillbaka till text och filter" }).click();
  await more(page, "Använd vanliga filter");
  await page.getByRole("combobox", { name: "Kommun", exact: true }).selectOption("Solna");
  await page.getByRole("button", { name: "Granska ändringarna" }).click();
  await expect(page.getByRole("heading", { name: "Stämmer det här?" })).toBeVisible();
  expect(calls).toBe(0);
  expect(await env.DB.prepare("SELECT sum(reserved) AS total FROM ai_attempts").first()).toEqual({ total: 6000 });
  expect(await env.DB.prepare("SELECT count(*) AS n FROM outbox").first()).toEqual({ n: 0 });
});

test("compact website shell explains the service, fits small screens and defers password without losing text", async ({ page }) => {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  await page.context().clearCookies();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await websiteSurface(page);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
  const prompt = page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true });
  const original = "Villa i Nacka,\ngärna en trädgård.";
  await prompt.fill(original);
  await prompt.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await prompt.fill(original);
  const widths = test.info().project.name === "mobile" ? [320, 360, 390, 430] : [1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 850 });
    await websiteSurface(page);
    await heroGeometry(page);
    await heroAssets(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width <= 430) expect((await page.locator(".compact-header").boundingBox())!.height).toBeLessThanOrEqual(84);
    expect(await prompt.evaluate(input => parseFloat(getComputedStyle(input).fontSize))).toBeGreaterThanOrEqual(16);
    for (const button of await page.locator("button:visible").all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    if (process.env.VISUAL_REVIEW === "1") await page.screenshot({ path: test.info().outputPath(`compact-home-${width}.png`), fullPage: true, animations: "disabled" });
  }
  const normalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: test.info().project.name === "mobile" ? 640 : 1280, height: 1000 });
  await page.evaluate(() => { document.body.style.zoom = "2"; });
  await websiteSurface(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Meny", exact: true }).click();
  await expect(page.locator("#site-navigation").getByRole("link", { name: "Så fungerar det" })).toBeVisible();
  await page.keyboard.press("Escape");
  if (process.env.VISUAL_REVIEW === "1") await page.screenshot({ path: test.info().outputPath("compact-home-200-percent.png"), fullPage: true, animations: "disabled" });
  await page.evaluate(() => { document.body.style.zoom = ""; });
  await page.setViewportSize(normalViewport);
  await more(page, "Så fungerar det");
  await expect(page.getByRole("heading", { name: "Så fungerar det", exact: true })).toBeFocused();
  await expect(page.getByRole("region", { name: "Så skapar du en sökning" })).toContainText("samma webbläsare");
  await expect(page.getByRole("region", { name: "Så skapar du en sökning" })).toContainText("Granska sedan sökförslaget igen och bekräfta sparandet");
  await expect(prompt).toHaveValue(original);
  await page.getByRole("link", { name: "kommandekollen. – till sökningen" }).click();
  await expect(prompt).toBeFocused();
  await expect(prompt).toHaveValue(original);
  await more(page, "Integritet");
  await expect(page.getByRole("heading", { name: "Din bevakning, dina uppgifter" })).toBeFocused();
  await expect(page.getByRole("link", { name: "kontakt@kommandekollen.se" })).toBeVisible();
  expect(gatePosts).toBe(0); expect(calls).toBe(0);
  await page.getByRole("button", { name: "Tillbaka till texten" }).click();
  await expect(prompt).toBeFocused();
  await page.locator("footer:visible").getByRole("link", { name: "Integritet & radering" }).click();
  await expect(page.getByRole("heading", { name: "Din bevakning, dina uppgifter" })).toBeFocused();
  await page.getByRole("button", { name: "Tillbaka till texten" }).click();
  await page.getByRole("button", { name: "Meny", exact: true }).click();
  await page.locator("#site-navigation").getByRole("button", { name: "Använd vanliga filter" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Meny", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Meny", exact: true })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: /^(Hitta bostad|Uppdatera sökförslaget)$/ }).click();
  await expect(page.getByLabel("Gemensamt lösenord")).toBeFocused();
  const consent = page.getByLabel("Jag vill använda AI-texthjälpen");
  await expect(consent).not.toBeChecked();
  await page.getByLabel("Gemensamt lösenord").fill(gatePassword);
  await expect(page.getByRole("button", { name: "Skapa med AI", exact: true })).toBeDisabled();
  await page.getByLabel("Gemensamt lösenord").press("Enter");
  expect(gatePosts).toBe(0); expect(calls).toBe(0);
  if (test.info().project.name === "mobile") await page.setViewportSize({ width: 320, height: 380 });
  await consent.scrollIntoViewIfNeeded();
  await expect(consent).toBeInViewport();
  await page.getByRole("button", { name: "Avbryt", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Avbryt", exact: true })).toBeInViewport();
  if (process.env.VISUAL_REVIEW === "1") await page.screenshot({ path: test.info().outputPath("contextual-access-keyboard.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(prompt).toBeFocused(); await expect(prompt).toHaveValue(original);
  await page.getByRole("button", { name: /^(Hitta bostad|Uppdatera sökförslaget)$/ }).click();
  await expect(consent).not.toBeChecked();
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(prompt).toHaveValue(original);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM ai_attempts").first()).toEqual({ n: 0 });
});

test("one consented submit cannot duplicate inference and followups reuse only that draft consent", async ({ page }) => {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  await page.context().clearCookies();
  output = { ...interpretation, question: { text: "Hur stor boarea vill du ha?", choices: ["Gärna minst 70 m²"], required: false } };
  await page.goto("/");
  await page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true }).fill("Lägenhet i Solna, högst 4 miljoner.");
  await page.getByRole("button", { name: /^(Hitta bostad|Uppdatera sökförslaget)$/ }).click();
  await page.getByLabel("Gemensamt lösenord").fill(gatePassword);
  await page.getByLabel("Jag vill använda AI-texthjälpen").check();
  await page.getByRole("button", { name: "Skapa med AI", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole("textbox", { name: "Hur stor boarea vill du ha?" })).toBeFocused();
  expect(calls).toBe(1); expect(gatePosts).toBe(1);
  output = interpretation;
  await page.getByRole("button", { name: "Gärna minst 70 m²", exact: true }).click();
  await page.getByRole("button", { name: /^(Hitta bostad|Uppdatera sökförslaget)$/ }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole("heading", { name: "Stämmer det här?" })).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(calls).toBe(2); expect(gatePosts).toBe(1);
  expect(submittedTexts).toEqual(["Lägenhet i Solna, högst 4 miljoner.", "Gärna minst 70 m²"]);
  expect(await env.DB.prepare("SELECT count(*) AS n,sum(reserved) AS total FROM ai_attempts").first()).toEqual({ n: 2, total: 2000 });
  await page.reload();
  await websiteSurface(page);
  await more(page, "Fortsätt utkast");
  await expect(page.getByRole("heading", { name: "Stämmer det här?" })).toBeVisible();
  await page.locator("#housing-prompt").fill("Gärna balkong också.");
  await page.getByRole("button", { name: /^(Hitta bostad|Uppdatera sökförslaget)$/ }).click();
  await expect(page.getByLabel("Gemensamt lösenord")).toHaveCount(0);
  await expect(page.getByLabel("Jag vill använda AI-texthjälpen")).not.toBeChecked();
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  expect(calls).toBe(2);
});

test("cancelling an in-flight password check never interprets after its delayed response or reload", async ({ page }) => {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  await page.context().clearCookies();
  let release!: () => void, reached!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const received = new Promise<void>(resolve => { reached = resolve; });
  await page.route(`${api}/api/gate`, async route => {
    const response = await route.fetch({ url: `${base}/api/gate` });
    if (route.request().method() === "POST") { reached(); await held; }
    await route.fulfill({ response });
  });
  await page.goto("/");
  const prompt = page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true });
  await prompt.fill("Lägenhet i Solna med balkong.");
  await consentToInterpret(page, true);
  await received;
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  release();
  await expect(prompt).toBeFocused();
  await expect(prompt).toHaveValue("Lägenhet i Solna med balkong.");
  await page.reload();
  await websiteSurface(page);
  expect(calls).toBe(0); expect(gatePosts).toBe(1);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM ai_attempts").first()).toEqual({ n: 0 });
});

test("shared provider rejection keeps a visible focused error and original text with manual recovery", async ({ page }) => {
  await sharedGuest(page);
  output = { ...interpretation, profile: { ...manualProfile(), unverified: [{ text: "", must: true }] } };
  await page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true }).fill("Lägenhet i Solna, högst 4 miljoner.");
  await consentToInterpret(page);
  const error = page.locator(".preference-flow [role=alert]");
  await expect(error).toContainText("Texthjälpens svar gick inte att kontrollera");
  await expect(error).toBeFocused(); await expect(error).toBeInViewport();
  await expect(page.locator("#housing-prompt")).toHaveValue("Lägenhet i Solna, högst 4 miljoner.");
  await page.getByRole("button", { name: "Använd vanliga filter", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Kommun", exact: true })).toBeVisible();
  expect(calls).toBe(1);
  expect(await env.DB.prepare("SELECT search_version,alerts_enabled FROM subscriptions").first()).toEqual({ search_version: 0, alerts_enabled: 0 });
});

test("closing shared access removes disclosed owner data without erasing local text or the saved profile", async ({ page }) => {
  const saved = manualProfile({ ...defaultFilters, maxPrice: 4250123 });
  await env.DB.prepare("UPDATE subscriptions SET preference_profile=?,filters=?,search_version=4").bind(JSON.stringify(saved), JSON.stringify(saved.filters)).run();
  await sharedGuest(page, true);
  await more(page, "Min sökning");
  await expect(page.locator(".saved-profile")).toContainText("4 250 123 kr");
  await readableContrast(page);
  await more(page, "Mörkt tema");
  await readableContrast(page);
  await page.locator("#housing-prompt").fill("Ett nytt önskemål som ännu inte skickats.");
  await more(page, "Konto & ägarverktyg");
  await readableContrast(page);
  await page.getByRole("button", { name: "Stäng åtkomsten", exact: true }).click();
  await expect(page.locator(".preference-flow [role=status]")).toContainText("Åtkomsten behöver öppnas igen");
  await expect(page.locator("#housing-prompt")).toHaveValue("Ett nytt önskemål som ännu inte skickats.");
  await expect(page.locator(".saved-profile")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Hantera medlemskap" })).toHaveCount(0);
  expect(await env.DB.prepare("SELECT preference_profile,search_version FROM subscriptions").first()).toEqual({ preference_profile: JSON.stringify(saved), search_version: 4 });
  expect(calls).toBe(0);
});

test("pinned logo palette stays on buttons with bold headings and neutral accessible surfaces", async ({ page }) => {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  await page.context().clearCookies();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await websiteSurface(page);
  expect(await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return ["--cp-blue", "--cp-ice", "--cp-coral"].map(token => style.getPropertyValue(token).trim());
  })).toEqual(["#0070ed", "#a3d9fc", "#fc6761"]);
  const heading = page.getByRole("heading", { name: "Vad är viktigt i ditt nästa hem?" });
  await expect(heading).toHaveCSS("font-family", /Georgia/);
  await expect(heading).toHaveCSS("font-weight", "700");
  await expect(page.getByRole("button", { name: "Meny", exact: true })).toHaveCSS("font-family", /Segoe UI/);
  const prompt = page.locator("#housing-prompt");
  await expect(page.locator(".home-photo,.inspiration")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Foto: Francesca Tosolini · bild & licens" })).toHaveCount(0);
  const targets = ".home-intro h1,.home-intro p,.prompt-shell label,#housing-prompt,#prompt-helper,.prompt-shell .primary,.public-listings h2,.public-listings p,.public-listings summary,.compact-header .brand,.compact-nav a,.nav-essential button,.site-menu-toggle,.compact-footer span,.compact-footer a";
  const reports = [];
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") {
      await more(page, "Mörkt tema");
      await page.getByRole("button", { name: "Meny", exact: true }).click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await brandAssets(page);
    await heroAssets(page);
    await heroGeometry(page);
    await heroGlass(page, theme);
    await neutralOutsideButtons(page);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath(`liquid-glass-${theme}.png`), animations: "disabled" });
    const primary = page.getByRole("button", { name: "Hitta bostad", exact: true });
    await prompt.fill("");
    await heading.click();
    await expect(primary).toBeDisabled();
    await expect(primary).toHaveCSS("opacity", "1");
    await expect(primary).toHaveCSS("background-color", "rgb(0, 112, 237)");
    await expect(primary).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(primary).toHaveCSS("box-shadow", "none");
    await expect(primary).toHaveCSS("cursor", "not-allowed");
    await primary.hover();
    await expect(primary).toHaveCSS("background-color", "rgb(0, 112, 237)");
    const disabledText = await readableContrast(page, ".prompt-shell .primary", "text", true);
    await primary.evaluate((button: HTMLButtonElement) => button.click());
    await prompt.press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await prompt.fill("");
    await heading.click();
    if (process.env.VISUAL_REVIEW === "1") await page.screenshot({ path: test.info().outputPath(`borderless-empty-${theme}.png`), fullPage: true, animations: "disabled" });
    await prompt.fill("Lägenhet i Solna, gärna balkong.");
    await prompt.focus();
    await expect(primary).toBeEnabled();
    await expect(page.locator("body")).toHaveCSS("background-color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(23, 23, 23)");
    await expect(page.locator(".prompt-shell")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(primary).toHaveCSS("background-color", "rgb(0, 112, 237)");
    await expect(primary).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(primary).toHaveCSS("border-radius", "999px");
    await borderlessSurfaces(page, ".prompt-shell .primary,.site-menu-toggle,.public-filters > summary", true);
    await borderlessSurfaces(page, ".prompt-form,.home-intro");
    await borderlessSurfaces(page, ".prompt-shell,#housing-prompt,.compact-header,.compact-footer");
    await expect(page.locator(".site-menu-toggle")).toHaveCSS("background-color", "rgb(163, 217, 252)");
    await expect(page.locator(".site-menu-toggle")).toHaveCSS("color", "rgb(32, 32, 32)");
    const text = await readableContrast(page, targets);
    const placeholder = await readableContrast(page, "#housing-prompt", "placeholder");
    await expect(prompt).toHaveCSS("outline-width", "3px");
    const focus = await readableContrast(page, "#housing-prompt", "focus");
    await page.keyboard.press("Tab");
    await expect(primary).toBeFocused();
    await expect(primary).toHaveCSS("outline-width", "3px");
    const actionFocus = await readableContrast(page, ".prompt-shell .primary", "focus");
    await primary.hover();
    await expect(primary).toHaveCSS("background-color", "rgb(0, 94, 199)");
    const hover = await readableContrast(page, ".prompt-shell .primary");
    reports.push({ theme, text, disabledText, placeholder, focus, actionFocus, hover });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (page.viewportSize()!.width <= 960) {
      const inputBox = await prompt.boundingBox(), feedBox = await page.locator(".public-listings").boundingBox();
      expect(feedBox!.y).toBeGreaterThan(inputBox!.y + inputBox!.height);
      expect(inputBox!.y + await page.evaluate(() => scrollY)).toBeLessThan(500);
    }
    await heading.click();
    await expect(primary).toHaveCSS("background-color", "rgb(0, 112, 237)");
    if (process.env.VISUAL_REVIEW === "1") await page.screenshot({ path: test.info().outputPath(`borderless-home-${theme}.png`), fullPage: true, animations: "disabled" });
    await page.getByRole("button", { name: "Meny", exact: true }).click();
    await borderlessSurfaces(page, page.viewportSize()!.width <= 800 ? ".compact-nav" : ".nav-advanced", true);
    await borderlessSurfaces(page, ".compact-nav button");
    for (const link of await page.locator(".compact-nav a:visible").all()) await expect(link).toHaveCSS("box-shadow", "none");
    const menu = await readableContrast(page, ".compact-nav a,.compact-nav button,.compact-nav p");
    if (process.env.VISUAL_REVIEW === "1" && test.info().project.name === "desktop")
      await page.screenshot({ path: test.info().outputPath(`borderless-menu-${theme}.png`), fullPage: true, animations: "disabled" });
    await page.keyboard.press("Escape");
    await primary.click();
    await expect(page.getByLabel("Gemensamt lösenord")).toBeFocused();
    await expect(page.getByLabel("Jag vill använda AI-texthjälpen")).not.toBeChecked();
    await expect(page.getByLabel("Jag vill använda AI-texthjälpen")).toHaveCSS("appearance", "auto");
    await borderlessSurfaces(page, ".access-dialog,.access-dialog input[type=password]", true);
    await borderlessSurfaces(page, ".access-dialog button");
    const dialog = await readableContrast(page, ".access-dialog h2,.access-dialog p,.access-dialog label,.access-dialog summary,.access-dialog a,.access-dialog button,.access-dialog input");
    const dialogFocus = await readableContrast(page, ".access-dialog input[type=password]", "focus");
    if (process.env.VISUAL_REVIEW === "1" && test.info().project.name === "mobile")
      await page.screenshot({ path: test.info().outputPath(`borderless-dialog-${theme}.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(prompt).toHaveValue("Lägenhet i Solna, gärna balkong.");
    await more(page, "Använd vanliga filter");
    await expect(page.getByRole("combobox", { name: "Kommun", exact: true })).toBeVisible();
    await expandedHeroPanels(page);
    await borderlessSurfaces(page, ".manual-controls select", true);
    await borderlessSurfaces(page, ".manual-search,.manual-controls button");
    const propertyType = page.locator(".manual-controls .type-buttons").getByRole("button", { pressed: true });
    await expect(propertyType).toHaveAttribute("aria-pressed", "true");
    await expect(propertyType).toHaveCSS("text-decoration-line", "underline");
    await expect(propertyType).toHaveCSS("background-color", "rgb(163, 217, 252)");
    const manual = await readableContrast(page);
    await page.getByRole("combobox", { name: "Kommun", exact: true }).focus();
    const manualFocus = await readableContrast(page, ".manual-controls select", "focus");
    await page.locator(".manual-search > summary").click();
    reports.push({ theme, menu, dialog, dialogFocus, manual, manualFocus });
  }
  await test.info().attach("theme-contrast", { body: JSON.stringify(reports, null, 2), contentType: "application/json" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("button", { name: "Hitta bostad", exact: true })).toHaveCSS("transition-duration", "0s");
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
  await more(page, "Ljust tema");
  await page.getByRole("button", { name: "Meny", exact: true }).click();
  const cdp = await page.context().newCDPSession(page);
  for (const type of ["deuteranopia", "protanopia"] as const) {
    await cdp.send("Emulation.setEmulatedVisionDeficiency", { type });
    await websiteSurface(page);
    if (process.env.VISUAL_REVIEW === "1" && type === "deuteranopia" && test.info().project.name === "desktop")
      await page.screenshot({ path: test.info().outputPath("reference-deuteranopia.png"), fullPage: true, animations: "disabled" });
  }
  await cdp.send("Emulation.setEmulatedVisionDeficiency", { type: "none" });
  await cdp.detach();
  expect(calls).toBe(0); expect(gatePosts).toBe(0);
});

test("liquid glass respects reduced transparency and falls back without remounting the prompt", async ({ page }) => {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  await page.goto("/");
  await heroAssets(page);
  const prompt = page.locator("#housing-prompt");
  const original = "Lägenhet med balkong och kakelugn.";
  await prompt.fill(original);
  const node = await prompt.elementHandle();
  const cdp = await page.context().newCDPSession(page);
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") { await more(page, "Mörkt tema"); await page.keyboard.press("Escape"); }
    await heroGlass(page, theme);
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches)).toBe(true);
    for (const surface of [".home-intro", ".prompt-form"]) {
      await expect(page.locator(surface)).toHaveCSS("background-color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(34, 34, 34)");
      await expect(page.locator(surface)).toHaveCSS("backdrop-filter", "none");
    }
    await expect(prompt).toHaveCSS("background-color", theme === "light" ? "rgb(242, 242, 242)" : "rgb(43, 43, 43)");
    await readableContrast(page, ".home-intro h1,.home-intro p,.prompt-shell label,#housing-prompt,#prompt-helper");
    await heroGeometry(page);
    await expect(prompt).toHaveValue(original);
    expect(await prompt.evaluate((el, prior) => el === prior, node)).toBe(true);
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await heroGlass(page, theme);
  }
  await cdp.detach();
  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.locator(".home-intro")).toHaveCSS("backdrop-filter", "none");
  await page.emulateMedia({ forcedColors: "none" });
  await heroGlass(page, "dark");
  const removed = await page.evaluate(() => {
    let removed = 0;
    for (const sheet of document.styleSheets) {
      for (let index = sheet.cssRules.length - 1; index >= 0; index--) {
        const rule = sheet.cssRules[index];
        if (rule instanceof CSSSupportsRule && rule.conditionText.includes("backdrop-filter")) {
          sheet.deleteRule(index);
          removed++;
        }
      }
    }
    return removed;
  });
  expect(removed).toBe(1);
  for (const surface of [".home-intro", ".prompt-form"]) {
    await expect(page.locator(surface)).toHaveCSS("background-color", "rgb(34, 34, 34)");
    await expect(page.locator(surface)).toHaveCSS("backdrop-filter", "none");
  }
  await expect(prompt).toHaveValue(original);
  expect(await prompt.evaluate((el, prior) => el === prior, node)).toBe(true);
});

test("photo hero remains readable and usable without its image in light and dark themes", async ({ page }) => {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  await page.context().clearCookies();
  await page.route("**/assets/autumn-home-*.webp", route => route.fulfill({ status: 404, body: "" }));
  await page.goto("/");
  await websiteSurface(page);
  await expect.poll(() => page.locator(".hero-backdrop").evaluate((el: HTMLImageElement) => el.complete)).toBe(true);
  expect(await page.locator(".hero-backdrop").evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(0);
  await expect(page.locator(".hero-backdrop")).toBeHidden();
  const original = "Villa i Nacka med en trädgård.";
  const prompt = page.locator("#housing-prompt");
  await prompt.fill(original);
  const node = await prompt.elementHandle();
  const reports = [];
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") { await more(page, "Mörkt tema"); await page.keyboard.press("Escape"); }
    await expect(page.locator(".home-hero")).toHaveCSS("background-color", theme === "light" ? "rgb(242, 242, 242)" : "rgb(43, 43, 43)");
    for (const surface of [".home-intro", ".prompt-form"]) {
      await expect(page.locator(surface)).toHaveCSS("background-color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(34, 34, 34)");
      await expect(page.locator(surface)).toHaveCSS("backdrop-filter", "none");
    }
    await heroGeometry(page);
    reports.push(await readableContrast(page));
    await prompt.focus();
    await expect(prompt).toHaveCSS("outline-width", "3px");
    reports.push(await readableContrast(page, "#housing-prompt", "focus"));
    await expect(prompt).toHaveValue(original);
    expect(await prompt.evaluate((el, prior) => el === prior, node)).toBe(true);
    if (process.env.VISUAL_REVIEW === "1" && test.info().project.name === "desktop")
      await page.screenshot({ path: test.info().outputPath(`photo-hero-missing-${theme}.png`), fullPage: true, animations: "disabled" });
  }
  await test.info().attach("missing-image-contrast", { body: JSON.stringify(reports, null, 2), contentType: "application/json" });
  await page.unroute("**/assets/autumn-home-*.webp");
  await page.setViewportSize({ width: page.viewportSize()!.width <= 960 ? 1440 : 390, height: 1000 });
  await heroAssets(page);
  await heroGlass(page, "dark");
  await expect(page.locator(".hero-backdrop")).toBeVisible();
  await expect(prompt).toHaveValue(original);
  await page.getByRole("button", { name: "Hitta bostad", exact: true }).click();
  await expect(page.getByLabel("Jag vill använda AI-texthjälpen")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Skapa med AI", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveValue(original);
  expect(calls).toBe(0); expect(gatePosts).toBe(0);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM ai_attempts").first()).toEqual({ n: 0 });
});

async function seedPublicInventory() {
  env.AUTHORIZED_SOURCES = JSON.stringify([{ id: "authorized", hosts: ["listings.example.com"],
    licenseReference: "Synthetic local browser fixture only", expiresAt: "2099-01-01T00:00:00Z" }]);
  await env.DB.batch(publicFixtures.map(({ id, firstSeen, lastSeen, ...listing }) =>
    env.DB.prepare("INSERT INTO listings VALUES(?,?,?,?,?,1)").bind(id, listing.sourceId, JSON.stringify(listing), firstSeen, lastSeen)));
}
async function browsingState() {
  return Promise.all(["subscriptions", "sessions", "guest_sessions", "guest_drafts", "guest_saves", "search_drafts", "ai_attempts", "outbox", "quotas", "gate_logins"]
    .map(async table => ({ table, rows: (await env.DB.prepare(`SELECT * FROM ${table}`).all()).results })));
}
async function browseWithPassword(page: Page) {
  await page.getByRole("button", { name: "Öppna bostadslistan", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(dialog.locator('input[type="email"]')).toHaveCount(0);
  await dialog.getByLabel("Gemensamt lösenord").fill(gatePassword);
  await dialog.getByRole("button", { name: "Visa bostäder", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
test("private feed reads real HTTP/D1 pages after password only and filters without changing the personal search", async ({ page }) => {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  await seedPublicInventory();
  await env.DB.prepare("UPDATE subscriptions SET preference_profile=?,search_version=4").bind(JSON.stringify(manualProfile({ ...defaultFilters, maxPrice: 4250123 }))).run();
  await page.context().clearCookies();
  const reads: { url: string; credentials: RequestCredentials }[] = [];
  await page.exposeFunction("capturePublicRead", (url: string, credentials: RequestCredentials) => { reads.push({ url, credentials }); });
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = (input, init) => {
      if (String(input).includes("/api/listings")) {
        const capture = Reflect.get(window, "capturePublicRead") as (url: string, credentials: RequestCredentials | undefined) => void;
        capture(String(input), init?.credentials);
      }
      return original(input, init);
    };
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const feed = page.locator(".public-listings"), cards = feed.locator(".property"), prompt = page.locator("#housing-prompt");
  await expect(cards).toHaveCount(0);
  await browseWithPassword(page);
  const before = await browsingState();
  await expect(cards).toHaveCount(12);
  await expect(cards.first()).toContainText("Syntetiska gatan 29");
  await websiteSurface(page);
  await brandAssets(page);
  await prompt.fill("Villa i Nacka, gärna en trädgård.");
  const contrast = [];
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") { await more(page, "Mörkt tema"); await page.keyboard.press("Escape"); }
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    contrast.push(await readableContrast(page, ".public-listings h2,.public-listings h3,.public-listings p,.public-listings a,.public-listings dt,.public-listings dd,.public-listings span,.public-listings summary,.public-listings button"));
    await borderlessSurfaces(page, ".public-listings .property,.public-filters > summary,.public-load-more button", true);
    await page.locator(".public-filters > summary").focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator(".public-filters > summary")).toHaveCSS("outline-width", "3px");
    contrast.push(await readableContrast(page, ".public-filters > summary", "focus"));
    if (process.env.VISUAL_REVIEW === "1") {
      await page.locator("#public-listings-title").evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 24, behavior: "instant" }));
      await page.screenshot({ path: test.info().outputPath(`public-feed-populated-${theme}.png`), animations: "disabled" });
    }
  }
  await more(page, "Ljust tema"); await page.keyboard.press("Escape");
  for (const width of test.info().project.name === "mobile" ? [320, 360, 390, 430] : [1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width <= 430) expect((await page.locator(".compact-header").boundingBox())!.height).toBeLessThanOrEqual(84);
    for (const target of await feed.locator("button:visible,summary:visible,.property a:visible").all()) {
      const box = (await target.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44);
    }
  }
  await feed.getByRole("button", { name: "Ladda fler", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(cards).toHaveCount(24);
  expect(reads.filter(read => new URL(read.url).searchParams.has("cursor"))).toHaveLength(1);
  await feed.getByRole("button", { name: "Ladda fler", exact: true }).click();
  await expect(cards).toHaveCount(29);
  await expect(feed.getByRole("button", { name: "Ladda fler", exact: true })).toHaveCount(0);
  expect(new Set(await cards.locator("h3").allTextContents()).size).toBe(29);
  await feed.locator(":scope > details > summary").click();
  await feed.getByRole("combobox", { name: "Kommun", exact: true }).selectOption("Stockholm");
  await readableContrast(page, ".public-listings label,.public-listings button,.public-listings select,.public-listings legend,.public-listings summary");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await feed.getByRole("button", { name: "Använd filter", exact: true }).click();
  await expect(cards).toHaveCount(12);
  for (const location of await cards.locator(".property-location").allTextContents()) expect(location).toContain("Stockholm");
  await feed.getByRole("button", { name: "Ladda fler", exact: true }).click();
  await expect(cards).toHaveCount(15);
  await feed.locator(":scope > details > summary").click();
  await feed.getByRole("button", { name: "Rensa", exact: true }).click();
  await feed.locator(".more-filters > summary").click();
  await feed.getByRole("searchbox", { name: "Område eller gata" }).fill("åRSTA öSTRA");
  await feed.getByRole("button", { name: "Använd filter", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Syntetiska gatan 1");
  await expect(cards.first()).toContainText("Pris: Ej angivet");
  await expect(cards.first()).toContainText("Först upptäckt:");
  await expect(cards.first()).toContainText("Äldre uppgift:");
  await expect(cards.first().getByRole("link", { name: "Visa objekt" })).toHaveAttribute("href", publicFixtures[0].url);
  await expect(feed).not.toContainText("Matchar dina");
  await expect(prompt).toHaveValue("Villa i Nacka, gärna en trädgård.");
  await more(page, "Så fungerar det");
  await page.getByRole("link", { name: "kommandekollen. – till sökningen" }).click();
  await expect(prompt).toHaveValue("Villa i Nacka, gärna en trädgård.");
  await expect(cards).toHaveCount(1);
  await page.getByRole("button", { name: "Hitta bostad", exact: true }).click();
  await expect(page.getByLabel("Gemensamt lösenord")).toHaveCount(0);
  await expect(page.getByLabel("Jag vill använda AI-texthjälpen")).not.toBeChecked();
  await page.keyboard.press("Escape");
  expect(reads.every(read => read.credentials === "include")).toBe(true);
  expect(await browsingState()).toEqual(before);
  expect(calls).toBe(0); expect(gatePosts).toBe(1); expect(errors).toEqual([]);
  await test.info().attach("public-feed-contrast", { body: JSON.stringify(contrast), contentType: "application/json" });
});

async function holdPublicResponse(page: Page, match: (url: URL) => boolean) {
  let release!: () => void, reached!: () => void, done!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const received = new Promise<void>(resolve => { reached = resolve; });
  const completed = new Promise<void>(resolve => { done = resolve; });
  let once = true;
  await page.route(`${api}/api/listings?**`, async route => {
    const url = new URL(route.request().url());
    if (!once || !match(url)) { await route.fallback(); return; }
    once = false;
    const response = await route.fetch({ url: `${base}${url.pathname}${url.search}` });
    reached(); await held;
    await route.fulfill({ response }); done();
  });
  return { release, received, completed };
}
test("private feed retains cards on failed load more and ignores late pages and old filter responses", async ({ page }) => {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  await seedPublicInventory(); await page.context().clearCookies();
  await page.goto("/");
  await browseWithPassword(page);
  const feed = page.locator(".public-listings"), cards = feed.locator(".property");
  await expect(cards).toHaveCount(12);
  await page.locator("#housing-prompt").fill("Min oskickade bostadstext.");
  await page.route(`${api}/api/listings?**`, route => route.abort("failed"), { times: 1 });
  await feed.getByRole("button", { name: "Ladda fler", exact: true }).click();
  await expect(feed.getByRole("alert")).toContainText("Kontrollera anslutningen");
  await expect(feed.getByRole("alert")).toContainText("Redan inlästa objekt finns kvar");
  await expect(cards).toHaveCount(12);
  await feed.getByRole("button", { name: "Försök igen", exact: true }).click();
  await expect(cards).toHaveCount(24);
  const oldPage = await holdPublicResponse(page, url => url.searchParams.has("cursor"));
  await feed.getByRole("button", { name: "Ladda fler", exact: true }).click();
  await oldPage.received;
  await feed.locator(":scope > details > summary").click();
  await feed.getByRole("combobox", { name: "Kommun", exact: true }).selectOption("Stockholm");
  await feed.getByRole("button", { name: "Använd filter", exact: true }).click();
  await expect(cards).toHaveCount(12);
  oldPage.release(); await oldPage.completed;
  await expect(cards).toHaveCount(12);
  expect((await cards.locator(".property-location").allTextContents()).every(text => text.includes("Stockholm"))).toBe(true);
  const oldFilter = await holdPublicResponse(page, url => JSON.parse(url.searchParams.get("filters") || "{}").municipality === "Nacka");
  await feed.locator(":scope > details > summary").click();
  await feed.getByRole("combobox", { name: "Kommun", exact: true }).selectOption("Nacka");
  await feed.getByRole("button", { name: "Använd filter", exact: true }).click();
  await oldFilter.received;
  await feed.locator(":scope > details > summary").click();
  await feed.getByRole("combobox", { name: "Kommun", exact: true }).selectOption("Solna");
  await feed.getByRole("button", { name: "Använd filter", exact: true }).click();
  await expect(cards).toHaveCount(12);
  oldFilter.release(); await oldFilter.completed;
  await expect(cards).toHaveCount(12);
  expect((await cards.locator(".property-location").allTextContents()).every(text => text.includes("Solna"))).toBe(true);
  await feed.getByRole("button", { name: "Ladda fler", exact: true }).click();
  await expect(cards).toHaveCount(14);
  await expect(page.locator("#housing-prompt")).toHaveValue("Min oskickade bostadstext.");
  expect(calls).toBe(0); expect(gatePosts).toBe(1);
});

test("private feed distinguishes no sources, empty inventory and no filter matches", async ({ page }) => {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  await page.context().clearCookies();
  await page.goto("/");
  await browseWithPassword(page);
  const feed = page.locator(".public-listings");
  await expect(feed).toContainText("Inga bostadskällor är anslutna ännu. Därför visas inga bostäder just nu.");
  await expect(feed.locator(".property")).toHaveCount(0);
  await seedPublicInventory();
  await env.DB.prepare("UPDATE listings SET active=0").run();
  await feed.getByRole("button", { name: "Uppdatera listan" }).click();
  await expect(feed.getByRole("heading", { name: "Inga kommande objekt just nu" })).toBeVisible();
  await env.DB.prepare("UPDATE listings SET active=1").run();
  await feed.locator(":scope > details > summary").click();
  await feed.getByRole("combobox", { name: "Kommun", exact: true }).selectOption("Nacka");
  await feed.getByRole("button", { name: "Använd filter", exact: true }).click();
  await expect(feed.getByRole("heading", { name: "Inga objekt matchar filtren" })).toBeVisible();
  await feed.getByRole("button", { name: "Rensa filter", exact: true }).click();
  await expect(feed.locator(".property")).toHaveCount(12);
  await expect(feed.getByRole("button", { name: "Ladda fler", exact: true })).toBeVisible();
  expect(calls).toBe(0); expect(gatePosts).toBe(1);
});

test("private feed clears facts and late pages on logout and rejects rotated access without losing housing text", async ({ page }) => {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  await seedPublicInventory(); await page.context().clearCookies();
  const reads: string[] = [];
  page.on("request", request => { if (new URL(request.url()).origin === api) reads.push(new URL(request.url()).pathname); });
  await page.goto("/");
  const feed = page.locator(".public-listings"), cards = feed.locator(".property");
  await page.locator("#housing-prompt").fill("Texten ska vara kvar efter stängd åtkomst.");
  await browseWithPassword(page);
  await expect(cards).toHaveCount(12);
  expect(reads).not.toContain("/api/me");
  const oldPage = await holdPublicResponse(page, url => url.searchParams.has("cursor"));
  await feed.getByRole("button", { name: "Ladda fler", exact: true }).click();
  await oldPage.received;
  await more(page, "Konto");
  await page.getByRole("button", { name: "Stäng åtkomsten", exact: true }).click();
  await expect(cards).toHaveCount(0);
  oldPage.release(); await oldPage.completed;
  await expect(cards).toHaveCount(0);
  await expect(feed).not.toContainText("inlästa objekt");
  await expect(page.locator("#housing-prompt")).toHaveValue("Texten ska vara kvar efter stängd åtkomst.");
  await browseWithPassword(page);
  await expect(cards).toHaveCount(12);
  env.SHARED_ACCESS_PASSWORD = "d".repeat(64);
  await feed.getByRole("button", { name: "Uppdatera listan", exact: true }).click();
  await expect(cards).toHaveCount(0);
  await expect(feed.getByRole("button", { name: "Öppna bostadslistan", exact: true })).toBeVisible();
  await expect(page.locator("#housing-prompt")).toHaveValue("Texten ska vara kvar efter stängd åtkomst.");
  expect(calls).toBe(0);
});

test("private observations travel through importer HTTP Worker D1 and render unknown facts with paused saving", async ({ page }) => {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  env.PRIVATE_OBSERVATION_SOURCES = JSON.stringify([{ id: "notar", hosts: ["www.notar.se"],
    basisReference: "Synthetic test evidence only; not a real source grant", expiresAt: "2099-01-01T00:00:00.000Z" }]);
  const preview = {
    kind: "notar-rendered-preview", ingestible: false, sourceId: "notar", coverage: { complete: false },
    observationId: crypto.randomUUID(), observedAt: new Date(Date.now() - 60000).toISOString(),
    items: publicFixtures.slice(0, 15).map(({ firstSeen: _first, lastSeen: _last, ...item }) => ({
      ...item, id: `notar:${item.externalId}`, sourceId: "notar", type: null, price: null, fee: null,
      url: `https://www.notar.se/kopa-bostad/objekt/${item.externalId}`,
    })),
  };
  const data = prepareObservations(preview, env);
  expect(await sendObservations(data, env, base, env.ADMIN_TOKEN, true)).toMatchObject({ inserted: 15, retired: 0 });
  await page.context().clearCookies();
  await page.goto("/");
  const feed = page.locator(".public-listings");
  await expect(feed.locator(".property")).toHaveCount(0);
  await browseWithPassword(page);
  await expect(feed.locator(".property")).toHaveCount(12);
  await expect(feed.locator(".property").first()).toContainText("Bostadstyp: Ej angivet");
  await expect(feed.locator(".property").first()).toContainText("Pris: Ej angivet");
  await expect(feed).toContainText("inte mäklarnas hela utbud");
  await heroGeometry(page);
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") { await more(page, "Mörkt tema"); await page.keyboard.press("Escape"); }
    await readableContrast(page, ".home-intro h1,.home-intro p,.public-listings h2,.public-listings p,.property span,.property dt,.property dd,.property a");
    if (process.env.VISUAL_PRIVATE === "1") {
      await page.locator("#public-listings-title").evaluate(element => window.scrollTo({ top: element.getBoundingClientRect().top + scrollY - 24, behavior: "instant" }));
      await page.screenshot({ path: test.info().outputPath(`private-observations-${theme}.png`), animations: "disabled" });
    }
  }
  for (const width of test.info().project.name === "mobile" ? [320, 360, 390, 430] : [1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 850 });
    await heroGeometry(page);
  }
  await feed.getByRole("button", { name: "Ladda fler" }).click();
  await expect(feed.locator(".property")).toHaveCount(15);
  await feed.locator(":scope > details > summary").click();
  await feed.getByRole("button", { name: "Villa", exact: true }).click();
  await feed.getByRole("button", { name: "Använd filter", exact: true }).click();
  await expect(feed.getByRole("heading", { name: "Inga objekt matchar filtren" })).toBeVisible();
  await feed.getByRole("button", { name: "Rensa filter", exact: true }).click();
  await expect(feed.locator(".property")).toHaveCount(12);
  await more(page, "Använd vanliga filter");
  await page.getByRole("button", { name: "Granska ändringarna" }).click();
  await expect(page.getByRole("button", { name: "Fortsätt till e-post", exact: true })).toBeVisible();
  await expect(page.locator(".draft-review")).toContainText("pausad");
  expect(await env.DB.prepare("SELECT count(*) AS n FROM outbox").first()).toEqual({ n: 0 });
  expect(await env.DB.prepare("SELECT count(*) AS n FROM ai_attempts").first()).toEqual({ n: 0 });
  expect(calls).toBe(0);
});
