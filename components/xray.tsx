// Rayons X: a reading layer over the public pages. Off, none of this renders and the page is exactly as live.
// On (a cookie, routes/rayons-x.ts — no script), every piece of the page carries a tag naming its owner and
// where it lives, owned photos get viewfinder corners, and a readout lists what the page never shows.
// Owners: md = a Deno KV post (born as a file in the repo) · cms = the shared Payload CMS · code = the site.
import { createContext, Fragment } from "preact";
import { useContext } from "preact/hooks";
import type { Locale, PostSummary } from "../lib/types.ts";
import type { CmsList } from "../lib/cms.ts";
import { seedFile } from "../lib/xray.ts";
import { t } from "../lib/i18n.ts";

/** On or off for the page. Fresh renders a route outside routes/_app.tsx's tree, so each page root provides it
 * (PageShell, Home, Login) from `state.xray`; a page component itself reads `state.xray`, not this. */
export const Rx = createContext(false);
export const useRx = () => useContext(Rx);

export type Owner = "md" | "cms" | "code";
const OWNER: Record<Owner, string> = { md: "Markdown", cms: "Payload", code: "Code" }; // the same in both languages

/** `a `code` b` → a <i>code</i> b: the strings keep paths and keys in backticks. */
export function Code({ text }: { text: string }) {
  return <>{text.split("`").map((part, i) => (i % 2 ? <i key={i}>{part}</i> : part))}</>;
}

export function Tag(
  { o, label, where, note, at }: { o: Owner; label?: string; where: string; note?: string; at?: string },
) {
  const on = useRx();
  if (!on) return null;
  return (
    <span
      class={`rx-tag${at ? ` ${at.split(" ").map((a) => `rx-tag--${a}`).join(" ")}` : ""}`}
      data-o={o}
      aria-hidden="true"
    >
      <span>
        <b>{label ?? OWNER[o]}</b>
        <i>{where}</i>
        {note && <small>{note}</small>}
      </span>
    </span>
  );
}

/** Viewfinder corners on an owned photo: the class and owner to spread on its frame, when the X-ray is on. */
export function vise(on: boolean, o: Owner, cls = ""): { class: string; "data-o"?: Owner } {
  return on ? { class: `${cls} rx-vise`.trim(), "data-o": o } : { class: cls };
}

/** Where a post lives: a seed file (or a KV key, for a post written in the editor), or its CMS row. */
export function SourceTag({ post, at, une = false }: { post: PostSummary; at?: string; une?: boolean }) {
  const x = t(post.locale).xray;
  if (post.cms) return <Tag o="cms" where={`articles › ${post.slug}`} note={x.cmsCard} at={at} />;
  const file = seedFile(post.locale, post.slug);
  return (
    <Tag
      o="md"
      where={file ?? `Deno KV ["page","${post.locale}","${post.slug}"]`}
      note={file ? (une ? x.kvUne : x.kv) : x.editorPost}
      at={at}
    />
  );
}

/** A photo's owner: a file in the repo, or the CMS media library. */
export function PhotoTag({ post, at }: { post: PostSummary; at?: string }) {
  const x = t(post.locale).xray;
  if (!post.cover) return null;
  return post.cms
    ? (
      <Tag
        o="cms"
        label={x.cmsPhoto}
        where={`media › ${post.cms.media?.file}`}
        note={x.cmsPhotoNote(post.cms.media?.credit ?? "")}
        at={at}
      />
    )
    : <Tag o="md" label={x.mdPhoto} where={`static${post.cover}`} note={x.mdPhotoNote} at={at} />;
}

/** The switch: a form, so the server renders the layer and the page stays script-free. */
export function Switch({ locale, path }: { locale: Locale; path: string }) {
  const on = useRx();
  const x = t(locale).xray;
  return (
    <form class="rx-form" method="post" action="/rayons-x">
      <input type="hidden" name="back" value={path} />
      <button class="rx" type="submit" name="rx" value={on ? "0" : "1"} aria-pressed={on ? "true" : "false"}>
        {x.switch}
        <span class="rx-etat">
          <span class="rx-mot">{on ? x.on : x.off}</span>
        </span>
      </button>
    </form>
  );
}

/** What this page is made of, counted. The numbers are filled in after rendering (lib/xray.ts › fillLegend). */
export function Legend({ locale }: { locale: Locale }) {
  const on = useRx();
  if (!on) return null;
  const x = t(locale).xray;
  return (
    <p class="rx-legende">
      <span class="visually-hidden">{x.legendIntro}</span>
      {(["md", "cms", "code"] as const).map((o) => (
        <span key={o} data-o={o}>
          {OWNER[o]} <b data-rx-count={o}>0</b>
        </span>
      ))}
      <span class="rx-total">
        <b data-rx-count="all">0</b> {x.items}
      </span>
    </p>
  );
}

/** Under the masthead: the legend and the masthead's own tag (desktop; phones carry the legend in the try bar). */
export function XrayRow({ locale, where }: { locale: Locale; where: string }) {
  const on = useRx();
  if (!on) return null;
  return (
    <div class="rx-rang">
      <Legend locale={locale} />
      <Tag o="code" where={where} note={t(locale).xray.head} at="flux" />
    </div>
  );
}

/** The readout: the facts the page never shows, as a definition list. */
export function Readout(
  { title, intro, rows, page = false }: {
    title: string;
    intro: string;
    rows: { o?: Owner; dt: string; dd: string }[];
    page?: boolean;
  },
) {
  const on = useRx();
  if (!on) return null;
  return (
    <section class={`rx-releve${page ? " rx-releve--page" : ""}`} aria-labelledby="releve">
      <div class="rx-releve-corps">
        <h2 id="releve">{title.split("*").map((p, i) => (i % 2 ? <em key={i} class="accent">{p}</em> : p))}</h2>
        <p>{intro}</p>
        <dl>
          {rows.map((r) => (
            <Fragment key={r.dt}>
              <dt data-o={r.o}>{r.dt}</dt>
              <dd>
                <Code text={r.dd} />
              </dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** The CMS read, in one sentence: now, from memory, or a spare copy. */
export function cmsRead(locale: Locale, base: string | undefined, list: CmsList, now = Date.now()): string {
  const x = t(locale).xray;
  const age = Math.max(0, Math.round((now - list.at) / 1000));
  const ms = Math.round(list.ms);
  if (!base) return x.readNone(locale);
  const how = list.from === "live"
    ? x.readLive(ms)
    : list.from === "cache"
    ? x.readCache(age, ms)
    : list.at
    ? x.readStale(age)
    : x.readFixture(locale);
  return `${x.readGet(locale, new URL(base).host)} ${how} ${x.readMemory}`;
}
