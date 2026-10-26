// The shared pieces of every public page. Small enough to live in one file.
import { Head } from "fresh/runtime";
import type { ComponentChildren } from "preact";
import type { Locale, PostSummary, Toast as ToastT } from "../lib/types.ts";
import { fmtDate, href, swapLocale, t, topicLabel } from "../lib/i18n.ts";
import { plainTitle, titleHtml } from "../lib/markdown.ts";
import { VISITOR } from "../lib/auth.ts";

export function Seo(
  { locale, url, title, description, image, alternate = true }: {
    locale: Locale;
    url: URL;
    title: string;
    description: string;
    image?: string;
    /** false when the page has no twin in the other language */
    alternate?: boolean;
  },
) {
  const abs = (p: string) => new URL(p, url.origin).href;
  const self = url.pathname;
  const fr = locale === "fr" ? self : swapLocale(self);
  const en = locale === "en" ? self : swapLocale(self);
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={abs(self)} />
      {alternate && <link rel="alternate" hreflang="fr-CA" href={abs(fr)} />}
      {alternate && <link rel="alternate" hreflang="en-CA" href={abs(en)} />}
      <meta property="og:type" content="article" />
      <meta property="og:site_name" content="cerise" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={abs(image ?? "/img/vitrine.webp")} />
      <link rel="alternate" type="application/rss+xml" title="cerise" href={abs(href(locale, "/rss.xml"))} />
    </Head>
  );
}

