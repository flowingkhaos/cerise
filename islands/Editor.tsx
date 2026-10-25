// The post editor. Without JavaScript it is the plain <textarea> the server renders, and the
// form still works. With it, ProseMirror takes over and keeps the textarea equal to the
// markdown on every change, so the form always submits the writer's text.
import { useEffect, useRef, useState } from "preact/hooks";
import { type Command, EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { MdEnv } from "../lib/markdown.ts";
import * as cmd from "../editor/commands.ts";
import { attrText, parse, serialize } from "../editor/markdown.ts";
import { schema } from "../editor/schema.ts";
import { nodeViews } from "../editor/views.ts";

export interface EditorProps {
  name: string;
  initial: string;
  role: "admin" | "visitor";
  formId: string;
  images: { src: string; alt: string }[];
  labels: Record<string, string>;
}

const { nodes, marks } = schema;

// 20 × 20, drawn with one 1.75 stroke (styles/editor.css).
const ICON = {
  bold: "M6 4h5a3 3 0 0 1 0 6H6zm0 6h6a3 3 0 0 1 0 6H6z",
  italic: "M9 4h6M5 16h6M12 4 8 16",
  strike: "M4 10h12M13.5 6.5C13 5 11.7 4 10 4 8 4 6.5 5 6.5 6.5M6.5 13.5C7 15 8.3 16 10 16c2 0 3.5-1 3.5-2.5",
  code: "M7 6l-4 4 4 4M13 6l4 4-4 4",
  bullet: "M8 5h9M8 10h9M8 15h9M3.5 5h.01M3.5 10h.01M3.5 15h.01",
  ordered: "M9 5h8M9 10h8M9 15h8M3 4.5 4.5 3v4.5M3 12.5a1.5 1.5 0 0 1 3 .5c0 1.2-3 1.8-3 4h3",
  quote: "M4 4v12M8 6h8M8 10h8M8 14h5",
  codeBlock: "M3 4h14v12H3zM8 8l-2 2 2 2M12 8l2 2-2 2",
  link:
    "M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l1-1",
  hr: "M3 10h14",
  undo: "M7 4 3 8l4 4M3 8h9a4 4 0 0 1 0 8H9",
  redo: "M13 4l4 4-4 4M17 8H8a4 4 0 0 0 0 8h3",
};

interface Tool {
  key: string; // label key, also the button's accessible name
  icon?: string;
  text?: string;
  cmd?: Command;
  click?: () => void; // instead of a command: opens a prompt or a dialog
  can?: (s: EditorState) => boolean; // default: the command dry-runs
  on?: (s: EditorState) => boolean; // a toggle: shown pressed
}

const keep = (e: Event) => e.preventDefault(); // a toolbar click must not steal the editor's focus

export default function Editor({ name, initial, role, formId, images, labels }: EditorProps) {
  const t = (k: string) => labels[k] ?? k;
  const host = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const view = useRef<EditorView | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const captionInput = useRef<HTMLInputElement>(null);
  const sourceSeen = useRef<string | null>(null); // textarea value when source mode opened
  const submitted = useRef(false);
  const refocus = useRef(false);

  const [state, setState] = useState<EditorState | null>(null); // null until mounted
  const [mode, setMode] = useState<"rich" | "source">("rich");
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [toast, setToast] = useState(0); // bumps on each refused submit, restarting the timer
  const [pick, setPick] = useState<{ src: string; alt: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [alt, setAlt] = useState("");

  useEffect(() => {
    const area = ta.current!;
    // The HTML parser drops one leading newline from a textarea: put the exact source back.
    if ("\n" + area.value === initial) area.value = initial;
    const base = parse(initial);
    const env: MdEnv = {};
    const v: EditorView = new EditorView(host.current!, {
      state: EditorState.create({ doc: parse(area.value, env), plugins: cmd.plugins() }),
      nodeViews: nodeViews(t),
      attributes: { class: "ed-prose", role: "textbox", "aria-multiline": "true", "aria-label": t("editor") },
      dispatchTransaction(tr) {
        const next = v.state.apply(tr);
        v.updateState(next);
        if (tr.docChanged) {
          // Untouched (or undone back) text keeps its exact original markdown.
          area.value = next.doc.eq(base) ? initial : serialize(next.doc);
          setDirty(area.value !== initial);
        }
        setState(next);
      },
    });
    view.current = v;
    setState(v.state);
    setDirty(area.value !== initial);
    if (env.errors?.length) { // show the problem in the source rather than hide it in rich text
      setErrors(env.errors);
      setMode("source");
    }

    const form = document.getElementById(formId);
    const onSubmit = (e: Event) => {
      if (role === "visitor") { // the server refuses too; this keeps the visitor's text on screen
        e.preventDefault();
        setToast((n) => n + 1);
      } else submitted.current = true;
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (submitted.current || area.value === initial) return;
      e.preventDefault();
      e.returnValue = "";
    };
    form?.addEventListener("submit", onSubmit);
    addEventListener("beforeunload", onLeave);
    return () => {
      form?.removeEventListener("submit", onSubmit);
      removeEventListener("beforeunload", onLeave);
      v.destroy();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(0), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    if (mode === "source") ta.current!.focus();
    else view.current!.focus();
  }, [mode]);

  useEffect(() => {
    if (pick) captionInput.current!.focus();
  }, [pick]);

  const exec = (c: Command) => {
    const v = view.current!;
    c(v.state, v.dispatch, v);
    v.focus();
  };

  const toggleMode = () => {
    const v = view.current!, area = ta.current!;
    if (mode === "rich") {
      sourceSeen.current = area.value;
    } else if (area.value !== sourceSeen.current) {
      const env: MdEnv = {};
      const doc = parse(area.value, env);
      if (env.errors?.length) return setErrors(env.errors); // stay in source until it parses clean
      v.dispatch(v.state.tr.replaceWith(0, v.state.doc.content.size, doc.content));
    }
    setErrors([]);
    refocus.current = true;
    setMode(mode === "rich" ? "source" : "rich");
  };

  const editLink = () => {
    const v = view.current!;
    const input = prompt(t("linkPrompt"), cmd.currentHref(v.state));
    if (input === null) return v.focus();
    if (!input.trim()) return exec(cmd.setLink(null));
    const href = cmd.safeHref(input);
    if (!href) {
      alert(t("linkInvalid"));
      return v.focus();
    }
    exec(cmd.setLink(href));
  };

  const openFigure = () => {
    setPick(null);
    dialog.current!.showModal();
  };

  const choose = (img: { src: string; alt: string }) => {
    setCaption("");
    setAlt(img.alt);
    setPick(img);
  };

  const insertFigure = () => {
    if (!pick) return;
    dialog.current!.close();
    exec(cmd.insertFigure({ src: pick.src, alt, caption }));
  };

  const onFieldKey = (e: KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault(); // would submit the publication form
    insertFigure();
  };

  const onBarKey = (e: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const btns = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    const j = e.key === "Home" ? 0 : e.key === "End" ? btns.length - 1 : (i + step + btns.length) % btns.length;
    btns[j].focus();
  };

  const groups: Tool[][] = [
    [
      { key: "bold", icon: ICON.bold, cmd: cmd.toggleStrong, on: (s) => cmd.markActive(s, marks.strong) },
      { key: "italic", icon: ICON.italic, cmd: cmd.toggleEm, on: (s) => cmd.markActive(s, marks.em) },
      { key: "strike", icon: ICON.strike, cmd: cmd.toggleStrike, on: (s) => cmd.markActive(s, marks.s) },
      { key: "code", icon: ICON.code, cmd: cmd.toggleCode, on: (s) => cmd.markActive(s, marks.code) },
    ],
    [
      { key: "h2", text: "H2", cmd: cmd.toggleHeading(2), on: (s) => cmd.blockIs(s, nodes.heading, { level: 2 }) },
      { key: "h3", text: "H3", cmd: cmd.toggleHeading(3), on: (s) => cmd.blockIs(s, nodes.heading, { level: 3 }) },
    ],
    [
      {
        key: "bulletList",
        icon: ICON.bullet,
        cmd: cmd.toggleList(nodes.bullet_list),
        on: (s) => cmd.inside(s, nodes.bullet_list),
      },
      {
        key: "orderedList",
        icon: ICON.ordered,
        cmd: cmd.toggleList(nodes.ordered_list),
        on: (s) => cmd.inside(s, nodes.ordered_list),
      },
      {
        key: "quote",
        icon: ICON.quote,
        cmd: cmd.toggleWrap(nodes.blockquote),
        on: (s) => cmd.inside(s, nodes.blockquote),
      },
      { key: "codeBlock", icon: ICON.codeBlock, cmd: cmd.toggleCodeBlock, on: (s) => cmd.blockIs(s, nodes.code_block) },
    ],
    [
      {
        key: "link",
        icon: ICON.link,
        click: editLink,
        can: (s) => s.selection.$from.parent.type.allowsMarkType(marks.link),
      },
      { key: "hr", icon: ICON.hr, cmd: cmd.insertHr },
    ],
    [
      {
        key: "callout",
        text: t("callout"),
        cmd: cmd.toggleWrap(nodes.callout),
        on: (s) => cmd.inside(s, nodes.callout),
      },
      {
        key: "figure",
        text: t("figure"),
        click: openFigure,
        can: (s) => images.length > 0 && cmd.insertFigure({ src: "", alt: "", caption: "" })(s),
      },
    ],
    [
      { key: "undo", icon: ICON.undo, cmd: cmd.undo },
      { key: "redo", icon: ICON.redo, cmd: cmd.redo },
    ],
  ];

  const rich = state !== null && mode === "rich";
  const status = errors.length ? `${t("sourceErrors")} ${errors.join(" · ")}` : dirty ? t("unsaved") : "";

  return (
    <div class="ed">
      {state && (
        <div class="ed-bar" role="toolbar" aria-label={t("toolbar")} onKeyDown={onBarKey}>
          {groups.map((group) => (
            <div class="ed-group">
              {group.map((tool) => {
                const can = rich && (tool.can ? tool.can(state) : tool.cmd!(state));
                return (
                  <button
                    type="button"
                    class="ed-btn"
                    aria-label={t(tool.key)}
                    title={t(tool.key)}
                    aria-pressed={tool.on ? rich && tool.on(state) : undefined}
                    disabled={!can}
                    onMouseDown={keep}
                    onClick={() => tool.click ? tool.click() : exec(tool.cmd!)}
                  >
                    {tool.icon
                      ? (
                        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                          <path d={tool.icon} />
                        </svg>
                      )
                      : tool.text}
                  </button>
                );
              })}
            </div>
          ))}
          <button
            type="button"
            class="ed-btn ed-mode"
            aria-label={t("source")}
            aria-pressed={mode === "source"}
            onMouseDown={keep}
            onClick={toggleMode}
          >
            {t("source")}
          </button>
        </div>
      )}
      <div ref={host} class="ed-surface" hidden={!rich} />
      <textarea
        ref={ta}
        class="ed-source"
        name={name}
        form={formId}
        aria-label={t("editor")}
        spellcheck
        rows={24}
        hidden={rich}
        onInput={() => setDirty(ta.current!.value !== initial)}
      >
        {initial}
      </textarea>
      {state && <p class="ed-status" data-error={errors.length ? "" : undefined} aria-live="polite">{status}</p>}
      <div class="ed-toasts" role="status">
        {toast > 0 && (
          <div class="ed-toast">
            <p class="ed-toast-title">{t("demoTitle")}</p>
            <p class="ed-toast-body">{t("demoBody")}</p>
            <button type="button" class="ed-action" onClick={() => setToast(0)}>{t("close")}</button>
          </div>
        )}
      </div>
      {state && (
        <dialog
          ref={dialog}
          class="ed-dialog"
          aria-labelledby={`${name}-figure-title`}
          onClose={() => setPick(null)}
        >
          <p class="ed-dialog-title" id={`${name}-figure-title`}>{pick ? t("figure") : t("figurePick")}</p>
          {pick
            ? (
              <div class="ed-figure-form">
                <img class="ed-figure-preview" src={pick.src} alt="" />
                <label class="ed-field">
                  <span>{t("figureCaption")}</span>
                  <input
                    ref={captionInput}
                    type="text"
                    value={caption}
                    onInput={(e) => setCaption(attrText(e.currentTarget.value))}
                    onKeyDown={onFieldKey}
                  />
                </label>
                <label class="ed-field">
                  <span>{t("figureAlt")}</span>
                  <input
                    type="text"
                    value={alt}
                    onInput={(e) => setAlt(attrText(e.currentTarget.value))}
                    onKeyDown={onFieldKey}
                  />
                </label>
              </div>
            )
            : (
              <div class="ed-picks">
                {images.map((img) => (
                  <button type="button" class="ed-pick" onClick={() => choose(img)}>
                    <img src={img.src} alt="" />
                    <span>{img.alt}</span>
                  </button>
                ))}
              </div>
            )}
          <div class="ed-dialog-actions">
            <button type="button" class="ed-action" onClick={() => dialog.current!.close()}>{t("cancel")}</button>
            {pick && (
              <button type="button" class="ed-action ed-action--primary" onClick={insertFigure}>
                {t("figureInsert")}
              </button>
            )}
          </div>
        </dialog>
      )}
    </div>
  );
}
