import { NextResponse } from "next/server";
import { receiveScan, type ScanBody } from "@/src/lib/git/scan";
import { syncConfig } from "@/src/lib/server/config";
import { bearer, preflight, withCors } from "@/src/lib/server/cors";
import { errorResponse } from "@/src/lib/server/respond";
import { userFromFigmaKey } from "@/src/lib/server/session";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** The plugin sends the tokens a component scan made (F12). Sending the same scan again changes nothing. */
export async function POST(req: Request) {
  const user = await userFromFigmaKey(bearer(req));
  if (!user) return withCors(NextResponse.json({ error: "auth", message: "The sync key is not valid. Make a new key in Token Library, Sync to Figma." }, { status: 401 }));
  try {
    const body = (await req.json()) as ScanBody;
    const result = await receiveScan(user.host, syncConfig(), user.viewer.login, body);
    // A renewed sync key must replace the old one in the plugin; the old key stops working.
    return withCors(NextResponse.json({ ok: true, ...result, newKey: user.newKey ?? null }));
  } catch (e) {
    const res = errorResponse(e);
    if (!user.newKey) return withCors(res);
    const body = await res.json();
    return withCors(NextResponse.json({ ...body, newKey: user.newKey }, { status: res.status }));
  }
}
