import { feedSchema } from "../../shared/model";

export function authorizedFeed(observedAt = new Date().toISOString()) {
  return feedSchema.parse({
    sourceId: "authorized", observedAt,
    listings: [{
      externalId: "fixture-1", sourceId: "authorized", status: "upcoming", county: "Stockholms län",
      municipality: "Stockholm", area: "Södermalm", address: "Exempelgatan 12", type: "Lägenhet",
      price: 4250000, rooms: 2.5, size: 56, fee: 3200, url: "https://listings.example.com/fixture-1",
    }],
  });
}
