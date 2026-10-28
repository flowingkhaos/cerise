// deno run -A scripts/smoke.ts <base-url>
// The /demo guard gate plus the showcase checks. Run against a built server or prod,
// never the Vite dev server (it answers gzip clients with 0 bytes). The burst runs last.
const base = (Deno.args[0] ?? "http://127.0.0.1:8000").replace(/\/$/, "");
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${!cond && detail ? `  (${detail})` : ""}`);
};
const get = (path: string, init: RequestInit = {}) => fetch(base + path, { redirect: "manual", ...init });
const form = (body: Record<string, string>) => new URLSearchParams(body);
const sameOrigin = { origin: base };

// 1. public routes: 200, noindex, CSP; 404 carries the same headers
const PUBLIC = [
  "/",
  "/en",
  "/articles",
  "/themes",
  "/themes/ecrire",
  "/articles/ecrivez-comme-vous-parlez",
  "/en/articles/ecrivez-comme-vous-parlez",
  "/articles/d-ou-viennent-ces-articles", // from the shared Payload CMS (or its fixture)
  "/en/articles/d-ou-viennent-ces-articles",
  "/connexion",
  "/rss.xml",
  "/healthz",
];
for (const p of PUBLIC) {
  const r = await get(p);
  const html = await r.text();
  ok(`GET ${p} 200`, r.status === 200, String(r.status));
  ok(`GET ${p} noindex`, r.headers.get("x-robots-tag") === "noindex, nofollow");
  ok(`GET ${p} frame-ancestors`, (r.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"));
  if (p.startsWith("/articles/") || p === "/" || p === "/articles") {
    ok(`GET ${p} ships no script`, !/<script\b/i.test(html), `${(html.match(/<script\b/gi) ?? []).length} script tags`);
    ok(`GET ${p} is cacheable`, (r.headers.get("cache-control") ?? "").startsWith("public"));
  }
}
{
  const r = await get("/pas-une-page");
  await r.body?.cancel();
  ok("unknown path 404", r.status === 404, String(r.status));
  ok("404 noindex", r.headers.get("x-robots-tag") === "noindex, nofollow");
}

// 2. the article: one stored HTML, ETag → 304, store timing exposed
{
  const r = await get("/articles/vos-consignes-dans-un-encadre");
  const html = await r.text();
  ok("article renders the callout", html.includes('class="callout callout--attention"'));
  ok("article has the markdown flip", html.includes('class="flip"'));
  const etag = r.headers.get("etag") ?? "";
  ok("article has an ETag", etag.startsWith('W/"'));
  ok("article reports store timing", (r.headers.get("server-timing") ?? "").startsWith("store;dur="));
  const again = await get("/articles/vos-consignes-dans-un-encadre", { headers: { "if-none-match": etag } });
  await again.body?.cancel();
  if (again.status !== 304 && (again.headers.get("server-timing") ?? "").includes('inm;desc="none"')) {
    // Deno Deploy strips If-None-Match before the app sees it (measured 2026-10-26).
    console.log("skip article 304: the platform did not pass If-None-Match to the app");
  } else {
    ok("article 304 on a matching ETag", again.status === 304, String(again.status));
  }
}

// 2b. the reader's paths: no post twice on the home page, three ways on from an article,
// the editor one tap away, the light/dark pick rendered by the server
{
  const home = await (await get("/")).text();
  const slugs = [...home.matchAll(/href="\/articles\/([a-z0-9-]+)"/g)].map((m) => m[1]);
  ok("home shows no post twice", slugs.length > 0 && new Set(slugs).size === slugs.length, slugs.join(" "));
  ok("home opens the editor in one tap", /name="next" value="\/admin\/posts\/[0-9a-f-]{36}"/.test(home));
  const art = await (await get("/articles/ecrivez-comme-vous-parlez")).text();
  const end = art.slice(art.indexOf('class="la-suite"'));
  const ways = end.match(/href="\/articles\/[a-z0-9-]+"|name="next" value="\/admin\/posts\//g) ?? [];
  ok("article ends with 3+ ways forward", ways.length >= 3, String(ways.length));
  const m = await get("/mode", {
    method: "POST",
    headers: sameOrigin,
    body: form({ mode: "dark", back: "/articles" }),
  });
  await m.body?.cancel();
  const pick = (m.headers.get("set-cookie") ?? "").split(";")[0];
  ok(
    "mode pick → 303 back + cookie",
    m.status === 303 && m.headers.get("location") === "/articles" && pick === "cerise_mode=dark",
    `${m.status} ${m.headers.get("location")} ${pick}`,
  );
  const dark = await (await get("/", { headers: { cookie: pick } })).text();
  ok("the server renders the pick", dark.includes('data-theme="dark"'));
}

// 2c. the shared CMS: its articles beside the KV posts, the lead stays a KV post, a twin with another slug
{
  const home = await (await get("/")).text();
  const lead = home.slice(home.indexOf('class="une'), home.indexOf('class="presentoir"'));
  ok("home lists the CMS articles", home.includes('href="/articles/d-ou-viennent-ces-articles"'));
  ok("the lead is a KV post", lead.includes('href="/articles/ecrivez-comme-vous-parlez"'));
  const r = await get("/articles/d-ou-viennent-ces-articles");
  const html = await r.text();
  ok("CMS article renders its markdown", html.includes("<code>blog-demo</code>"));
  ok("CMS article never opens cerise's editor on itself", !/name="next" value="\/admin\/posts\//.test(html));
  ok("CMS article reports how it was read", /cms;desc="(live|cache|spare)"/.test(r.headers.get("server-timing") ?? ""));
  const twin = await get("/en/articles/un-seul-endroit-pour-vos-contenus");
  await twin.body?.cancel();
  ok(
    "a CMS twin with another slug redirects to it",
    twin.status === 302 && twin.headers.get("location") === "/en/articles/one-place-for-all-your-content",
    `${twin.status} ${twin.headers.get("location")}`,
  );
}

// 2d. Rayons X: off by default; a form sets a cookie; on, every tag is counted in the legend and the page
// is never shared from a cache
{
  const off = await (await get("/")).text();
  ok("X-ray off: the switch, no tags", off.includes('action="/rayons-x"') && !off.includes("rx-tag"));
  const s = await get("/rayons-x", { method: "POST", headers: sameOrigin, body: form({ rx: "1", back: "/articles" }) });
  await s.body?.cancel();
  const cookie = (s.headers.get("set-cookie") ?? "").split(";")[0];
  ok(
    "X-ray switch → 303 back + cookie",
    s.status === 303 && s.headers.get("location") === "/articles" && cookie === "cerise_rx=1",
    `${s.status} ${s.headers.get("location")} ${cookie}`,
  );
  const pages = [
    "/",
    "/en",
    "/articles",
    "/articles/ecrivez-comme-vous-parlez",
    "/articles/d-ou-viennent-ces-articles",
  ];
  for (const p of pages) {
    const r = await get(p, { headers: { cookie } });
    const html = await r.text();
    const n: Record<string, number> = { md: 0, cms: 0, code: 0 };
    for (const m of html.matchAll(/class="rx-tag[^"]*" data-o="(md|cms|code)"/g)) n[m[1]]++;
    const legend = html.match(/<p class="rx-legende">.*?<\/p>/s)?.[0] ?? "";
    const shown = [...legend.matchAll(/<b>(\d+)<\/b>/g)].map((m) => Number(m[1]));
    const want = [n.md, n.cms, n.code, n.md + n.cms + n.code];
    ok(`X-ray ${p}: legend = tags`, JSON.stringify(shown) === JSON.stringify(want), `${shown} vs ${want}`);
    ok(`X-ray ${p}: never cached`, (r.headers.get("cache-control") ?? "").includes("no-store"));
    ok(`X-ray ${p}: no script`, !/<script\b/i.test(html));
  }
  const home = await (await get("/", { headers: { cookie } })).text();
  ok("X-ray home tags both sources", /data-o="md"/.test(home) && /class="rx-tag[^"]*" data-o="cms"/.test(home));
  ok("X-ray home has the readout", home.includes('class="rx-releve"'));
  const art = await (await get("/articles/d-ou-viennent-ces-articles", { headers: { cookie } })).text();
  ok("X-ray CMS article names its collection", art.includes("articles › d-ou-viennent-ces-articles"));
  const o = await get("/rayons-x", { method: "POST", headers: sameOrigin, body: form({ rx: "0", back: "/" }) });
  await o.body?.cancel();
  ok("X-ray off clears the cookie", (o.headers.get("set-cookie") ?? "").includes("Max-Age=0"));
}

// 2c. live preview: a link the CMS did not sign is refused (403; 404 from a CMS without /api/preview),
// never cached, and only /preview may be framed — by the CMS origin, never by anyone else.
{
  const r = await get("/preview?collection=articles&id=1&exp=1&sig=00");
  await r.body?.cancel();
  ok("preview: an unsigned link is refused", r.status === 403 || r.status === 404, String(r.status));
  ok("preview: never cached", (r.headers.get("cache-control") ?? "").includes("no-store"));
  const fa = (r.headers.get("content-security-policy") ?? "").match(/frame-ancestors ([^;]+)/)?.[1] ?? "";
  ok("preview: framed by the CMS only", fa === "'none'" || /^https?:\/\/[^\s']+$/.test(fa), fa);
  const h = await get("/");
  await h.body?.cancel();
  ok("home: never framed", (h.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"));
}

// 3. guard: cross-site and size refusals
{
  const r = await get("/connexion", {
    method: "POST",
    headers: { origin: "https://evil.example" },
    body: form({ a: "1" }),
  });
  await r.body?.cancel();
  ok("cross-site POST 403", r.status === 403, String(r.status));
  const big = await get("/connexion", { method: "POST", headers: sameOrigin, body: "a=" + "x".repeat(70 * 1024) });
  await big.body?.cancel();
  ok("70 KiB POST to a small route 413", big.status === 413, String(big.status));
}

// 4. the visitor: signs in, sees everything, writes nothing
{
  const r = await get("/connexion", {
    method: "POST",
    headers: sameOrigin,
    body: form({ username: "visiteur", password: "cerise", next: "/admin" }),
  });
  await r.body?.cancel();
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  ok(
    "visitor sign-in 303 → /admin",
    r.status === 303 && r.headers.get("location") === "/admin",
    `${r.status} ${r.headers.get("location")}`,
  );
  ok("session cookie is HttpOnly", (r.headers.get("set-cookie") ?? "").includes("HttpOnly"));
  const list = await get("/admin", { headers: { cookie } });
  const html = await list.text();
  ok("visitor sees the admin", list.status === 200, String(list.status));
  ok("admin is never cached", (list.headers.get("cache-control") ?? "").includes("no-store"));
  const ids = [...html.matchAll(/\/admin\/posts\/([0-9a-f-]{36})/g)].map((m) => m[1]);
  const before = ids.length;
  const edit = await get(`/admin/posts/${ids[0]}`, { headers: { cookie } });
  const editHtml = await edit.text();
  ok("visitor opens the editor", edit.status === 200 && editHtml.includes('name="source"'), String(edit.status));
  const post = await get(`/admin/posts/${ids[0]}`, {
    method: "POST",
    headers: { ...sameOrigin, cookie, referer: `${base}/admin/posts/${ids[0]}` },
    body: form({ intent: "delete" }),
  });
  await post.body?.cancel();
  ok(
    "visitor write → 303 + demo toast",
    post.status === 303 && (post.headers.get("set-cookie") ?? "").includes("cerise_flash="),
  );
  const after = await get("/admin", { headers: { cookie } });
  const n = [...(await after.text()).matchAll(/\/admin\/posts\/([0-9a-f-]{36})/g)].length;
  ok("visitor delete changed nothing", n === before, `${before} → ${n}`);
  const exp = await get("/admin/exporter", { headers: { cookie } });
  await exp.body?.cancel();
  ok("visitor export refused", exp.status === 303);
  const out = await get("/deconnexion", { method: "POST", headers: { ...sameOrigin, cookie }, body: form({}) });
  await out.body?.cancel();
  const gone = await get("/admin", { headers: { cookie } });
  await gone.body?.cancel();
  ok(
    "signed out → admin redirects to sign-in",
    gone.status === 303 && (gone.headers.get("location") ?? "").startsWith("/connexion"),
  );
}

// 5. wrong password; then the burst (last: it trips the limiters for this IP)
{
  const r = await get("/connexion", {
    method: "POST",
    headers: sameOrigin,
    body: form({ username: "visiteur", password: "non" }),
  });
  await r.body?.cancel();
  ok("wrong password 401", r.status === 401, String(r.status));
  let last = 0;
  for (let i = 0; i < 31; i++) {
    const b = await get("/connexion", {
      method: "POST",
      headers: sameOrigin,
      body: form({ username: "x", password: "y" }),
    });
    await b.body?.cancel();
    last = b.status;
  }
  ok("burst of POSTs ends in 429", last === 429, String(last));
}

console.log(`\n${pass} passed, ${fail} failed`);
Deno.exit(fail ? 1 : 0);
