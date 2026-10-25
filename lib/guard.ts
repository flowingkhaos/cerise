// Demo guard kit (/demo skill). Web-standard TypeScript with no imports, so the same file
// runs in a Fresh middleware (Deno Deploy) and an Astro middleware (Cloudflare Workers).
// Copy it into the demo as lib/guard.ts (Fresh) or src/lib/guard.ts (Astro); never import
// it across repos. The wiring for each lane is in the skill's reference/lanes.md.

/** Same shape as the Cloudflare Workers rate-limit binding, so the binding drops in. */
export interface Limiter {
  limit(o: { key: string }): Promise<{ success: boolean }>;
}

export interface GuardOptions {
  limiter: Limiter;
  /** GET routes that mint a session (the entry page). They count against the limiter. */
  entry?: RegExp;
  /** Largest POST body in bytes. Default 64 KiB: a demo form is never bigger. */
  maxBody?: number;
}

/** Fixed-window limiter in this isolate's memory. Costs no KV or D1 units. */
// ponytail: per isolate and fixed window (a burst at the edge of a window gets 2x);
// enough for a demo. Move to KV/D1 counters if a quota alert shows abuse across isolates.
export function memoryLimiter(
  limit = 30,
  periodMs = 60_000,
  now: () => number = Date.now,
): Limiter {
  let start = now();
  const hits = new Map<string, number>();
  return {
    limit({ key }) {
      if (now() - start >= periodMs) {
        start = now();
        hits.clear(); // keeps the map bounded by the IPs seen in one window
      }
      const n = (hits.get(key) ?? 0) + 1;
      hits.set(key, n);
      return Promise.resolve({ success: n <= limit });
    },
  };
}

function refuse(
  status: number,
  body: string,
  headers: HeadersInit = {},
): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...headers },
  });
}

/**
 * A POST from another site: Origin names another host, or the browser says cross-site.
 * Hosts, not origins: behind a platform proxy `req.url` can say http while the browser
 * said https, and comparing schemes would refuse every real form.
 */
export function crossSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host !== new URL(req.url).host;
    } catch {
      return true; // "null" (sandboxed frame, privacy redirect) or junk
    }
  }
  return req.headers.get("sec-fetch-site") === "cross-site";
}

// Loopback and private ranges: an address like this is the platform's proxy, not a visitor.
const PROXY = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd]|fe80:|::ffff:(127|10)\.)/i;

/**
 * The limiter's key. The socket's address when it is a visitor's; when it is a proxy's,
 * the last X-Forwarded-For hop — the one that proxy appended, which a client cannot forge
 * (a client can only add hops in front of it).
 */
export function clientIp(req: Request, remote: string): string {
  if (!PROXY.test(remote)) return remote;
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",");
  return hops[hops.length - 1].trim() || remote;
}

/**
 * Runs before every route. Returns a refusal, or null to let the request through.
 * Order: method, then cross-site, then size, then rate. Rejecting early costs nothing.
 */
export async function guard(
  req: Request,
  ip: string,
  o: GuardOptions,
): Promise<Response | null> {
  const m = req.method;
  if (m !== "GET" && m !== "HEAD" && m !== "POST") {
    return refuse(405, "Method not allowed", { allow: "GET, HEAD, POST" });
  }
  const post = m === "POST";
  if (post) {
    if (crossSite(req)) return refuse(403, "Cross-site request refused");
    const len = req.headers.get("content-length");
    // Browsers always send a length for form posts; a stream without one is a script.
    if (len === null && req.body) return refuse(411, "Length required");
    if (Number(len) > (o.maxBody ?? 65_536)) {
      return refuse(413, "Too large for a demo");
    }
  }
  if (post || o.entry?.test(new URL(req.url).pathname)) {
    const { success } = await o.limiter.limit({ key: ip });
    if (!success) {
      return refuse(429, "Slow down: this is a demo.", { "retry-after": "60" });
    }
  }
  return null;
}

/** Headers every demo response carries. `index: true` only for a portfolio demo. */
export function harden(res: Response, o: { index?: boolean } = {}): Response {
  const h = new Headers(res.headers);
  // No script-src: Fresh and Astro boot islands with inline scripts. These four break nothing.
  h.set(
    "content-security-policy",
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  );
  h.set("x-content-type-options", "nosniff");
  h.set("referrer-policy", "strict-origin-when-cross-origin");
  h.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  if (!o.index) h.set("x-robots-tag", "noindex, nofollow");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: h,
  });
}

// Secrets that let a demo reach the outside world. A demo sends nothing and charges nothing.
const OUTBOUND = [
  "RESEND_API_KEY",
  "SENDGRID_API_KEY",
  "POSTMARK_SERVER_TOKEN",
  "MAILGUN_API_KEY",
  "SMTP_PASSWORD",
  "TWILIO_AUTH_TOKEN",
];
const LIVE_KEY = /^(sk|rk)_live_/; // Stripe live secret and restricted keys

/**
 * The tripwire: the problems that make this deployment unsafe to serve, or [] when it is
 * clean. Call it once at boot and throw if anything comes back, so a wrong env fails
 * closed. `dbHosts` lists the only database hosts a demo may reach.
 */
export function tripwire(
  env: Record<string, unknown>,
  dbHosts: string[] = [],
): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== "string" || !v) continue; // Workers env also holds bindings
    if (OUTBOUND.includes(k)) out.push(`${k} is set: a demo sends nothing`);
    if (LIVE_KEY.test(v)) out.push(`${k} holds a live payment key`);
  }
  const db = env.DATABASE_URL;
  if (typeof db === "string" && db) {
    let host = "";
    try {
      host = new URL(db).hostname;
    } catch { /* unparsable counts as unknown */ }
    if (!dbHosts.includes(host)) {
      out.push(`DATABASE_URL host "${host}" is not a demo host`);
    }
  }
  return out;
}
