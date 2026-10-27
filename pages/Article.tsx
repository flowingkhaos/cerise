// /articles/:slug — HTML stored at save time, no client JavaScript. The post and the feed are
// read in parallel (one round trip), so the end of the article can offer the next post and two more.
// A slug Deno KV does not have is looked up in the shared CMS (lib/cms.ts): same template, rendered at read.
import { page } from "fresh";
import { define } from "../utils.ts";
import { getStore, SLUG } from "../lib/store.ts";
import { getCms } from "../lib/cms.ts";
import { seedFile } from "../lib/xray.ts";
import { fmtDate, href, t, topicLabel } from "../lib/i18n.ts";
import type { Post, PostSummary } from "../lib/types.ts";
import { Card, coverName, PageShell, plainTitle, Seo, StoredHtml, Title, TryForm } from "../components/ui.tsx";
import { cmsRead, PhotoTag, Readout, Tag, vise } from "../components/xray.tsx";

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
    const { locale } = ctx.state;
    const started = performance.now();
    const store = await getStore();
    const cms = getCms();
    const [kv, feed] = await Promise.all([
      store.getBySlug(locale, slug),
      store.listPublished(locale, undefined, 12),
    ]);
    const kvMs = performance.now() - started;
    const fromCms = kv ? null : await cms.find(locale, slug);
    if (!kv && !fromCms) {
      // A CMS twin may carry another slug (the language link swaps the prefix only): send it to its twin here.
      const twin = await cms.twinSlug(locale, slug);
      return twin ? ctx.redirect(href(locale, `/articles/${twin}`), 302) : ctx.next(); // else the 404 page
    }
    const found = (kv ?? fromCms)!;
    const list = fromCms?.list ?? await cms.list(locale);
    const all = [...feed.items, ...list.entries.map((e) => e.post)].sort((a, b) => b.publishedAt - a.publishedAt);
    const dur = kvMs.toFixed(1);

    // The feed is in the page now: a newer post anywhere changes it, so it is in the ETag too. So do the
    // visitor's light/dark pick and the X-ray, which are rendered into the HTML.
    const stamp = Math.max(0, ...all.map((p) => p.updatedAt));
    const view = `${ctx.state.theme ?? ""}${ctx.state.xray ? "-rx" : ""}`;
    const etag = `W/"${found.post.id}-${found.post.updatedAt}-${stamp}-${BUILD}${view}"`;
    // inm: whether a conditional request reached the app (on Deno Deploy, 304s did not happen).
    const inm = ctx.req.headers.get("if-none-match");
    const headers = {
      etag,
      "server-timing": `store;dur=${dur}, cms;desc="${list.from}", inm;desc="${inm ? "seen" : "none"}"`,
    };
    if (inm === etag) return new Response(null, { status: 304, headers });
    return page({ ...found, ...whatNext(found.post, all), kvMs, list, now: Date.now() }, { headers });
  },
});

