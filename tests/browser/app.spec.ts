import { test, expect, type Page } from "@playwright/test";
import { defaultFilters, type Filters } from "../../shared/model";
import { sources } from "../../shared/sources";
import { manualProfile, type Draft } from "../../shared/preferences";
import { readableContrast } from "./contrast";
import { brandAssets } from "./brand";

const api = "http://127.0.0.1:8787";
const ownerId = "00000000-0000-4000-8000-000000000001";
const applicantId = "00000000-0000-4000-8000-000000000002";
type MockOptions = { ready?: boolean; state?: string; owner?: boolean; filters?: Filters; ai?: boolean; aiError?: boolean; catalogReady?: boolean };

async function mockApi(page: Page, options: MockOptions = {}) {
  let filters = options.filters ?? { ...defaultFilters };
  let alertsEnabled = false;
  let profile = manualProfile(filters), version = 0, revision = 0, aiRound = 0;
  let draft: Draft | null = null;
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  await page.route(`${api}/**`, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      posts.push({ path, body });
      if (path === "/api/search") { filters = body.filters; alertsEnabled = body.enabled; version++; }
      if (path === "/api/preferences/interpret") {
        if (options.aiError) { await route.fulfill({ status: 502, json: { message: "Texthjälpens svar gick inte att kontrollera. Inget har sparats." } }); return; }
        const p = manualProfile({ ...defaultFilters, minRooms: 3, type: "Lägenhet", maxPrice: aiRound++ ? 5000000 : null });
        p.alternatives.municipalities = ["Solna", "Sundbyberg"];
        p.wishes = [{ ...defaultFilters, minSize: 80 }];
        p.unverified = [{ text: "Tyst gata", must: true }];
        draft = { id: body.id, revision: ++revision, baseVersion: version, profile: p, turns: aiRound, expiresAt: Date.now() + 1800000,
          question: aiRound === 1 ? { text: "Är 5 miljoner ett fast pristak?", choices: ["Ja, högst 5 miljoner"], required: true } : null, conflicts: [] };
        await route.fulfill({ json: { draft } }); return;
      }
      if (path === "/api/preferences/draft") {
        draft = { id: body.id, revision: ++revision, baseVersion: version, profile: body.profile, turns: 0,
          expiresAt: Date.now() + 1800000, question: body.resolveQuestions ? null : draft?.question ?? null, conflicts: [] };
        await route.fulfill({ json: { draft } }); return;
      }
      if (path === "/api/preferences/confirm") {
        if (!draft || body.id !== draft.id || body.revision !== draft.revision || !body.consent) { await route.fulfill({ status: 409, json: { message: "Utkastet ändrades." } }); return; }
        profile = draft.profile; filters = profile.filters; alertsEnabled = body.enabled; version++; draft = null;
        await route.fulfill({ json: { message: alertsEnabled ? "Sökningen är sparad. Daglig bevakning är startad." : "Sökningen är sparad pausad. Inga bostadsmejl aktiverades.", searchVersion: version, profile, alertsEnabled } }); return;
      }
      if (path === "/api/preferences/cancel") draft = null;
      await route.fulfill({ json: { message: "Testsvaret har tagits emot." } });
      return;
    }
    reads.push(path);
    if (path === "/api/status") await route.fulfill({ json: { serviceReady: options.ready ?? false, acceptingApplications: options.ready ?? false, privacyContact: null } });
    else if (path === "/api/me" && ["approved", "pending"].includes(options.state ?? "")) await route.fulfill({ json: {
      id: ownerId, email: "member@example.com", state: options.state, owner: options.owner ?? false, filters, alertsEnabled, profile, searchVersion: version, aiReady: options.ai ?? false,
    } });
    else if (path === "/api/me") await route.fulfill({ status: 401, json: { message: "Ingen giltig medlemssession." } });
    else if (path === "/api/catalog" && options.state === "approved") await route.fulfill({ json: {
      listings: [], sources: sources.map(source => ({ ...source, authorized: !!options.catalogReady && source.id === "authorized", run: null })),
      serviceReady: options.catalogReady ?? false, privacyContact: null,
    } });
    else if (path === "/api/preferences/draft") await route.fulfill({ json: { draft, aiReady: options.ai ?? false } });
    else if (path === "/api/admin/members" && options.owner) await route.fulfill({ json: { members: [
      { id: applicantId, email: "long.application.address.for.mobile@example.com", application: "Jag söker ett mindre hem i Stockholm.", state: "pending" },
      { id: ownerId, email: "member@example.com", application: "", state: "approved" },
    ] } });
    else await route.fulfill({ status: 403, json: { message: "Åtkomst nekad." } });
  });
  return { posts, reads };
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
async function imageLoaded(page: Page) {
  await brandAssets(page);
  const image = page.locator(".inspiration img");
  await expect(image).toHaveCount(1);
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await image.evaluate((img: HTMLImageElement) => new URL(img.currentSrc).origin)).toBe(new URL(page.url()).origin);
  await expect(image).toHaveAttribute("width", "960");
  await expect(image).toHaveAttribute("height", "640");
  await expect(page.getByText("Inspirationsbild · inte ett bostadsobjekt", { exact: true })).toBeVisible();
}
async function touchAndType(page: Page) {
  for (const target of await page.locator("button, summary, input[type=range], nav a, .check").all()) {
    if (!await target.isVisible()) continue;
    const box = await target.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  for (const field of await page.locator("input:not([type=checkbox]):not([type=range]), select, textarea").all()) {
    if (await field.isVisible()) expect(await field.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  }
}
test("public shell stays private, light by default even on dark OS, with local imagery", async ({ page }) => {
  const { posts, reads } = await mockApi(page);
  const images: string[] = [];
  page.on("request", request => { if (request.resourceType() === "image") images.push(request.url()); });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "En privat väg till nästa hem." })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Skicka medlemsansökan" })).toBeDisabled();
  await expect(page.getByText("Tjänsten är inte konfigurerad")).toBeVisible();
  await expect(page.locator(".property")).toHaveCount(0);
  await imageLoaded(page);
  expect(images.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(reads).not.toContain("/api/catalog");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Hoppa till innehåll" })).toBeFocused();
  await touchAndType(page);
  await readableContrast(page);
  await noOverflow(page);
  await page.getByRole("heading", { name: "En privat väg till nästa hem." }).click();
  await page.screenshot({ path: test.info().outputPath("membership-light.png"), fullPage: true });
  await page.getByRole("button", { name: "Har du redan ansökt? Logga in" }).click();
  await expect(page.getByRole("heading", { name: "Logga in med mejllänk" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Begär inloggningslänk" })).toBeDisabled();
  expect(posts).toHaveLength(0);
  await page.getByRole("button", { name: "Byt till mörkt tema" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/?scoutTheme=dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await brandAssets(page);
});

test("native sliders filter synthetic results, distinguish finite endpoints and unset, and reset", async ({ page }) => {
  const { posts } = await mockApi(page);
  await page.goto("/?demo=1");
  await expect(page.getByText("Demonstrationsläge")).toBeVisible();
  await expect(page.locator(".property")).toHaveCount(6);
  await page.locator(".manual-search > summary").click();
  const price = page.getByRole("slider", { name: "Högsta pris", exact: true });
  await expect(price).toHaveAttribute("aria-valuetext", "Ingen gräns");
  await price.focus();
  await price.press("Home");
  expect(await price.evaluate(el => getComputedStyle(el).outlineStyle)).toBe("solid");
  await expect(price).toHaveAttribute("aria-valuetext", "0 kr");
  for (let i = 0; i < 40; i++) await price.press("ArrowRight");
  await expect(price).toHaveAttribute("aria-valuetext", "4 000 000 kr");
  await expect(page.locator(".numeric-heading output").first()).toHaveText("4 000 000 kr");
  await expect(page.locator(".property")).toHaveCount(2);
  const box = (await price.boundingBox())!;
  await price.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(price).not.toHaveAttribute("aria-valuetext", "Ingen gräns");
  await expect(page.locator(".property")).toHaveCount(5);
  await price.press("End");
  await expect(page.locator(".property")).toHaveCount(6);
  await price.press("ArrowLeft");
  await expect(price).toHaveAttribute("aria-valuetext", "20 000 000 kr");
  await expect(page.locator(".property")).toHaveCount(5);
  await page.getByRole("combobox", { name: "Kommun", exact: true }).selectOption("Solna");
  await expect(page.locator(".property")).toHaveCount(0);
  await page.locator(".more-filters > summary").click();
  await page.getByLabel("Ta även med objekt").check();
  await expect(page.locator(".property")).toHaveCount(1);
  await expect(page.locator(".property")).toContainText("Pris ej angivet");
  await page.getByRole("button", { name: "Rensa", exact: true }).click();
  await expect(price).toHaveAttribute("aria-valuetext", "Ingen gräns");
  await expect(page.locator(".property")).toHaveCount(6);
  const rooms = page.getByRole("slider", { name: "Minsta antal rum", exact: true });
  await rooms.press("Home");
  for (let i = 0; i < 7; i++) await rooms.press("ArrowRight");
  await expect(rooms).toHaveAttribute("aria-valuetext", "3 rum");
  await expect(page.locator(".property")).toHaveCount(4);
  await page.getByRole("button", { name: "Villa", exact: true }).click();
  await expect(page.locator(".property")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Villa", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Rensa", exact: true }).click();
  await page.getByRole("combobox", { name: "Sortera", exact: true }).selectOption("price");
  await expect(page.locator(".property").first()).toContainText("Demostigen");
  await page.getByRole("button", { name: "Granska ändringarna" }).click();
  await page.getByLabel("Jag godkänner den här sökningen").check();
  await page.getByRole("button", { name: "Förhandsvisa sparande" }).click();
  await expect(page.locator(".preference-flow [role=status]")).toContainText("ingen prenumeration har skapats");
  expect(posts).toHaveLength(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await imageLoaded(page);
  await readableContrast(page);
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath("search-light.png"), fullPage: true });
  await page.getByRole("button", { name: "Byt till mörkt tema" }).click();
  await readableContrast(page);
  await page.screenshot({ path: test.info().outputPath("search-dark.png"), fullPage: true });
});

test("exact saved values survive rendering and saving; bounds remain coordinated", async ({ page }) => {
  const original: Filters = { ...defaultFilters, minPrice: 3250123, maxPrice: 4250123, minRooms: 2.7, maxRooms: 4.25, minSize: 56.75, maxSize: 142.25, maxFee: 4321 };
  const { posts } = await mockApi(page, { ready: true, state: "approved", filters: original, catalogReady: true });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Inga liveobjekt att visa ännu" })).toBeVisible();
  await page.locator(".manual-search > summary").click();
  const price = page.getByRole("slider", { name: "Högsta pris", exact: true });
  await expect(price).toHaveAttribute("aria-valuetext", "4 250 123 kr");
  await page.getByRole("button", { name: "Granska ändringarna" }).click();
  await page.getByLabel("Jag godkänner den här sökningen").check();
  await page.getByRole("button", { name: "Spara och starta daglig bevakning" }).click();
  await expect(page.locator(".preference-flow [role=status]")).toContainText("Daglig bevakning är startad");
  expect(posts[0].body.profile).toEqual(manualProfile(original));
  expect(posts[1].body).toMatchObject({ enabled: true, consent: true, expectedVersion: 0 });
  await expect(page.locator(".saved-profile > summary")).toContainText("bevakning startad");
  await page.locator(".manual-search > summary").click();
  await price.press("ArrowLeft");
  await expect(price).toHaveAttribute("aria-valuetext", "4 200 000 kr");
  expect(posts).toHaveLength(2);
  await page.locator(".more-filters > summary").click();
  await expect(page.getByRole("slider", { name: "Minsta boarea", exact: true })).toHaveAttribute("aria-valuetext", "56,75 m²");
  await expect(page.getByRole("slider", { name: "Högsta månadsavgift", exact: true })).toHaveAttribute("aria-valuetext", "4 321 kr/mån");
  const maxRooms = page.getByRole("slider", { name: "Högsta antal rum", exact: true });
  await expect(maxRooms).toHaveAttribute("aria-valuetext", "4,25 rum");
  await maxRooms.press("Home");
  await expect(page.getByRole("slider", { name: "Minsta antal rum", exact: true })).toHaveAttribute("aria-valuetext", "0 rum");
  const maxSize = page.getByRole("slider", { name: "Största boarea", exact: true });
  await expect(maxSize).toHaveAttribute("aria-valuetext", "142,25 m²");
  await maxSize.press("ArrowLeft");
  await expect(maxSize).toHaveAttribute("aria-valuetext", "140 m²");
  await page.getByText("Skriv exakt: Lägsta pris", { exact: true }).click();
  await page.getByRole("spinbutton", { name: "Lägsta pris – exakt (kr)", exact: true }).fill("5000001");
  await expect(price).toHaveAttribute("aria-valuetext", "5 000 001 kr");
  await page.getByText("Skriv exakt: Högsta pris", { exact: true }).click();
  const exact = page.getByRole("spinbutton", { name: "Högsta pris – exakt (kr)", exact: true });
  await exact.fill("25000000");
  await expect(price).toHaveAttribute("aria-valuetext", "25 000 000 kr");
  const expandedMax = await price.getAttribute("max");
  await price.press("ArrowLeft");
  await expect(price).toHaveAttribute("aria-valuetext", "24 900 000 kr");
  await expect(price).toHaveAttribute("max", expandedMax!);
  await exact.fill("100000001");
  await expect(price).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Granska ändringarna" })).toBeDisabled();
  await page.getByRole("button", { name: "Ingen gräns: Högsta pris", exact: true }).click();
  await expect(price).toHaveAttribute("aria-valuetext", "Ingen gräns");
  await page.getByRole("button", { name: "Rensa", exact: true }).click();
  await price.press("Home");
  await price.press("ArrowRight");
  await page.getByRole("button", { name: "Granska ändringarna" }).click();
  await page.getByLabel("Jag godkänner den här sökningen").check();
  await page.getByRole("button", { name: "Spara och starta daglig bevakning" }).click();
  await expect.poll(() => posts.length).toBe(4);
  expect(posts[2].body.profile).toEqual(manualProfile({ ...defaultFilters, maxPrice: 100000 }));
  await noOverflow(page);
});

test("320–430px layouts retain application, optional sliders and local images without overflow", async ({ page }) => {
  const { posts } = await mockApi(page, { ready: true });
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Skicka medlemsansökan" })).toBeEnabled();
    await imageLoaded(page);
    const email = page.getByLabel("E-postadress", { exact: true });
    expect((await email.boundingBox())!.y).toBeLessThan(650);
    await email.fill("mobile@example.com");
    await page.getByLabel("Berätta kort").fill("Jag söker ett hem i Stockholm.");
    await page.getByLabel("Jag godkänner").check();
    await touchAndType(page);
    await readableContrast(page);
    await noOverflow(page);
    if (width === 320) {
      await page.getByRole("button", { name: "Skicka medlemsansökan" }).click();
      await expect(page.locator(".membership [role=status]")).toBeVisible();
      expect(posts[0].path).toBe("/api/apply");
    }
    await page.goto("/?demo=1");
    await brandAssets(page);
    await page.locator(".manual-search > summary").click();
    await page.getByRole("combobox", { name: "Kommun", exact: true }).selectOption("Stockholm");
    await page.locator(".more-filters > summary").click();
    const size = page.getByRole("slider", { name: "Minsta boarea", exact: true });
    await size.press("Home");
    for (let i = 0; i < 12; i++) await size.press("ArrowRight");
    await expect(size).toHaveAttribute("aria-valuetext", "55 m²");
    await expect(page.locator(".property")).toHaveCount(1);
    await page.getByText("Skriv exakt: Högsta månadsavgift", { exact: true }).click();
    await page.getByRole("spinbutton", { name: "Högsta månadsavgift – exakt (kr/mån)", exact: true }).fill("3199");
    await expect(page.locator(".property")).toHaveCount(0);
    const fee = page.getByRole("slider", { name: "Högsta månadsavgift", exact: true });
    await fee.press("ArrowRight");
    await expect(fee).toHaveAttribute("aria-valuetext", "3 250 kr/mån");
    await expect(page.locator(".property")).toHaveCount(1);
    await touchAndType(page);
    await imageLoaded(page);
    await noOverflow(page);
  }
});

test("pending, rejected, revoked and unverified members never request the catalog", async ({ page }) => {
  for (const state of ["pending", "unverified", "rejected", "revoked"]) {
    await page.unrouteAll();
    const { reads } = await mockApi(page, { ready: true, state });
    await page.goto("/");
    if (state === "pending") await expect(page.getByText("Din ansökan väntar på godkännande")).toBeVisible();
    else await expect(page.getByRole("heading", { name: "Ansök om medlemskap", exact: true })).toBeVisible();
    expect(reads).not.toContain("/api/catalog");
    await expect(page.locator(".filter-panel, .sources-section, .owner-panel, .property")).toHaveCount(0);
  }
});

test("owner review and approved account controls stay usable on mobile", async ({ page }) => {
  const { posts } = await mockApi(page, { ready: true, state: "approved", owner: true });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Inga liveobjekt att visa ännu" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hantera medlemskap" })).toBeVisible();
  await expect(page.getByText("0 tillåtna källor · begränsad täckning")).toBeVisible();
  await expect(page.getByRole("button", { name: "Logga ut", exact: true })).toBeHidden();
  await page.locator(".account-details > summary").click();
  await expect(page.getByRole("button", { name: "Logga ut", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Radera medlemskapet" }).click();
  await expect(page.getByRole("button", { name: "Bekräfta radering" })).toBeVisible();
  await page.getByRole("button", { name: "Godkänn", exact: true }).click();
  expect(posts[0]).toEqual({ path: "/api/admin/review", body: { memberId: applicantId, decision: "approve" } });
  await touchAndType(page);
  await noOverflow(page);
  await page.locator(".owner-panel").screenshot({ path: test.info().outputPath("owner-light.png") });
  await page.locator(".membership-account").screenshot({ path: test.info().outputPath("account-light.png") });
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await touchAndType(page);
    await noOverflow(page);
  }
});

test("email action needs explicit POST and token is removed from address bar", async ({ page }) => {
  const { posts } = await mockApi(page);
  await page.goto("/#confirm=" + "a".repeat(64));
  await expect(page.getByRole("heading", { name: "Bekräfta och logga in" })).toBeVisible();
  expect(page.url()).not.toContain("aaaa");
  expect(posts).toHaveLength(0);
  await page.getByRole("button", { name: "Fortsätt", exact: true }).click();
  await expect(page.locator(".action-page [role=status]")).toBeVisible();
  expect(posts).toEqual([{ path: "/api/confirm", body: { token: "a".repeat(64) } }]);
});

test("personal prompt, one clarification, edited summary and explicit paused save", async ({ page }) => {
  const { posts } = await mockApi(page, { ready: true, state: "approved", ai: true });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Inga liveobjekt att visa ännu" })).toBeVisible();
  await page.getByRole("button", { name: "Använd exempel: lägenhet" }).click();
  expect(posts).toHaveLength(0);
  await page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true }).fill("Lägenhet i Solna eller Sundbyberg, minst 3 rum, runt 5 miljoner, gärna 80 m² och tyst gata.");
  await expect(page.getByRole("button", { name: "Hjälp mig att precisera" })).toBeDisabled();
  await page.getByLabel("Jag vill använda AI-texthjälpen").check();
  await page.getByRole("button", { name: "Hjälp mig att precisera" }).click();
  await expect(page.getByRole("textbox", { name: "Är 5 miljoner ett fast pristak?" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Spara pausad sökning" })).toBeDisabled();
  expect(posts.map(p => p.path)).toEqual(["/api/preferences/interpret"]);
  await page.getByRole("button", { name: "Ja, högst 5 miljoner", exact: true }).click();
  expect(posts).toHaveLength(1);
  await page.getByRole("button", { name: "Tolka mitt svar" }).click();
  await expect(page.getByRole("heading", { name: "Stämmer det här?" })).toBeFocused();
  await expect(page.locator(".draft-review")).toContainText("Solna eller Sundbyberg");
  await expect(page.locator(".draft-review")).toContainText("Minst 80 m²");
  await expect(page.locator(".draft-review")).toContainText("Tyst gata");
  await page.getByLabel("Jag accepterar att själv kontrollera").check();
  await page.getByLabel("Jag godkänner den här sökningen").check();
  await page.getByRole("textbox", { name: "Vill du rätta eller lägga till något?" }).fill("Jag vill också ha balkong");
  await expect(page.getByRole("button", { name: "Spara pausad sökning" })).toBeDisabled();
  await expect(page.getByLabel("Jag godkänner den här sökningen")).not.toBeChecked();
  await page.getByRole("textbox", { name: "Vill du rätta eller lägga till något?" }).fill("");
  await page.getByLabel("Jag godkänner den här sökningen").check();
  await page.locator(".manual-search > summary").click();
  const price = page.getByRole("slider", { name: "Högsta pris", exact: true });
  await price.press("ArrowLeft");
  await expect(page.getByRole("button", { name: "Spara pausad sökning" })).toBeDisabled();
  await expect(page.getByLabel("Jag godkänner den här sökningen")).not.toBeChecked();
  await page.getByRole("button", { name: "Granska ändringarna" }).click();
  await expect(page.locator(".draft-review")).toContainText("4 900 000 kr");
  await expect(page.getByLabel("Jag accepterar att själv kontrollera")).not.toBeChecked();
  await page.getByLabel("Jag accepterar att själv kontrollera").check();
  await page.getByLabel("Jag godkänner den här sökningen").check();
  expect(posts.some(p => p.path === "/api/preferences/confirm")).toBe(false);
  await touchAndType(page);
  await readableContrast(page);
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath("personal-summary.png"), fullPage: true });
  await page.getByRole("button", { name: "Spara pausad sökning" }).click();
  await expect(page.locator(".preference-flow [role=status]")).toContainText("Inga bostadsmejl aktiverades");
  expect(posts.at(-1)).toMatchObject({ path: "/api/preferences/confirm", body: { enabled: false, consent: true, acceptUnverified: true, expectedVersion: 0 } });
  await page.reload();
  await page.locator(".saved-profile > summary").click();
  await expect(page.locator(".saved-profile")).toContainText("4 900 000 kr");
  await expect(page.locator(".saved-profile")).toContainText("Tyst gata");
  await expect(page.locator(".draft-review")).toHaveCount(0);
});

test("model failure keeps search intact and manual fallback works at 320px", async ({ page }) => {
  const { posts } = await mockApi(page, { ready: true, state: "approved", ai: true, aiError: true,
    filters: { ...defaultFilters, maxPrice: 4250123 } });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true }).fill("Jag söker en villa i Nacka.");
  await page.getByLabel("Jag vill använda AI-texthjälpen").check();
  await page.getByRole("button", { name: "Hjälp mig att precisera" }).click();
  await expect(page.getByRole("alert")).toContainText("Inget har sparats");
  await page.locator(".saved-profile > summary").click();
  await expect(page.locator(".saved-profile")).toContainText("4 250 123 kr");
  expect(posts).toHaveLength(1);
  await page.locator(".manual-search > summary").click();
  await expect(page.getByRole("slider", { name: "Högsta pris", exact: true })).toHaveAttribute("aria-valuetext", "4 250 123 kr");
  await page.getByRole("combobox", { name: "Kommun", exact: true }).selectOption("Nacka");
  await page.getByRole("button", { name: "Granska ändringarna" }).click();
  await expect(page.locator(".draft-review")).toContainText("Nacka");
  await page.getByLabel("Jag godkänner den här sökningen").check();
  await page.getByRole("button", { name: "Spara pausad sökning" }).click();
  await expect(page.locator(".saved-profile")).toContainText("Nacka");
  await touchAndType(page);
  await noOverflow(page);
});

