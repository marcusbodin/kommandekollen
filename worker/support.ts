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
  OWNER_EMAIL: string;
  AI_ENABLED?: string;
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
const authorizationSchema = z.array(z.object({
  id: z.enum(sourceIds),
  hosts: z.array(z.string().regex(/^(?=.{1,253}$)[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/)).min(1).max(5),
  licenseReference: z.string().min(10).max(300),
  expiresAt: z.string().datetime(),
}).strict()).max(10);
export function authorizations(env: Env) {
  return authorizationSchema.parse(JSON.parse(env.AUTHORIZED_SOURCES || "[]"))
    .filter(source => Date.parse(source.expiresAt) > Date.now());
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
