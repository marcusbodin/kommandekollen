import { test, expect, type Page } from "@playwright/test";
import { defaultFilters, type Filters } from "../../shared/model";
import { sources } from "../../shared/sources";

const api = "http://127.0.0.1:8787";
const ownerId = "00000000-0000-4000-8000-000000000001";
const applicantId = "00000000-0000-4000-8000-000000000002";
type MockOptions = { ready?: boolean; state?: string; owner?: boolean; filters?: Filters };

async function mockApi(page: Page, options: MockOptions = {}) {
  let filters = options.filters ?? { ...defaultFilters };
  let alertsEnabled = false;
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  await page.route(`${api}/**`, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      posts.push({ path, body });
      if (path === "/api/search") { filters = body.filters; alertsEnabled = body.enabled; }
      await route.fulfill({ json: { message: "Testsvaret har tagits emot." } });
      return;
    }
    reads.push(path);
    if (path === "/api/status") await route.fulfill({ json: { serviceReady: options.ready ?? false, acceptingApplications: options.ready ?? false, privacyContact: null } });
    else if (path === "/api/me" && ["approved", "pending"].includes(options.state ?? "")) await route.fulfill({ json: {
      id: ownerId, email: "member@example.com", state: options.state, owner: options.owner ?? false, filters, alertsEnabled,
    } });
    else if (path === "/api/me") await route.fulfill({ status: 401, json: { message: "Ingen giltig medlemssession." } });
    else if (path === "/api/catalog" && options.state === "approved") await route.fulfill({ json: {
      listings: [], sources: sources.map(source => ({ ...source, authorized: false, run: null })),
      serviceReady: options.ready ?? false, privacyContact: null,
    } });
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
async function readableContrast(page: Page) {
  const failures = await page.evaluate(() => {
    const rgba = (color: string) => color.match(/[\d.]+/g)!.map(Number);
    const over = (front: number[], back: number[]) => {
      const alpha = front[3] ?? 1;
      return front.slice(0, 3).map((n, i) => n * alpha + back[i] * (1 - alpha));
    };
    const luminance = (color: number[]) => color.slice(0, 3).map(n => n / 255)
      .map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
      .reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
    return [...document.querySelectorAll<HTMLElement>("h1,h2,h3,label,.notice,.muted,.inspiration figcaption,.welcome-copy p,.numeric-heading output,.numeric-scale,.exact-value summary,.type-buttons button,.source-status,.property-location,.price,dt,dd,.badge,.property-bottom a")]
      .filter(el => el.getClientRects().length && !el.closest("[disabled], .honeypot"))
      .flatMap(el => {
        const style = getComputedStyle(el), ancestors: Element[] = [];
        for (let current: Element | null = el; current; current = current.parentElement) ancestors.unshift(current);
        const background = ancestors.reduce((color, node) => over(rgba(getComputedStyle(node).backgroundColor), color), [255, 255, 255]);
        const foreground = over(rgba(style.color), background);
        const a = luminance(foreground), b = luminance(background);
        const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
        return ratio + .01 < (large ? 3 : 4.5) ? [{ text: el.textContent?.slice(0, 60), ratio }] : [];
      });
  });
  expect(failures).toEqual([]);
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
});

test("native sliders filter synthetic results, distinguish finite endpoints and unset, and reset", async ({ page }) => {
  const { posts } = await mockApi(page);
  await page.goto("/?demo=1");
  await expect(page.getByText("Demonstrationsläge")).toBeVisible();
  await expect(page.locator(".property")).toHaveCount(6);
  const price = page.getByRole("slider", { name: "Högsta pris", exact: true });
  await expect(price).toHaveAttribute("aria-valuetext", "Ingen gräns");
  await price.focus();
  expect(await price.evaluate(el => getComputedStyle(el).outlineStyle)).toBe("solid");
  await price.press("Home");
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
  await page.getByLabel("Jag vill få bostadsbevakning").check();
  await page.getByRole("button", { name: "Förhandsvisa bevakning" }).click();
  await expect(page.locator(".subscription [role=status]")).toContainText("Ingen prenumeration har skapats");
  expect(posts).toHaveLength(0);
  await page.locator(".more-filters > summary").click();
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
  const { posts } = await mockApi(page, { ready: true, state: "approved", filters: original });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Inga liveobjekt att visa ännu" })).toBeVisible();
  const price = page.getByRole("slider", { name: "Högsta pris", exact: true });
  await expect(price).toHaveAttribute("aria-valuetext", "4 250 123 kr");
  await page.getByLabel("Jag vill få bostadsbevakning").check();
  await page.getByRole("button", { name: "Spara och aktivera bevakning" }).click();
  await expect(page.locator(".subscription [role=status]")).toHaveText("Testsvaret har tagits emot.");
  expect(posts[0]).toEqual({ path: "/api/search", body: { filters: original, enabled: true, consent: true } });
  await expect(page.locator(".subscription")).toContainText("Status: bevakning aktiverad");
  await price.press("ArrowLeft");
  await expect(price).toHaveAttribute("aria-valuetext", "4 200 000 kr");
  expect(posts).toHaveLength(1);
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
  await expect(page.getByRole("button", { name: "Spara och aktivera bevakning" })).toBeDisabled();
  await page.getByRole("button", { name: "Ingen gräns: Högsta pris", exact: true }).click();
  await expect(price).toHaveAttribute("aria-valuetext", "Ingen gräns");
  await page.getByRole("button", { name: "Rensa", exact: true }).click();
  await price.press("Home");
  await price.press("ArrowRight");
  await page.getByRole("button", { name: "Spara och aktivera bevakning" }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].body.filters).toEqual({ ...defaultFilters, maxPrice: 100000 });
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
