// The shared Payload CMS (domain blog-demo): the only module that sends anything out. One read per language,
// kept 60 s. A read slower than 2.5 s (Cloud Run waking up) answers with the last good copy, or the fixture
// saved from a real answer, while it finishes in the background. Bodies are markdown: they go through the same
// lib/render.ts as the Deno KV posts, here at read instead of at save, once per read of the list.
import { render } from "./render.ts";
import type { Locale, Post } from "./types.ts";
import fr from "../content/cms-articles-fr.json" with { type: "json" };
import en from "../content/cms-articles-en.json" with { type: "json" };

interface Media {
  id: number;
  url: string;
  alt?: string | null;
  credit?: string | null;
  filename: string;
}

/** One `articles` doc as the REST API returns it at depth 1. */
export interface CmsDoc {
  id: number;
  title: string;
  slug: string;
  locale: Locale;
  excerpt?: string | null;
  category?: string | null;
  publishedAt?: string | null;
  updatedAt: string;
  body: string;
  hero?: Media | number | null;
  translationOf?: { id: number; slug: string } | number | null;
}

/** A CMS article, rendered: the same shape the article page gets from the store. */
export interface CmsEntry {
  post: Post;
  html: string;
  source: string;
  /** The other language's doc this one translates, when the CMS links them. */
  twinOf: number | null;
}

/** How this answer was obtained: a read made now, the 60 s memory, or a spare copy. */
export interface CmsList {
  entries: CmsEntry[];
  from: "live" | "cache" | "spare";
  /** When the copy was read from the CMS (epoch ms); 0 = the fixture in the repo. */
  at: number;
  /** How long that read took. */
  ms: number;
}

// Hosts CMS_URL may name. The CMS serves media from the same host, so these are also the only image hosts.
const ALLOWED_HOSTS = new Set([
  "localhost:4620",
  "showcase-cms-1065657380974.us-east5.run.app", // Cloud Run, live 2026-10-27
]);

export function cmsUrlAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_HOSTS.has(u.host) && (u.protocol === "https:" || u.hostname === "localhost");
  } catch {
    return false;
  }
}

export const DOMAIN = "blog-demo";
export const FIXTURES: Record<Locale, { docs: CmsDoc[] }> = {
  fr: fr as unknown as { docs: CmsDoc[] },
  en: en as unknown as { docs: CmsDoc[] },
};

const NOON = 12 * 60 * 60 * 1000;

/** A doc as a Post. The hero is kept only when it comes from `base` (a fixture saved locally names localhost). */
export function toEntry(d: CmsDoc, base: string | undefined): CmsEntry {
  const r = render(d.body, d.locale);
  const hero = typeof d.hero === "object" && d.hero && base && new URL(d.hero.url).origin === new URL(base).origin
    ? d.hero
    : null;
  const updated = Date.parse(d.updatedAt);
  const published = d.publishedAt ? Date.parse(d.publishedAt) : updated - NOON;
  return {
    post: {
      id: `cms-${d.id}`,
      locale: d.locale,
      slug: d.slug,
      title: d.title,
      excerpt: d.excerpt ?? "",
      topics: [],
      cover: hero?.url ?? "",
      coverAlt: hero?.alt ?? "",
      number: 0,
      status: "published",
      author: "",
      publishedAt: published,
      updatedAt: updated,
      createdAt: published,
      words: r.words,
      minutes: r.minutes,
      toc: r.toc,
      srcChunks: 0,
      htmlChunks: 0,
      cms: {
        id: d.id,
        category: d.category ?? "",
        media: hero ? { id: hero.id, file: hero.filename, credit: hero.credit ?? "" } : null,
      },
    },
    html: r.html,
    source: d.body,
    twinOf: typeof d.translationOf === "object" && d.translationOf ? d.translationOf.id : null,
  };
}

interface Options {
  /** CMS origin; undefined → the fixtures answer every read. */
  base?: string;
  fixtures?: Record<Locale, { docs: CmsDoc[] }>;
  fetchFn?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
}

