import type { ComponentChildren } from "preact";
import type { Locale, Role, Toast as ToastT } from "../../lib/types.ts";
import { href, t } from "../../lib/i18n.ts";
import { Toast } from "../../components/ui.tsx";

export default function AdminShell(
  { locale, role, toast, children }: { locale: Locale; role: Role | null; toast?: ToastT; children: ComponentChildren },
) {
  const d = t(locale);
  return (
    <>
      <div class="admin-barre">
        <header class="barre">
          <a class="marque" href={href(locale, "/")}>
            cerise<span>.</span>
          </a>
          <nav aria-label={d.nav.admin}>
            <a href={href(locale, "/admin")}>{d.admin.title}</a>
            <a href={href(locale, "/")}>{locale === "fr" ? "Voir le site" : "View site"}</a>
            <a class="garde" href={locale === "fr" ? "/en/admin" : "/admin"} lang={locale === "fr" ? "en" : "fr"}>
              {d.nav.other}
            </a>
            <span class="role">{d.admin.signedInAs(role ?? "visitor")}</span>
            <form method="post" action={href(locale, "/deconnexion")}>
              <button type="submit">{d.login.signOut}</button>
            </form>
          </nav>
        </header>
      </div>
      {role === "visitor" && <p class="bandeau-visiteur" role="note">{d.admin.visitorBanner}</p>}
      <main id="contenu" class="admin">{children}</main>
      <Toast toast={toast} />
    </>
  );
}
