// Two accounts. The visitor's credentials are public on purpose (printed on the sign-in page).
// The admin's live only as a PBKDF2 hash in the environment: ADMIN_USERNAME + ADMIN_PASSWORD_HASH,
// made with `deno run scripts/hash-password.ts`. No sign-up, no reset, no third account.
import { memoryLimiter } from "./guard.ts";
import type { Role } from "./types.ts";

export const VISITOR = { username: "visiteur", password: "cerise" } as const;
export const SESSION_COOKIE = "cerise_sid";
const ITERATIONS = 600_000;
const enc = new TextEncoder();

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** "pbkdf2$600000$<salt b64>$<hash b64>" */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt, ITERATIONS))}`;
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !salt || !hash) return false;
  return equal(await derive(password, unb64(salt), Number(iter)), unb64(hash));
}

/** The role these credentials open, or null. Never logs what was typed. */
export async function checkCredentials(
  username: string,
  password: string,
  env: { get(k: string): string | undefined } = Deno.env,
): Promise<Role | null> {
  const u = username.trim().toLowerCase();
  if (u === VISITOR.username && password === VISITOR.password) return "visitor";
  const adminUser = env.get("ADMIN_USERNAME")?.toLowerCase();
  const adminHash = env.get("ADMIN_PASSWORD_HASH");
  if (!adminUser || !adminHash || u !== adminUser) return null;
  return await verifyPassword(password, adminHash) ? "admin" : null;
}

/** 10 sign-in attempts per 15 minutes per IP, on top of the guard's 30 POSTs a minute. */
// ponytail: per isolate, approximate; the admin password is long and random, so it is enough.
export const loginLimiter = memoryLimiter(10, 15 * 60_000);

export function readSid(req: Request): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === SESSION_COOKIE && v) return v;
  }
  return null;
}

export function sessionCookie(req: Request, sid: string, maxAgeSec: number): string {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${sid}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secure}`;
}

/** Only same-site paths, so a sign-in link cannot bounce anyone elsewhere. */
export function safeNext(next: string | null, fallback: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
