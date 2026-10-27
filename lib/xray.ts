// The X-ray layer's server side: the cookie, the legend's counts, and where a Deno KV post was born.
import type { Locale } from "./types.ts";

export const XRAY_COOKIE = /(?:^|;\s*)cerise_rx=1(?:;|$)/;

/** The legend sits above the tags it counts, so its numbers are filled in once the page is rendered:
 * every `rx-tag` in the HTML, by owner. The counts can never disagree with what the page shows. */
export function fillLegend(html: string): string {
  const n: Record<string, number> = { md: 0, cms: 0, code: 0 };
  for (const m of html.matchAll(/class="rx-tag[^"]*" data-o="(md|cms|code)"/g)) n[m[1]]++;
  const all = n.md + n.cms + n.code;
  return html.replace(/<b data-rx-count="(md|cms|code|all)">0<\/b>/g, (_, o) => `<b>${o === "all" ? all : n[o]}</b>`);
}

const seeds = new Map<string, boolean>();

/** The repo file a Deno KV post was seeded from, or null for a post written in cerise's editor. */
export function seedFile(locale: Locale, slug: string): string | null {
  const path = `content/${locale}/${slug}.md`;
  if (!seeds.has(path)) {
    try {
      seeds.set(path, Deno.statSync(path).isFile);
    } catch {
      seeds.set(path, false);
    }
  }
  return seeds.get(path) ? path : null;
}
