import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { mode } from "@/src/lib/server/config";
import { cookieOptions, STATE_COOKIE } from "@/src/lib/server/session";

/** Start GitHub sign-in. */
export async function GET(req: NextRequest) {
  if (mode() !== "github") return NextResponse.redirect(new URL("/", req.url));
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_APP_CLIENT_ID!);
  url.searchParams.set("redirect_uri", new URL("/api/auth/callback", req.url).toString());
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, { ...cookieOptions, maxAge: 600 });
  return res;
}