export function createCms(o: Options) {
  const fetchFn = o.fetchFn ?? fetch;
  const now = o.now ?? Date.now;
  const ttl = o.ttlMs ?? 60_000;
  const timeout = o.timeoutMs ?? 2_500;
  const fixtures = o.fixtures ?? FIXTURES;
  const rendered = new Map<Locale, CmsEntry[]>(); // the fixtures, rendered once
  const fixtureList = (l: Locale): CmsList => {
    if (!rendered.has(l)) rendered.set(l, fixtures[l].docs.map((d) => toEntry(d, o.base)));
    return { entries: rendered.get(l)!, from: "spare", at: 0, ms: 0 };
  };
  // `checked` is when the last read ended; `at`/`ms` describe the last read that succeeded.
  const cache = new Map<Locale, { checked: number; list: CmsList }>();
  const inflight = new Map<Locale, Promise<CmsList>>();

  function read(locale: Locale): Promise<CmsList> {
    let p = inflight.get(locale);
    if (p) return p;
    const q = new URLSearchParams({
      "where[domain.slug][equals]": DOMAIN,
      "where[locale][equals]": locale,
      sort: "-publishedAt",
      depth: "1",
      limit: "100",
    });
    const started = now();
    p = fetchFn(`${o.base}/api/articles?${q}`, { headers: { accept: "application/json" } })
      .then(async (r) => {
        if (!r.ok) throw new Error(`CMS answered ${r.status}`);
        const docs = ((await r.json()) as { docs: CmsDoc[] }).docs;
        const t = now();
        const list: CmsList = { entries: docs.map((d) => toEntry(d, o.base)), from: "live", at: t, ms: t - started };
        cache.set(locale, { checked: t, list });
        return list;
      })
      .catch((e) => {
        // A failed read waits a full TTL before the next try, so a down CMS is not hammered.
        const last = cache.get(locale)?.list ?? fixtureList(locale);
        cache.set(locale, { checked: now(), list: last });
        console.error(`cms: ${DOMAIN}/${locale}: ${e}`);
        return { ...last, from: "spare" as const };
      })
      .finally(() => inflight.delete(locale));
    inflight.set(locale, p);
    return p;
  }

  async function list(locale: Locale): Promise<CmsList> {
    if (!o.base) return fixtureList(locale);
    const hit = cache.get(locale);
    if (hit && now() - hit.checked < ttl) return { ...hit.list, from: hit.list.at ? "cache" : "spare" };
    const fallback: CmsList = { ...(hit?.list ?? fixtureList(locale)), from: "spare" };
    let timer: number | undefined;
    const late = new Promise<CmsList>((resolve) => {
      timer = setTimeout(() => resolve(fallback), timeout);
    });
    try {
      return await Promise.race([read(locale), late]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    base: o.base,
    list,
    /** The article at `slug`, its twin in the other language, and how the list was read. */
    async find(locale: Locale, slug: string) {
      const other: Locale = locale === "fr" ? "en" : "fr";
      const [mine, theirs] = await Promise.all([list(locale), list(other)]);
      const entry = mine.entries.find((e) => e.post.slug === slug);
      if (!entry) return null;
      const id = entry.post.cms!.id;
      const twin = theirs.entries.find((e) => e.post.cms!.id === entry.twinOf || e.twinOf === id);
      return { ...entry, other: twin ? { locale: other, slug: twin.post.slug } : null, list: mine };
    },
    /** A slug that exists only in the other language: the slug of its twin here, to redirect to. */
    async twinSlug(locale: Locale, slug: string): Promise<string | null> {
      const other: Locale = locale === "fr" ? "en" : "fr";
      const [mine, theirs] = await Promise.all([list(locale), list(other)]);
      const there = theirs.entries.find((e) => e.post.slug === slug);
      if (!there) return null;
      const id = there.post.cms!.id;
      return mine.entries.find((e) => e.post.cms!.id === there.twinOf || e.twinOf === id)?.post.slug ?? null;
    },
  };
}

export type Cms = ReturnType<typeof createCms>;

let current: Cms | undefined;

/** The CMS this server reads: CMS_URL when it names an allowed host, else the fixtures. */
export function getCms(): Cms {
  if (current) return current;
  const url = Deno.env.get("CMS_URL")?.replace(/\/$/, "");
  if (url && !cmsUrlAllowed(url)) console.error(`cms: CMS_URL ${url} is not an allowed host; serving the fixtures`);
  return current = createCms({ base: url && cmsUrlAllowed(url) ? url : undefined });
}
