import { NextResponse, type NextRequest } from "next/server";
import { applyPull, planPull } from "@/src/lib/git/sync";
import { syncConfig } from "@/src/lib/server/config";
import { errorResponse, notSignedIn } from "@/src/lib/server/respond";
import { currentUser } from "@/src/lib/server/session";
import type { Decision } from "@/src/lib/tokens";

export const dynamic = "force-dynamic";

/** Compare the release branch with the saved tokens. `?head=` reads an exact saved version. */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return notSignedIn();
  try {
    return NextResponse.json(await planPull(user.host, syncConfig(), req.nextUrl.searchParams.get("head") || undefined));
  } catch (e) {
    return errorResponse(e);
  }
}

/** Apply accept and decline decisions, and open a restore pull request for declines. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return notSignedIn();
  try {
    const body = (await req.json()) as { codeHead?: string; dataHead?: string; decisions?: Decision[] };
    if (!body.codeHead || !Array.isArray(body.decisions)) {
      return NextResponse.json({ error: "input", message: "The request is not complete. Reload the page and try again." }, { status: 400 });
    }
    const res = await applyPull(user.host, syncConfig(), {
      codeHead: body.codeHead,
      dataHead: body.dataHead || undefined,
      decisions: body.decisions,
      author: user.viewer.login,
    });
    return NextResponse.json(res, { status: res.problems.length ? 422 : 200 });
  } catch (e) {
    return errorResponse(e);
  }
}
