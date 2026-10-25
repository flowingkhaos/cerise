// Prints the ADMIN_PASSWORD_HASH for a password typed at the prompt (never echoed to a file).
// deno run scripts/hash-password.ts
import { hashPassword } from "../lib/auth.ts";

const pw = prompt("Admin password (24+ characters):") ?? "";
if (pw.length < 24) {
  console.error("Too short: use 24 characters or more.");
  Deno.exit(1);
}
console.log(await hashPassword(pw));
