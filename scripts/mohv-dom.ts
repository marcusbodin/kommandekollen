import { load } from "cheerio";
import { municipalities, types } from "../shared/model";
import {
  BROKER_INDEXES, canonicalObjectLink, checkDomSize, clean, numericFact, previewResult,
  SourcePreviewError, validatedItem, type PreviewItem,
} from "./preview-common";

export const MOHV_INDEX = BROKER_INDEXES.mohv;
export const MOHV_RESULTS = "section.vitec-estate-list";

export function parseMohvDom(html: string, renderedCards: number | null = null) {
  checkDomSize(html);
  const $ = load(html), lists = $(MOHV_RESULTS), cards = lists.children("section.vitec-estate-list-item");
  if (lists.length !== 1 || cards.length !== lists.children().length)
    throw new SourcePreviewError("invalid_dom", "MOHV results structure changed");
  const candidates: PreviewItem[] = [];
  let excludedStatus = 0, excludedLocation = 0, unrecognizedFacts = 0;
  for (const element of cards) {
    const card = $(element), anchors = card.children("a"), badge = card.find(".vitec-estate-list-item-is-coming");
    if (anchors.length !== 1 || badge.length !== 1 || clean(badge.text()) !== "Snart här")
      throw new SourcePreviewError("invalid_card", "Missing or changed MOHV upcoming badge");
    if (!card.hasClass("is-coming") || !anchors.hasClass("estate-listitem-kommande")
      || /\bis-(sold|bidding)\b/.test(card.attr("class") || "")) { excludedStatus++; continue; }
    const location = card.attr("data-municipality"), county = card.attr("data-county"), area = card.attr("data-area");
    if (location === undefined || county === undefined || area === undefined)
      throw new SourcePreviewError("invalid_card", "Missing MOHV geographic attributes");
    const municipality = municipalities.find(value => value === clean(location));
    if (!municipality || clean(county) !== "Stockholm") { excludedLocation++; continue; }
    const link = canonicalObjectLink(anchors.attr("href") || "", "mohv");
    const field = (name: string) => {
      const nodes = card.find(`.vitec-estate-list-item-${name}`);
      if (nodes.length !== 1) throw new SourcePreviewError("invalid_dom", "MOHV fact structure changed");
      return clean(nodes.text());
    };
    const typeLabel = field("estatetype");
    const type = typeLabel === "Friliggande villa" ? "Villa" : types.find(value => value === typeLabel) ?? null;
    if (type === null && typeLabel) unrecognizedFacts++;
    const withUnit = (text: string, unit: string) => {
      if (!text) return null;
      if (!text.endsWith(` ${unit}`)) throw new SourcePreviewError("invalid_card", "Changed MOHV fact unit");
      const value = text.slice(0, -(unit.length + 1));
      if (unit === "kvm" && /^\d+(?:[,.]\d+)?\s*\+\s*\d+(?:[,.]\d+)?$/.test(value)) { unrecognizedFacts++; return null; }
      return numericFact(value);
    };
    candidates.push(validatedItem({
      ...link, sourceId: "mohv", status: "upcoming", county: "Stockholms län",
      municipality, area: clean(area), address: field("title"), type,
      rooms: numericFact(field("rooms")), size: withUnit(field("livingarea"), "kvm"),
      price: withUnit(field("price"), "kr"), fee: null,
    }));
  }
  return previewResult("mohv", candidates, { sampledCards: cards.length, excludedStatus, excludedLocation, unrecognizedFacts }, renderedCards);
}
