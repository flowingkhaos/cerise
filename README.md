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

| Variable                                | Meaning                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` | the one account that can write; without them there is no admin               |
| `KV_PATH`                               | local KV file (default `.data/kv.sqlite3`); Deno Deploy uses its attached KV |

The posts in `content/fr` and `content/en` load into an empty store on first start. The admin can restore them at any
time.

## Check, test, ship

```sh
deno task check   # fmt, lint, types, and scripts/greps.sh (the architecture's rules)
deno task test    # renderer, store, auth, guard, editor round-trips
deno task build && deno serve -A --unstable-kv --port 8000 _fresh/server.js
deno run -A scripts/smoke.ts http://127.0.0.1:8000
scripts/deploy.sh # needs DENO_DEPLOY_TOKEN
```

## How it is put together

```
main.ts            guard first, cache rules, static files, seeding
lib/markdown.ts    the one markdown parser (server and editor share it) + named components
lib/render.ts      render on save: sanitize, heading ids, table of contents (server only)
lib/store.ts       the only module that touches KV; atomic writes; chunked bodies
lib/auth.ts        PBKDF2 admin, the public visitor account, sessions
lib/guard.ts       rate limit, cross-site and size refusals, security headers
editor/            the ProseMirror editor; islands/Editor.tsx mounts it
pages/, routes/    French routes; routes/en/ re-exports them for English
content/           the seed posts, in markdown
```

## Credits

Post photos from [Pexels](https://www.pexels.com) (see `design/CREDITS.md`). Fonts: Roundo and Figtree (SIL OFL,
self-hosted); Sentient (ITF Free Font License) is loaded from Fontshare, since its licence does not allow it in a public
repository.

## Licence

MIT — see `LICENSE`. Fonts and photos keep their own licences.
