import { assertEquals } from "@std/assert";
import { type CmsDoc, cmsUrlAllowed, createCms, FIXTURES, toEntry } from "./cms.ts";

const BASE = "http://localhost:4620";
const doc = (id: number, slug: string, extra: Partial<CmsDoc> = {}): CmsDoc => ({
  id,
  slug,
  title: `Titre *${slug}*`,
  locale: "fr",
  updatedAt: "2026-10-27T22:00:00.000Z",
  publishedAt: "2026-10-27T15:00:00.000Z",
  body: "## Un intertitre\n\nDu **gras** et <script>alert(1)</script> rien d’autre.",
  ...extra,
});
const answer = (docs: CmsDoc[]) => new Response(JSON.stringify({ docs }), { status: 200 });

Deno.test("cmsUrlAllowed accepts only the listed hosts, https outside localhost", () => {
  assertEquals(cmsUrlAllowed("http://localhost:4620"), true);
  assertEquals(cmsUrlAllowed("https://showcase-cms-1065657380974.us-east5.run.app"), true);
  assertEquals(cmsUrlAllowed("http://showcase-cms-1065657380974.us-east5.run.app"), false);
  assertEquals(cmsUrlAllowed("http://localhost:9999"), false);
  assertEquals(cmsUrlAllowed("https://evil.example"), false);
  assertEquals(cmsUrlAllowed("not a url"), false);
});

Deno.test("toEntry renders the body with the KV posts' renderer, and keeps only photos from the CMS host", () => {
  const hero = { id: 8, url: `${BASE}/api/media/file/a.webp`, alt: "Vernis", credit: "Pexels", filename: "a.webp" };
  const e = toEntry(doc(4, "a", { hero, translationOf: { id: 7, slug: "a" } }), BASE);
  assertEquals(e.html.includes("<script"), false);
  assertEquals(e.html.includes('<h2 id="un-intertitre">'), true);
  assertEquals(e.post.toc, [{ id: "un-intertitre", text: "Un intertitre", level: 2 }]);
  assertEquals(e.post.cover, hero.url);
  assertEquals(e.post.cms, { id: 4, category: "", media: { id: 8, file: "a.webp", credit: "Pexels" } });
  assertEquals(e.twinOf, 7);
  // A fixture saved from the local CMS names localhost: never an <img> on another host.
  assertEquals(toEntry(doc(4, "a", { hero }), "https://showcase-cms-1065657380974.us-east5.run.app").post.cover, "");
  assertEquals(toEntry(doc(4, "a", { hero }), undefined).post.cover, "");
});

Deno.test("list: 60 s memory, one read for parallel callers, the source of each answer", async () => {
  let t = 1_000, calls = 0;
  const cms = createCms({
    base: BASE,
    now: () => t,
    fetchFn: () => (calls++, Promise.resolve(answer([doc(4, "a")]))),
  });
  const [a, b] = await Promise.all([cms.list("fr"), cms.list("fr")]);
  assertEquals([calls, a.from, b.from, a.entries[0].post.slug], [1, "live", "live", "a"]);
  t = 60_000;
  assertEquals((await cms.list("fr")).from, "cache");
  t = 62_000;
  assertEquals((await cms.list("fr")).from, "live");
  assertEquals(calls, 2);
});

Deno.test("list: a failed read answers the last good copy, then the fixture, and waits a TTL to retry", async () => {
  let t = 1_000, up = true, calls = 0;
  const cms = createCms({
    base: BASE,
    now: () => t,
    fetchFn: () => (calls++, up ? Promise.resolve(answer([doc(4, "a")])) : Promise.reject(new Error("down"))),
  });
  await cms.list("fr");
  up = false;
  t = 62_000;
  const stale = await cms.list("fr");
  assertEquals([stale.from, stale.at, stale.entries[0].post.slug], ["spare", 1_000, "a"]);
  t = 63_000;
  assertEquals((await cms.list("fr")).at, 1_000); // the last good copy, with its age
  assertEquals(calls, 2); // no new read inside the TTL after a failure
  const cold = createCms({ base: BASE, fetchFn: () => Promise.reject(new Error("down")) });
  const spare = await cold.list("en");
  assertEquals([spare.from, spare.at, spare.entries.length], ["spare", 0, FIXTURES.en.docs.length]);
});

Deno.test("list: a read slower than the timeout answers the spare copy and finishes in the background", async () => {
  let release: (r: Response) => void = () => {};
  const cms = createCms({
    base: BASE,
    timeoutMs: 10,
    fetchFn: () => new Promise<Response>((r) => release = r),
  });
  const first = await cms.list("fr");
  assertEquals([first.from, first.at], ["spare", 0]);
  release(answer([doc(4, "late")]));
  await new Promise((r) => setTimeout(r, 0));
  assertEquals((await cms.list("fr")).entries[0].post.slug, "late");
});

Deno.test("find links twins both ways; twinSlug sends a slug from the other language to its twin", async () => {
  const fr = [doc(1, "un-seul-endroit")];
  const en = [doc(2, "one-place", { locale: "en", translationOf: { id: 1, slug: "un-seul-endroit" } })];
  const cms = createCms({
    base: BASE,
    fetchFn: (url) => Promise.resolve(answer(String(url).includes("=en") ? en : fr)),
  });
  assertEquals((await cms.find("fr", "un-seul-endroit"))?.other, { locale: "en", slug: "one-place" });
  assertEquals((await cms.find("en", "one-place"))?.other, { locale: "fr", slug: "un-seul-endroit" });
  assertEquals(await cms.find("fr", "nope"), null);
  assertEquals(await cms.twinSlug("en", "un-seul-endroit"), "one-place");
  assertEquals(await cms.twinSlug("fr", "nope"), null);
});

Deno.test("no CMS_URL: the fixtures answer, saved from a real answer of the CMS", async () => {
  const cms = createCms({});
  const fr = await cms.list("fr");
  assertEquals(fr.from, "spare");
  assertEquals(fr.entries.map((e) => e.post.slug).includes("d-ou-viennent-ces-articles"), true);
  assertEquals(fr.entries.every((e) => e.post.cms && e.html.length > 0), true);
});
