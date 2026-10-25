import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { extract } from "@std/front-matter/yaml";
import type { Node } from "prosemirror-model";
import { md, type MdEnv } from "../lib/markdown.ts";
import { render } from "../lib/render.ts";
import type { Locale } from "../lib/types.ts";
import { attrText, parse, serialize } from "./markdown.ts";
import { schema } from "./schema.ts";

// The editor keeps a soft line break (a newline inside a paragraph) as a space, the way every
// rich editor does. md renders it as "\n", so the expected side renders soft breaks as spaces;
// everything else must match byte for byte.
function expected(source: string, loc: Locale): string {
  const rule = md.renderer.rules.softbreak;
  md.renderer.rules.softbreak = () => " ";
  try {
    return render(source, loc).html;
  } finally {
    md.renderer.rules.softbreak = rule;
  }
}

function roundTrip(source: string, loc: Locale, label: string) {
  const doc = parse(source);
  const out = serialize(doc);
  assertEquals(render(out, loc).html, expected(source, loc), `${label}: html\n--- markdown out ---\n${out}`);
  assert(parse(out).eq(doc), `${label}: document changed on re-parse\n--- markdown out ---\n${out}`);
  assertEquals(serialize(parse(out)), out, `${label}: serializer is not stable`);
}

Deno.test("every seed post survives parse → serialize with the same html", async () => {
  let n = 0;
  for (const loc of ["fr", "en"] as const) {
    for await (const f of Deno.readDir(`content/${loc}`)) {
      if (!f.name.endsWith(".md")) continue;
      const { body } = extract(await Deno.readTextFile(`content/${loc}/${f.name}`));
      roundTrip(body, loc, `${loc}/${f.name}`);
      n++;
    }
  }
  assert(n >= 12, `only ${n} seed posts found`);
});

const FIXTURE = `# A title md demotes

Plain **bold**, *italic*, ***both***, ~~struck~~, \`code\`, \`\`a \` tick\`\`, [a link](https://example.com "Title") and
[a relative one](/fr/autre), <https://example.com/auto>, <me@example.com>, an image
![alt with *em*](/img/cerises.webp "Photo") and a hard\\
break. Escapes: \\*not em\\*, 5 \\* 3, a\\_b, \\[x\\], \\<Figure\\>, AT&T, \\&amp;, 1\\) one.

\\# not a heading

\\- not a list

1\\. not a list either

## Second level

### Third level

#### Fourth level

##### Fifth level becomes fourth

> A quote with **bold**
>
> - and a list

- one
- two
  - nested
  - nested *again*
    1. deep
- three

* another list right after

3. three
4. four

A list may start at zero:

0. zero

- loose item

- loose item two

1. Run this:
   \`\`\`sh
   deno task check
   \`\`\`
2. Then this.

\`\`\`ts
const x = 1;

console.log(\`\${x}\`);
\`\`\`

\`\`\`
\`\`\`

    indented code

---

<Callout type="note">
A note with a [link](https://example.com).
</Callout>

<Callout type="astuce">
A tip.

- with a list
- of two
</Callout>

<Callout type="attention">
A warning with \`code\`.

<Figure src="/img/cerises.webp" caption="Inside a callout" />
</Callout>

<Figure src="/img/cerises.webp" caption="Our counter, on a Saturday in July." />

<Figure src="/img/cerises.webp" caption="A caption" alt="A different alt" />

<Figure src="/img/cerises.webp" />

Heading with a closing hash:

## Price \\#

Last paragraph.
`;

Deno.test("fixture with every node and mark round-trips", () => {
  for (const loc of ["fr", "en"] as const) roundTrip(FIXTURE, loc, `fixture/${loc}`);
  const html = render(serialize(parse(FIXTURE)), "en").html;
  assertStringIncludes(html, '<ol start="0">');
  assertStringIncludes(html, ">Price #</h2>");
  const env: MdEnv = {};
  parse(FIXTURE, env);
  assertEquals(env.errors ?? [], []);
});

