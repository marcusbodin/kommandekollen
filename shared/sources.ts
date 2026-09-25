import type { SourceId } from "./model";

export type Source = {
  id: SourceId; name: string; status: "blocked" | "unverified" | "awaiting-feed";
  reason: string; robots: string | null; terms: string | null; checked: string | null;
};
export const sources: Source[] = [
  { id: "fastighetsbyran", name: "Fastighetsbyrån", status: "blocked",
    reason: "Automatisk åtkomst kräver särskilt tillstånd enligt robots.txt.",
    robots: "https://www.fastighetsbyran.com/robots.txt", terms: null, checked: "2026-09-25" },
  { id: "svenskfast", name: "Svensk Fastighetsförmedling", status: "blocked",
    reason: "Villkoren förbjuder skrapning, återpublicering och automatiskt genererade objektlänkar utan tillstånd.",
    robots: "https://www.svenskfast.se/robots.txt", terms: "https://www.svenskfast.se/om-oss/anvandarvillkor/", checked: "2026-09-25" },
  { id: "bjurfors", name: "Bjurfors", status: "unverified",
    reason: "Robots tillåter vissa sidor. Granskade Boagent-villkor ger inget tillstånd till en publik objekttjänst.",
    robots: "https://www.bjurfors.se/robots.txt", terms: "https://www.bjurfors.se/sv/mitt-bjurfors/anvandarvillkor/", checked: "2026-09-25" },
  ...([
    ["lansfast", "Länsförsäkringar Fastighetsförmedling", "https://www.lansfast.se/robots.txt"],
    ["skandia", "SkandiaMäklarna", "https://www.skandiamaklarna.se/robots.txt"],
    ["husmanhagberg", "HusmanHagberg", "https://www.husmanhagberg.se/robots.txt"],
    ["notar", "Notar", "https://www.notar.se/robots.txt"],
    ["erikolsson", "Erik Olsson", "https://www.erikolsson.se/robots.txt"],
    ["mohv", "MOHV", "https://www.mohv.se/robots.txt"],
  ] as const).map(([id, name, robots]): Source => ({
    id, name, robots, status: "unverified", reason: "Robots granskad. Licens och feed inte verifierade; ingen hämtning av objekt.",
    terms: null, checked: "2026-09-25",
  })),
  { id: "authorized", name: "Godkänd partnerfeed", status: "awaiting-feed",
    reason: "Importstöd finns. Ingen licensierad feed eller partnerdata har anslutits.",
    robots: null, terms: null, checked: null },
];
