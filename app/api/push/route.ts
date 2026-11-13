import { NextResponse, type NextRequest } from "next/server";
import { pushToCode } from "@/src/lib/git/sync";
import { syncConfig } from "@/src/lib/server/config";
import { errorResponse, notSignedIn } from "@/src/lib/server/respond";
import { currentUser } from "@/src/lib/server/session";

export const dynamic = "force-dynamic";

/** Push the saved tokens: CSS on a new branch and a pull request with the changelog. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return notSignedIn();
  try {
    const { title, summary, dataHead } = (await req.json()) as { title?: string; summary?: string; dataHead?: string };
    const res = await pushToCode(user.host, syncConfig(), { title: title ?? "", summary: summary ?? "", author: user.viewer.login, dataHead: dataHead || undefined });
    return NextResponse.json(res);
  } catch (e) {
    return errorResponse(e);
  }
}
