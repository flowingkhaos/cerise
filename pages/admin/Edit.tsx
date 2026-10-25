// /admin/posts/:id — the editor and the publication form. id "nouveau" is a new post.
// A refused save re-renders with the errors and everything typed, never a redirect that loses it.
import { page } from "fresh";
import { define } from "../../utils.ts";
import { DemoRefusal, getStore, SLUG } from "../../lib/store.ts";
import { href, t } from "../../lib/i18n.ts";
import { redirectWithFlash } from "../../lib/flash.ts";
import { images } from "../../lib/images.ts";
import type { Locale, PostInput, Role, Status } from "../../lib/types.ts";
import AdminShell from "./AdminShell.tsx";
import Editor from "../../islands/Editor.tsx";

const NEW = "nouveau";

const blank = (locale: Locale): PostInput => ({
  locale,
  slug: "",
  title: "",
  excerpt: "",
  topics: [],
  cover: "",
  coverAlt: "",
  status: "draft",
  source: "",
});

function readForm(form: FormData): PostInput {
  const s = (k: string) => String(form.get(k) ?? "");
  return {
    locale: s("locale") === "en" ? "en" : "fr",
    slug: s("slug").trim().toLowerCase(),
    title: s("title"),
    excerpt: s("excerpt"),
    topics: s("topics").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean),
    cover: s("cover"),
    coverAlt: s("coverAlt"),
    status: "draft",
    source: s("source").replace(/\r\n/g, "\n"),
  };
}

interface Data {
  id: string;
  input: PostInput;
  current: Status | null;
  errors: string[];
}

export const handler = define.handlers({
  async GET(ctx) {
    const { id } = ctx.params;
    if (id === NEW) return page<Data>({ id, input: blank(ctx.state.locale), current: null, errors: [] });
    const found = await (await getStore()).getForEdit(id);
    if (!found) return ctx.next();
    const { post, source } = found;
    const input: PostInput = { ...post, source };
    return page<Data>({ id, input, current: post.status, errors: [] });
  },

  async POST(ctx) {
    const { locale, role } = ctx.state;
    const d = t(locale);
    const { id } = ctx.params;
    const form = await ctx.req.formData();
    const intent = String(form.get("intent") ?? "draft");
    const store = await getStore();
    try {
      if (intent === "delete" && id !== NEW) {
        await store.deletePost(role, id);
        return redirectWithFlash(href(locale, "/admin"), { kind: "ok", title: d.toast.deleted });
      }
      const input = readForm(form);
      input.status = intent === "publish" ? "published" : "draft";
      const r = await store.savePost(role, id === NEW ? null : id, input);
      if (!r.ok) {
        const current = id === NEW ? null : (await store.getForEdit(id))?.post.status ?? null;
        return page<Data>({ id, input, current, errors: r.errors }, { status: 422 });
      }
      const title = intent === "publish"
        ? d.toast.published
        : intent === "unpublish"
        ? d.toast.unpublished
        : d.toast.saved;
      return redirectWithFlash(href(locale, `/admin/posts/${r.id}`), { kind: "ok", title });
    } catch (e) {
      if (e instanceof DemoRefusal) {
        return redirectWithFlash(href(locale, `/admin/posts/${id}`), {
          kind: "demo",
          title: d.toast.demoTitle,
          body: d.toast.demoBody,
        });
      }
      throw e;
    }
  },
});

function labels(locale: Locale): Record<string, string> {
  const d = t(locale);
  const fr = locale === "fr";
  return {
    ...Object.fromEntries(Object.entries(d.admin.form).map(([k, v]) => [k, String(v)])),
    demoTitle: d.toast.demoTitle,
    demoBody: d.toast.demoBody,
    close: d.toast.close,
    bold: fr ? "Gras" : "Bold",
    italic: fr ? "Italique" : "Italic",
    strike: fr ? "Barré" : "Strikethrough",
    code: fr ? "Code" : "Code",
    h2: fr ? "Intertitre H2" : "Heading H2",
    h3: fr ? "Sous-titre H3" : "Subheading H3",
    bulletList: fr ? "Liste à puces" : "Bulleted list",
    orderedList: fr ? "Liste numérotée" : "Numbered list",
    quote: fr ? "Citation" : "Quote",
    codeBlock: fr ? "Bloc de code" : "Code block",
    link: fr ? "Lien" : "Link",
    linkPrompt: fr ? "Adresse du lien (https://…)" : "Link address (https://…)",
    hr: fr ? "Séparateur" : "Divider",
    callout: fr ? "Encadré" : "Callout",
    figure: fr ? "Image" : "Image",
    figurePick: fr ? "Choisir une image" : "Pick an image",
    caption: fr ? "Légende" : "Caption",
    undo: fr ? "Annuler" : "Undo",
    redo: fr ? "Rétablir" : "Redo",
    source: fr ? "Markdown" : "Markdown",
    rich: fr ? "Mise en page" : "Formatted",
    toolbar: fr ? "Mise en forme" : "Formatting",
    note: fr ? "Note" : "Note",
    astuce: fr ? "Astuce" : "Tip",
    attention: fr ? "Attention" : "Warning",
    calloutType: fr ? "Type d’encadré" : "Callout type",
    editor: fr ? "Éditeur de texte" : "Text editor",
    linkInvalid: fr
      ? "Adresse refusée : utilisez https://, mailto: ou un lien du site."
      : "Address refused: use https://, mailto: or a link on this site.",
    figureCaption: fr ? "Légende" : "Caption",
    figureAlt: fr ? "Description pour les lecteurs d’écran" : "Description for screen readers",
    figureInsert: fr ? "Insérer l’image" : "Insert image",
    cancel: fr ? "Annuler" : "Cancel",
    calloutNote: fr ? "Note" : "Note",
    calloutAstuce: fr ? "Astuce" : "Tip",
    calloutAttention: fr ? "Attention" : "Warning",
    sourceErrors: fr ? "À corriger avant la mise en page :" : "Fix before formatting:",
  };
}

