# cerise

A blog for beauty and care professionals, with its own small CMS — and a showcase of what a blog-specific app feels
like. French at `/`, English at `/en`.

- **Fast by construction.** Markdown turns into sanitized HTML once, when a post is saved, and the result is stored. An
  article page is one storage read, a template, and no client JavaScript at all.
- **A real editor.** A ProseMirror editor (in `editor/`) that writes plain markdown, with a source mode one click away.
  Built to be reused.
- **Named components, not MDX.** A post may contain `<Callout type="note">…</Callout>` and
  `<Figure src="/img/…" caption="…" />` — a fixed list turned into fixed HTML on save. No JavaScript in content ever
  runs; an unknown tag refuses the save.
- **A demo nobody can break.** The visitor account (printed on the sign-in page) opens the whole admin; every write
  answers "this is a demo" and changes nothing.
- **Your words stay yours.** The admin exports every post as markdown in one file.
- **Two sources, one look.** Beside its own posts, the blog reads the `articles` of the shared
  [showcase CMS](https://github.com/flowingkhaos/commerce-showcase) (Payload, domain `blog-demo`) and renders them with
  the same renderer. The **Rayons X** switch (« X-ray ») tags every piece of a public page with where it comes from: a
  markdown file copied into Deno KV, the Payload CMS, or the site's code.

Stack: [Fresh 2](https://fresh.deno.dev) + Preact on Deno, Deno KV, Deno Deploy. No AI, no analytics, no trackers.

## Run it

```sh
deno install
deno task dev            # http://localhost:5173 — a local KV file in .data/
```

Sign in with the visitor account: `visiteur` / `cerise`. To have an admin, set two variables (in `.env` locally, in the
host's settings in production):

```sh
deno run scripts/hash-password.ts   # prints ADMIN_PASSWORD_HASH for a 24+ character password
ADMIN_USERNAME=you
ADMIN_PASSWORD_HASH=pbkdf2$600000$…
```

| Variable                                | Meaning                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` | the one account that can write; without them there is no admin                 |
| `KV_PATH`                               | local KV file (default `.data/kv.sqlite3`); Deno Deploy uses its attached KV   |
| `CMS_URL`                               | the showcase CMS to read (allowed hosts in `lib/cms.ts`); unset = the fixtures |

The posts in `content/fr` and `content/en` load into an empty store on first start. The admin can restore them at any
time.

### The CMS articles

`lib/cms.ts` reads `/api/articles?where[domain.slug][equals]=blog-demo&where[locale][equals]=<fr|en>&depth=1` once per
language and keeps it 60 s; a read slower than 2.5 s serves the last good copy (or `content/cms-articles-<fr|en>.json`,
a saved real answer) while it finishes. The newest post on the home page is always one of cerise's own (its one-tap
editor edits those only); the CMS articles join the rest by date. To see them locally, run the showcase CMS on :4620 and
`CMS_URL=http://localhost:4620 deno task dev`.

The three articles about how this blog works live in `scripts/cms-articles/` (markdown, covers, credits). Write them to
a CMS with its admin key — creates or updates, published, the English one linked to the French one:

```sh
python3 -I scripts/cms-articles.py ~/.config/kos/showcase-cms.local.env http://localhost:4620
python3 -I scripts/cms-articles.py ~/.config/kos/showcase-cms.prod-admin.env https://showcase-cms-1065657380974.us-east5.run.app
```

Then refresh the fixtures from the CMS you deploy against:

```sh
for l in fr en; do curl -sgf "https://showcase-cms-1065657380974.us-east5.run.app/api/articles?where[domain.slug][equals]=blog-demo&where[locale][equals]=$l&sort=-publishedAt&depth=1" | python3 -m json.tool --indent 1 > content/cms-articles-$l.json; done
```

### Live preview

The showcase CMS admin shows a draft of a cerise article beside its form while the author types (autosave every 3 s).
Contract: the CMS README § Live preview.

- **The link.** The admin opens `/preview?collection=articles&id=<id>&exp=<unix s>&sig=<hex>` in its iframe. It builds
  the link from the `url` of the `blog-demo` domain row; the third argument of `scripts/cms-articles.py` writes it
  (`https://cerise.flowingkhaos.deno.net` in production).
- **The read.** `pages/Preview.tsx` passes the four values to `GET ${CMS_URL}/api/preview` (`lib/cms.ts` `readPreview`);
  the CMS checks the signature and answers the latest draft. cerise holds no secret and caches nothing. Only `blog-demo`
  articles render; 403 = the link expired (1–2 h): reopen the preview in the admin.
- **The frame.** `/preview` alone may be framed, by the CMS origin only (`frame-ancestors`, `main.ts`), and is
  `private, no-store`. It renders with the article page's own view, X-ray off, and one inline script — the only script
  outside the admin: it tells the admin the page is ready, then reloads on each save.

## Check, test, ship

```sh
deno task check   # fmt, lint, types, and scripts/greps.sh (the architecture's rules)
deno task test    # renderer, store, auth, guard, editor round-trips
deno task build && deno serve -A --unstable-kv --port 8000 _fresh/server.js
deno run -A scripts/smoke.ts http://127.0.0.1:8000
scripts/deploy.sh # needs DENO_DEPLOY_TOKEN
```

Production reads the live CMS once `CMS_URL` is set on the app (once; it survives redeploys). The CLI runs from an empty
temp dir: it writes a `deno.jsonc` (org + app) where it runs.

```sh
cd "$(mktemp -d)" && deno run -A --node-modules-dir=auto jsr:@deno/deploy env add CMS_URL https://showcase-cms-1065657380974.us-east5.run.app --org flowingkhaos --app cerise --non-interactive
```

## How it is put together

```
main.ts            guard first, cache rules, static files, seeding
lib/markdown.ts    the one markdown parser (server and editor share it) + named components
lib/render.ts      render on save: sanitize, heading ids, table of contents (server only)
lib/store.ts       the only module that touches KV; atomic writes; chunked bodies
lib/auth.ts        PBKDF2 admin, the public visitor account, sessions
lib/guard.ts       rate limit, cross-site and size refusals, security headers
lib/cms.ts         the only module that sends anything out: the showcase CMS's articles, cached, with a spare copy
components/xray.tsx  Rayons X: tags, legend, readouts (lib/xray.ts counts the tags; routes/rayons-x.ts is the switch)
editor/            the ProseMirror editor; islands/Editor.tsx mounts it
pages/, routes/    French routes; routes/en/ re-exports them for English
content/           the seed posts, in markdown
```

## Credits

Post photos from [Pexels](https://www.pexels.com), the CMS articles' covers too (see `design/CREDITS.md`). Fonts: Roundo
and Figtree (SIL OFL, self-hosted); Sentient (ITF Free Font License) is loaded from Fontshare, since its licence does
not allow it in a public repository.

## Licence

MIT — see `LICENSE`. Fonts and photos keep their own licences.
