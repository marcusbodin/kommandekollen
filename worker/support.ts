import { z } from "zod";
import { sourceIds } from "../shared/model";
import type { HousingAI } from "./ai";

export interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
  TOKEN_SECRET: string;
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  PUBLIC_URL: string;
  ALLOWED_ORIGINS: string;
  PRIVACY_CONTACT: string;
  SERVICE_ENABLED: string;
  AUTHORIZED_SOURCES: string;
  PRIVATE_OBSERVATION_SOURCES?: string;
  PROPERTY_EMAILS_ENABLED?: string;
  OWNER_EMAIL: string;
  AI_ENABLED?: string;
  ACCESS_MODE?: string;
  SHARED_ACCESS_PASSWORD?: string;
  AI?: HousingAI;
}
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const encoder = new TextEncoder();
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), n => n.toString(16).padStart(2, "0")).join("");
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
export async function hash(value: string) { return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value))); }
export async function keyed(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
export async function equalSecrets(a: string, b: string) {
  const ah = await hash(a), bh = await hash(b);
  let difference = 0;
  for (let i = 0; i < ah.length; i++) difference |= ah.charCodeAt(i) ^ bh.charCodeAt(i);
  return difference === 0;
}
async function encryptionKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`outbox:${secret}`));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
export async function seal(secret: string, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(secret), encoder.encode(JSON.stringify(value)));
  return `${hex(iv.buffer)}.${hex(data)}`;
}
export async function unseal<T>(secret: string, value: string): Promise<T> {
  const [iv, ciphertext] = value.split(".").map(part => Uint8Array.from(part.match(/.{2}/g) || [], n => parseInt(n, 16)));
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await encryptionKey(secret), ciphertext);
  return JSON.parse(new TextDecoder().decode(data)) as T;
}
export async function readJson(request: Pick<Request, "headers" | "body">, maxBytes = 4096): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new ApiError(415, "content_type", "Skicka JSON.");
  }
  if (Number(request.headers.get("content-length")) > maxBytes) throw new ApiError(413, "body_size", "För stor begäran.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "body", "Data saknas.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new ApiError(413, "body_size", "För stor begäran."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiError(400, "json", "Ogiltig JSON."); }
}
export async function rate(env: Env, key: string, limit: number, seconds: number, now = Date.now()) {
  const bucket = Math.floor(now / (seconds * 1000));
  const row = await env.DB.prepare(`INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<=? RETURNING count`)
    .bind(`${key}:${bucket}`, now + seconds * 2000, limit).first<{ count: number }>();
  return !!row && row.count <= limit;
}
const grantFields = {
  id: z.enum(sourceIds),
  hosts: z.array(z.string().regex(/^(?=.{1,253}$)[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/)).min(1).max(5),
  expiresAt: z.string().datetime(),
};
const authorizationSchema = z.array(z.object({
  ...grantFields, licenseReference: z.string().min(10).max(300),
}).strict()).max(4);
const privateAuthorizationSchema = z.array(z.object({
  ...grantFields, basisReference: z.string().trim().min(10).max(300),
}).strict()).max(4);
export type SourceConfiguration = Pick<Env, "AUTHORIZED_SOURCES" | "PRIVATE_OBSERVATION_SOURCES">;
function sourceGrants(env: SourceConfiguration) {
  let licensedInput: unknown, privateInput: unknown;
  try {
    licensedInput = JSON.parse(env.AUTHORIZED_SOURCES || "[]");
    privateInput = JSON.parse(env.PRIVATE_OBSERVATION_SOURCES || "[]");
  } catch { throw new ApiError(503, "source_config", "Källkonfigurationen är inte giltig JSON."); }
  const licensedResult = authorizationSchema.safeParse(licensedInput), privateResult = privateAuthorizationSchema.safeParse(privateInput);
  if (!licensedResult.success || !privateResult.success)
    throw new ApiError(503, "source_config", "Källkonfigurationen är inte giltig.");
  const licensed = licensedResult.data, observations = privateResult.data;
  const all = [...licensed, ...observations];
  if (all.length > 4 || new Set(all.map(source => source.id)).size !== all.length)
    throw new ApiError(503, "source_config", "Källkonfigurationen har överlappande ID eller överskrider fyra källor.");
  const active = (source: { expiresAt: string }) => Date.parse(source.expiresAt) > Date.now();
  return { licensed: licensed.filter(active), observations: observations.filter(active) };
}
export function authorizations(env: SourceConfiguration) {
  return sourceGrants(env).licensed;
}
export function observationAuthorizations(env: SourceConfiguration) {
  return sourceGrants(env).observations;
}
export function listingAuthorizations(env: SourceConfiguration) {
  const grants = sourceGrants(env);
  return [...grants.licensed.map(source => ({ ...source, coverage: "complete" as const })),
    ...grants.observations.map(source => ({ ...source, coverage: "partial" as const }))];
}
export function propertyEmailsReady(env: Env) {
  return env.PROPERTY_EMAILS_ENABLED === "true" && serviceReady(env) && authorizations(env).length > 0;
}
export function serviceReady(env: Env) {
  return env.SERVICE_ENABLED === "true" && env.TOKEN_SECRET?.length >= 32
    && env.RESEND_API_KEY?.length > 0 && env.MAIL_FROM?.includes("@")
    && env.PRIVACY_CONTACT?.includes("@") && env.OWNER_EMAIL?.includes("@") && !!env.PUBLIC_URL;
}
export type MemberState = "unverified" | "pending" | "approved" | "rejected" | "revoked";
export interface Member {
  id: string; email: string; state: MemberState; filters: string; alerts_enabled: number; application: string;
  preference_profile: string | null; search_version: number;
}
export function isOwner(env: Env, member: Member) {
  return !!env.OWNER_EMAIL && member.email === env.OWNER_EMAIL.trim().toLowerCase();
}
export function cookieName(request: Request) {
  return new URL(request.url).protocol === "https:" ? "__Host-kk_session" : "kk_session";
}
export function sessionCookie(request: Request, value: string, remove = false) {
  return `${cookieName(request)}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${remove ? 0 : 43200}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function sharedAccess(env: Env) {
  if (env.ACCESS_MODE && !["membership", "shared"].includes(env.ACCESS_MODE)) {
    throw new ApiError(503, "access_config", "Åtkomsten är inte korrekt konfigurerad.");
  }
  return env.ACCESS_MODE === "shared";
}
export function guestCookieName(request: Request) {
  return new URL(request.url).protocol === "https:" ? "__Host-kk_guest" : "kk_guest";
}
export function guestCookie(request: Request, value: string, remove = false) {
  return `${guestCookieName(request)}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${remove ? 0 : 43200}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function gateVersion(env: Env) {
  if (!sharedAccess(env) || !/^[a-f0-9]{64}$/.test(env.SHARED_ACCESS_PASSWORD || "") || !serviceReady(env)) {
    throw new ApiError(503, "gate_unavailable", "Lösenordsåtkomsten är inte aktiverad. Försök senare.");
  }
  return hash(env.SHARED_ACCESS_PASSWORD!);
}
export type Guest = { id: string; credential_version: string; expires_at: number; member_id: string | null };
export async function authenticateGuest(request: Request, env: Env): Promise<Guest> {
  const version = await gateVersion(env);
  const value = (request.headers.get("cookie") || "").split(";").map(part => part.trim())
    .find(part => part.startsWith(`${guestCookieName(request)}=`))?.slice(guestCookieName(request).length + 1);
  if (!value || !/^[a-f0-9]{64}$/.test(value)) throw new ApiError(401, "gate_required", "Ange det gemensamma lösenordet för att fortsätta.");
  const guest = await env.DB.prepare("SELECT id,credential_version,expires_at,member_id FROM guest_sessions WHERE token_hash=? AND credential_version=? AND expires_at>?")
    .bind(await hash(value), version, Date.now()).first<Guest>();
  if (!guest) throw new ApiError(401, "gate_required", "Lösenordsåtkomsten har gått ut eller ändrats. Ange lösenordet igen.");
  return guest;
}
export async function authenticate(request: Request, env: Env, approved = true): Promise<Member> {
  const value = (request.headers.get("cookie") || "").split(";").map(part => part.trim())
    .find(part => part.startsWith(`${cookieName(request)}=`))?.slice(cookieName(request).length + 1);
  if (!value || !/^[a-f0-9]{64}$/.test(value)) throw new ApiError(401, "login_required", "Logga in för att fortsätta.");
  const member = await env.DB.prepare(`SELECT s.id,s.email,s.state,s.filters,s.alerts_enabled,s.application,s.preference_profile,s.search_version
    FROM sessions t JOIN subscriptions s ON s.id=t.member_id WHERE t.token_hash=? AND t.expires_at>? AND s.expires_at>?`)
    .bind(await hash(value), Date.now(), Date.now()).first<Member>();
  if (!member || member.state === "rejected" || member.state === "revoked") throw new ApiError(401, "login_required", "Sessionen har gått ut eller åtkomsten har återkallats.");
  if (approved && member.state !== "approved") throw new ApiError(403, "approval_required", "Ditt medlemskap väntar på godkännande.");
  return member;
}
export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function actionUrl(env: Env, action: string, token: string) {
  const url = new URL(env.PUBLIC_URL);
  url.hash = `${action}=${token}`;
  return url.toString();
}
export async function unsubscribeToken(env: Env, id: string) {
  return `${id}.${await keyed(env.TOKEN_SECRET, `unsubscribe:${id}`)}`;
}
