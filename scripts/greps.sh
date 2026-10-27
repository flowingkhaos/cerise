#!/bin/sh
# The architecture's conventions as checks. Part of `deno task check`; any hit fails the gate.
set -u
fail=0
no() { # no <description> <grep args...>: fails when grep finds anything
  desc=$1; shift
  hits=$(grep -rnE "$@" 2>/dev/null)
  if [ -n "$hits" ]; then echo "FAIL: $desc"; echo "$hits"; fail=1; fi
}

no "only lib/store.ts touches KV" "lib/kv\.ts|Deno\.openKv|Deno\.Kv\b" routes pages components islands editor main.ts
no "markdown-it is imported only by lib/markdown.ts" "from \"markdown-it\"" routes pages components islands editor main.ts lib/render.ts lib/store.ts
no "public pages render no island and read no session" "islands/|readSid|getSession" pages/Home.tsx pages/Archive.tsx pages/Article.tsx pages/Topics.tsx components
no "only lib/cms.ts sends anything out (the showcase CMS)" "fetch\(" lib pages routes main.ts components --exclude=cms.ts --exclude=cms_test.ts
no "no password material outside lib/auth.ts" "hashPassword|ADMIN_PASSWORD_HASH" routes pages components islands editor
no "public repo: no internal paths" "OSDocs|KhaordicOS|/var/home|flowingkhaos/dev" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=_fresh --exclude-dir=.impeccable --exclude=greps.sh .

[ "$fail" = 0 ] && echo "greps: ok"
exit $fail
