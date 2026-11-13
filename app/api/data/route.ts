import { NextResponse, type NextRequest } from "next/server";
import { loadData, saveData } from "@/src/lib/git/sync";
import { syncConfig } from "@/src/lib/server/config";
import { errorResponse, notSignedIn } from "@/src/lib/server/respond";
import { currentUser } from "@/src/lib/server/session";
import { parseDtcg, serialiseDtcg, type HistoryEntry } from "@/src/lib/tokens";

export const dynamic = "force-dynamic";

/** Load the saved token set from the token data repo. `?head=` reads an exact version. */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return notSignedIn();
  try {
    const d = await loadData(user.host, syncConfig(), req.nextUrl.searchParams.get("head") || undefined);
    return NextResponse.json({ head: d.head, tokens: serialiseDtcg(d.set), history: d.history, lastPush: d.lastPush });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Save the working copy as 1 commit. 409 means someone else saved first. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return notSignedIn();
  try {
    const body = (await req.json()) as { expectedHead: string; tokens: Record<string, unknown>; history: HistoryEntry[]; message?: string };
    if (!body.expectedHead || !body.tokens || !Array.isArray(body.history)) {
      return NextResponse.json({ error: "input", message: "The request is not complete. Reload the page and try again." }, { status: 400 });
    }
    // The signed-in person is the author of every new history entry.
    const history = body.history.map((e) => (e.by === "pending" ? { ...e, by: user.viewer.login } : e));
    const message = (body.message?.trim() || "Update tokens") + `\n\nSaved by ${user.viewer.login} from Token Library.`;
    const head = await saveData(user.host, syncConfig(), { expectedHead: body.expectedHead, set: parseDtcg(body.tokens), history, message });
    return NextResponse.json({ head, history });
  } catch (e) {
    return errorResponse(e);
  }
}
