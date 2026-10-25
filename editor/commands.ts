// What the toolbar buttons, shortcuts and typed markdown do. No DOM here: tests drive these
// on a bare EditorState.
import { baseKeymap, chainCommands, exitCode, lift, setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  undoInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import type { Attrs, Mark, MarkType, Node, NodeType, ResolvedPos } from "prosemirror-model";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import { type Command, type EditorState, type Plugin, Selection, TextSelection } from "prosemirror-state";
import { attrText } from "./markdown.ts";
import { schema } from "./schema.ts";

const { nodes, marks } = schema;

// ── State queries (toolbar pressed / enabled) ─────────────────────────────────────────────

export function markActive(state: EditorState, type: MarkType): boolean {
  const { from, to, empty, $from } = state.selection;
  return empty ? !!type.isInSet(state.storedMarks ?? $from.marks()) : state.doc.rangeHasMark(from, to, type);
}

/** The selection sits inside a node of this type (any depth). */
export function inside(state: EditorState, type: NodeType): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === type) return true;
  return false;
}

export function blockIs(state: EditorState, type: NodeType, attrs?: Attrs): boolean {
  return state.selection.$from.parent.hasMarkup(type, attrs);
}

/** The whole link around a position, so a cursor inside a link can edit or remove it. */
export function linkAt($pos: ResolvedPos): { from: number; to: number; mark: Mark } | null {
  const parent = $pos.parent;
  const look = (side: "childAfter" | "childBefore") => {
    const { index, offset } = parent[side]($pos.parentOffset);
    const child = parent.maybeChild(index);
    const mark = child && marks.link.isInSet(child.marks);
    return mark ? { index, offset, child, mark } : null;
  };
  const hit = look("childAfter") ?? look("childBefore");
  if (!hit) return null;
  let from = $pos.start() + hit.offset, to = from + hit.child.nodeSize;
  for (let i = hit.index - 1; i >= 0 && hit.mark.isInSet(parent.child(i).marks); i--) from -= parent.child(i).nodeSize;
  for (let i = hit.index + 1; i < parent.childCount && hit.mark.isInSet(parent.child(i).marks); i++) {
    to += parent.child(i).nodeSize;
  }
  return { from, to, mark: hit.mark };
}

export function currentHref(state: EditorState): string {
  const { $from, from, to, empty } = state.selection;
  if (empty) return linkAt($from)?.mark.attrs.href ?? "";
  let href = "";
  state.doc.nodesBetween(from, to, (n) => {
    href ||= marks.link.isInSet(n.marks)?.attrs.href ?? "";
  });
  return href;
}

/** Links may point to the web, to a mail address, or inside the site. Anything else is refused. */
export function safeHref(input: string): string | null {
  const href = input.trim();
  if (!href || /\s/.test(href) || href.startsWith("//")) return null;
  if (/^(https?|mailto):/i.test(href)) return href;
  return /^[a-z][a-z0-9+.-]*:/i.test(href) ? null : href;
}

// ── Commands ──────────────────────────────────────────────────────────────────────────────

export const toggleStrong = toggleMark(marks.strong);
export const toggleEm = toggleMark(marks.em);
export const toggleStrike = toggleMark(marks.s);
export const toggleCode = toggleMark(marks.code);

export const toggleHeading = (level: number): Command => (state, dispatch) =>
  blockIs(state, nodes.heading, { level })
    ? setBlockType(nodes.paragraph)(state, dispatch)
    : setBlockType(nodes.heading, { level })(state, dispatch);

export const toggleCodeBlock: Command = (state, dispatch) =>
  blockIs(state, nodes.code_block)
    ? setBlockType(nodes.paragraph)(state, dispatch)
    : setBlockType(nodes.code_block)(state, dispatch);

/** Blockquote and callout: wrap the selected blocks, or lift them out. Never a callout in a callout. */
export const toggleWrap = (type: NodeType): Command => (state, dispatch) =>
  inside(state, type) ? lift(state, dispatch) : wrapIn(type)(state, dispatch);

/** In a list of this type: leave it. In the other kind: switch kind. Elsewhere: start one. */
export const toggleList = (type: NodeType): Command => (state, dispatch) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type !== nodes.bullet_list && node.type !== nodes.ordered_list) continue;
    if (node.type === type) return liftListItem(nodes.list_item)(state, dispatch);
    dispatch?.(state.tr.setNodeMarkup($from.before(d), type, { tight: node.attrs.tight }));
    return true;
  }
  return wrapInList(type)(state, dispatch);
};

