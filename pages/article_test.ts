import { assertEquals } from "@std/assert";
import { whatNext } from "./Article.tsx";
import type { Post, PostSummary } from "../lib/types.ts";

const p = (id: string, topics: string[]) => ({ id, topics }) as PostSummary;
// newest first, as the feed is
const feed = [p("a", ["x"]), p("b", ["y"]), p("c", ["x"]), p("d", ["z"]), p("e", ["x", "y"])];
const ids = (r: ReturnType<typeof whatNext>) => [r.next?.id, ...r.related.map((x) => x.id)];

Deno.test("the end of an article: the older post next, then two sharing a topic", () => {
  assertEquals(ids(whatNext(feed[0] as Post, feed)), ["b", "c", "e"]);
  // the oldest wraps to the newest
  assertEquals(ids(whatNext(feed[4] as Post, feed)), ["a", "b", "c"]);
  // a post older than the feed starts again at the newest; a lone post has nothing next
  assertEquals(ids(whatNext(p("old", ["z"]) as Post, feed)), ["a", "d", "b"]);
  assertEquals(ids(whatNext(feed[0] as Post, [feed[0]])), [undefined]);
});
