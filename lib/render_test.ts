import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { extract } from "@std/front-matter/yaml";
import { render } from "./render.ts";
import { plainTitle, titleHtml } from "./markdown.ts";

Deno.test("every seed post renders without errors", async () => {
  for (const loc of ["fr", "en"] as const) {
    for await (const f of Deno.readDir(`content/${loc}`)) {
      const { body } = extract(await Deno.readTextFile(`content/${loc}/${f.name}`));
      const r = render(body, loc);
      assertEquals(r.errors, [], `${loc}/${f.name}`);
      assert(r.words > 100, `${loc}/${f.name} words`);
    }
  }
});

Deno.test("named components render to fixed HTML", () => {
  const r = render(
    '<Callout type="astuce">\nLisez **à voix haute**.\n</Callout>\n\n<Figure src="/img/cerises.webp" caption="Le comptoir" />',
    "fr",
  );
  assertStringIncludes(r.html, '<aside class="callout callout--astuce">');
  assertStringIncludes(r.html, "<strong>à voix haute</strong>");
  assertStringIncludes(r.html, '<figure class="figure"><img src="/img/cerises.webp" alt="Le comptoir"');
  assertStringIncludes(r.html, "<figcaption>Le comptoir</figcaption>");
});

Deno.test("unknown components and bad values are refused", () => {
  assertEquals(render('<Video src="x" />', "fr").errors.length, 1);
  assertEquals(render('<Callout type="danger">\nx\n</Callout>', "fr").errors.length, 1);
  assertEquals(render('<Figure src="https://evil.example/x.png" />', "fr").errors.length, 1);
  assertEquals(render("<Callout>\nno closing tag", "fr").errors.length, 1);
});

Deno.test("no script, no foreign image, safe links", () => {
  const r = render(
    "<script>alert(1)</script>\n\n[x](javascript:alert(1)) [y](https://example.com)\n\n![p](https://evil.example/p.png)",
    "en",
  );
  assert(!r.html.includes("<script"), r.html);
  assert(!/href="javascript/i.test(r.html), r.html);
  assert(!r.html.includes("evil.example"), r.html);
  assertStringIncludes(r.html, 'rel="noopener noreferrer"');
});

Deno.test("headings: ids, toc, h1 demoted", () => {
  const r = render("# Titre\n\n## Une idée\n\n## Une idée\n\n### Détail", "fr");
  assertStringIncludes(r.html, '<h2 id="titre">');
  assertEquals(r.toc.map((h) => h.id), ["titre", "une-idee", "une-idee-2", "detail"]);
});

Deno.test("french spacing keeps : and ? with their word", () => {
  const r = render("Une pose ? Oui : « bien ».", "fr");
  assertStringIncludes(r.html, "pose ?");
  assertStringIncludes(r.html, "Oui :");
  assertStringIncludes(r.html, "« bien »");
});

Deno.test("titles: one accent phrase, escaped", () => {
  assertEquals(
    titleHtml("Vos <b>mots</b> *vous appartiennent*."),
    'Vos &lt;b&gt;mots&lt;/b&gt; <em class="accent">vous appartiennent</em>.',
  );
  assertEquals(plainTitle("Vos mots *vous appartiennent*."), "Vos mots vous appartiennent.");
});
