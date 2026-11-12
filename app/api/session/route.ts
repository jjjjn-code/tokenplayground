import { NextResponse } from "next/server";
import { mode, syncConfig } from "@/src/lib/server/config";
import { currentUser } from "@/src/lib/server/session";

export const dynamic = "force-dynamic";

/** How the tool is running and who is signed in. */
export async function GET() {
  const m = mode();
  const cfg = syncConfig();
  const user = m === "local" ? null : await currentUser();
  return NextResponse.json({
    mode: m,
    viewer: user?.viewer ?? null,
    dataRepo: m === "local" ? null : cfg.dataRepo,
    codeRepo: m === "local" ? null : cfg.codeRepo,
    codeBranch: cfg.codeBranch,
  });
}
