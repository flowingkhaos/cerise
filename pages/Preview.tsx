// Live preview (README § Live preview): the showcase CMS admin shows this page in its iframe, through
// a link it signed. It renders the latest draft of one of our CMS articles with the article page's own
// view, and reloads when the admin saves (Payload's `payload-document-event`). main.ts lets only the
// CMS admin frame it and marks it no-store; the X-ray stays off here.
import { HttpError } from "fresh";
import { define } from "../utils.ts";
import { getCms, readPreview, toEntry } from "../lib/cms.ts";
import Article from "./Article.tsx";

const REFUSED: Record<number, string> = {
  403: "Ce lien d’aperçu a expiré. Rouvrez l’aperçu dans l’administration du CMS.\n" +
    "This preview link has expired. Reopen the preview in the CMS admin.",
  503: "Le CMS ne répond pas. Réessayez dans un instant.\nThe CMS is not answering. Try again in a moment.",
};

// Tells the admin the page is ready (it sends nothing before that), then reloads on each save.
const reload = (origin: string) =>
  `(()=>{const o=${
    JSON.stringify(origin)
  };parent.postMessage({type:"payload-live-preview",ready:true},o);addEventListener("message",e=>{if(e.origin===o&&e.data&&e.data.type==="payload-document-event")location.reload()})})()`;

export const handler = define.handlers({
  async GET(ctx) {
    const base = getCms().base;
    const started = Date.now();
    const { status, doc } = await readPreview(base, ctx.url.searchParams);
    if (!doc) {
      if (status === 404) throw new HttpError(404);
      return new Response(REFUSED[status], { status, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    ctx.state.locale = doc.locale === "en" ? "en" : "fr";
    ctx.state.xray = false;
    const entry = toEntry(doc, base);
    const now = Date.now();
    return {
      data: {
        ...entry,
        other: null,
        next: null,
        related: [],
        kvMs: 0,
        list: { entries: [entry], from: "live" as const, at: now, ms: now - started },
        now,
      },
    };
  },
});

export default define.page<typeof handler>(function Preview(props) {
  const base = getCms().base;
  return (
    <>
      <Article {...props} />
      {base && (
        // deno-lint-ignore react-no-danger -- our own script; the origin comes from CMS_URL
        <script dangerouslySetInnerHTML={{ __html: reload(new URL(base).origin) }} />
      )}
    </>
  );
});
