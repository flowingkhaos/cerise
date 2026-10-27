// Sign-out, RSS, health, and the 404 and error pages.
import { define } from "../utils.ts";
import { getStore } from "../lib/store.ts";
import { getCms } from "../lib/cms.ts";
import { href, localeOf, t } from "../lib/i18n.ts";
import { readSid, sessionCookie } from "../lib/auth.ts";
import { plainTitle } from "../lib/markdown.ts";
import { PageShell, Seo } from "../components/ui.tsx";

export const signOutHandler = define.handlers({
  async POST(ctx) {
    const sid = readSid(ctx.req);
    if (sid) await (await getStore()).deleteSession(sid);
    return new Response(null, {
      status: 303,
      headers: { location: href(ctx.state.locale, "/"), "set-cookie": sessionCookie(ctx.req, "", 0) },
    });
  },
});

const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

export const rssHandler = define.handlers({
  async GET(ctx) {
    const { locale } = ctx.state;
    const d = t(locale);
    const [kv, cms] = await Promise.all([
      (await getStore()).listPublished(locale, undefined, 20),
      getCms().list(locale),
    ]);
    const items = [...kv.items, ...cms.entries.map((e) => e.post)]
      .sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 20);
    const base = ctx.url.origin;
    const entries = items.map((p) => {
      const link = `${base}${href(locale, `/articles/${p.slug}`)}`;
      return `<item><title>${xml(plainTitle(p.title))}</title><link>${link}</link><guid>${link}</guid>` +
        `<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate><description>${
          xml(p.excerpt)
        }</description></item>`;
    }).join("");
    const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>` +
      `<title>cerise</title><link>${base}${href(locale, "/")}</link><description>${
        xml(d.siteDescription)
      }</description>` +
      `<language>${d.htmlLang}</language>${entries}</channel></rss>`;
    return new Response(body, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
  },
});

export const healthHandler = define.handlers({
  async GET() {
    const ok = await (await getStore()).isSeeded();
    return Response.json({ ok }, { status: ok ? 200 : 503 });
  },
});

// Fresh serves _404 and _error outside the app middleware: set the guard's headers here.
const HARDEN = {
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
  "content-security-policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "cache-control": "no-store",
};

export const notFoundHandler = define.handlers(() => ({ data: null, status: 404, headers: HARDEN }));

export const NotFound = define.page(function NotFound({ url, state }) {
  const locale = localeOf(url.pathname);
  const d = t(locale).notFound;
  return (
    <PageShell locale={locale} path={url.pathname} xray={state.xray} toast={state.toast}>
      <Seo locale={locale} url={url} title={`${d.title} ${d.accent} — cerise`} description={d.body} alternate={false} />
      <section class="perdu">
        <div class="perdu-photo">
          <img class="photo" src="/img/apres-soin.webp" alt="" width="928" height="1152" />
        </div>
        <div class="perdu-texte">
          <h1>
            {d.title} <em class="accent">{d.accent}</em>.
          </h1>
          <p>{d.body}</p>
          <a class="pill pill-rouge" href={href(locale, "/")}>{d.home}</a>
        </div>
      </section>
    </PageShell>
  );
});

export const ErrorPage = define.page(function ErrorPage({ url }) {
  const locale = localeOf(url.pathname);
  const d = t(locale).error;
  return (
    <PageShell locale={locale} path={url.pathname}>
      <section class="perdu">
        <div class="perdu-photo">
          <img class="photo" src="/img/apres-soin.webp" alt="" width="928" height="1152" />
        </div>
        <div class="perdu-texte">
          <h1>
            {d.title} <em class="accent">{d.accent}</em>.
          </h1>
          <p>{d.body}</p>
          <a class="pill pill-rouge" href={href(locale, "/")}>{t(locale).notFound.home}</a>
        </div>
      </section>
    </PageShell>
  );
});
