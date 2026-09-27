import { expect, type Page } from "@playwright/test";

export async function brandAssets(page: Page) {
  const brand = page.locator("header:visible .brand");
  const image = brand.locator("img.brand-mark");
  await expect(brand).toHaveAccessibleName(/^kommandekollen\s*\.(?: – till sökningen)?$/);
  await expect(image).toHaveCount(1);
  await expect(image).toHaveAttribute("alt", "");
  await expect(image).toHaveAttribute("width", "40");
  await expect(image).toHaveAttribute("height", "40");
  await expect(image).toHaveCSS("filter", "none");
  await expect(image).toHaveCSS("object-fit", "contain");
  await expect(image).toHaveCSS("opacity", "1");
  await expect.poll(() => image.evaluate((img: HTMLImageElement) =>
    img.complete && img.naturalWidth === 80 && img.naturalHeight === 80)).toBe(true);
  const source = await image.evaluate((img: HTMLImageElement) => img.currentSrc);
  expect(new URL(source).origin).toBe(new URL(page.url()).origin);
  expect(new URL(source).pathname).toMatch(/\/assets\/brand-mark-solid-80\.png$/);
  const logoResponse = await page.request.get(source);
  expect(logoResponse.status()).toBe(200);
  expect(logoResponse.headers()["content-type"]).toContain("image/png");
  const logo = await logoResponse.body();
  expect(logo.length).toBeLessThan(10_000);
  expect(logo[25]).toBe(6);
  const box = (await image.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(36);
  expect(box.width).toBeLessThanOrEqual(40);
  expect(box.height).toBe(box.width);
  expect((await brand.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  const favicon = page.locator('link[rel="icon"]');
  await expect(favicon).toHaveAttribute("sizes", "32x32");
  await expect(favicon).toHaveAttribute("type", "image/png");
  const faviconUrl = new URL((await favicon.getAttribute("href"))!, page.url());
  expect(faviconUrl.origin).toBe(new URL(page.url()).origin);
  expect(faviconUrl.pathname).toMatch(/\/assets\/favicon-solid-32\.png$/);
  const faviconResponse = await page.request.get(faviconUrl.href);
  expect(faviconResponse.status()).toBe(200);
  expect(faviconResponse.headers()["content-type"]).toContain("image/png");
  const png = await faviconResponse.body();
  expect(png.length).toBeLessThan(3_000);
  expect(png[25]).toBe(6);
  expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = new DataView(png.buffer, png.byteOffset, png.byteLength);
  expect([header.getUint32(16), header.getUint32(20)]).toEqual([32, 32]);
}
