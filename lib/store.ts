// The only module that touches Deno KV. Every write is one atomic operation over the post
// and everything derived from it, so a post is never half-saved.
//
// Keys (times are UTC epoch ms):
//   ["posts", id]                                  Post (metadata, no body)
//   ["src", id, n] / ["html", id, n]               body chunks, CHUNK units each
//   ["slug", locale, slug]                          id
//   ["feed", locale, publishedAt, id]               PostSummary, published only
//   ["tagfeed", locale, topic, publishedAt, id]     PostSummary, published only
//   ["sessions", sid]                               Session, expires by itself
//   ["meta", "seeded"]                              { version, at }
import { extract } from "@std/front-matter/yaml";
import { getKv } from "./kv.ts";
import { render } from "./render.ts";
import type { Locale, Post, PostInput, PostSummary, Role, Session, Status } from "./types.ts";

/** Measured 2026-10-25 (local KV, deno 2.9.7): a value holds at most 65,536 bytes and an
 * atomic write 819,200. French text is two bytes a unit (’ is not Latin-1), so 30,000 units
 * is ~60 KB, and a 100,000-unit post plus its HTML stays under one atomic write. */
export const CHUNK = 30_000;
export const MAX_SOURCE = 100_000;
const SEED_VERSION = 1;
const SESSION_MS = 24 * 60 * 60 * 1000;
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Thrown by every write a non-admin attempts. Routes turn it into the demo toast. */
export class DemoRefusal extends Error {
  constructor() {
    super("demo: visitors cannot write");
  }
}

function assertAdmin(role: Role | null): void {
  if (role !== "admin") throw new DemoRefusal();
}

function chunks(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += CHUNK) out.push(s.slice(i, i + CHUNK));
  return out.length ? out : [""];
}

function summary(p: Post): PostSummary {
  const { createdAt: _c, toc: _t, srcChunks: _s, htmlChunks: _h, ...rest } = p;
  return rest;
}

async function readChunks(kv: Deno.Kv, kind: "src" | "html", id: string): Promise<string> {
  let out = "";
  for await (const e of kv.list<string>({ prefix: [kind, id] })) out += e.value;
  return out;
}

export interface Page<T> {
  items: T[];
  cursor?: string;
}

export type SaveResult = { ok: true; id: string; post: Post } | { ok: false; errors: string[] };

/** Validates a form, returning human-readable problems (empty when fine). */
export function validate(input: PostInput): string[] {
  const e: string[] = [];
  if (!input.title.trim() || input.title.length > 160) e.push("title: 1–160 characters");
  if (!SLUG.test(input.slug) || input.slug.length > 80) {
    e.push("slug: lowercase letters, digits and dashes, 80 at most");
  }
  if (input.excerpt.length > 320) e.push("excerpt: 320 characters at most");
  if (input.topics.some((t) => !SLUG.test(t)) || input.topics.length > 6) {
    e.push("topics: up to 6, lowercase and dashes");
  }
  if (input.cover && !input.cover.startsWith("/img/")) e.push("cover: must be one of the site's photos (/img/…)");
  if (input.source.length > MAX_SOURCE) e.push(`text: ${MAX_SOURCE.toLocaleString("en")} characters at most`);
  if (input.locale !== "fr" && input.locale !== "en") e.push("locale: fr or en");
  return e;
}

