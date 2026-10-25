// The one markdown-it instance. The server renders with it (lib/render.ts) and the editor
// parses with it (editor/), so the two can never disagree about what a post contains.
// It enables exactly what the editor schema can hold: no raw HTML, no tables.
// @ts-types="npm:@types/markdown-it@14.2.0"
import MarkdownIt, { type StateBlock } from "markdown-it";

/** Named components: the only tags a post may contain. */
export const CALLOUT_TYPES = ["note", "astuce", "attention"] as const;
export type CalloutType = typeof CALLOUT_TYPES[number];
export const COMPONENTS = ["Callout", "Figure"] as const;

/** Parse problems a save must refuse, collected in env.errors. */
export interface MdEnv {
  errors?: string[];
}

const ATTR = /(\w+)="([^"]*)"/g;
function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(ATTR)) out[m[1]] = m[2];
  return out;
}

function line(state: StateBlock, n: number): string {
  return state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);
}

function err(state: StateBlock, msg: string) {
  const env = state.env as MdEnv;
  (env.errors ??= []).push(msg);
}

/** `<Figure src="/img/x.webp" caption="…" alt="…" />` and
 *  `<Callout type="note">` … `</Callout>` (the body is markdown). */
function components(state: StateBlock, start: number, end: number, silent: boolean): boolean {
  if (state.sCount[start] - state.blkIndent >= 4) return false;
  const first = line(state, start);
  const tag = first.match(/^<([A-Z][A-Za-z]*)\b(.*)$/);
  if (!tag) return false;
  const [, name, rest] = tag;

  if (name === "Figure") {
    const m = rest.match(/^(.*?)\/>\s*$/);
    if (!m) return false;
    if (silent) return true;
    const a = attrs(m[1]);
    if (!a.src?.startsWith("/img/")) err(state, `Figure: src must start with /img/ (got "${a.src ?? ""}")`);
    const tok = state.push("figure", "figure", 0);
    tok.attrs = [["src", a.src ?? ""], ["alt", a.alt ?? a.caption ?? ""], ["caption", a.caption ?? ""]];
    tok.block = true;
    tok.map = [start, start + 1];
    state.line = start + 1;
    return true;
  }

  if (name === "Callout") {
    const m = rest.match(/^(.*?)>\s*$/);
    if (!m) return false;
    let close = start + 1;
    while (close < end && line(state, close).trim() !== "</Callout>") close++;
    if (close >= end) {
      if (!silent) err(state, "Callout: missing </Callout>");
      return false;
    }
    if (silent) return true;
    const type = attrs(m[1]).type ?? "note";
    if (!(CALLOUT_TYPES as readonly string[]).includes(type)) {
      err(state, `Callout: unknown type "${type}" (use ${CALLOUT_TYPES.join(", ")})`);
    }
    const open = state.push("callout_open", "aside", 1);
    open.attrs = [["type", type]];
    open.block = true;
    open.map = [start, close + 1];
    const oldMax = state.lineMax;
    state.lineMax = close; // paragraphs inside end at </Callout>
    state.md.block.tokenize(state, start + 1, close);
    state.lineMax = oldMax;
    const shut = state.push("callout_close", "aside", -1);
    shut.block = true;
    state.line = close + 1;
    return true;
  }

  if (!silent) err(state, `Unknown component <${name}> (allowed: ${COMPONENTS.join(", ")})`);
  return false;
}

export const md = new MarkdownIt("default", { html: false, linkify: false, typographer: false })
  .disable(["table"]);
md.block.ruler.before("paragraph", "components", components, {
  alt: ["paragraph", "reference", "blockquote", "list"],
});

const esc = (s: string) => md.utils.escapeHtml(s);
md.renderer.rules.figure = (tokens, i) => {
  const src = tokens[i].attrGet("src") ?? "";
  const alt = tokens[i].attrGet("alt") ?? "";
  const cap = tokens[i].attrGet("caption") ?? "";
  return `<figure class="figure"><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">` +
    (cap ? `<figcaption>${esc(cap)}</figcaption>` : "") + `</figure>\n`;
};
md.renderer.rules.callout_open = (tokens, i) =>
  `<aside class="callout callout--${esc(tokens[i].attrGet("type") ?? "note")}">\n`;
md.renderer.rules.callout_close = () => `</aside>\n`;

/** Title markdown: `*one phrase*` becomes the accent; everything else is escaped text. */
export function titleHtml(title: string): string {
  return esc(title).replace(/\*([^*]+)\*/, '<em class="accent">$1</em>');
}

export function plainTitle(title: string): string {
  return title.replace(/\*/g, "");
}
