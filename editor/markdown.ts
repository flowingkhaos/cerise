// Markdown ⇄ editor document. The parser runs on `md`, the same markdown-it instance the
// server renders with, so the editor can only ever hold what a saved post can contain.
// The serializer writes markdown that `md` parses back to the same document; the round-trip
// test (markdown_test.ts) holds it to that over every seed post.
import { MarkdownParser, MarkdownSerializer, type MarkdownSerializerState } from "prosemirror-markdown";
import type { Node } from "prosemirror-model";
import { md, type MdEnv } from "../lib/markdown.ts";
import { schema } from "./schema.ts";

/** md marks the paragraphs of a tight list `hidden`; a list with no paragraph renders the same either way. */
function tight(tokens: { type: string; level: number; hidden: boolean }[], i: number): boolean {
  const lvl = tokens[i].level;
  for (let j = i + 1; j < tokens.length && tokens[j].level > lvl; j++) {
    if (tokens[j].type === "paragraph_open" && tokens[j].level === lvl + 2) return tokens[j].hidden;
  }
  return true;
}

const parser = new MarkdownParser(schema, md, {
  blockquote: { block: "blockquote" },
  paragraph: { block: "paragraph" },
  list_item: { block: "list_item" },
  bullet_list: { block: "bullet_list", getAttrs: (_t, toks, i) => ({ tight: tight(toks, i) }) },
  ordered_list: {
    block: "ordered_list",
    getAttrs: (tok, toks, i) => ({ order: Number(tok.attrGet("start") ?? 1), tight: tight(toks, i) }),
  },
  // The page title is the only h1: body headings live between h2 and h4, as render() does.
  heading: { block: "heading", getAttrs: (tok) => ({ level: Math.min(4, Math.max(2, +tok.tag.slice(1))) }) },
  code_block: { block: "code_block", noCloseToken: true },
  fence: { block: "code_block", getAttrs: (tok) => ({ language: tok.info }), noCloseToken: true },
  hr: { node: "horizontal_rule" },
  image: {
    node: "image",
    getAttrs: (tok) => ({
      src: tok.attrGet("src"),
      title: tok.attrGet("title") || null,
      // The alt md renders: the label's plain text, not just its first token. A line break in
      // it becomes a space, like every soft break (see README).
      alt: md.renderer.renderInlineAsText(tok.children ?? [], md.options, {}).replace(/\n/g, " ") || null,
    }),
  },
  hardbreak: { node: "hard_break" },
  em: { mark: "em" },
  strong: { mark: "strong" },
  s: { mark: "s" },
  link: { mark: "link", getAttrs: (tok) => ({ href: tok.attrGet("href"), title: tok.attrGet("title") || null }) },
  code_inline: { mark: "code", noCloseToken: true },
  callout: { block: "callout", getAttrs: (tok) => ({ type: tok.attrGet("type") ?? "note" }) },
  figure: {
    node: "figure",
    getAttrs: (tok) => ({ src: tok.attrGet("src"), alt: tok.attrGet("alt"), caption: tok.attrGet("caption") }),
  },
});

/** Markdown → document. Pass `env` to read md's errors (unknown component, bad Figure src…). */
export function parse(source: string, env: MdEnv = {}): Node {
  return parser.parse(source, env);
}

/** Component attributes are `"…"` on one line and md does not decode entities in them, so a
 *  straight quote or a newline cannot survive: quotes become curly, newlines spaces. Opening
 *  or closing is read from the character before, so it also works one keystroke at a time. */
