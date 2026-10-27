// /themes — every topic with its count, and /themes/:topic — the posts in one topic.
import { page } from "fresh";
import { define } from "../utils.ts";
import { getStore, SLUG } from "../lib/store.ts";
import { href, t, topicLabel } from "../lib/i18n.ts";
import { PageShell, PostRow, Seo } from "../components/ui.tsx";
import type { PostSummary } from "../lib/types.ts";

export const indexHandler = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    // ponytail: counts from one 500-post read; keep a ["topiccount"] key when a blog outgrows it.
    const { items } = await store.listPublished(ctx.state.locale, undefined, 500);
    const counts = new Map<string, number>();
    for (const p of items) for (const tp of p.topics) counts.set(tp, (counts.get(tp) ?? 0) + 1);
    return page({ topics: [...counts].sort((a, b) => b[1] - a[1]) });
  },
});

export const TopicsIndex = define.page<typeof indexHandler>(function TopicsIndex({ data, state, url }) {
  const { locale } = state;
  const d = t(locale);
  return (
    <PageShell locale={locale} path={url.pathname} xray={state.xray} current="topics" toast={state.toast}>
      <Seo locale={locale} url={url} title={`${d.nav.topics} — cerise`} description={d.siteDescription} />
      <section class="sommaire">
        <div class="sommaire-tete">
          <h1>{d.nav.topics}</h1>
        </div>
        <nav class="grille-themes" aria-label={d.nav.topics}>
          {data.topics.map(([slug, n]) => (
            <a key={slug} href={href(locale, `/themes/${slug}`)}>
              {topicLabel(locale, slug)} <span>{n}</span>
            </a>
          ))}
        </nav>
      </section>
    </PageShell>
  );
});

export const topicHandler = define.handlers({
  async GET(ctx) {
    const topic = ctx.params.topic;
    if (!SLUG.test(topic)) return ctx.next();
    const store = await getStore();
    const after = ctx.url.searchParams.get("apres") ?? undefined;
    let res: { items: PostSummary[]; cursor?: string };
    try {
      res = await store.listByTopic(ctx.state.locale, topic, after, 20);
    } catch {
      return ctx.redirect(href(ctx.state.locale, `/themes/${topic}`), 303);
    }
    return page({ topic, ...res });
  },
});

export const TopicPage = define.page<typeof topicHandler>(function TopicPage({ data, state, url }) {
  const { locale } = state;
  const d = t(locale);
  const label = topicLabel(locale, data.topic);
  return (
    <PageShell locale={locale} path={url.pathname} xray={state.xray} current="topics" toast={state.toast}>
      <Seo locale={locale} url={url} title={`${d.topic.title(label)} — cerise`} description={d.siteDescription} />
      <section class="sommaire">
        <div class="sommaire-tete">
          <h1>{label}</h1>
          <nav class="themes" aria-label={d.nav.topics}>
            {Object.entries(d.topics).map(([slug, l]) => (
              <a
                key={slug}
                href={href(locale, `/themes/${slug}`)}
                aria-current={slug === data.topic ? "page" : "false"}
              >
                {l}
              </a>
            ))}
          </nav>
        </div>
        {data.items.length
          ? data.items.map((p) => <PostRow key={p.id} post={p} locale={locale} />)
          : <p class="vide-liste">{d.topic.empty}</p>}
        {data.cursor && (
          <p class="suite">
            <a
              class="pill pill-ligne"
              href={href(locale, `/themes/${data.topic}?apres=${encodeURIComponent(data.cursor)}`)}
            >
              {d.home.more}
            </a>
          </p>
        )}
      </section>
    </PageShell>
  );
});
