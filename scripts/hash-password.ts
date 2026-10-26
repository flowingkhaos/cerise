// Prints the ADMIN_PASSWORD_HASH for a password typed at the prompt (never echoed to a file).
// deno run scripts/hash-password.ts
import { hashPassword } from "../lib/auth.ts";

if (!Deno.stdin.isTerminal()) {
  console.error("This needs a keyboard: run it in your own terminal, not through a pipe or a tool.");
  Deno.exit(1);
}
const pw = prompt("Admin password (24+ characters):") ?? "";
if (pw.length < 24) {
  console.error("Too short: use 24 characters or more.");
  Deno.exit(1);
}
console.log(await hashPassword(pw));