export function attrText(s: string): string {
  return s.replace(/[\r\n]+/g, " ").replace(/(^|[\s(\[«])"/g, "$1“").replace(/"/g, "”");
}

// prosemirror-markdown keeps these on the state without typing them.
type State = MarkdownSerializerState & {
  out: string;
  atBlockStart: boolean;
  inAutolink?: boolean;
  inTightList: boolean;
  flushClose(size?: number): void;
};

/** Escapes for text that starts a line: what md would read as a block marker. */
function escLineStart(s: string): string {
  return s.replace(/^[ \t]+/, "") // md strips it anyway; 4 spaces would make a code block
    .replace(/^(#{1,6})(?=\s|$)/, "\\$1")
    .replace(/^[-+*>=]/, "\\$&")
    .replace(/^(\d{1,9})([.)])(?=\s|$)/, "$1\\$2");
}

/** A run of backticks one longer than any inside, padded when the text touches a space or a tick. */
function ticks(node: Node, open: boolean): string {
  const text = node.text ?? "";
  const run = Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const fence = "`".repeat(run + 1);
  const pad = /^[ `]|[ `]$/.test(text) && /[^ ]/.test(text) ? " " : "";
  return open ? fence + pad : pad + fence;
}

/** Adjacent lists of one type need different markers, or md joins them into one list. */
function marker(parent: Node, index: number, markers: string[]): string {
  let k = 0;
  while (index - k > 0 && parent.child(index - k - 1).type === parent.child(index).type) k++;
  return markers[k % 2];
}

// In a tight list, blocks inside an item sit on consecutive lines, except a paragraph after
// something whose last paragraph would swallow it as a lazy continuation line.
const LAZY = new Set(["paragraph", "blockquote", "bullet_list", "ordered_list"]);
const continues = (n: Node) => n.type.name === "paragraph" || (n.type.name === "ordered_list" && n.attrs.order !== 1);

const serializer = new MarkdownSerializer(
  {
    blockquote(state, node) {
      state.wrapBlock("> ", null, node, () => state.renderContent(node));
    },
    code_block(state, node) {
      const text = node.textContent;
      const tilde = node.attrs.language.includes("`"); // a backtick fence cannot carry one
      const run = Math.max(2, ...(text.match(tilde ? /~+/g : /`+/g) ?? []).map((m) => m.length));
      const fence = (tilde ? "~" : "`").repeat(run + 1);
      state.write(fence + node.attrs.language + "\n");
      if (text) { // an empty block stays empty: one blank line would come back as "\n"
        state.text(text, false);
        state.write("\n");
      }
      state.write(fence);
      state.closeBlock(node);
    },
    heading(state, node) {
      state.write("#".repeat(node.attrs.level) + " ");
      state.renderInline(node, false);
      // A trailing " #" would be read as the optional closing sequence and dropped.
      const st = state as State;
      st.out = st.out.replace(/(\s)(#+)$/, "$1\\$2");
      state.closeBlock(node);
    },
    horizontal_rule(state, node, parent) {
      // Inside a list item, "---" under a paragraph is a setext heading and "- ---" is a rule.
      state.write(parent.type.name === "list_item" ? "___" : "---");
      state.closeBlock(node);
    },
    bullet_list(state, node, parent, index) {
      const bullet = marker(parent, index, ["-", "*"]);
      state.renderList(node, "  ", () => bullet + " ");
    },
    ordered_list(state, node, parent, index) {
      const delim = marker(parent, index, [".", ")"]);
      const start: number = node.attrs.order;
      const maxW = String(start + node.childCount - 1).length;
      state.renderList(node, " ".repeat(maxW + 2), (i) => {
        const n = String(start + i);
        return " ".repeat(maxW - n.length) + n + delim + " ";
      });
    },
    list_item(state, node) {
      const st = state as State;
      node.forEach((child, _, i) => {
        if (i && st.inTightList && !(LAZY.has(node.child(i - 1).type.name) && continues(child))) {
          st.flushClose(1);
        }
        state.render(child, node, i);
      });
    },
    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
    image(state, node) {
      state.write(
        "![" + state.esc(node.attrs.alt ?? "") + "](" + node.attrs.src.replace(/[()]/g, "\\$&") +
          (node.attrs.title ? ' "' + node.attrs.title.replace(/"/g, '\\"') + '"' : "") + ")",
      );
    },
    hard_break(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type !== node.type) {
          state.write("\\\n");
          return;
        }
      }
    },
    text(state, node, parent, index) {
      const st = state as State;
      if (st.inAutolink) return state.text(node.text!, false);
      const lineStart = st.atBlockStart || (index > 0 && parent.child(index - 1).type.name === "hard_break");
      const s = state.esc(node.text!.replace(/\n/g, " "));
      state.text(lineStart ? escLineStart(s) : s, false);
    },
    callout(state, node) {
      state.write(`<Callout type="${attrText(node.attrs.type)}">`);
      state.ensureNewLine();
      state.renderContent(node);
      (state as State).flushClose(1); // no blank line before the closing tag
      state.write("</Callout>");
      state.closeBlock(node);
    },
    figure(state, node) {
      const { src, alt, caption } = node.attrs;
      state.write(
        `<Figure src="${attrText(src)}"` + (caption ? ` caption="${attrText(caption)}"` : "") +
          (alt !== caption ? ` alt="${attrText(alt)}"` : "") + " />",
      );
      state.closeBlock(node);
    },
  },
  {
    em: { open: "*", close: "*", mixable: true, expelEnclosingWhitespace: true },
    strong: { open: "**", close: "**", mixable: true, expelEnclosingWhitespace: true },
    s: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
    link: {
      open(state, mark, parent, index) {
        const st = state as State;
        const content = parent.child(index);
        st.inAutolink = !mark.attrs.title && /^\w+:/.test(mark.attrs.href) && content.isText &&
          content.text === mark.attrs.href && content.marks[content.marks.length - 1] === mark &&
          (index === parent.childCount - 1 || !mark.isInSet(parent.child(index + 1).marks));
        return st.inAutolink ? "<" : "[";
      },
      close(state, mark) {
        const st = state as State;
        const auto = st.inAutolink;
        st.inAutolink = undefined;
        return auto ? ">" : "](" + mark.attrs.href.replace(/[()"]/g, "\\$&") +
          (mark.attrs.title ? ` "${mark.attrs.title.replace(/"/g, '\\"')}"` : "") + ")";
      },
      mixable: true,
    },
    code: {
      open: (_s, _m, parent, index) => ticks(parent.child(index), true),
      close: (_s, _m, parent, index) => ticks(parent.child(index - 1), false),
      escape: false,
    },
  },
  {
    // `<` before a letter or `/` would open an autolink or a component; `&name;` would decode.
    escapeExtraCharacters: /<(?=[A-Za-z/])|&(?=#?[A-Za-z0-9]+;)/g,
  },
);

/** Document → markdown. */
export function serialize(doc: Node): string {
  return serializer.serialize(doc);
}