test("anonymous illustrative prompt is deterministic and never uses the model or saves", async ({ page }) => {
  const { posts, reads } = await mockApi(page);
  await page.goto("/?demo=1");
  await expect(page.getByText("Detta är ett fast, illustrativt exempel", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Visa exempelutkast" }).click();
  await page.getByRole("button", { name: "Ja, högst 5 miljoner", exact: true }).click();
  await page.getByRole("button", { name: "Visa exemplets svar" }).click();
  await page.getByLabel("Jag godkänner den här sökningen").check();
  await page.getByRole("button", { name: "Förhandsvisa sparande" }).click();
  await expect(page.locator(".preference-flow [role=status]")).toContainText("inget mejl har skickats");
  expect(posts).toHaveLength(0);
  expect(reads).toHaveLength(0);
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await touchAndType(page);
    await imageLoaded(page);
    await noOverflow(page);
  }
});

test("canceling a pending interpretation cannot replace the saved search", async ({ page }) => {
  const { posts } = await mockApi(page, { ready: true, state: "approved", ai: true, filters: { ...defaultFilters, maxPrice: 4250123 } });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${api}/api/preferences/interpret`, async route => {
    await held;
    await route.fulfill({ status: 409, json: { message: "Utkastet avbröts." } });
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Beskriv ditt nästa hem", exact: true }).fill("Villa i Nacka");
  await page.getByLabel("Jag vill använda AI-texthjälpen").check();
  await page.getByRole("button", { name: "Hjälp mig att precisera" }).click();
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  release();
  await expect(page.locator(".preference-flow [role=status]")).toContainText("Den sparade sökningen är oförändrad");
  await expect(page.locator(".draft-review")).toHaveCount(0);
  await page.locator(".saved-profile > summary").click();
  await expect(page.locator(".saved-profile")).toContainText("4 250 123 kr");
  expect(posts.some(p => p.path === "/api/preferences/confirm")).toBe(false);
});