export default define.page<typeof handler>(function Edit({ data, state }) {
  const { locale, role } = state;
  const d = t(locale).admin;
  const f = d.form;
  const { id, input, current, errors } = data;
  const action = href(locale, `/admin/posts/${id}`);
  const pics = images(locale);
  return (
    <AdminShell locale={locale} role={role as Role} toast={state.toast}>
      <div class="admin-tete">
        <h1>{id === NEW ? d.newPost : d.edit}</h1>
        <div class="admin-actions">
          {current === "published" && SLUG.test(input.slug) && (
            <a class="pill pill-ligne" href={href(input.locale, `/articles/${input.slug}`)}>{d.view} →</a>
          )}
        </div>
      </div>
      {errors.length > 0 && (
        <div class="erreurs" role="alert">
          <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      <form id="publication" class="edition" method="post" action={action}>
        <div>
          <label class="visually-hidden" for="title">{f.title}</label>
          <input
            id="title"
            class="edition-titre"
            name="title"
            required
            maxlength={160}
            value={input.title}
            placeholder={f.title}
          />
          <p class="aide" style="margin:.5rem 0 1.25rem;color:#6b5a5d;font-size:.875rem">{f.titleHint}</p>
          <Editor
            name="source"
            initial={input.source}
            role={role ?? "visitor"}
            formId="publication"
            images={pics}
            labels={labels(locale)}
          />
        </div>
        <aside class="panneau" aria-label={locale === "fr" ? "Publication" : "Publishing"}>
          <div class="champ">
            <label for="slug">{f.slug}</label>
            <input id="slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength={80} value={input.slug} />
            <span class="aide">{f.slugHint}</span>
          </div>
          <div class="champ">
            <label for="excerpt">{f.excerpt}</label>
            <textarea id="excerpt" name="excerpt" rows={3} maxlength={320}>{input.excerpt}</textarea>
          </div>
          <div class="champ">
            <label for="topics">{f.topics}</label>
            <input id="topics" name="topics" value={input.topics.join(", ")} />
            <span class="aide">{f.topicsHint}</span>
          </div>
          <div class="champ">
            <label for="locale">{f.locale}</label>
            <select id="locale" name="locale">
              <option value="fr" selected={input.locale === "fr"}>Français</option>
              <option value="en" selected={input.locale === "en"}>English</option>
            </select>
          </div>
          <fieldset class="champ" style="border:0;padding:0">
            <legend style="font-weight:700;font-size:.9375rem;margin-bottom:.5rem">{f.cover}</legend>
            <div class="couvertures">
              {pics.map((p) => (
                <label>
                  <input type="radio" name="cover" value={p.src} checked={input.cover === p.src} aria-label={p.alt} />
                  <img src={p.src} alt="" width="80" height="80" loading="lazy" />
                </label>
              ))}
            </div>
          </fieldset>
          <div class="champ">
            <label for="coverAlt">{f.coverAlt}</label>
            <input id="coverAlt" name="coverAlt" value={input.coverAlt} maxlength={200} />
          </div>
          <div class="boutons">
            <button class="pill pill-rouge" type="submit" name="intent" value="publish">{f.publish}</button>
            <button
              class="pill pill-ligne"
              type="submit"
              name="intent"
              value={current === "published" ? "unpublish" : "draft"}
            >
              {current === "published" ? f.unpublish : f.saveDraft}
            </button>
          </div>
          {id !== NEW && (
            <details>
              <summary class="danger">{f.delete}…</summary>
              <p style="margin:.5rem 0;font-size:.9375rem">{f.deleteConfirm}</p>
              <button class="pill pill-rouge" type="submit" name="intent" value="delete" formnovalidate>
                {f.delete}
              </button>
            </details>
          )}
        </aside>
      </form>
    </AdminShell>
  );
});
