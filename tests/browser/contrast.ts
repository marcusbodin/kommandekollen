import { expect, type Page } from "@playwright/test";

const defaultSelectors = "h1,h2,h3,label,.notice,.error,.muted,.welcome-copy p,.numeric-heading output,.numeric-scale,.exact-value summary,.type-buttons button,.source-status,.property-location,.price,dt,dd,.badge,.property-bottom a";
export async function readableContrast(page: Page, selectors = defaultSelectors, kind: "text" | "border" | "focus" | "placeholder" = "text", includeDisabled = false) {
  const measurements = await page.evaluate(async ({ selectors, kind, includeDisabled }) => {
    // Like animations:"disabled" screenshots, sample settled colors. Closed
    // details can suspend finite transitions indefinitely, so do not await them.
    for (const animation of document.getAnimations()) {
      if (Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))) animation.finish();
    }
    const rgba = (color: string) => {
      const values = color.match(/[\d.]+/g)!.map(Number);
      return color.startsWith("color(srgb ") ? values.map((n, i) => i < 3 ? n * 255 : n) : values;
    };
    const over = (front: number[], back: number[]) => {
      const alpha = front[3] ?? 1;
      return front.slice(0, 3).map((n, i) => n * alpha + back[i] * (1 - alpha));
    };
    const luminance = (color: number[]) => color.slice(0, 3).map(n => n / 255)
      .map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
      .reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
    return [...document.querySelectorAll<HTMLElement>(selectors)]
      .filter(el => el.getClientRects().length && !el.closest(".honeypot") && (includeDisabled || !el.closest("[disabled]")))
      .map(el => {
        const style = getComputedStyle(el, kind === "placeholder" ? "::placeholder" : null), ancestors: Element[] = [];
        for (let current: Element | null = kind === "focus" ? el.parentElement : el; current; current = current.parentElement) ancestors.unshift(current);
        const photo = el.closest(".home-hero")?.querySelector<HTMLImageElement>(".hero-backdrop");
        const hasPhoto = !!photo?.getClientRects().length && photo.naturalWidth > 0;
        // Bound image-backed contrast by black/white pixels, not the ancestor's
        // solid fallback color. Blur and saturation cannot exceed these bounds.
        const backgrounds = (hasPhoto ? [0, 255] : [255]).map(pixel => ancestors.reduce((color, node) => {
          if (hasPhoto && node.classList.contains("home-hero")) return [pixel, pixel, pixel];
          return over(rgba(getComputedStyle(node).backgroundColor), color);
        }, [255, 255, 255]));
        const ink = rgba(kind === "border" ? style.borderTopColor : kind === "focus" ? style.outlineColor : style.color);
        const bounds = backgrounds.map(luminance);
        const inkLuminance = luminance(ink);
        const ratio = hasPhoto && inkLuminance >= Math.min(...bounds) && inkLuminance <= Math.max(...bounds) ? 1 :
          Math.min(...backgrounds.map(background => {
            const a = luminance(over(ink, background)), b = luminance(background);
            return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
          }));
        const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
        return { element: el.tagName, classes: el.className, kind, ratio, imageBounds: hasPhoto, minimum: kind === "border" || kind === "focus" || large ? 3 : 4.5 };
      });
  }, { selectors, kind, includeDisabled });
  expect(measurements.length).toBeGreaterThan(0);
  expect(measurements.filter(item => item.ratio + .01 < item.minimum)).toEqual([]);
  return measurements;
}
