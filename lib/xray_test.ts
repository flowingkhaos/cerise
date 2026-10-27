import { assertEquals } from "@std/assert";
import { fillLegend, seedFile, XRAY_COOKIE } from "./xray.ts";

const tag = (o: string) => `<span class="rx-tag rx-tag--flux" data-o="${o}" aria-hidden="true"></span>`;

Deno.test("fillLegend counts the tags the page rendered, by owner, wherever the legend sits", () => {
  const legend = '<b data-rx-count="md">0</b><b data-rx-count="cms">0</b><b data-rx-count="code">0</b>' +
    '<b data-rx-count="all">0</b>';
  const html = legend + tag("md") + tag("md") + tag("cms") + tag("code") + '<dt data-o="md">not a tag</dt>' + legend;
  const once = "<b>2</b><b>1</b><b>1</b><b>4</b>";
  assertEquals(fillLegend(html), once + html.slice(legend.length, -legend.length) + once);
});

Deno.test("the X-ray cookie is cerise_rx=1 and nothing like it", () => {
  assertEquals(XRAY_COOKIE.test("cerise_rx=1"), true);
  assertEquals(XRAY_COOKIE.test("cerise_mode=dark; cerise_rx=1"), true);
  assertEquals(XRAY_COOKIE.test("cerise_rx=10"), false);
  assertEquals(XRAY_COOKIE.test("xcerise_rx=1"), false);
  assertEquals(XRAY_COOKIE.test("cerise_rx="), false);
});

Deno.test("seedFile names the repo file a seed post came from, null for a post written in the editor", () => {
  assertEquals(seedFile("fr", "ecrivez-comme-vous-parlez"), "content/fr/ecrivez-comme-vous-parlez.md");
  assertEquals(seedFile("en", "ecrivez-comme-vous-parlez"), "content/en/ecrivez-comme-vous-parlez.md");
  assertEquals(seedFile("fr", "un-article-de-l-editeur"), null);
});