Deno.test("parse maps md tokens onto the schema", () => {
  const doc = parse(FIXTURE);
  const types = new Set<string>(["doc"]);
  const marks = new Set<string>();
  doc.descendants((n) => {
    types.add(n.type.name);
    n.marks.forEach((m) => marks.add(m.type.name));
  });
  for (const t of Object.keys(schema.nodes)) assert(types.has(t), `fixture lacks node ${t}`);
  for (const m of Object.keys(schema.marks)) assert(marks.has(m), `fixture lacks mark ${m}`);

  const levels: number[] = [];
  const callouts: string[] = [];
  doc.descendants((n) => {
    if (n.type.name === "heading") levels.push(n.attrs.level);
    if (n.type.name === "callout") callouts.push(n.attrs.type);
  });
  assertEquals(levels, [2, 2, 3, 4, 4, 2]);
  assertEquals(callouts, ["note", "astuce", "attention"]);
});

Deno.test("figure: alt is written only when it differs from the caption", () => {
  const fig = (attrs: Record<string, string>) => serialize(schema.node("doc", null, [schema.node("figure", attrs)]));
  assertEquals(fig({ src: "/img/a.webp", alt: "C", caption: "C" }), '<Figure src="/img/a.webp" caption="C" />');
  assertEquals(fig({ src: "/img/a.webp", alt: "", caption: "C" }), '<Figure src="/img/a.webp" caption="C" alt="" />');
  assertEquals(fig({ src: "/img/a.webp", alt: "A", caption: "" }), '<Figure src="/img/a.webp" alt="A" />');
  assertEquals(
    fig({ src: "/img/a.webp", alt: 'Le "comptoir"', caption: 'Le "comptoir"' }),
    '<Figure src="/img/a.webp" caption="Le “comptoir”" />',
  );
  assertEquals(attrText('a "b" c "d\ne'), "a “b” c “d e");
  // One keystroke at a time, as the caption field cleans it.
  assertEquals([...'Le "fauteuil"'].reduce((acc, ch) => attrText(acc + ch), ""), "Le “fauteuil”");
});

/** Documents only the editor can make (md never produces them): they must still survive. */
Deno.test("editor-made text that looks like markdown stays text", () => {
  const p = (...content: Node[]) => schema.node("paragraph", null, content);
  const txt = (s: string) => schema.text(s);
  const br = () => schema.node("hard_break");
  const docs = [
    schema.node("doc", null, [p(txt("- not a list"))]),
    schema.node("doc", null, [p(txt("+ not a list"))]),
    schema.node("doc", null, [p(txt("+"))]),
    schema.node("doc", null, [p(txt("1. not a list"))]),
    schema.node("doc", null, [p(txt("1) not a list"))]),
    schema.node("doc", null, [p(txt("## not a heading"))]),
    schema.node("doc", null, [p(txt("> not a quote"))]),
    schema.node("doc", null, [p(txt('<Figure src="/img/a.webp" />'))]),
    schema.node("doc", null, [p(txt("a"), br(), txt("# b"), br(), txt("- c"), br(), txt("==="))]),
    schema.node("doc", null, [p(txt("&amp; and &#33; and <https://x.y> and <b>"))]),
    schema.node("doc", null, [schema.node("callout", null, [p(txt("</Callout>"))]), p(txt("after"))]),
    schema.node("doc", null, [p(txt("code: "), schema.text(" x ", [schema.marks.code.create()]))]),
    schema.node("doc", null, [schema.node("heading", { level: 2 }, [txt("C# and #")])]),
    schema.node("doc", null, [
      schema.node("bullet_list", null, [schema.node("list_item", null, [p(txt("a"))])]),
      schema.node("bullet_list", null, [schema.node("list_item", null, [p(txt("b"))])]),
      schema.node("ordered_list", null, [schema.node("list_item", null, [p(txt("c"))])]),
      schema.node("ordered_list", null, [schema.node("list_item", null, [p(txt("d"))])]),
    ]),
    schema.node("doc", null, [
      schema.node("bullet_list", { tight: true }, [
        schema.node("list_item", null, [p(txt("a")), schema.node("horizontal_rule"), p(txt("b"))]),
      ]),
    ]),
  ];
  for (const doc of docs) {
    const out = serialize(doc);
    assert(parse(out).eq(doc), `changed on re-parse:\n${out}\n${JSON.stringify(parse(out).toJSON())}`);
  }
});
