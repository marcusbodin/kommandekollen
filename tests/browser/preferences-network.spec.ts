import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import worker from "../../worker/index";
import { hash, keyed, type Env } from "../../worker/support";
import { dispatchOne } from "../../worker/mail";
import { defaultFilters } from "../../shared/model";
import { manualProfile, type Interpretation } from "../../shared/preferences";

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

const gatePassword = "a".repeat(64);
async function sharedGuest(page: Page, keepAccount = false) {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  if (!keepAccount) await page.context().clearCookies();
  await page.goto("/");
  await page.getByRole("button", { name: "Mer", exact: true }).click();
  await page.getByRole("button", { name: /Konto/ }).click();
  await page.getByLabel("Gemensamt lösenord").fill(gatePassword);
  await page.getByRole("button", { name: "Fortsätt utan AI", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ditt konto", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tillbaka till texten" }).click();
  await page.getByRole("button", { name: "Mer", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true })).toBeVisible();
}
async function more(page: Page, name: string) {
  if (await page.getByRole("button", { name: "Mer", exact: true }).getAttribute("aria-expanded") !== "true")
    await page.getByRole("button", { name: "Mer", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}
async function minimalSurface(page: Page) {
  await expect(page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true })).toBeVisible();
  await expect(page.locator("textarea:visible")).toHaveCount(1);
  await expect(page.locator("input:visible")).toHaveCount(0);
  await expect(page.locator("button:visible")).toHaveCount(2);
  await expect(page.locator("header")).toBeHidden();
  await expect(page.locator("footer")).toBeHidden();
  await expect(page.locator(".inspiration:visible, .privacy:visible, .results:visible, .saved-profile:visible, .draft-review:visible")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function consentToInterpret(page: Page, password = false) {
  await page.getByRole("button", { name: "Skicka bostadsönskemål" }).click();
  if (password) await page.getByLabel("Gemensamt lösenord").fill(gatePassword);
  await page.getByLabel("Jag vill använda AI-texthjälpen").check();
  await page.getByRole("button", { name: "Tolka min text", exact: true }).click();
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
  await minimalSurface(page);
  await expect(page.getByRole("heading", { name: "Ansök om medlemskap" })).toHaveCount(0);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM subscriptions").first()).toEqual({ n: 1 });
  await page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true }).fill("Lägenhet i Solna, högst 4 miljoner.");
  await consentToInterpret(page, true);
  await expect(page.getByRole("heading", { name: "Stämmer det här?" })).toBeFocused();
  await page.getByLabel("Jag godkänner den här sökningen").check();
  await page.getByRole("button", { name: "Spara pausad sökning", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verifiera e-post för att spara" })).toBeFocused();
  await page.getByLabel("E-postadress", { exact: true }).first().fill("new-browser@example.com");
  await page.getByRole("button", { name: "Skicka verifieringslänk" }).click();
  await expect(page.locator(".preference-flow [role=status]")).toContainText("Inget har sparats ännu");
  const link = await deliverVerification();
  await page.reload();
  await minimalSurface(page);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Bekräfta och logga in" })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  expect(await env.DB.prepare("SELECT state,search_version FROM subscriptions WHERE email='new-browser@example.com'").first())
    .toEqual({ state: "unverified", search_version: 0 });
  await page.getByRole("button", { name: "Fortsätt", exact: true }).click();
  await expect(page.locator(".action-page [role=status]")).toContainText("Sökningen är inte sparad");
  await page.getByRole("link", { name: "Till sökningen och granskningen" }).click();
  await expect(page.getByText("E-postadressen är verifierad. Granska den här sammanfattningen", { exact: false })).toBeVisible();
  const confirm = page.getByRole("button", { name: "Bekräfta och spara pausad sökning" });
  await expect(confirm).toBeDisabled();
  expect(await env.DB.prepare("SELECT state,search_version,alerts_enabled FROM subscriptions WHERE email='new-browser@example.com'").first())
    .toEqual({ state: "approved", search_version: 0, alerts_enabled: 0 });
  await page.getByLabel("Jag godkänner den här sökningen").check();
  await confirm.click();
  await expect(page.getByRole("heading", { name: "Sökningen är sparad pausad", exact: true })).toBeInViewport();
  expect(await env.DB.prepare("SELECT search_version,alerts_enabled FROM subscriptions WHERE email='new-browser@example.com'").first())
    .toEqual({ search_version: 1, alerts_enabled: 0 });
  expect(calls).toBe(1);
  expect(gatePosts).toBe(1);
  expect(submittedTexts).toEqual(["Lägenhet i Solna, högst 4 miljoner."]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(".preference-flow").screenshot({ path: test.info().outputPath("guest-saved.png") });
});
test("wrong-password errors are visible and a separate browser cannot claim the verification", async ({ page, browser }) => {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  await page.context().clearCookies();
  await page.goto("/");
  const prompt = page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true });
  await prompt.fill("Villa i Nacka. Gärna stor trädgård.");
  await page.getByRole("button", { name: "Skicka bostadsönskemål" }).click();
  await expect(page.getByLabel("Gemensamt lösenord")).toBeFocused();
  await page.getByLabel("Gemensamt lösenord").fill("wrong");
  await page.getByLabel("Jag vill använda AI-texthjälpen").check();
  await page.getByRole("button", { name: "Tolka min text", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Lösenordet kunde inte godkännas");
  await expect(page.getByRole("alert")).toBeFocused();
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
  await page.getByRole("button", { name: "Spara pausad sökning", exact: true }).click();
  await page.getByLabel("E-postadress", { exact: true }).first().fill("device@example.com");
  await page.getByRole("button", { name: "Skicka verifieringslänk" }).click();
  await expect(page.locator(".preference-flow [role=status]")).toContainText("Inget har sparats ännu");
  const link = await deliverVerification();
  const other = await browser.newContext();
  try {
    const second = await other.newPage();
    await second.route(`${api}/**`, async route => {
      await route.fulfill({ response: await route.fetch({ url: `${base}${new URL(route.request().url()).pathname}` }) });
    });
    await second.goto(link);
    await second.getByRole("button", { name: "Fortsätt", exact: true }).click();
    await expect(second.locator(".action-page [role=alert]")).toContainText("gemensamma lösenordet");
    await expect(second.locator(".action-page [role=alert]")).toBeFocused();
    await expect(second.locator(".action-page [role=alert]")).toBeInViewport();
    await expect(second.getByText("Om länken öppnades på en annan enhet:", { exact: false })).toBeVisible();
  } finally { await other.close(); }
  await page.reload();
  await minimalSurface(page);
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
  await more(page, "Konto & ägarverktyg");
  await expect(page.getByRole("heading", { name: "Hantera medlemskap" })).toBeVisible();
  await page.getByRole("button", { name: "Tillbaka till texten" }).click();
  await page.locator("#housing-prompt").fill("Lägenhet i Solna, högst 4 miljoner.");
  await consentToInterpret(page);
  await expect(page.getByRole("heading", { name: "Stämmer det här?" })).toBeFocused();
  expect(await env.DB.prepare("SELECT base_version FROM search_drafts").first()).toEqual({ base_version: 4 });
  env.SHARED_ACCESS_PASSWORD = "b".repeat(64);
  await page.reload();
  await minimalSurface(page);
  await page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true }).fill("Solna, gärna balkong");
  await page.getByRole("button", { name: "Skicka bostadsönskemål" }).click();
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

test("minimal shared homepage defers password and disclosure, fits small screens and keeps text on cancel", async ({ page }) => {
  env.ACCESS_MODE = "shared"; env.SHARED_ACCESS_PASSWORD = gatePassword;
  await page.context().clearCookies();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await minimalSurface(page);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(247, 244, 239)");
  const prompt = page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true });
  const original = "Villa i Nacka,\ngärna en trädgård.";
  await prompt.fill(original);
  await prompt.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await prompt.fill(original);
  const widths = test.info().project.name === "mobile" ? [320, 360, 390, 430] : [1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 850 });
    await minimalSurface(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await prompt.evaluate(input => parseFloat(getComputedStyle(input).fontSize))).toBeGreaterThanOrEqual(16);
    for (const button of await page.locator("button:visible").all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: test.info().outputPath(`minimal-home-${width}.png`) });
  }
  await more(page, "Integritet & radering");
  await expect(page.getByRole("heading", { name: "Din bevakning, dina uppgifter" })).toBeFocused();
  await expect(page.getByRole("link", { name: "kontakt@kommandekollen.se" })).toBeVisible();
  expect(gatePosts).toBe(0); expect(calls).toBe(0);
  await page.getByRole("button", { name: "Tillbaka till texten" }).click();
  await expect(prompt).toBeFocused();
  await page.getByRole("button", { name: "Mer", exact: true }).click();
  await page.getByRole("button", { name: "Skicka bostadsönskemål" }).click();
  await expect(page.getByLabel("Gemensamt lösenord")).toBeFocused();
  const consent = page.getByLabel("Jag vill använda AI-texthjälpen");
  await expect(consent).not.toBeChecked();
  await page.getByLabel("Gemensamt lösenord").fill(gatePassword);
  await expect(page.getByRole("button", { name: "Tolka min text", exact: true })).toBeDisabled();
  await page.getByLabel("Gemensamt lösenord").press("Enter");
  expect(gatePosts).toBe(0); expect(calls).toBe(0);
  if (test.info().project.name === "mobile") await page.setViewportSize({ width: 320, height: 380 });
  await consent.scrollIntoViewIfNeeded();
  await expect(consent).toBeInViewport();
  await page.getByRole("button", { name: "Avbryt", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Avbryt", exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("contextual-access-keyboard.png") });
  await page.keyboard.press("Escape");
  await expect(prompt).toBeFocused(); await expect(prompt).toHaveValue(original);
  await page.getByRole("button", { name: "Skicka bostadsönskemål" }).click();
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
  await page.getByRole("button", { name: "Skicka bostadsönskemål" }).click();
  await page.getByLabel("Gemensamt lösenord").fill(gatePassword);
  await page.getByLabel("Jag vill använda AI-texthjälpen").check();
  await page.getByRole("button", { name: "Tolka min text", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole("textbox", { name: "Hur stor boarea vill du ha?" })).toBeFocused();
  expect(calls).toBe(1); expect(gatePosts).toBe(1);
  output = interpretation;
  await page.getByRole("button", { name: "Gärna minst 70 m²", exact: true }).click();
  await page.getByRole("button", { name: "Skicka bostadsönskemål" }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole("heading", { name: "Stämmer det här?" })).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(calls).toBe(2); expect(gatePosts).toBe(1);
  expect(submittedTexts).toEqual(["Lägenhet i Solna, högst 4 miljoner.", "Gärna minst 70 m²"]);
  expect(await env.DB.prepare("SELECT count(*) AS n,sum(reserved) AS total FROM ai_attempts").first()).toEqual({ n: 2, total: 2000 });
  await page.reload();
  await minimalSurface(page);
  await more(page, "Fortsätt utkast");
  await expect(page.getByRole("heading", { name: "Stämmer det här?" })).toBeVisible();
  await page.locator("#housing-prompt").fill("Gärna balkong också.");
  await page.getByRole("button", { name: "Skicka bostadsönskemål" }).click();
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
  await minimalSurface(page);
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
  await page.locator("#housing-prompt").fill("Ett nytt önskemål som ännu inte skickats.");
  await more(page, "Konto & ägarverktyg");
  await page.getByRole("button", { name: "Stäng åtkomsten", exact: true }).click();
  await expect(page.locator(".preference-flow [role=status]")).toContainText("Åtkomsten behöver öppnas igen");
  await expect(page.locator("#housing-prompt")).toHaveValue("Ett nytt önskemål som ännu inte skickats.");
  await expect(page.locator(".saved-profile")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Hantera medlemskap" })).toHaveCount(0);
  expect(await env.DB.prepare("SELECT preference_profile,search_version FROM subscriptions").first()).toEqual({ preference_profile: JSON.stringify(saved), search_version: 4 });
  expect(calls).toBe(0);
});
