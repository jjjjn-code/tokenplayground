import { NextResponse } from "next/server";
import { ConflictError } from "@/src/lib/git/host";
import { DATA_FILES, loadData } from "@/src/lib/git/sync";
import { syncConfig } from "@/src/lib/server/config";
import { bearer, preflight, withCors } from "@/src/lib/server/cors";
import { errorResponse } from "@/src/lib/server/respond";
import { userFromFigmaKey } from "@/src/lib/server/session";
import type { HistoryEntry } from "@/src/lib/tokens";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** The plugin reports a finished sync; each token it added or changed gets a "synced" history entry. */
export async function POST(req: Request) {
  const user = await userFromFigmaKey(bearer(req));
  if (!user) return withCors(NextResponse.json({ error: "auth", message: "The sync key is not valid. Make a new key in Token Library, Sync to Figma." }, { status: 401 }));
  try {
    const body = (await req.json()) as { fileName?: string; added?: string[]; changed?: string[]; removed?: string[] };
    const file = (body.fileName ?? "a Figma file").slice(0, 200);
    const now = new Date();
    const lines: [string[] | undefined, string][] = [
      [body.added, `Added to Figma file "${file}".`],
      [body.changed, `Updated in Figma file "${file}".`],
      [body.removed, `Removed from Figma file "${file}".`],
    ];
    const cfg = syncConfig();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const d = await loadData(user.host, cfg);
      const known = new Set(d.set.tokens.map((t) => t.name));
      const entries: HistoryEntry[] = [];
      for (const [names, reason] of lines) {
        for (const token of (names ?? []).slice(0, 2000)) {
          if (typeof token !== "string") continue;
          if (!known.has(token) && !reason.startsWith("Removed")) continue;
          entries.push({ id: `f-${now.getTime().toString(36)}-${entries.length}`, token, action: "synced", at: now.toISOString(), by: user.viewer.login, reason });
        }
      }
      if (!entries.length) return withCors(NextResponse.json({ ok: true, logged: 0 }));
      try {
        await user.host.commit(
          cfg.dataRepo,
          cfg.dataBranch,
          d.head,
          [{ path: DATA_FILES.history, content: JSON.stringify([...d.history, ...entries], null, 2) + "\n" }],
          `Figma sync: ${entries.length} ${entries.length === 1 ? "token" : "tokens"} in "${file}"\n\nSynced by ${user.viewer.login} from the Token Library Figma plugin.`,
        );
        return withCors(NextResponse.json({ ok: true, logged: entries.length }));
      } catch (e) {
        if (!(e instanceof ConflictError) || attempt === 2) throw e;
      }
    }
    return withCors(NextResponse.json({ ok: true, logged: 0 }));
  } catch (e) {
    return withCors(errorResponse(e));
  }
}
