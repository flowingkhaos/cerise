// /articles — every published post, newest first, 20 a page (cursor pagination).
import { page } from "fresh";
import { define } from "../utils.ts";
import { getStore } from "../lib/store.ts";
import { href, t } from "../lib/i18n.ts";
import { PageShell, PostRow, Seo } from "../components/ui.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const after = ctx.url.searchParams.get("apres") ?? undefined;
    try {
      return page(await store.listPublished(ctx.state.locale, after, 20));
    } catch {
      return ctx.redirect(href(ctx.state.locale, "/articles"), 303); // a stale or forged cursor
    }
  },
});

export default define.page<typeof handler>(function Archive({ data, state, url }) {
  const { locale } = state;
  const d = t(locale);
  return (
    <PageShell locale={locale} path={url.pathname} current="articles" toast={state.toast}>
      <Seo locale={locale} url={url} title={`${d.home.all} — cerise`} description={d.siteDescription} />
      <section class="sommaire">
        <div class="sommaire-tete">
          <h1>{d.home.all}</h1>
          <nav class="themes" aria-label={d.nav.topics}>
            {Object.entries(d.topics).map(([slug, label]) => (
              <a key={slug} href={href(locale, `/themes/${slug}`)}>{label}</a>
            ))}
          </nav>
        </div>
        {data.items.length
          ? data.items.map((p) => <PostRow key={p.id} post={p} locale={locale} />)
          : <p class="vide-liste">{d.home.empty}</p>}
        {data.cursor && (
          <p class="suite">
            <a class="pill pill-ligne" href={href(locale, `/articles?apres=${encodeURIComponent(data.cursor)}`)}>
              {d.home.more}
            </a>
          </p>
        )}
      </section>
    </PageShell>
  );
});
