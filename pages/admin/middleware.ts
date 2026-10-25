// Every /admin route: a server-side session check, then the write gate. A visitor's POST is
// refused here, before its body is read; the store refuses it again (DemoRefusal).
import { define } from "../../utils.ts";
import { getStore } from "../../lib/store.ts";
import { readSid } from "../../lib/auth.ts";
import { href, t } from "../../lib/i18n.ts";
import { redirectWithFlash } from "../../lib/flash.ts";

export const handler = define.middleware(async (ctx) => {
  const { locale } = ctx.state;
  const sid = readSid(ctx.req);
  const session = sid ? await (await getStore()).getSession(sid) : null;
  if (!session) {
    const next = encodeURIComponent(ctx.url.pathname);
    return ctx.redirect(`${href(locale, "/connexion")}?next=${next}`, 303);
  }
  ctx.state.role = session.role;
  if (ctx.req.method === "POST" && session.role !== "admin") {
    const d = t(locale).toast;
    return redirectWithFlash(backTo(ctx.req, ctx.url, href(locale, "/admin")), {
      kind: "demo",
      title: d.demoTitle,
      body: d.demoBody,
    });
  }
  return ctx.next();
});

/** The page the form came from, when it is ours; the admin home otherwise. */
function backTo(req: Request, url: URL, fallback: string): string {
  try {
    const ref = new URL(req.headers.get("referer") ?? "");
    if (ref.origin === url.origin) return ref.pathname + ref.search;
  } catch { /* no or bad referer */ }
  return fallback;
}
