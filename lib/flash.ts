// One toast carried across a POST → 303 redirect in a short cookie. main.ts reads it,
// clears it, and the page renders it server-side: no script needed.
import type { Toast } from "./types.ts";

const NAME = "cerise_flash";

function encode(toast: Toast): string {
  const bytes = new TextEncoder().encode(JSON.stringify(toast));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function readFlash(req: Request): Toast | null {
  const raw = (req.headers.get("cookie") ?? "").split(";").map((s) => s.trim())
    .find((s) => s.startsWith(`${NAME}=`))?.slice(NAME.length + 1);
  if (!raw) return null;
  try {
    const bin = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    const t = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    return typeof t?.title === "string" && ["ok", "demo", "error"].includes(t.kind) ? t : null;
  } catch {
    return null;
  }
}

export function redirectWithFlash(location: string, toast: Toast, extra: HeadersInit = {}): Response {
  const headers = new Headers(extra);
  headers.set("location", location);
  headers.append("set-cookie", `${NAME}=${encode(toast)}; Max-Age=60; Path=/; SameSite=Lax`);
  return new Response(null, { status: 303, headers });
}