export default define.page<typeof handler>(function Article({ data, state, url }) {
  const { locale } = state;
  const d = t(locale);
  const { post, html, source, other, next, related } = data;
  const x = d.xray;
  const cms = post.cms;
  const file = cms ? null : seedFile(locale, post.slug);
  const base = getCms().base;
  const rx = Boolean(state.xray);
  const cover = vise(rx, cms ? "cms" : "md", "couverture");
  return (
    <PageShell
      locale={locale}
      path={url.pathname}
      xray={state.xray}
      toast={state.toast}
      tryPost={cms ? undefined : post.id}
    >
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
            {cms
              ? (
                <Tag
                  o="cms"
                  where={`articles › ${post.slug} › title, excerpt, publishedAt, category`}
                  note={x.fieldsCms}
                  at="flux"
                />
              )
              : (
                <Tag
                  o="md"
                  where={file
                    ? `${file} › title, excerpt, author, publishedAt, topics`
                    : `Deno KV ["page","${locale}","${post.slug}","m"]`}
                  note={file ? x.fieldsMd : x.editorPost}
                  at="flux"
                />
              )}
            <Title text={post.title} />
            {post.excerpt && <p class="chapo">{post.excerpt}</p>}
            <p class="spec">
              {post.author && <span>{d.post.by} {post.author}</span>}
              <span>{fmtDate(locale, post.publishedAt)}</span>
              <span>{d.post.minutes(post.minutes)}</span>
              {post.topics.map((tp) => <a key={tp} href={href(locale, `/themes/${tp}`)}>{topicLabel(locale, tp)}</a>)}
              {cms?.category && <span>{cms.category}</span>}
              {other && (
                <a href={href(other.locale, `/articles/${other.slug}`)} lang={other.locale} hreflang={other.locale}>
                  {d.post.other}
                </a>
              )}
            </p>
          </div>
          {post.cover && (
            <div {...cover}>
              <PhotoTag post={post} />
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
                <Tag o={cms ? "cms" : "md"} where="toc" note={cms ? x.tocCms : x.tocMd} at="flux" />
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
          {rx
            ? (
              // X-ray only: a frame for the body's tag (the stored HTML cannot take a child). Off, the DOM is as live.
              <div class="corps-cadre">
                {cms
                  ? (
                    <Tag
                      o="cms"
                      label="Payload → HTML"
                      where="articles › body (markdown)"
                      note={x.bodyCms}
                      at="dessus"
                    />
                  )
                  : (
                    <Tag
                      o="md"
                      label="Markdown → HTML"
                      where={`Deno KV ["page","${locale}","${post.slug}","h",0]`}
                      note={x.bodyMd}
                      at="dessus"
                    />
                  )}
                <StoredHtml class="corps" html={html} />
              </div>
            )
            : <StoredHtml class="corps" html={html} />}
        </div>
      </article>

      <Readout
        page
        title={x.articleTitle}
        intro={cms ? x.introCms : file ? x.introSeed : x.introEditor}
        rows={cms
          ? [
            { dt: x.dt.route, dd: x.articleRoute(url.pathname) },
            {
              o: "cms",
              dt: x.dt.source,
              dd: x.sourceCmsRow(cms.id, locale, base ? x.onHost(new URL(base).host) : x.noHost) +
                (post.cover ? x.photoCms : ""),
            },
            { dt: x.dt.read, dd: cmsRead(locale, base, data.list, data.now) },
            { dt: x.dt.memory, dd: x.memory },
            { dt: x.dt.render, dd: x.renderCms },
            { dt: x.dt.browser, dd: x.browserArticle },
          ]
          : [
            { dt: x.dt.route, dd: x.articleRoute(url.pathname) },
            { o: "md", dt: x.dt.source, dd: file ? x.sourceSeed(file) : x.sourceEditor },
            { dt: x.dt.storage, dd: x.storage(locale, post.slug) },
            { dt: x.dt.render, dd: x.renderMd },
            { dt: x.dt.read, dd: x.readKv(locale === "fr" ? "en" : "fr", post.slug, Math.round(data.kvMs)) },
            { dt: x.dt.browser, dd: x.browserArticle },
          ]}
      />

      <section class="la-suite">
        {cms
          ? (
            <div class="essai-ici revele">
              <div>
                <Tag
                  o="code"
                  where={`i18n/${locale}.ts › post.elsewhere · components/ui.tsx › TryForm`}
                  note={x.tryElsewhere}
                  at="flux"
                />
                <p class="sur">{d.post.elsewhereKicker}</p>
                <Title text={d.post.elsewhereTitle} as="h2" />
                <p>{d.post.elsewhereBody}</p>
              </div>
              <div class="essai-ici-actions">
                <TryForm locale={locale} label={d.post.elsewhereCta} class="pill pill-blanc" />
                {base && (
                  <a class="pill pill-ligne" href={`${base}/admin/login`}>
                    {d.post.openCms} <span class="fleche" aria-hidden="true">→</span>
                  </a>
                )}
              </div>
            </div>
          )
          : (
            <div class="essai-ici revele">
              <div>
                <Tag
                  o="code"
                  where={`i18n/${locale}.ts › post.tryHere · components/ui.tsx › TryForm`}
                  note={x.tryHere}
                  at="flux"
                />
                <p class="sur">{d.post.tryKicker}</p>
                <Title text={d.post.tryHere} as="h2" />
                <p>{d.post.tryHereBody}</p>
              </div>
              <TryForm locale={locale} postId={post.id} label={d.post.tryHereCta} class="pill pill-blanc" />
            </div>
          )}
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
        {cms
          ? <Tag o="cms" where="articles › body" note={x.sourceCms} />
          : <Tag o="md" where={`Deno KV ["page","${locale}","${post.slug}","s",0]`} note={x.sourceMd} />}
        <a class="pill pill-ligne" href={href(locale, "/articles")}>← {d.post.back}</a>
        <details class="flip">
          <summary class="pill pill-ligne">
            <span class="ouvre">{d.post.source}</span>
            <span class="ferme">{d.post.rendered}</span>
          </summary>
          <div class="source">
            <p>{cms ? d.post.sourceNoteCms : d.post.sourceNote}</p>
            <pre><code>{source}</code></pre>
          </div>
        </details>
      </div>
    </PageShell>
  );
});