export function createStore(kv: Deno.Kv) {
  /** Writes `next` and its derived keys, removing what `prev` had. One atomic operation. */
  async function write(prev: Deno.KvEntryMaybe<Post> | null, next: Post, source: string, html: string) {
    const src = chunks(source), out = chunks(html);
    const op = kv.atomic();
    if (prev) op.check(prev);
    const slugKey = ["slug", next.locale, next.slug];
    const owner = await kv.get<string>(slugKey);
    if (owner.value && owner.value !== next.id) return false;
    op.check(owner);

    const old = prev?.value;
    if (old) {
      for (let i = src.length; i < old.srcChunks; i++) op.delete(["src", old.id, i]);
      for (let i = out.length; i < old.htmlChunks; i++) op.delete(["html", old.id, i]);
      if (old.slug !== next.slug || old.locale !== next.locale) op.delete(["slug", old.locale, old.slug]);
      if (old.status === "published") {
        op.delete(["feed", old.locale, old.publishedAt, old.id]);
        for (const t of old.topics) op.delete(["tagfeed", old.locale, t, old.publishedAt, old.id]);
      }
    }
    next.srcChunks = src.length;
    next.htmlChunks = out.length;
    op.set(["posts", next.id], next);
    src.forEach((c, i) => op.set(["src", next.id, i], c));
    out.forEach((c, i) => op.set(["html", next.id, i], c));
    op.set(slugKey, next.id);
    if (next.status === "published") {
      const s = summary(next);
      op.set(["feed", next.locale, next.publishedAt, next.id], s);
      for (const t of next.topics) op.set(["tagfeed", next.locale, t, next.publishedAt, next.id], s);
    }
    return (await op.commit()).ok;
  }

  async function nextNumber(locale: Locale): Promise<number> {
    let max = 0;
    for await (const e of kv.list<Post>({ prefix: ["posts"] })) {
      if (e.value.locale === locale) max = Math.max(max, e.value.number);
    }
    return max + 1;
  }

  async function wipePosts() {
    for (const prefix of ["posts", "src", "html", "slug", "feed", "tagfeed"]) {
      const keys: Deno.KvKey[] = [];
      for await (const e of kv.list({ prefix: [prefix] })) keys.push(e.key);
      for (let i = 0; i < keys.length; i += 500) {
        const op = kv.atomic();
        keys.slice(i, i + 500).forEach((k) => op.delete(k));
        await op.commit();
      }
    }
  }

  async function seed() {
    for (const locale of ["fr", "en"] as const) {
      for await (const f of Deno.readDir(`content/${locale}`)) {
        if (!f.name.endsWith(".md")) continue;
        const { attrs, body } = extract<Record<string, unknown>>(
          await Deno.readTextFile(`content/${locale}/${f.name}`),
        );
        const r = render(body, locale);
        if (r.errors.length) throw new Error(`seed ${locale}/${f.name}: ${r.errors.join("; ")}`);
        // YAML reads 2026-10-24 as UTC midnight, which Toronto shows as the 23rd: use noon.
        const d = attrs.publishedAt instanceof Date ? attrs.publishedAt : new Date(String(attrs.publishedAt));
        const at = d.getTime() + 12 * 60 * 60 * 1000;
        const post: Post = {
          id: crypto.randomUUID(),
          locale,
          slug: String(attrs.slug),
          title: String(attrs.title),
          excerpt: String(attrs.excerpt ?? ""),
          topics: (attrs.topics as string[]) ?? [],
          cover: String(attrs.cover ?? ""),
          coverAlt: String(attrs.coverAlt ?? ""),
          number: Number(attrs.number),
          status: "published",
          author: String(attrs.author ?? ""),
          publishedAt: at,
          updatedAt: at,
          createdAt: at,
          words: r.words,
          minutes: r.minutes,
          toc: r.toc,
          srcChunks: 0,
          htmlChunks: 0,
        };
        if (!await write(null, post, body, r.html)) throw new Error(`seed ${locale}/${f.name}: slug taken`);
      }
    }
    await kv.set(["meta", "seeded"], { version: SEED_VERSION, at: Date.now() });
  }

  return {
    // ---------- reads (public) ----------
    async listPublished(locale: Locale, cursor?: string, limit = 20): Promise<Page<PostSummary>> {
      const it = kv.list<PostSummary>({ prefix: ["feed", locale] }, { reverse: true, limit, cursor });
      const items: PostSummary[] = [];
      for await (const e of it) items.push(e.value);
      return { items, cursor: items.length === limit ? it.cursor : undefined };
    },

    async listByTopic(locale: Locale, topic: string, cursor?: string, limit = 20): Promise<Page<PostSummary>> {
      const it = kv.list<PostSummary>({ prefix: ["tagfeed", locale, topic] }, { reverse: true, limit, cursor });
      const items: PostSummary[] = [];
      for await (const e of it) items.push(e.value);
      return { items, cursor: items.length === limit ? it.cursor : undefined };
    },

    /** A published post with its HTML and source, or null. */
    async getBySlug(locale: Locale, slug: string) {
      const id = (await kv.get<string>(["slug", locale, slug])).value;
      if (!id) return null;
      const post = (await kv.get<Post>(["posts", id])).value;
      if (!post || post.status !== "published") return null;
      const [html, source] = await Promise.all([readChunks(kv, "html", id), readChunks(kv, "src", id)]);
      return { post, html, source };
    },

    /** The same slug in the other language, when it is published. */
    async counterpart(post: PostSummary): Promise<PostSummary | null> {
      const other: Locale = post.locale === "fr" ? "en" : "fr";
      const id = (await kv.get<string>(["slug", other, post.slug])).value;
      const p = id ? (await kv.get<Post>(["posts", id])).value : null;
      return p?.status === "published" ? summary(p) : null;
    },

    // ---------- reads (admin; visitors see the same screens) ----------
    async listAll(status?: Status): Promise<PostSummary[]> {
      const out: PostSummary[] = [];
      for await (const e of kv.list<Post>({ prefix: ["posts"] })) {
        if (!status || e.value.status === status) out.push(summary(e.value));
      }
      return out.sort((a, b) => (b.publishedAt || b.updatedAt) - (a.publishedAt || a.updatedAt));
    },

    async getForEdit(id: string) {
      const post = (await kv.get<Post>(["posts", id])).value;
      return post ? { post, source: await readChunks(kv, "src", id) } : null;
    },

    // ---------- writes: admin only ----------
    async savePost(role: Role | null, id: string | null, input: PostInput, now = Date.now()): Promise<SaveResult> {
      assertAdmin(role);
      const errors = validate(input);
      const r = render(input.source, input.locale);
      errors.push(...r.errors);
      if (errors.length) return { ok: false, errors };

      const prev = id ? await kv.get<Post>(["posts", id]) : null;
      if (id && !prev?.value) return { ok: false, errors: ["post: not found"] };
      const old = prev?.value;
      const publishedAt = input.status === "published"
        ? (old?.status === "published" ? old.publishedAt : now)
        : (old?.publishedAt ?? 0);
      const post: Post = {
        id: old?.id ?? crypto.randomUUID(),
        locale: input.locale,
        slug: input.slug,
        title: input.title.trim(),
        excerpt: input.excerpt.trim(),
        topics: input.topics,
        cover: input.cover,
        coverAlt: input.coverAlt.trim(),
        number: old && old.locale === input.locale ? old.number : await nextNumber(input.locale),
        status: input.status,
        author: old?.author ?? "Luke Sidney",
        publishedAt,
        updatedAt: now,
        createdAt: old?.createdAt ?? now,
        words: r.words,
        minutes: r.minutes,
        toc: r.toc,
        srcChunks: 0,
        htmlChunks: 0,
      };
      if (!await write(prev, post, input.source, r.html)) {
        return { ok: false, errors: ["slug: already used by another post, or the post changed meanwhile — reload"] };
      }
      return { ok: true, id: post.id, post };
    },

    async deletePost(role: Role | null, id: string): Promise<boolean> {
      assertAdmin(role);
      const prev = await kv.get<Post>(["posts", id]);
      const p = prev.value;
      if (!p) return false;
      const op = kv.atomic().check(prev).delete(["posts", id]).delete(["slug", p.locale, p.slug]);
      for (let i = 0; i < p.srcChunks; i++) op.delete(["src", id, i]);
      for (let i = 0; i < p.htmlChunks; i++) op.delete(["html", id, i]);
      if (p.status === "published") {
        op.delete(["feed", p.locale, p.publishedAt, id]);
        for (const t of p.topics) op.delete(["tagfeed", p.locale, t, p.publishedAt, id]);
      }
      return (await op.commit()).ok;
    },

    /** Every post, drafts included, as plain markdown sources. */
    async exportAll(role: Role | null) {
      assertAdmin(role);
      const posts = [];
      for await (const e of kv.list<Post>({ prefix: ["posts"] })) {
        const { toc: _t, srcChunks: _s, htmlChunks: _h, ...meta } = e.value;
        posts.push({ ...meta, source: await readChunks(kv, "src", e.value.id) });
      }
      return { app: "cerise", exportedAt: new Date().toISOString(), posts };
    },

    async restoreSeed(role: Role | null) {
      assertAdmin(role);
      await wipePosts();
      await seed();
    },

    /** Loads content/*.md into an empty store. A deploy never overwrites edits. */
    async ensureSeeded() {
      if ((await kv.get(["meta", "seeded"])).value) return;
      await wipePosts();
      await seed();
    },

    async isSeeded(): Promise<boolean> {
      return Boolean((await kv.get(["meta", "seeded"])).value);
    },

    // ---------- sessions ----------
    async createSession(role: Role): Promise<string> {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const sid = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      await kv.set(["sessions", sid], { role, exp: Date.now() + SESSION_MS } satisfies Session, {
        expireIn: SESSION_MS,
      });
      return sid;
    },

    async getSession(sid: string): Promise<Session | null> {
      const s = (await kv.get<Session>(["sessions", sid])).value;
      return s && s.exp > Date.now() ? s : null;
    },

    async deleteSession(sid: string): Promise<void> {
      await kv.delete(["sessions", sid]);
    },
  };
}

export type Store = ReturnType<typeof createStore>;

let shared: Promise<Store> | undefined;
/** The app's store on this isolate's KV handle. Routes use this, never KV itself. */
export function getStore(): Promise<Store> {
  return shared ??= getKv().then(({ kv }) => createStore(kv));
}

/** Every key in the store, for the visitor-write test (the rung-2 deletion test). */
export async function snapshot(kv: Deno.Kv): Promise<string> {
  const rows: string[] = [];
  for await (const e of kv.list({ prefix: [] })) rows.push(JSON.stringify([e.key, e.versionstamp]));
  return rows.join("\n");
}
