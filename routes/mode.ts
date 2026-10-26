// POST /mode — the light/dark pick. A cookie, so the server renders it and pages stay script-free.
import { define } from "../utils.ts";
import { safeNext } from "../lib/auth.ts";

const YEAR = 365 * 24 * 60 * 60;

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const mode = form.get("mode") === "dark" ? "dark" : "light";
    return new Response(null, {
      status: 303,
      headers: {
        location: safeNext(String(form.get("back") ?? ""), "/"),
        "set-cookie": `cerise_mode=${mode}; Path=/; Max-Age=${YEAR}; SameSite=Lax`,
      },
    });
  },
});
