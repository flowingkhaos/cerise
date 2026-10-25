import { assert, assertEquals } from "@std/assert";
import { type Command, EditorState, TextSelection, type Transaction } from "prosemirror-state";
import { insertFigure, insertHr, safeHref, setLink, toggleList, toggleWrap } from "./commands.ts";
import { parse, serialize } from "./markdown.ts";
import { schema } from "./schema.ts";

const MARK = "\u2063"; // invisible separator: stands in for the cursor while parsing

/** Run a command on markdown with the cursor (or selection) at the `|` marks; return markdown. */
function run(source: string, cmd: Command): string {
  const marked = parse(source.replaceAll("|", MARK));
  const at: number[] = [];
  marked.descendants((n, pos) => {
    for (let i = n.text?.indexOf(MARK) ?? -1; i >= 0; i = n.text!.indexOf(MARK, i + 1)) at.push(pos + i);
  });
  const tr = EditorState.create({ doc: marked }).tr;
  for (const pos of [...at].reverse()) tr.delete(pos, pos + 1);
  const selection = TextSelection.create(tr.doc, at[0], at.length > 1 ? at[1] - 1 : at[0]);
  let state = EditorState.create({ doc: tr.doc, selection });
  assert(cmd(state, (t) => (state = state.apply(t))), "command refused");
  return serialize(state.doc);
}

Deno.test("links: only web, mail and site addresses", () => {
  for (const ok of ["https://example.com", "http://x.y/a?b", "mailto:a@b.c", "/fr/article", "#notes", "page"]) {
    assertEquals(safeHref(` ${ok} `), ok);
  }
  for (
    const bad of ["javascript:alert(1)", "JavaScript:x", "data:text/html,x", "//evil.example", "", "a b", "ftp://x"]
  ) {
    assertEquals(safeHref(bad), null, bad);
  }
});

Deno.test("setLink adds, edits from inside, and removes a link", () => {
  assertEquals(run("Lisez |ceci| maintenant.", setLink("/fr/x")), "Lisez [ceci](/fr/x) maintenant.");
  assertEquals(
    run("Lisez [ce|ci](/fr/x) maintenant.", setLink("https://a.b")),
    "Lisez [ceci](https://a.b) maintenant.",
  );
  assertEquals(run("Lisez [ce|ci](/fr/x) maintenant.", setLink(null)), "Lisez ceci maintenant.");
  assertEquals(run("Voir |", setLink("https://a.b")), "Voir <https://a.b>");
});

Deno.test("callout wraps a paragraph and never nests", () => {
  assertEquals(
    run("Arrivez |tôt.", toggleWrap(schema.nodes.callout)),
    '<Callout type="note">\nArrivez tôt.\n</Callout>',
  );
  assertEquals(
    run('<Callout type="note">\nArrivez |tôt.\n</Callout>', toggleWrap(schema.nodes.callout)),
    "Arrivez tôt.",
  );
});

Deno.test("list buttons start, switch and leave lists", () => {
  assertEquals(run("un|", toggleList(schema.nodes.bullet_list)), "- un");
  assertEquals(run("- un|\n- deux", toggleList(schema.nodes.ordered_list)), "1. un\n2. deux");
  assertEquals(run("- un|", toggleList(schema.nodes.bullet_list)), "un");
});

Deno.test("block inserts leave a place to keep typing", () => {
  const doc = parse("Fin.");
  let state = EditorState.create({ doc, selection: TextSelection.atEnd(doc) });
  const apply = (t: Transaction) => (state = state.apply(t));
  assert(insertHr(state, apply));
  assert(insertFigure({ src: "/img/a.webp", alt: "Le comptoir", caption: 'Notre "comptoir"' })(state, apply));
  assertEquals(state.doc.content.content.map((n) => n.type.name), [
    "paragraph",
    "horizontal_rule",
    "figure",
    "paragraph",
  ]);
  assert(state.selection.$from.parent === state.doc.lastChild, "cursor is in the paragraph after");
  assertEquals(
    serialize(state.doc),
    'Fin.\n\n---\n\n<Figure src="/img/a.webp" caption="Notre “comptoir”" alt="Le comptoir" />',
  );
});
