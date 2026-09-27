import { load } from "cheerio";
import { listingId, listingSchema, municipalities } from "../shared/model";
import { LIMITS } from "./collector";

export const NOTAR_INDEX = "https://www.notar.se/kopa-bostad?rf=true";
const previewItem = listingSchema.extend({ type: listingSchema.shape.type.nullable() });
const clean = (text: string) => text.normalize("NFC").replace(/\s+/gu, " ").trim();

export class NotarPreviewError extends Error {
  constructor(public code: "invalid_dom" | "invalid_card" | "invalid_output" | "limit" | "robots" | "access_denied" | "not_ready", message: string) {
    super(message);
    this.name = "NotarPreviewError";
  }
}

export function notarListingUrl(href: string) {
  let url: URL;
  try { url = new URL(href, NOTAR_INDEX); }
  catch { throw new NotarPreviewError("invalid_card", "Invalid Notar object link"); }
  const match = /^\/kopa-bostad\/objekt\/([a-zA-Z0-9_-]{1,80})$/.exec(url.pathname);
  if (url.origin !== "https://www.notar.se" || url.username || url.password || url.hash || url.search || !match)
    throw new NotarPreviewError("invalid_card", "Unexpected Notar object link");
  return { url: url.toString(), externalId: match[1] };
}

/** Consumes the rendered public index, not API bodies or the static search shell. */
export function parseNotarDom(html: string) {
  if (Buffer.byteLength(html) > LIMITS.bodyBytes) throw new NotarPreviewError("limit", "Rendered DOM exceeds 500 KB");
  const $ = load(html);
  const selected = $('.custom-tab[role="tab"][aria-selected="true"]');
  if (selected.length !== 1 || clean(selected.text()) !== "Kommande")
    throw new NotarPreviewError("invalid_dom", "The public Kommande tab must be selected");
  const cards = $("a.card[href]");
  if (!cards.length) throw new NotarPreviewError("not_ready", "No rendered Notar cards; this is not an empty inventory snapshot");
  if (cards.length > 50) throw new NotarPreviewError("limit", "Rendered card count exceeds 50");

  const items: (ReturnType<typeof previewItem.parse> & { id: string })[] = [];
  const seen = new Set<string>();
  let excludedStatus = 0, excludedLocation = 0, duplicates = 0, unrecognizedFacts = 0;
  for (const element of cards) {
    const card = $(element), subtitle = card.find(".subtitle-info > span");
    if (card.find(".v-card-title").length !== 1 || subtitle.length !== 3)
      throw new NotarPreviewError("invalid_dom", "Notar card structure changed");
    const [status, area, locality] = subtitle.map((_i, el) => clean($(el).text())).get();
    if (!status || !area || !locality) throw new NotarPreviewError("invalid_card", "Missing status or location");
    if (status !== "Kommande försäljning") {
      if (!["Till salu", "Såld"].includes(status)) throw new NotarPreviewError("invalid_card", "Unrecognized Notar status label");
      excludedStatus++;
      continue;
    }
    const municipality = municipalities.find(value => locality === value || locality === `${value} kommun`);
    if (!municipality) { excludedLocation++; continue; }
    const link = notarListingUrl(card.attr("href")!);
    const values: Record<"rooms" | "size" | "fee" | "price", number | null> = { rooms: null, size: null, fee: null, price: null };
    const units = { rok: "rooms", kvm: "size", "kr/mån": "fee", kr: "price" } as const;
    const found = new Set<string>();
    for (const fact of card.find("li > span")) {
      const text = clean($(fact).text());
      const match = /^(.*?)\s+(rok|kvm|kr\/mån|kr)$/.exec(text);
      if (!match) { if (text) unrecognizedFacts++; continue; }
      const field = units[match[2] as keyof typeof units];
      if (found.has(field)) throw new NotarPreviewError("invalid_card", "Ambiguous duplicate Notar fact");
      found.add(field);
      // Combined floor areas and plot areas do not establish a single living-area value.
      if (field === "size" && (/^\d+(?:[,.]\d+)?\s*\+\s*\d+(?:[,.]\d+)?$/.test(match[1]) || /^Tomt\b/.test(match[1]))) {
        unrecognizedFacts++;
        continue;
      }
      if (!/^\d[\d ]*(?:[,.]\d+)?$/.test(match[1]))
        throw new NotarPreviewError("invalid_card", "Malformed Notar numeric fact");
      values[field] = Number(match[1].replace(/ /g, "").replace(",", "."));
    }
    const parsed = previewItem.safeParse({
      ...link, sourceId: "notar", status: "upcoming", county: "Stockholms län",
      municipality, area, address: clean(card.find(".v-card-title").text()),
      type: null, ...values,
    });
    if (!parsed.success) throw new NotarPreviewError("invalid_card", "Notar facts failed shared validation");
    const id = listingId(parsed.data);
    if (seen.has(id)) {
      const previous = items.find(item => item.id === id)!;
      if (JSON.stringify(previous) !== JSON.stringify({ ...parsed.data, id }))
        throw new NotarPreviewError("invalid_card", "Conflicting duplicate Notar object");
      duplicates++;
      continue;
    }
    seen.add(id);
    items.push({ ...parsed.data, id });
  }
  return {
    kind: "notar-rendered-preview" as const,
    ingestible: false as const,
    sourceId: "notar" as const,
    coverage: {
      complete: false as const, scope: "one rendered upcoming index page" as const,
      totalAvailable: null, renderedCards: cards.length, excludedStatus, excludedLocation, duplicates,
      unknownPropertyTypes: items.length, unrecognizedFacts,
      countyEvidence: "exact municipality in the shared Stockholm-county allowlist" as const,
    },
    items,
  };
}
