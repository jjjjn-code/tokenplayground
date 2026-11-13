import { NextResponse } from "next/server";
import { makeFigmaKey } from "@/src/lib/server/session";

export const dynamic = "force-dynamic";

/** Make a sync key for the Figma plugin, for the signed-in person. */
export async function POST() {
  const key = await makeFigmaKey();
  if (!key) return NextResponse.json({ error: "auth", message: "Sign in with GitHub." }, { status: 401 });
  return NextResponse.json({ key });
}