/** HTML that lib/render.ts rendered and sanitized once, at save. Never anything else. */
export function StoredHtml({ html, class: cls }: { html: string; class: string }) {
  // deno-lint-ignore react-no-danger -- sanitized by lib/render.ts's allow-list when the post was saved
  return <div class={cls} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** A title whose *one phrase* is the accent. titleHtml escapes everything else. */
export function Title({ text, as: Tag = "h1" }: { text: string; as?: "h1" | "h2" | "h3" }) {
  // deno-lint-ignore react-no-danger -- titleHtml escapes the text and adds only <em class="accent">
  return <Tag dangerouslySetInnerHTML={{ __html: titleHtml(text) }} />;
}

export function Masthead(
  { locale, path, current }: { locale: Locale; path: string; current?: "articles" | "topics" },
) {
  const d = t(locale).nav;
  return (
    <header class="barre">
      <a class="marque" href={href(locale, "/")} aria-current="false">
        cerise<span>.</span>
      </a>
      <nav aria-label={locale === "fr" ? "Principale" : "Main"}>
        <a href={href(locale, "/articles")} aria-current={current === "articles" ? "page" : "false"}>{d.articles}</a>
        <a href={href(locale, "/themes")} aria-current={current === "topics" ? "page" : "false"}>{d.topics}</a>
        <a class="garde" href={swapLocale(path)} lang={locale === "fr" ? "en" : "fr"} aria-label={d.otherLabel}>
          {d.other}
        </a>
        <a class="garde connexion-lien" href={href(locale, "/connexion")}>{d.signIn}</a>
        <form class="mode" method="post" action="/mode">
          <input type="hidden" name="back" value={path} />
          <button type="submit" name="mode" value="dark" aria-label={d.dark} title={d.dark}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" />
            </svg>
          </button>
          <button type="submit" name="mode" value="light" aria-label={d.light} title={d.light}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
              <circle cx="12" cy="12" r="4.5" fill="currentColor" />
              <path
                d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </form>
      </nav>
    </header>
  );
}

/** One tap into the editor: signs in as the visitor (the public demo account) and opens `postId`. */
export function TryForm(
  { locale, postId, label, class: cls = "pill pill-rouge" }: {
    locale: Locale;
    postId?: string;
    label: string;
    class?: string;
  },
) {
  return (
    <form method="post" action={href(locale, "/connexion")}>
      <input type="hidden" name="username" value={VISITOR.username} />
      <input type="hidden" name="password" value={VISITOR.password} />
      <input type="hidden" name="next" value={href(locale, postId ? `/admin/posts/${postId}` : "/admin")} />
      <button class={cls} type="submit">
        {label} <span class="fleche" aria-hidden="true">→</span>
      </button>
    </form>
  );
}

/** The visitor login, printed: it is public on purpose. */
export function VisitorIds({ locale }: { locale: Locale }) {
  return (
    <p class="ids">
      {t(locale).home.visitor} : <b>{VISITOR.username}</b> / <b>{VISITOR.password}</b>
    </p>
  );
}

/** Phones only: the editor one tap away, pinned to the bottom of the screen. */
export function TryBar({ locale, postId }: { locale: Locale; postId?: string }) {
  return (
    <div class="barre-essai">
      <TryForm locale={locale} postId={postId} label={t(locale).home.tryBar} />
      <span class="ids">
        <b>{VISITOR.username}</b> / <b>{VISITOR.password}</b>
      </span>
    </div>
  );
}

/** A post's photo carries its view-transition name, so it travels into the article's cover. */
export const coverName = (slug: string) => `view-transition-name: p-${slug}`;

/** A magazine card (home, end of an article). `big` spans the row, photo beside the text. */
export function Card({ post, locale, big = false }: { post: PostSummary; locale: Locale; big?: boolean }) {
  const d = t(locale);
  return (
    <a class={`carte revele${big ? " carte-grand" : ""}`} href={href(locale, `/articles/${post.slug}`)}>
      <div class="carte-photo">
        {post.cover && (
          <img
            src={post.cover}
            alt=""
            loading="lazy"
            decoding="async"
            width="1067"
            height="1334"
            style={coverName(post.slug)}
          />
        )}
      </div>
      <div class="carte-texte">
        {post.topics[0] && <p class="sur">{topicLabel(locale, post.topics[0])}</p>}
        <Title text={post.title} as="h3" />
        {post.excerpt && <p class="extrait">{post.excerpt}</p>}
        <p class="spec">{fmtDate(locale, post.publishedAt)} · {d.post.minutes(post.minutes)}</p>
      </div>
    </a>
  );
}

export function Footer({ locale }: { locale: Locale }) {
  const d = t(locale);
  return (
    <footer class="pied">
      <div class="pied-haut">
        <a class="marque" href={href(locale, "/")}>
          cerise<span>.</span>
        </a>
        <nav aria-label={locale === "fr" ? "Pied de page" : "Footer"}>
          <a href={href(locale, "/articles")}>{d.nav.articles}</a>
          <a href={href(locale, "/rss.xml")}>{d.footer.rss}</a>
          <a href={href(locale, "/connexion")}>{d.nav.signIn}</a>
          <a href={locale === "fr" ? "/en" : "/"} lang={locale === "fr" ? "en" : "fr"}>{d.nav.otherLabel}</a>
        </nav>
      </div>
      <p>{d.footer.note} {d.footer.photos}</p>
    </footer>
  );
}

export function Toast({ toast }: { toast?: ToastT }) {
  if (!toast) return null;
  return (
    <div class={`toast toast--${toast.kind}`} role="status">
      <div class="toast-corps">
        <strong>{toast.title}</strong>
        {toast.body && <p>{toast.body}</p>}
      </div>
    </div>
  );
}

/** One row of the contents list (home, archive, topic). */
export function PostRow({ post, locale }: { post: PostSummary; locale: Locale }) {
  const d = t(locale);
  return (
    <a class="ligne" href={href(locale, `/articles/${post.slug}`)}>
      <div class="no">{String(post.number).padStart(2, "0")}</div>
      <div>
        <Title text={post.title} as="h3" />
        {post.excerpt && <p>{post.excerpt}</p>}
        <p class="spec">
          {fmtDate(locale, post.publishedAt)} · {d.post.minutes(post.minutes)}
          {post.topics[0] ? ` · ${topicLabel(locale, post.topics[0])}` : ""}
        </p>
      </div>
      {post.cover ? <img src={post.cover} alt="" loading="lazy" decoding="async" width="320" height="400" /> : <span />}
    </a>
  );
}

export function PageShell(
  { locale, path, current, toast, children }: {
    locale: Locale;
    path: string;
    current?: "articles" | "topics";
    toast?: ToastT;
    children: ComponentChildren;
  },
) {
  return (
    <>
      <div class="bande">
        <Masthead locale={locale} path={path} current={current} />
      </div>
      <main id="contenu">{children}</main>
      <Footer locale={locale} />
      <Toast toast={toast} />
    </>
  );
}

export { plainTitle };
