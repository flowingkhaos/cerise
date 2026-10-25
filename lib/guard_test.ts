// deno test kit/guard_test.ts — copy beside lib/guard.ts in the demo.
import { clientIp, crossSite, guard, harden, memoryLimiter, tripwire } from "./guard.ts";

const eq = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${a} !== ${b}`);
};
const URL_ = "https://demo.example/reserver";
const post = (headers: Record<string, string> = {}, body = "a=1") =>
  new Request(URL_, {
    method: "POST",
    body,
    headers: {
      origin: "https://demo.example",
      "content-length": String(body.length),
      ...headers,
    },
  });

Deno.test("limiter: 30 in a window pass, the 31st fails, a new window resets", async () => {
  let t = 0;
  const l = memoryLimiter(30, 60_000, () => t);
  for (let i = 0; i < 30; i++) eq((await l.limit({ key: "ip" })).success, true);
  eq((await l.limit({ key: "ip" })).success, false);
  eq((await l.limit({ key: "other" })).success, true);
  t = 60_000;
  eq((await l.limit({ key: "ip" })).success, true);
});

Deno.test("guard: refusals in order", async () => {
  const o = { limiter: memoryLimiter(1), entry: /^\/demo$/ };
  eq((await guard(new Request(URL_, { method: "PUT" }), "ip", o))?.status, 405);
  eq(
    (await guard(post({ origin: "https://evil.example" }), "ip", o))?.status,
    403,
  );
  eq((await guard(post({ "content-length": "999999" }), "ip", o))?.status, 413);
  eq(await guard(post(), "ip", o), null);
  eq((await guard(post(), "ip", o))?.status, 429);
  eq(await guard(new Request(URL_), "ip", o), null); // plain GETs never count
  eq(
    (await guard(new Request("https://demo.example/demo"), "ip", o))?.status,
    429,
  );
});

Deno.test("crossSite: compares hosts, so a proxy's http does not refuse an https form", () => {
  const behindProxy = (origin: string) =>
    new Request("http://demo.example/x", {
      method: "POST",
      headers: { origin },
    });
  eq(crossSite(behindProxy("https://demo.example")), false);
  eq(crossSite(behindProxy("https://evil.example")), true);
  eq(crossSite(behindProxy("null")), true);
});

Deno.test("clientIp: socket address unless it is a proxy's, then the last forwarded hop", () => {
  const req = (xff?: string) => new Request(URL_, { headers: xff ? { "x-forwarded-for": xff } : {} });
  eq(clientIp(req("1.1.1.1"), "203.0.113.9"), "203.0.113.9");
  eq(clientIp(req("6.6.6.6, 198.51.100.7"), "127.0.0.1"), "198.51.100.7");
  eq(clientIp(req("198.51.100.7"), "10.0.0.4"), "198.51.100.7");
  eq(clientIp(req(), "::1"), "::1");
  eq(clientIp(req("198.51.100.7"), "172.20.1.1"), "198.51.100.7");
  eq(clientIp(req("198.51.100.7"), "172.32.1.1"), "172.32.1.1"); // public, not a proxy
});

Deno.test("crossSite: no Origin falls back to Sec-Fetch-Site", () => {
  eq(
    crossSite(
      new Request(URL_, {
        method: "POST",
        headers: { "sec-fetch-site": "cross-site" },
      }),
    ),
    true,
  );
  eq(
    crossSite(
      new Request(URL_, {
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
      }),
    ),
    false,
  );
});

Deno.test("harden: noindex unless asked, status kept", () => {
  const r = harden(new Response("x", { status: 201 }));
  eq(r.status, 201);
  eq(r.headers.get("x-robots-tag"), "noindex, nofollow");
  eq(
    harden(new Response("x"), { index: true }).headers.has("x-robots-tag"),
    false,
  );
});

Deno.test("tripwire: clean env passes, outbound or live or foreign DB fails", () => {
  eq(tripwire({ DEMO: "true", STRIPE_SECRET_KEY: "sk_test_x", KV: {} }), []);
  eq(tripwire({ RESEND_API_KEY: "re_x" }).length, 1);
  eq(tripwire({ STRIPE_SECRET_KEY: "sk_live_x" }).length, 1);
  eq(
    tripwire({ DATABASE_URL: "postgres://prod.neon.tech/db" }, [
      "demo.neon.tech",
    ]).length,
    1,
  );
  eq(
    tripwire({ DATABASE_URL: "postgres://demo.neon.tech/db" }, [
      "demo.neon.tech",
    ]),
    [],
  );
});
