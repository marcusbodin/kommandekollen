import type { Listing } from "../../shared/model";

// Local synthetic inventory only; never an ingestable production source.
export const publicFixtures: Listing[] = Array.from({ length: 29 }, (_, i) => {
  const externalId = `fixture-${String(i + 1).padStart(3, "0")}`;
  return {
    id: `authorized:${externalId}`, externalId, sourceId: "authorized", status: "upcoming", county: "Stockholms län",
    municipality: i < 15 ? "Stockholm" : "Solna", area: i === 0 ? "Årsta Östra" : i < 15 ? "HÄGERSTEN" : "Örnsberg",
    address: `Syntetiska gatan ${i + 1}`, type: i % 2 ? "Villa" : "Lägenhet",
    price: i % 7 ? 1_000_000 + i * 100_000 : null, rooms: i % 6 ? 2 + i % 5 : null,
    size: i % 5 ? 40 + i * 5 : null, fee: i % 4 ? 2000 + i * 100 : null,
    url: `https://listings.example.com/fixtures/${externalId}`,
    firstSeen: new Date(Date.UTC(2025, 1, 1, 12, Math.floor(i / 4))).toISOString(),
    lastSeen: "2025-02-02T12:00:00.000Z",
  };
});
