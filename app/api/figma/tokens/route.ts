import { NextResponse } from "next/server";
import { loadData } from "@/src/lib/git/sync";
import { syncConfig } from "@/src/lib/server/config";
import { bearer, preflight, withCors } from "@/src/lib/server/cors";
import { errorResponse } from "@/src/lib/server/respond";
import { userFromFigmaKey } from "@/src/lib/server/session";
import { serialiseDtcg } from "@/src/lib/tokens";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** The saved tokens, for the Figma plugin. */
export async function GET(req: Request) {
  const user = await userFromFigmaKey(bearer(req));
  if (!user) return withCors(NextResponse.json({ error: "auth", message: "The sync key is not valid. Make a new key in Token Library, Sync to Figma." }, { status: 401 }));
  try {
    const d = await loadData(user.host, syncConfig());
    return withCors(NextResponse.json({ head: d.head, tokens: serialiseDtcg(d.set), viewer: user.viewer, newKey: user.newKey ?? null }));
  } catch (e) {
    return withCors(errorResponse(e));
  }
}
