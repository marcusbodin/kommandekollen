import { load } from "cheerio";
import { municipalities } from "../shared/model";
import {
  BROKER_INDEXES, canonicalObjectLink, checkDomSize, clean, numericFact, previewResult,
  SourcePreviewError, validatedItem, type PreviewItem,
} from "./preview-common";

export const HUSMANHAGBERG_INDEX = BROKER_INDEXES.husmanhagberg;
export const HUSMANHAGBERG_RESULTS = ".grid:has(> .group a[href*='/objekt/'])";

export function parseHusmanHagbergDom(html: string, renderedCards: number | null = null) {
  checkDomSize(html);
  const $ = load(html), grids = $("body > .grid"), cards = grids.children("div.group");
  if (grids.length !== 1)
    throw new SourcePreviewError("invalid_dom", "HusmanHagberg results structure changed");
  const candidates: PreviewItem[] = [];
  let excludedStatus = 0, excludedLocation = 0, unrecognizedFacts = 0;
  for (const element of cards) {
    const card = $(element), details = card.children("div.mt-4");
    const title = details.find("h3"), anchors = details.children("a"), location = details.children("p");
    if (details.length !== 1 || title.length !== 1 || anchors.length !== 1 || location.length !== 1)
      throw new SourcePreviewError("invalid_dom", "HusmanHagberg card structure changed");
    const link = canonicalObjectLink(anchors.attr("href") || "", "husmanhagberg");
    const badges = card.find("span.ring-1").map((_i, el) => clean($(el).text())).get();
    if (!badges.length || badges.some(label => !["Kommande®", "Budgivning"].includes(label))
      || new Set(badges).size !== badges.length)
      throw new SourcePreviewError("invalid_card", "Missing or unrecognized HusmanHagberg status");
    // Both labels were displayed together on real cards. Do not resolve that contradiction by guessing.
    if (!badges.includes("Kommande®") || badges.includes("Budgivning")) { excludedStatus++; continue; }
    const locality = clean(location.text()), separator = locality.lastIndexOf(", ");
    if (separator < 1) throw new SourcePreviewError("invalid_card", "Missing HusmanHagberg area or municipality");
    const area = locality.slice(0, separator), municipality = municipalities.find(value => value === locality.slice(separator + 2));
    if (!municipality) { excludedLocation++; continue; }
    const facts = details.children("div.mt-1");
    if (facts.length !== 1) throw new SourcePreviewError("invalid_dom", "Missing HusmanHagberg fact row");
    const values: Record<"rooms" | "size" | "price", number | null> = { rooms: null, size: null, price: null };
    const seen = new Set<string>();
    for (const element of facts.find("span")) {
      const text = clean($(element).text()).replace(/,\s*$/, "");
      if (!text) continue;
      const match = /^(.*?)\s+(rum|kvm|kr)$/.exec(text);
      if (!match) { unrecognizedFacts++; continue; }
      const field = { rum: "rooms", kvm: "size", kr: "price" }[match[2]] as keyof typeof values;
      if (seen.has(field)) throw new SourcePreviewError("invalid_card", "Duplicate HusmanHagberg numeric fact");
      seen.add(field);
      if (field === "size" && /^\d+(?:[,.]\d+)?\s*\+\s*\d+(?:[,.]\d+)?$/.test(match[1])) { unrecognizedFacts++; continue; }
      values[field] = numericFact(match[1]);
    }
    candidates.push(validatedItem({
      ...link, sourceId: "husmanhagberg", status: "upcoming", county: "Stockholms län",
      municipality, area, address: clean(title.text()), type: null, fee: null, ...values,
    }));
  }
  return previewResult("husmanhagberg", candidates, { sampledCards: cards.length, excludedStatus, excludedLocation, unrecognizedFacts }, renderedCards);
}
