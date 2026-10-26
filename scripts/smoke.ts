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
