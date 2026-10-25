// /connexion — the visitor account is printed here on purpose; the admin's lives in the env.
import { page } from "fresh";
import { define } from "../utils.ts";
import { getStore } from "../lib/store.ts";
import { href, t } from "../lib/i18n.ts";
import { checkCredentials, loginLimiter, readSid, safeNext, sessionCookie, VISITOR } from "../lib/auth.ts";
import { clientIp } from "../lib/guard.ts";
import { Masthead, Seo, Toast } from "../components/ui.tsx";

const DAY = 24 * 60 * 60;

export const handler = define.handlers({
  async GET(ctx) {
    const sid = readSid(ctx.req);
    const admin = href(ctx.state.locale, "/admin");
    if (sid && await (await getStore()).getSession(sid)) return ctx.redirect(admin, 303);
    return page({
      error: null as string | null,
      username: "",
      next: safeNext(ctx.url.searchParams.get("next"), admin),
    });
  },

  async POST(ctx) {
    const { locale } = ctx.state;
    const d = t(locale).login;
    const form = await ctx.req.formData();
    const username = String(form.get("username") ?? "");
    const password = String(form.get("password") ?? "");
    const next = safeNext(String(form.get("next") ?? ""), href(locale, "/admin"));
    const ip = clientIp(ctx.req, (ctx.info.remoteAddr as Deno.NetAddr).hostname);
    if (!(await loginLimiter.limit({ key: ip })).success) {
      return page({ error: d.slow, username, next }, { status: 429 });
    }
    const role = await checkCredentials(username, password);
    if (!role) return page({ error: d.failed, username, next }, { status: 401 });

    const sid = await (await getStore()).createSession(role); // a new id at every sign-in
    return new Response(null, {
      status: 303,
      headers: { location: next, "set-cookie": sessionCookie(ctx.req, sid, DAY) },
    });
  },
});

export default define.page<typeof handler>(function Login({ data, state, url }) {
  const { locale } = state;
  const d = t(locale).login;
  return (
    <>
      <Seo locale={locale} url={url} title={`${d.title} — cerise`} description={d.lede} />
      <main id="contenu" class="connexion">
        <div class="connexion-photo">
          <Masthead locale={locale} path={url.pathname} />
          <img class="photo" src="/img/vitrine.webp" alt="" width="928" height="1152" />
        </div>
        <div class="connexion-corps">
          <h1>{d.title}</h1>
          <p class="lede">{d.lede}</p>
          <div class="visiteur">
            <h2>{d.visitor}</h2>
            <dl class="identifiants">
              <dt>{d.username}</dt>
              <dd>{VISITOR.username}</dd>
              <dt>{d.password}</dt>
              <dd>{VISITOR.password}</dd>
            </dl>
          </div>
          {data.error && <p class="erreurs" role="alert">{data.error}</p>}
          <form class="champs" method="post">
            <input type="hidden" name="next" value={data.next} />
            <div class="champ">
              <label for="username">{d.username}</label>
              <input id="username" name="username" autocomplete="username" required value={data.username} />
            </div>
            <div class="champ">
              <label for="password">{d.password}</label>
              <input id="password" name="password" type="password" autocomplete="current-password" required />
            </div>
            <button class="pill pill-rouge" type="submit">
              {d.submit} <span class="fleche" aria-hidden="true">→</span>
            </button>
          </form>
        </div>
      </main>
      <Toast toast={state.toast} />
    </>
  );
});
