// The editor's document model: exactly what `md` (lib/markdown.ts) parses, nothing more.
// Built on prosemirror-markdown's CommonMark schema, then narrowed (headings 2–4, fenced
// code with a language) and extended (strikethrough, the two named components).
import { type DOMOutputSpec, type Node, Schema } from "prosemirror-model";
import { schema as commonmark } from "prosemirror-markdown";
import { CALLOUT_TYPES } from "../lib/markdown.ts";

const level = (n: number) => Math.min(4, Math.max(2, n));

const nodes = commonmark.spec.nodes
  .update("heading", {
    ...commonmark.spec.nodes.get("heading"),
    attrs: { level: { default: 2, validate: "number" } },
    parseDOM: [1, 2, 3, 4, 5, 6].map((n) => ({ tag: `h${n}`, attrs: { level: level(n) } })),
    toDOM: (node: Node): DOMOutputSpec => [`h${node.attrs.level}`, 0],
  })
  .update("code_block", {
    content: "text*",
    group: "block",
    code: true,
    defining: true,
    marks: "",
    attrs: { language: { default: "" } },
    parseDOM: [{
      tag: "pre",
      preserveWhitespace: "full",
      getAttrs: (dom: HTMLElement) => ({ language: dom.getAttribute("data-language") ?? "" }),
    }],
    toDOM: (node: Node): DOMOutputSpec => [
      "pre",
      node.attrs.language ? { "data-language": node.attrs.language } : {},
      ["code", 0],
    ],
  })
  // New lists are tight (no blank lines between items); parsed lists keep what md saw.
  .update("bullet_list", {
    ...commonmark.spec.nodes.get("bullet_list"),
    attrs: { tight: { default: true } },
  })
  .update("ordered_list", {
    ...commonmark.spec.nodes.get("ordered_list"),
    attrs: { order: { default: 1 }, tight: { default: true } },
  })
  // Lets setBlockType turn hard breaks into newlines when a paragraph becomes code, and back.
  .update("hard_break", { ...commonmark.spec.nodes.get("hard_break"), linebreakReplacement: true })
  .addToEnd("callout", {
    // md cannot nest a callout directly in a callout (the first </Callout> closes the outer one).
    content: "(paragraph | heading | blockquote | bullet_list | ordered_list | code_block | horizontal_rule | figure)+",
    group: "block",
    defining: true,
    attrs: { type: { default: "note" } },
    parseDOM: [{
      tag: "aside.callout",
      getAttrs: (dom: HTMLElement) => ({
        type: CALLOUT_TYPES.find((t) => dom.classList.contains(`callout--${t}`)) ?? "note",
      }),
    }],
    toDOM: (node: Node): DOMOutputSpec => ["aside", { class: `callout callout--${node.attrs.type}` }, 0],
  })
  .addToEnd("figure", {
    group: "block",
    atom: true,
    draggable: true,
    attrs: { src: {}, alt: { default: "" }, caption: { default: "" } },
    parseDOM: [{
      tag: "figure",
      getAttrs: (dom: HTMLElement) => {
        const img = dom.querySelector("img");
        if (!img) return false;
        return {
          src: img.getAttribute("src") ?? "",
          alt: img.getAttribute("alt") ?? "",
          caption: dom.querySelector("figcaption")?.textContent ?? "",
        };
      },
    }],
    toDOM: (node: Node): DOMOutputSpec => [
      "figure",
      { class: "figure" },
      ["img", { src: node.attrs.src, alt: node.attrs.alt }],
      ["figcaption", node.attrs.caption],
    ],
  });

// Mark order matters to the serializer: `code` must stay last.
const marks = commonmark.spec.marks.addBefore("link", "s", {
  parseDOM: [{ tag: "s" }, { tag: "del" }, { tag: "strike" }, { style: "text-decoration=line-through" }],
  toDOM: (): DOMOutputSpec => ["s", 0],
});

export const schema = new Schema({ nodes, marks });
