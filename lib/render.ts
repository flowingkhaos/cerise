// Render on save (server only): markdown → sanitized HTML + table of contents + word count.
// Runs once per save, never per request. A leaked admin login can deface a post but cannot
// plant a script: the output passes this allow-list.
// @ts-types="npm:@types/sanitize-html@2.16.2"
import sanitizeHtml from "sanitize-html";
import { md, type MdEnv } from "./markdown.ts";
import type { Heading, Locale } from "./types.ts";

export interface Rendered {
  html: string;
  toc: Heading[];
  words: number;
  minutes: number;
  errors: string[];
}

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "em",
    "strong",
    "s",
    "a",
    "img",
    "figure",
    "figcaption",
    "aside",
    "hr",
    "br",
  ],
  allowedAttributes: {
    a: ["href", "title", "rel"],
    img: ["src", "alt", "loading", "decoding"],
    h2: ["id"],
    h3: ["id"],
    h4: ["id"],
    aside: ["class"],
    figure: ["class"],
    code: ["class"],
    ol: ["start"],
  },
  allowedClasses: {
    aside: ["callout", "callout--note", "callout--astuce", "callout--attention"],
    figure: ["figure"],
    code: [/^language-[\w-]+$/],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: [] }, // images: site paths only, checked below
  allowProtocolRelative: false,
  exclusiveFilter: (f) => f.tag === "img" && !String(f.attribs.src ?? "").startsWith("/img/"),
  transformTags: {
    a: (tag, attribs) =>
      /^https?:/.test(attribs.href ?? "")
        ? { tagName: tag, attribs: { ...attribs, rel: "noopener noreferrer" } }
        : { tagName: tag, attribs },
  },
  disallowedTagsMode: "discard",
};

function slugify(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
}

// French spacing: the plain space before : ; ! ? » and after « becomes a narrow no-break
// space, so the mark never wraps to the next line alone.
const NNBSP = "\u202F";
function frenchSpacing(s: string): string {
  return s.replace(/ ([:;!?»])/g, `${NNBSP}$1`).replace(/« /g, `«${NNBSP}`);
}

export function render(source: string, locale: Locale): Rendered {
  const env: MdEnv = {};
  const tokens = md.parse(source, env);
  const toc: Heading[] = [];
  const used = new Set<string>();
  let words = 0;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type === "heading_open") {
      // The page title is the only h1: body headings live between h2 and h4.
      const level = Math.min(4, Math.max(2, Number(tok.tag.slice(1))));
      tok.tag = `h${level}`;
      tokens[i + 2].tag = `h${level}`;
      const text = tokens[i + 1].content;
      let id = slugify(text), n = 2;
      while (used.has(id)) id = `${slugify(text)}-${n++}`;
      used.add(id);
      tok.attrSet("id", id);
      if (level <= 3) toc.push({ id, text, level: level as 2 | 3 });
    }
    if (tok.type === "inline") {
      words += tok.content.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
      if (locale === "fr") {
        for (const child of tok.children ?? []) {
          if (child.type === "text") child.content = frenchSpacing(child.content);
        }
      }
    }
  }

  const html = sanitizeHtml(md.renderer.render(tokens, md.options, env), SANITIZE);
  return { html, toc, words, minutes: Math.max(1, Math.round(words / 200)), errors: env.errors ?? [] };
}
