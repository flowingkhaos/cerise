// /articles/:slug — HTML stored at save time, no client JavaScript. The post and the feed are
// read in parallel (one round trip), so the end of the article can offer the next post and two more.
import { page } from "fresh";
import { define } from "../utils.ts";
import { getStore, SLUG } from "../lib/store.ts";
import { fmtDate, href, t, topicLabel } from "../lib/i18n.ts";
import type { Post, PostSummary } from "../lib/types.ts";
import { Card, coverName, PageShell, plainTitle, Seo, StoredHtml, Title, TryBar, TryForm } from "../components/ui.tsx";

const BUILD = Deno.env.get("DENO_DEPLOYMENT_ID") ?? "dev";

/** The next post (the older one, wrapping to the newest) and two more, those sharing a topic first. */
export function whatNext(post: Post, feed: PostSummary[]) {
  const i = feed.findIndex((p) => p.id === post.id);
  const next = feed.length > 1 || i === -1 ? feed[(i + 1) % feed.length] ?? null : null;
  const shared = (p: PostSummary) => p.topics.filter((tp) => post.topics.includes(tp)).length;
  const related = feed.filter((p) => p.id !== post.id && p.id !== next?.id)
    .sort((a, b) => shared(b) - shared(a)) // stable: newest first among equals
    .slice(0, 2);
  return { next, related };
}

export const handler = define.handlers({
  async GET(ctx) {
    const slug = ctx.params.slug;
    if (!SLUG.test(slug)) return ctx.next();
    const started = performance.now();
    const store = await getStore();
    const [found, feed] = await Promise.all([
      store.getBySlug(ctx.state.locale, slug),
      store.listPublished(ctx.state.locale, undefined, 12),
    ]);
    if (!found) return ctx.next(); // the 404 page
    const dur = (performance.now() - started).toFixed(1);

    // The feed is in the page now: a newer post anywhere changes it, so it is in the ETag too.
    const stamp = Math.max(0, ...feed.items.map((p) => p.updatedAt));
    const etag = `W/"${found.post.id}-${found.post.updatedAt}-${stamp}-${BUILD}"`;
    // inm: whether a conditional request reached the app (on Deno Deploy, 304s did not happen).
    const inm = ctx.req.headers.get("if-none-match");
    const headers = { etag, "server-timing": `store;dur=${dur}, inm;desc="${inm ? "seen" : "none"}"` };
    if (inm === etag) return new Response(null, { status: 304, headers });
    return page({ ...found, ...whatNext(found.post, feed.items) }, { headers });
  },
});

export default define.page<typeof handler>(function Article({ data, state, url }) {
  const { locale } = state;
  const d = t(locale);
  const { post, html, source, other, next, related } = data;
  return (
    <PageShell locale={locale} path={url.pathname} toast={state.toast}>
      <Seo
        locale={locale}
        url={url}
        title={`${plainTitle(post.title)} — cerise`}
        description={post.excerpt}
        image={post.cover}
        alternate={Boolean(other)}
      />
      <div class="progression" aria-hidden="true" />
      <article>
        <header class="article-tete">
          <div>
            <Title text={post.title} />
            {post.excerpt && <p class="chapo">{post.excerpt}</p>}
            <p class="spec">
              <span>{d.post.by} {post.author}</span>
              <span>{fmtDate(locale, post.publishedAt)}</span>
              <span>{d.post.minutes(post.minutes)}</span>
              {post.topics.map((tp) => <a key={tp} href={href(locale, `/themes/${tp}`)}>{topicLabel(locale, tp)}</a>)}
              {other && (
                <a href={href(other.locale, `/articles/${other.slug}`)} lang={other.locale} hreflang={other.locale}>
                  {d.post.other}
                </a>
              )}
            </p>
          </div>
          {post.cover && (
            <div class="couverture">
              <img
                class="photo"
                src={post.cover}
                alt={post.coverAlt}
                width="1067"
                height="1334"
                fetchpriority="high"
                style={coverName(post.slug)}
              />
            </div>
          )}
        </header>

        <div class="lecture">
          {post.toc.length > 1
            ? (
              <nav class="sommaire-article" aria-labelledby="toc">
                <h2 id="toc">{d.post.toc}</h2>
                <ol>
                  {post.toc.map((h) => (
                    <li key={h.id} class={`n${h.level}`}>
                      <a href={`#${h.id}`}>{h.text}</a>
                    </li>
                  ))}
                </ol>
              </nav>
            )
            : <div />}
          <StoredHtml class="corps" html={html} />
        </div>
      </article>

      <section class="la-suite">
        <div class="essai-ici revele">
          <div>
            <p class="sur">{d.post.tryKicker}</p>
            <Title text={d.post.tryHere} as="h2" />
            <p>{d.post.tryHereBody}</p>
          </div>
          <TryForm locale={locale} postId={post.id} label={d.post.tryHereCta} class="pill pill-blanc" />
        </div>
        {next && (
          <>
            <h2>{d.post.next}</h2>
            <Card post={next} locale={locale} big />
          </>
        )}
        {related.length > 0 && (
          <>
            <h2>{d.post.related}</h2>
            <div class="grille">
              {related.map((p) => <Card key={p.id} post={p} locale={locale} />)}
            </div>
          </>
        )}
      </section>

      <div class="article-pied">
        <a class="pill pill-ligne" href={href(locale, "/articles")}>← {d.post.back}</a>
        <details class="flip">
          <summary class="pill pill-ligne">
            <span class="ouvre">{d.post.source}</span>
            <span class="ferme">{d.post.rendered}</span>
          </summary>
          <div class="source">
            <p>{d.post.sourceNote}</p>
            <pre><code>{source}</code></pre>
          </div>
        </details>
      </div>
      <TryBar locale={locale} postId={post.id} />
    </PageShell>
  );
});
