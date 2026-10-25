// /admin — every post, both languages, drafts included. Visitors see the same screen.
import { page } from "fresh";
import { define } from "../../utils.ts";
import { getStore } from "../../lib/store.ts";
import { fmtDate, href, t } from "../../lib/i18n.ts";
import { Title } from "../../components/ui.tsx";
import type { Status } from "../../lib/types.ts";
import AdminShell from "./AdminShell.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const f = ctx.url.searchParams.get("statut");
    const status: Status | undefined = f === "draft" || f === "published" ? f : undefined;
    return page({ posts: await (await getStore()).listAll(status), status });
  },
});

export default define.page<typeof handler>(function AdminList({ data, state }) {
  const { locale, role } = state;
  const d = t(locale).admin;
  const tab = (s: Status | undefined, label: string) => (
    <a href={href(locale, "/admin") + (s ? `?statut=${s}` : "")} aria-current={data.status === s ? "page" : "false"}>
      {label}
    </a>
  );
  return (
    <AdminShell locale={locale} role={role} toast={state.toast}>
      <div class="admin-tete">
        <h1>{d.title}</h1>
        <div class="admin-actions">
          <a class="pill pill-ligne" href={href(locale, "/admin/exporter")}>{d.export}</a>
          <form method="post" action={href(locale, "/admin/restaurer")}>
            <details>
              <summary class="pill pill-ligne">{d.restore}</summary>
              <p style="margin:.75rem 0;max-width:32ch">{d.restoreConfirm}</p>
              <button class="pill pill-rouge" type="submit">{d.restore}</button>
            </details>
          </form>
          <a class="pill pill-rouge" href={href(locale, "/admin/posts/nouveau")}>{d.newPost}</a>
        </div>
      </div>
      <nav class="onglets" aria-label={d.title}>
        {tab(undefined, d.all)}
        {tab("published", d.published)}
        {tab("draft", d.drafts)}
      </nav>
      {data.posts.length
        ? (
          <table class="table">
            <thead>
              <tr>
                <th class="cacher-mobile">
                  <span class="visually-hidden">{d.form.cover}</span>
                </th>
                <th>{d.form.title}</th>
                <th>{d.form.locale}</th>
                <th>{locale === "fr" ? "Statut" : "Status"}</th>
                <th class="cacher-mobile">{locale === "fr" ? "Date" : "Date"}</th>
              </tr>
            </thead>
            <tbody>
              {data.posts.map((p) => (
                <tr>
                  <td class="cacher-mobile">
                    {p.cover
                      ? <img class="vignette" src={p.cover} alt="" width="112" height="112" loading="lazy" />
                      : null}
                  </td>
                  <td class="titre">
                    <a href={href(locale, `/admin/posts/${p.id}`)}>
                      <Title text={p.title} as="h3" />
                    </a>
                  </td>
                  <td>
                    <span class="langue">{p.locale}</span>
                  </td>
                  <td>
                    <span class={`statut statut--${p.status}`}>{d.status[p.status]}</span>
                  </td>
                  <td class="num cacher-mobile">{fmtDate(locale, p.publishedAt || p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
        : <p class="vide-liste">{d.empty}</p>}
    </AdminShell>
  );
});
