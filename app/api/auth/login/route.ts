import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { mode } from "@/src/lib/server/config";
import { cookieOptions, STATE_COOKIE, VERIFIER_COOKIE } from "@/src/lib/server/session";

/** Start GitHub sign-in, with a state check and PKCE as GitHub recommends. */
export async function GET(req: NextRequest) {
  if (mode() !== "github") return NextResponse.redirect(new URL("/", req.url));
  const state = randomBytes(16).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_APP_CLIENT_ID!);
  url.searchParams.set("redirect_uri", new URL("/api/auth/callback", req.url).toString());
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, { ...cookieOptions, maxAge: 600 });
  res.cookies.set(VERIFIER_COOKIE, verifier, { ...cookieOptions, maxAge: 600 });
  return res;
}
