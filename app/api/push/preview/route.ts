import { NextResponse } from "next/server";
import { planPush } from "@/src/lib/git/sync";
import { syncConfig } from "@/src/lib/server/config";
import { errorResponse, notSignedIn } from "@/src/lib/server/respond";
import { currentUser } from "@/src/lib/server/session";

export const dynamic = "force-dynamic";

/** What a push would change, based on the saved tokens. */
export async function GET() {
  const user = await currentUser();
  if (!user) return notSignedIn();
  try {
    const plan = await planPush(user.host, syncConfig());
    return NextResponse.json({ ...plan, author: user.viewer.login });
  } catch (e) {
    return errorResponse(e);
  }
}
