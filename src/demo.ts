import { listingSchema, listingId, type Listing } from "../shared/model";

const examples = [
  { externalId: "demo-1", municipality: "Stockholm", area: "Södermalm", address: "Exempelgatan 12", type: "Lägenhet", price: 4250000, rooms: 2, size: 56, fee: 3200 },
  { externalId: "demo-2", municipality: "Nacka", area: "Saltsjö-Boo", address: "Visningsvägen 8", type: "Villa", price: 7950000, rooms: 5, size: 142, fee: null },
  { externalId: "demo-3", municipality: "Solna", area: "Råsunda", address: "Illustrationsgränd 3", type: "Lägenhet", price: null, rooms: 3, size: 78, fee: 4600 },
  { externalId: "demo-4", municipality: "Stockholm", area: "Årsta", address: "Demotorget 6", type: "Lägenhet", price: 3250000, rooms: 2, size: 49, fee: 2900 },
  { externalId: "demo-5", municipality: "Täby", area: "Näsbypark", address: "Exempelallén 15", type: "Radhus", price: 6400000, rooms: 4, size: 112, fee: 5400 },
  { externalId: "demo-6", municipality: "Värmdö", area: "Ingarö", address: "Demostigen 2", type: "Fritidshus", price: 2950000, rooms: 3, size: 64, fee: null },
];
export const demoListings: Listing[] = examples.map((example, i) => {
  const data = listingSchema.parse({ ...example, sourceId: "authorized", county: "Stockholms län", status: "upcoming", url: `https://example.com/demonstration/${example.externalId}` });
  return { ...data, id: listingId(data), firstSeen: `2026-09-${String(25 - i).padStart(2, "0")}T06:00:00.000Z`, lastSeen: "2026-09-25T06:00:00.000Z" };
});
