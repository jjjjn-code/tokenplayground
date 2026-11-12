import { NextResponse, type NextRequest } from "next/server";
import { mode } from "@/src/lib/server/config";
import { cookieOptions, requestToken, seal, sessionFromToken, SESSION_COOKIE, STATE_COOKIE } from "@/src/lib/server/session";

/** GitHub sends the person back here after they approve sign-in. */
export async function GET(req: NextRequest) {
  const home = new URL("/", req.url);
  if (mode() !== "github") return NextResponse.redirect(home);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get(STATE_COOKIE)?.value;
  const fail = (reason: string) => {
    const url = new URL("/", req.url);
    url.searchParams.set("signin", reason);
    const res = NextResponse.redirect(url);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };
  if (!code || !state || state !== expected) return fail("state");

  const token = await requestToken({ code, redirect_uri: new URL("/api/auth/callback", req.url).toString() });
  if (!token.access_token) return fail("token");

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "token-tool" },
    cache: "no-store",
  });
  if (!userRes.ok) return fail("user");
  const user = (await userRes.json()) as { login: string; name: string | null; avatar_url: string };

  const res = NextResponse.redirect(home);
  res.cookies.delete(STATE_COOKIE);
  res.cookies.set(
    SESSION_COOKIE,
    seal(sessionFromToken(token, { login: user.login, name: user.name || user.login, avatar: user.avatar_url })),
    { ...cookieOptions, maxAge: 60 * 60 * 24 * 30 },
  );
  return res;
}
