import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import worker from "../../worker/index";
import { hash, keyed, type Env } from "../../worker/support";
import { defaultFilters } from "../../shared/model";
import { manualProfile, type Interpretation } from "../../shared/preferences";

const frontend = "http://127.0.0.1:5174";
const api = "http://127.0.0.1:8787";
let mf: Miniflare, server: Server, env: Env, base: string;
let memberId: string, cookie: string, output: unknown, calls: number;
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
  output = interpretation; calls = 0;
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
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(key, value);
      const response = await worker.fetch(new Request(`${base}${req.url}`, {
        method: req.method, headers, body: body.length ? body : undefined,
      }), env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
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
    const response = await route.fetch({ url: `${base}${new URL(route.request().url()).pathname}` });
    await route.fulfill({ response });
  });
});
test.afterEach(async () => {
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
  await page.getByRole("button", { name: "Hjälp mig att precisera" }).click();
  await expect(page.getByRole("heading", { name: "Stämmer det här?" })).toBeFocused();
  expect(await env.DB.prepare("SELECT search_version FROM subscriptions").first()).toEqual({ search_version: 0 });
  await page.getByLabel("Jag godkänner den här sökningen").check();
  await page.getByRole("button", { name: "Spara pausad sökning" }).click();
  const receipt = page.getByRole("heading", { name: "Sökningen är sparad pausad", exact: true });
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
  await page.getByRole("button", { name: "Hjälp mig att precisera" }).click();
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
  await page.getByRole("button", { name: "Hjälp mig att precisera" }).click();
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
  await expect(page.getByRole("heading", { name: "Sökningen är sparad pausad", exact: true })).toBeVisible();
  expect(calls).toBe(0);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM ai_attempts").first()).toEqual({ n: 6 });
});

test("a non-JSON gateway response is actionable instead of exposing a parser exception", async ({ page }) => {
  await page.route(`${api}/api/preferences/interpret`, route => route.fulfill({
    status: 503, contentType: "text/html", body: "<html><body>Upstream unavailable</body></html>",
  }));
  await enterPrompt(page);
  await page.getByRole("button", { name: "Hjälp mig att precisera" }).click();
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
