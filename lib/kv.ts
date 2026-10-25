// One KV handle per isolate. Locally a SQLite file in .data/; on Deno Deploy the app's
// attached KV. If Deploy has none attached, fall back to memory so the demo still runs.

export interface KvHandle {
  kv: Deno.Kv;
  persistent: boolean;
}

let handle: Promise<KvHandle> | undefined;

export function getKv(): Promise<KvHandle> {
  return handle ??= open();
}

async function open(): Promise<KvHandle> {
  const onDeploy = Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));
  try {
    if (onDeploy) return { kv: await Deno.openKv(), persistent: true };
    const path = Deno.env.get("KV_PATH") ?? ".data/kv.sqlite3";
    await Deno.mkdir(path.split("/").slice(0, -1).join("/") || ".", {
      recursive: true,
    });
    return { kv: await Deno.openKv(path), persistent: true };
  } catch (err) {
    console.warn("KV unavailable, using memory:", (err as Error).message);
    return { kv: await Deno.openKv(":memory:"), persistent: false };
  }
}
