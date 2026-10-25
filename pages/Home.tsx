// The vitrine: the newest post's photo and title, the tester rail, the contents list.
import { page } from "fresh";
import { define } from "../utils.ts";
import { getStore } from "../lib/store.ts";
import { fmtDate, href, t } from "../lib/i18n.ts";
import { Footer, Masthead, PostRow, Seo, Title, Toast } from "../components/ui.tsx";
import { VISITOR } from "../lib/auth.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const store = await getStore();
    const { items, cursor } = await store.listPublished(ctx.state.locale, undefined, 12);
    return page({ items, cursor });
  },
});

export default define.page<typeof handler>(function Home({ data, state, url }) {
  const { locale } = state;
  const d = t(locale);
  const [une, ...rest] = data.items;
  const rail = rest.slice(0, 3);
  const slots = [0, 1, 2];
  return (
    <>
      <Seo locale={locale} url={url} title={d.siteTitle} description={d.siteDescription} image={une?.cover} />
      <main id="contenu">
        <section class="vitrine">
          <article class={une ? "une" : "une une-vide"}>
            {une?.cover && (
              <img class="photo" src={une.cover} alt={une.coverAlt} width="1600" height="1067" fetchpriority="high" />
            )}
            <Masthead locale={locale} path={url.pathname} />
            <div class="une-texte">
              {une
                ? (
                  <>
                    <Title text={une.title} />
                    <p class="spec">
                      <span class="allume">{d.home.newBadge}</span>
                      <span>
                        N° {String(une.number).padStart(2, "0")} · {d.post.reading(une.minutes)} ·{" "}
                        {d.post.words(une.words)}
                      </span>
                    </p>
                    <a class="pill pill-blanc" href={href(locale, `/articles/${une.slug}`)}>
                      {d.home.read} <span class="fleche" aria-hidden="true">→</span>
                    </a>
                  </>
                )
                : <h1>{d.home.empty}</h1>}
            </div>
          </article>

          <aside class="presentoir" aria-labelledby="nouv">
            <h2 id="nouv">{d.home.news}</h2>
            {slots.map((i) => {
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
                    ? <img src={p.cover} alt="" width="192" height="192" loading="lazy" decoding="async" />
                    : <span class="vide" />}
                  <div>
                    <div class="no">N° {String(p.number).padStart(2, "0")}</div>
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
                loading="lazy"
                decoding="async"
              />
              <div class="essai-corps">
                <h3>{d.home.tryTitle}</h3>
                <p>{d.home.tryBody}</p>
                <dl>
                  <dt>{d.home.username}</dt>
                  <dd>{VISITOR.username}</dd>
                  <dt>{d.home.password}</dt>
                  <dd>{VISITOR.password}</dd>
                </dl>
                <a class="pill pill-rouge" href={href(locale, "/connexion")}>
                  {d.home.tryCta} <span class="fleche" aria-hidden="true">→</span>
                </a>
              </div>
            </div>
          </aside>
        </section>

        <section class="sommaire" aria-labelledby="som">
          <div class="sommaire-tete">
            <h2 id="som">{d.home.all}</h2>
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
      </main>
      <Footer locale={locale} />
      <Toast toast={state.toast} />
    </>
  );
});