/** Insert a block node; if it lands last, a paragraph follows so the cursor has somewhere to go. */
function insertBlock(node: Node): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    let ok = false;
    for (let d = $from.depth; d >= 0 && !ok; d--) {
      ok = $from.node(d).canReplaceWith($from.index(d), $from.index(d), node.type);
    }
    if (!ok) return false;
    if (dispatch) {
      const tr = state.tr.replaceSelectionWith(node);
      let end = 0; // where the inserted content ends
      tr.mapping.maps[tr.mapping.maps.length - 1].forEach((_a, _b, _c, to) => (end = to));
      const $end = tr.doc.resolve(end);
      if (!$end.parent.inlineContent) { // the node did not split a paragraph: place the cursor after it
        if (!$end.nodeAfter) tr.insert(end, nodes.paragraph.create());
        tr.setSelection(Selection.near(tr.doc.resolve(end), 1));
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

export const insertHr: Command = (state, dispatch) => insertBlock(nodes.horizontal_rule.create())(state, dispatch);

export const insertFigure = (a: { src: string; alt: string; caption: string }): Command =>
  insertBlock(nodes.figure.create({ src: a.src, alt: attrText(a.alt), caption: attrText(a.caption) }));

/** Set, change or (href null) remove the link on the selection, or on the link around the cursor.
 *  With an empty selection outside any link, the address itself is inserted as the link text. */
export const setLink = (href: string | null): Command => (state, dispatch) => {
  const { from, to, empty, $from } = state.selection;
  const range = empty ? linkAt($from) : { from, to };
  if (!range && !href) return false;
  if (dispatch) {
    const tr = state.tr;
    const mark = href ? marks.link.create({ href }) : null;
    if (range) {
      tr.removeMark(range.from, range.to, marks.link);
      if (mark) tr.addMark(range.from, range.to, mark);
    } else if (mark) {
      tr.insert(from, schema.text(href!, [mark]));
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};

export { redo, undo };

// ── Typing markdown ───────────────────────────────────────────────────────────────────────

/** `---` on an empty line becomes a rule. Only when the line holds nothing else. */
const hrRule = new InputRule(/^---$/, (state, _match, start, end) => {
  const $start = state.doc.resolve(start);
  if ($start.parent.type !== nodes.paragraph || $start.parent.content.size !== end - start) return null;
  const pos = $start.before();
  const tr = state.tr.replaceWith(pos, $start.after(), [nodes.horizontal_rule.create(), nodes.paragraph.create()]);
  return tr.setSelection(TextSelection.create(tr.doc, pos + 2));
});

const rules = [
  textblockTypeInputRule(/^(#{2,4})\s$/, nodes.heading, (m) => ({ level: m[1].length })),
  wrappingInputRule(/^\s*>\s$/, nodes.blockquote),
  wrappingInputRule(/^\s*([-*])\s$/, nodes.bullet_list),
  wrappingInputRule(
    /^(\d+)\.\s$/,
    nodes.ordered_list,
    (m) => ({ order: +m[1] }),
    (m, node) => node.childCount + node.attrs.order === +m[1],
  ),
  textblockTypeInputRule(/^```([^\s`]*)\s$/, nodes.code_block, (m) => ({ language: m[1] })),
  hrRule,
];

// ── Plugins ───────────────────────────────────────────────────────────────────────────────

const hardBreak: Command = (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(nodes.hard_break.create()).scrollIntoView());
  return true;
};

export function plugins(): Plugin[] {
  return [
    inputRules({ rules }),
    keymap({
      "Mod-b": toggleStrong,
      "Mod-i": toggleEm,
      "Mod-`": toggleCode,
      "Mod-z": undo,
      "Mod-Shift-z": redo,
      "Mod-y": redo,
      Backspace: undoInputRule,
      Enter: splitListItem(nodes.list_item),
      // Outside a list these fail and Tab moves focus on, as a keyboard user expects.
      Tab: sinkListItem(nodes.list_item),
      "Shift-Tab": liftListItem(nodes.list_item),
      "Shift-Enter": chainCommands(exitCode, hardBreak),
      "Mod-Enter": chainCommands(exitCode, hardBreak),
    }),
    keymap(baseKeymap),
    history(),
  ];
}
