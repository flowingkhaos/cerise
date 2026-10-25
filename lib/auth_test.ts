import { assert, assertEquals } from "@std/assert";
import { checkCredentials, hashPassword, safeNext, verifyPassword, VISITOR } from "./auth.ts";

const env = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });

Deno.test("hash round-trips and rejects a wrong password", async () => {
  const h = await hashPassword("un mot de passe très long");
  assert(h.startsWith("pbkdf2$600000$"));
  assert(await verifyPassword("un mot de passe très long", h));
  assert(!await verifyPassword("un mot de passe tres long", h));
  assert(!await verifyPassword("x", "garbage"));
});

Deno.test("credentials open the right role, and only that", async () => {
  const hash = await hashPassword("s3cret-admin");
  const e = env({ ADMIN_USERNAME: "Luke", ADMIN_PASSWORD_HASH: hash });
  assertEquals(await checkCredentials(VISITOR.username, VISITOR.password, e), "visitor");
  assertEquals(await checkCredentials("VISITEUR ", VISITOR.password, e), "visitor");
  assertEquals(await checkCredentials("luke", "s3cret-admin", e), "admin");
  assertEquals(await checkCredentials("luke", "wrong", e), null);
  assertEquals(await checkCredentials("visiteur", "s3cret-admin", e), null);
  assertEquals(await checkCredentials("luke", "s3cret-admin", env({})), null, "no admin without env");
});

Deno.test("next stays on this site", () => {
  assertEquals(safeNext("/admin", "/"), "/admin");
  assertEquals(safeNext("//evil.example", "/"), "/");
  assertEquals(safeNext("https://evil.example", "/"), "/");
  assertEquals(safeNext(null, "/x"), "/x");
});
