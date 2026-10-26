// /articles/:slug — HTML stored at save time, one store read, no client JavaScript.
import { page } from "fresh";
import { define } from "../utils.ts";
import { getStore, SLUG } from "../lib/store.ts";
import { fmtDate, href, t, topicLabel } from "../lib/i18n.ts";
import { PageShell, plainTitle, Seo, StoredHtml, Title } from "../components/ui.tsx";

const BUILD = Deno.env.get("DENO_DEPLOYMENT_ID") ?? "dev";

export const handler = define.handlers({
  async GET(ctx) {
    const slug = ctx.params.slug;
    if (!SLUG.test(slug)) return ctx.next();
    const started = performance.now();
    const store = await getStore();
    const found = await store.getBySlug(ctx.state.locale, slug);
    if (!found) return ctx.next(); // the 404 page
    const dur = (performance.now() - started).toFixed(1);

    const etag = `W/"${found.post.id}-${found.post.updatedAt}-${BUILD}"`;
    // inm: whether a conditional request reached the app (on Deno Deploy, 304s did not happen).
    const inm = ctx.req.headers.get("if-none-match");
    const headers = { etag, "server-timing": `store;dur=${dur}, inm;desc="${inm ? "seen" : "none"}"` };
    if (inm === etag) return new Response(null, { status: 304, headers });
    return page(found, { headers });
  },
});

export default define.page<typeof handler>(function Article({ data, state, url }) {
  const { locale } = state;
  const d = t(locale);
  const { post, html, source, other } = data;
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
      <article>
        <header class="article-tete">
          <div>
            <Title text={post.title} />
            {post.excerpt && <p class="chapo">{post.excerpt}</p>}
            <p class="spec">
              <span>N° {String(post.number).padStart(2, "0")}</span>
              <span>{d.post.by} {post.author}</span>
              <span>{fmtDate(locale, post.publishedAt)}</span>
              <span>{d.post.reading(post.minutes)}</span>
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
              <img class="photo" src={post.cover} alt={post.coverAlt} width="1067" height="1334" fetchpriority="high" />
            </div>
          )}
        </header>

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
      <nav class="article-pied" aria-label={d.post.back}>
        <a class="pill pill-ligne" href={href(locale, "/articles")}>← {d.post.back}</a>
      </nav>
    </PageShell>
  );
});
