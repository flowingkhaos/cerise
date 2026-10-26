import { App, staticFiles } from "fresh";
import type { State } from "./lib/types.ts";
import { localeOf } from "./lib/i18n.ts";
import { getStore } from "./lib/store.ts";
import { readFlash } from "./lib/flash.ts";
import { clientIp, guard, harden, memoryLimiter, tripwire } from "./lib/guard.ts";

export const app = new App<State>();

// The demo guard kit, first, so a refused request costs nothing. The tripwire runs on the
// first request, never at import: the build imports this file with the operator's env.
// Posts can be long, so the editor's routes take a bigger body than the 64 KiB default.
let unsafe: string[] | undefined;
const limiter = memoryLimiter(30, 60_000);
const BIG_BODY = /^\/(en\/)?admin\/posts/;
// Our files only, plus Fontshare for the Sentient accent (its licence keeps it out of the repo).
const CSP_EXTRA =
  "; img-src 'self' data:; font-src 'self' https://cdn.fontshare.com; style-src 'self' 'unsafe-inline' https://api.fontshare.com";

app.use(async (ctx) => {
  unsafe ??= tripwire(Deno.env.toObject());
  if (unsafe.length) {
    console.error(`tripwire: ${unsafe.join("; ")}`);
    return new Response("Demo stopped: unsafe configuration.", { status: 503 });
  }
  const ip = clientIp(ctx.req, (ctx.info.remoteAddr as Deno.NetAddr).hostname);
  const maxBody = BIG_BODY.test(ctx.url.pathname) ? 262_144 : 65_536;
  const no = await guard(ctx.req, ip, { limiter, maxBody });
  const res = harden(no ?? await ctx.next());
  res.headers.set("content-security-policy", res.headers.get("content-security-policy") + CSP_EXTRA);
  return res;
});

// Caching per route class (architecture § Rendering and caching). Gated routes never cache.
const PRIVATE = /^\/(en\/?)?(admin|connexion|deconnexion)(\/|$)/;
const LONG_CACHE = /^\/(fonts|assets|_fresh)\//;
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|rss\+xml)|image\/svg)/;

app.use(async (ctx) => {
  const res = await ctx.next();
  const path = ctx.url.pathname;
  const type = res.headers.get("content-type") ?? "";
  if (LONG_CACHE.test(path)) {
    res.headers.set("cache-control", "public, max-age=31536000, immutable");
  } else if (path.startsWith("/img/")) {
    res.headers.set("cache-control", "public, max-age=86400");
  } else if (PRIVATE.test(path) || res.headers.has("set-cookie") || path === "/healthz") {
    res.headers.set("cache-control", "private, no-store");
  } else if (res.status === 200 && /^text\/html|xml/.test(type)) {
    res.headers.set("cache-control", "public, max-age=60, stale-while-revalidate=600");
    res.headers.append("vary", "Cookie"); // the light/dark pick is rendered into the HTML
  }
  if (
    res.body && COMPRESSIBLE.test(type) && !res.headers.has("content-encoding") &&
    (ctx.req.headers.get("accept-encoding") ?? "").includes("gzip")
  ) {
    const headers = new Headers(res.headers);
    headers.set("content-encoding", "gzip");
    headers.delete("content-length");
    headers.append("vary", "Accept-Encoding");
    return new Response(res.body.pipeThrough(new CompressionStream("gzip")), {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  }
  return res;
});

app.use(staticFiles());

// Seed once per isolate, on the first request (never at import: the build imports this file).
let seeded: Promise<unknown> | undefined;

app.use(async (ctx) => {
  await (seeded ??= getStore().then((s) => s.ensureSeeded()).catch((e) => {
    seeded = undefined; // retry on the next request instead of serving an empty blog forever
    throw e;
  }));
  ctx.state.locale = localeOf(ctx.url.pathname);
  ctx.state.role = null; // only routes/admin/_middleware.ts and the sign-in page read the session
  // The admin and the editor keep one look; public pages take the visitor's pick.
  ctx.state.theme = /^\/(en\/)?admin(\/|$)/.test(ctx.url.pathname)
    ? "light"
    : (ctx.req.headers.get("cookie") ?? "").match(/(?:^|;\s*)cerise_mode=(light|dark)/)?.[1] as "light" | "dark" ??
      undefined;
  const flash = readFlash(ctx.req);
  ctx.state.toast = flash ?? undefined;
  const res = await ctx.next();
  if (flash) res.headers.append("set-cookie", "cerise_flash=; Max-Age=0; Path=/; SameSite=Lax");
  return res;
});

app.fsRoutes();
