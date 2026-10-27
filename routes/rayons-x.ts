// POST /rayons-x — the X-ray switch. A cookie, like the light/dark pick, so the server renders the layer and
// public pages stay script-free. Pages rendered with it on are never shared from a cache (main.ts).
import { define } from "../utils.ts";
import { safeNext } from "../lib/auth.ts";

const YEAR = 365 * 24 * 60 * 60;

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const on = form.get("rx") === "1";
    return new Response(null, {
      status: 303,
      headers: {
        location: safeNext(String(form.get("back") ?? ""), "/"),
        "set-cookie": `cerise_rx=${on ? "1" : ""}; Path=/; Max-Age=${on ? YEAR : 0}; SameSite=Lax`,
      },
    });
  },
});
