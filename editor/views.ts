// What a writer sees for the two named components (browser only; the tests never load this).
// Callout: a box with its type picker above the editable body. Figure: the image with its
// caption and alt text in plain inputs, written straight into the node's attributes.
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView, NodeViewConstructor, ViewMutationRecord } from "prosemirror-view";
import { CALLOUT_TYPES } from "../lib/markdown.ts";
import { attrText } from "./markdown.ts";

type T = (key: string) => string;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

class CalloutView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  head: HTMLElement;
  select: HTMLSelectElement;

  constructor(private node: PMNode, view: EditorView, getPos: () => number | undefined, t: T) {
    this.select = el(
      "select",
      {},
      ...CALLOUT_TYPES.map((type) => el("option", { value: type }, t(`callout${cap(type)}`))),
    );
    this.select.addEventListener("change", () => {
      const pos = getPos();
      if (pos !== undefined) view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { type: this.select.value }));
    });
    this.head = el(
      "label",
      { class: "ed-callout-head", contenteditable: "false" },
      el("span", {}, t("calloutType")),
      this.select,
    );
    this.contentDOM = el("div", { class: "ed-callout-body" });
    this.dom = el("aside", { class: "ed-callout" }, this.head, this.contentDOM);
    this.update(node);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.dom.dataset.type = node.attrs.type;
    this.select.value = node.attrs.type;
    return true;
  }

  stopEvent(e: Event): boolean {
    return this.head.contains(e.target as Node);
  }

  ignoreMutation(m: ViewMutationRecord): boolean {
    return !this.contentDOM.contains(m.target);
  }
}

class FigureView implements NodeView {
  dom: HTMLElement;
  img: HTMLImageElement;
  fields: HTMLElement;
  inputs: Record<"caption" | "alt", HTMLInputElement>;

  constructor(private node: PMNode, view: EditorView, getPos: () => number | undefined, t: T) {
    const field = (attr: "caption" | "alt") => {
      const input = el("input", { type: "text", class: `ed-figure-${attr}` });
      input.addEventListener("input", () => {
        const v = attrText(input.value);
        if (v !== input.value) { // quotes cannot live in a component attribute
          const at = input.selectionStart;
          input.value = v;
          input.setSelectionRange(at, at);
        }
        const pos = getPos();
        if (pos !== undefined) {
          view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, [attr]: v }));
        }
      });
      input.addEventListener("keydown", (e) => {
        // Enter would submit the publication form; both keys go back to the text instead.
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          view.focus();
        }
      });
      return input;
    };
    this.inputs = { caption: field("caption"), alt: field("alt") };
    this.img = el("img", { alt: "" });
    this.fields = el(
      "div",
      { class: "ed-figure-fields" },
      el("label", { class: "ed-field" }, el("span", {}, t("figureCaption")), this.inputs.caption),
      el("label", { class: "ed-field" }, el("span", {}, t("figureAlt")), this.inputs.alt),
    );
    this.dom = el("figure", { class: "ed-figure" }, this.img, this.fields);
    this.update(node);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (this.img.getAttribute("src") !== node.attrs.src) this.img.src = node.attrs.src;
    for (const k of ["caption", "alt"] as const) {
      if (document.activeElement !== this.inputs[k]) this.inputs[k].value = node.attrs[k];
    }
    return true;
  }

  stopEvent(e: Event): boolean {
    return this.fields.contains(e.target as Node);
  }

  ignoreMutation(): boolean {
    return true;
  }
}

export function nodeViews(t: T): Record<string, NodeViewConstructor> {
  return {
    callout: (node, view, getPos) => new CalloutView(node, view, getPos, t),
    figure: (node, view, getPos) => new FigureView(node, view, getPos, t),
  };
}
