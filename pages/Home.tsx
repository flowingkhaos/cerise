// The vitrine: the newest post fills the first screen, two more and the try strip beside it;
// then the editor moment, then every other post once, as a magazine. No post is shown twice.
import { page } from "fresh";
import { define } from "../utils.ts";
import { getStore } from "../lib/store.ts";
import { VISITOR } from "../lib/auth.ts";
import { fmtDate, href, t, topicLabel } from "../lib/i18n.ts";
import {
  Card,
  coverName,
  Footer,
  Masthead,
  PostRow,
  Seo,
  Title,
  Toast,
  TryBar,
  TryForm,
  VisitorIds,
} from "../components/ui.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const { items, cursor } = await store.listPublished(ctx.state.locale, undefined, 12);
    return page({ items, cursor });
  },
});

/** "Annulez au moins **24 h**" → the text with its bold part, for both panes of the editor moment. */
function bold(line: string, mark: boolean) {
  return line.split("**").map((part, i) =>
    i % 2 ? (mark ? <span class="m">**{part}**</span> : <strong>{part}</strong>) : part
  );
}

export default define.page<typeof handler>(function Home({ data, state, url }) {
  const { locale } = state;
  const d = t(locale);
  const [une, ...others] = data.items;
  const rail = others.slice(0, 2);
  const [grand, ...rest] = others.slice(2);
  const demo = d.home.demo;
  const prefix = ["## ", "", "- ", "- ", "> "];
  return (
    <>
      <Seo locale={locale} url={url} title={d.siteTitle} description={d.siteDescription} image={une?.cover} />
      <main id="contenu">
        <section class="vitrine">
          <article class={une ? "une" : "une une-vide"}>
            {une?.cover && (
              <img
                class="photo"
                src={une.cover}
                alt={une.coverAlt}
                width="1600"
                height="1067"
                fetchpriority="high"
                style={coverName(une.slug)}
              />
            )}
            <Masthead locale={locale} path={url.pathname} />
            {une
              ? (
                <a class="une-lien" href={href(locale, `/articles/${une.slug}`)}>
                  <Title text={une.title} />
                  <p class="spec">
                    <span class="allume">{d.home.newBadge}</span>
                    <span>
                      {une.topics[0] && `${topicLabel(locale, une.topics[0])} · `}
                      {d.post.minutes(une.minutes)}
                    </span>
                  </p>
                  <span class="pill pill-blanc">
                    {d.home.read} <span class="fleche" aria-hidden="true">→</span>
                  </span>
                </a>
              )
              : <h1>{d.home.empty}</h1>}
          </article>

          <aside class="presentoir" aria-labelledby="nouv">
            <h2 id="nouv">{d.home.news}</h2>
            {[0, 1].map((i) => {
              const p = rail[i];
              if (!p) {
                return (
                  <div class="fente" aria-hidden="true">
                    <span class="vide" />
                    <div />
                  </div>
                );
              }
              return (
                <a class="fente" href={href(locale, `/articles/${p.slug}`)}>
                  {p.cover
                    ? (
                      <img
                        src={p.cover}
                        alt=""
                        width="192"
                        height="192"
                        decoding="async"
                        style={coverName(p.slug)}
                      />
                    )
                    : <span class="vide" />}
                  <div>
                    {p.topics[0] && <p class="spec sur">{topicLabel(locale, p.topics[0])}</p>}
                    <Title text={p.title} as="h3" />
                    <p class="spec">{d.post.minutes(p.minutes)} · {fmtDate(locale, p.publishedAt)}</p>
                  </div>
                </a>
              );
            })}
            <div class="essai">
              <img
                src="/img/service.webp"
                alt={locale === "fr"
                  ? "Les mains d’une esthéticienne aux ongles rouges roulent une serviette blanche au soleil"
                  : "An esthetician's red-nailed hands roll a white towel in the sun"}
                width="928"
                height="1152"
                decoding="async"
              />
              <div class="essai-corps">
                <h3>{d.home.tryTitle}</h3>
                <p>{d.home.tryBody}</p>
                <TryForm locale={locale} postId={une?.id} label={d.home.tryCta} />
                <VisitorIds locale={locale} />
              </div>
            </div>
          </aside>
        </section>

        <section class="atelier">
          <div class="atelier-texte revele">
            <p class="sur">{d.home.editorKicker}</p>
            <Title text={d.home.editorTitle} as="h2" />
            <p>{d.home.editorBody}</p>
            <TryForm locale={locale} postId={une?.id} label={d.home.tryCta} />
            <p class="ids">
              {d.home.noAccount} · <b>{VISITOR.username}</b> / <b>{VISITOR.password}</b>
            </p>
          </div>
          {/* Decorative: the paragraph beside it says what it shows. */}
          <div class="atelier-demo" aria-hidden="true">
            <div class="ecran ecran-source">
              <div class="ecran-barre">
                <i />
                <i />
                <i />
                <b>{d.home.demoSource}</b>
              </div>
              <pre>{demo.map((line, i) => (
                <span class="frappe" style={`--i: ${i}`}>
                  <span class="m">{prefix[i]}</span>
                  {bold(line, true)}
                </span>
              ))}</pre>
            </div>
            <div class="ecran ecran-page">
              <div class="ecran-barre">
                <i />
                <i />
                <i />
                <b>{d.home.demoPage}</b>
              </div>
              <div class="ecran-corps">
                <h3 class="sort" style="--i: 0">{demo[0]}</h3>
                <p class="sort" style="--i: 1">{bold(demo[1], false)}</p>
                <ul>
                  <li class="sort" style="--i: 2">{demo[2]}</li>
                  <li class="sort" style="--i: 3">{demo[3]}</li>
                </ul>
                <blockquote class="sort" style="--i: 4">{demo[4]}</blockquote>
              </div>
            </div>
          </div>
        </section>

        <section class="a-lire" aria-labelledby="som">
          <div class="sommaire-tete">
            <h2 id="som">{d.home.next}</h2>
            <nav class="themes" aria-label={d.nav.topics}>
              {Object.entries(d.topics).map(([slug, label]) => (
                <a key={slug} href={href(locale, `/themes/${slug}`)}>{label}</a>
              ))}
            </nav>
          </div>
          {grand
            ? (
              <div class="grille">
                <Card post={grand} locale={locale} big />
                {rest.slice(0, 2).map((p) => <Card key={p.id} post={p} locale={locale} />)}
              </div>
            )
            : <p class="vide-liste">{d.home.empty}</p>}
          {rest.slice(2).map((p) => <PostRow key={p.id} post={p} locale={locale} />)}
          <p class="suite">
            <a
              class="pill pill-ligne"
              href={href(locale, data.cursor ? `/articles?apres=${encodeURIComponent(data.cursor)}` : "/articles")}
            >
              {data.cursor ? d.home.more : d.home.all} <span class="fleche" aria-hidden="true">→</span>
            </a>
          </p>
        </section>
      </main>
      <Footer locale={locale} />
      <TryBar locale={locale} postId={une?.id} />
      <Toast toast={state.toast} />
    </>
  );
});
