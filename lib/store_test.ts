import { assert, assertEquals, assertRejects } from "@std/assert";
import { CHUNK, createStore, DemoRefusal, snapshot } from "./store.ts";
import type { PostInput } from "./types.ts";

const input = (over: Partial<PostInput> = {}): PostInput => ({
  locale: "fr",
  slug: "un-essai",
  title: "Un *essai*",
  excerpt: "Court.",
  topics: ["ecrire"],
  cover: "/img/posts/ecrivez-comme-vous-parlez.webp",
  coverAlt: "Une bouche",
  status: "published",
  source: "## Bonjour\n\nUn texte.",
  ...over,
});

async function fresh() {
  const kv = await Deno.openKv(":memory:");
  return { kv, store: createStore(kv) };
}

Deno.test("seed loads every post, newest first, per locale", async () => {
  const { kv, store } = await fresh();
  await store.ensureSeeded();
  const fr = await store.listPublished("fr");
  const en = await store.listPublished("en");
  assertEquals(fr.items.length, 6);
  assertEquals(en.items.length, 6);
  assertEquals(fr.items[0].slug, "ecrivez-comme-vous-parlez");
  assertEquals(fr.items.map((p) => p.number), [6, 5, 4, 3, 2, 1]);
  const page = await store.getBySlug("fr", "ecrivez-comme-vous-parlez");
  assert(page?.html.includes("<h2"));
  assertEquals((await store.counterpart(page!.post))?.locale, "en");
  // a second call never reseeds
  const before = await snapshot(kv);
  await store.ensureSeeded();
  assertEquals(await snapshot(kv), before);
  kv.close();
});

Deno.test("a visitor's writes change nothing (the deletion test)", async () => {
  const { kv, store } = await fresh();
  await store.ensureSeeded();
  const before = await snapshot(kv);
  const id = (await store.listAll())[0].id;
  await assertRejects(() => store.savePost("visitor", null, input()), DemoRefusal);
  await assertRejects(() => store.savePost("visitor", id, input()), DemoRefusal);
  await assertRejects(() => store.savePost(null, null, input()), DemoRefusal);
  await assertRejects(() => store.deletePost("visitor", id), DemoRefusal);
  await assertRejects(() => store.restoreSeed("visitor"), DemoRefusal);
  await assertRejects(() => store.exportAll("visitor"), DemoRefusal);
  assertEquals(await snapshot(kv), before);
  kv.close();
});

Deno.test("long posts are chunked and read back whole", async () => {
  const { kv, store } = await fresh();
  const body = ("Une phrase qu’on lit jusqu’au bout. ".repeat(80) + "\n\n").repeat(30);
  assert(body.length > 2 * CHUNK);
  const r = await store.savePost("admin", null, input({ source: body }));
  assert(r.ok);
  assert(r.post.srcChunks >= 3);
  const back = await store.getForEdit(r.id);
  assertEquals(back?.source, body);
  kv.close();
});

Deno.test("slugs are unique per locale; edits move the slug and feeds", async () => {
  const { kv, store } = await fresh();
  const a = await store.savePost("admin", null, input());
  assert(a.ok);
  const clash = await store.savePost("admin", null, input({ title: "Autre" }));
  assert(!clash.ok);
  const en = await store.savePost("admin", null, input({ locale: "en" }));
  assert(en.ok, "same slug in the other locale is its translation");
  const moved = await store.savePost("admin", a.id, input({ slug: "nouvelle-adresse", topics: ["outils"] }));
  assert(moved.ok);
  assertEquals(await store.getBySlug("fr", "un-essai"), null);
  assertEquals((await store.listByTopic("fr", "ecrire")).items.length, 0);
  assertEquals((await store.listByTopic("fr", "outils")).items.length, 1);
  kv.close();
});

Deno.test("draft, publish, unpublish, delete leave no stray keys", async () => {
  const { kv, store } = await fresh();
  const empty = await snapshot(kv);
  const d = await store.savePost("admin", null, input({ status: "draft" }));
  assert(d.ok);
  assertEquals((await store.listPublished("fr")).items.length, 0);
  const p = await store.savePost("admin", d.id, input({ status: "published" }), 1_000);
  assert(p.ok && p.post.publishedAt === 1_000);
  const again = await store.savePost("admin", d.id, input({ status: "published", title: "Encore" }), 2_000);
  assert(again.ok && again.post.publishedAt === 1_000, "editing keeps the publication date");
  const u = await store.savePost("admin", d.id, input({ status: "draft" }));
  assert(u.ok);
  assertEquals((await store.listPublished("fr")).items.length, 0);
  assert(await store.deletePost("admin", d.id));
  assertEquals(await snapshot(kv), empty);
  kv.close();
});

Deno.test("invalid input is refused with reasons", async () => {
  const { kv, store } = await fresh();
  const r = await store.savePost(
    "admin",
    null,
    input({ slug: "Pas Bon", cover: "https://x/y.jpg", source: "<Video />" }),
  );
  assert(!r.ok);
  assertEquals(r.errors.length, 3);
  kv.close();
});

Deno.test("restore seed replaces edits; export carries sources", async () => {
  const { kv, store } = await fresh();
  await store.ensureSeeded();
  await store.savePost("admin", null, input());
  assertEquals((await store.listAll()).length, 13);
  await store.restoreSeed("admin");
  assertEquals((await store.listAll()).length, 12);
  const out = await store.exportAll("admin");
  assertEquals(out.posts.length, 12);
  assert(out.posts.every((p) => p.source.length > 100));
  kv.close();
});

Deno.test("sessions expire and can be deleted", async () => {
  const { kv, store } = await fresh();
  const sid = await store.createSession("visitor");
  assertEquals((await store.getSession(sid))?.role, "visitor");
  await store.deleteSession(sid);
  assertEquals(await store.getSession(sid), null);
  assertEquals(await store.getSession("nope"), null);
  kv.close();
});
