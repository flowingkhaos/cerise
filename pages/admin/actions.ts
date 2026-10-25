// /admin/exporter (GET) and /admin/restaurer (POST). Visitors get the demo toast.
import { define } from "../../utils.ts";
import { DemoRefusal, getStore } from "../../lib/store.ts";
import { href, t } from "../../lib/i18n.ts";
import { redirectWithFlash } from "../../lib/flash.ts";
import type { Locale } from "../../lib/types.ts";

function demo(locale: Locale) {
  const d = t(locale).toast;
  return redirectWithFlash(href(locale, "/admin"), { kind: "demo", title: d.demoTitle, body: d.demoBody });
}

export const exportHandler = define.handlers({
  async GET(ctx) {
    try {
      const out = await (await getStore()).exportAll(ctx.state.role);
      const day = new Date().toISOString().slice(0, 10);
      return new Response(JSON.stringify(out, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="cerise-${day}.json"`,
        },
      });
    } catch (e) {
      if (e instanceof DemoRefusal) return demo(ctx.state.locale);
      throw e;
    }
  },
});

export const restoreHandler = define.handlers({
  async POST(ctx) {
    const { locale } = ctx.state;
    try {
      await (await getStore()).restoreSeed(ctx.state.role);
      return redirectWithFlash(href(locale, "/admin"), { kind: "ok", title: t(locale).toast.restored });
    } catch (e) {
      if (e instanceof DemoRefusal) return demo(locale);
      throw e;
    }
  },
});
