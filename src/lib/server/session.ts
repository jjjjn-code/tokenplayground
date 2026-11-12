import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { GitHubHost, MemoryHost, type GitHost } from "../git/host";
import { demoHost, mode } from "./config";

export const SESSION_COOKIE = "tt_session";
export const STATE_COOKIE = "tt_oauth_state";
/** PKCE code verifier, kept until GitHub sends the person back. */
export const VERIFIER_COOKIE = "tt_oauth_verifier";

export interface Session {
  token: string;
  refreshToken?: string;
  /** Milliseconds since 1970 when the access token expires, if it does. */
  expiresAt?: number;
  login: string;
  name: string;
  avatar: string;
}

export interface Viewer {
  login: string;
  name: string;
  avatar: string;
}

const key = () => createHash("sha256").update(process.env.SESSION_SECRET ?? "").digest();

/** Encrypt the session so the GitHub token is never readable in the browser. */
export function seal(s: Session): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(s), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

export function unseal(v: string): Session | null {
  try {
    const raw = Buffer.from(v, "base64url");
    const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8")) as Session;
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/** Exchange an authorisation code, or a refresh token, for a GitHub user token. */
export async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_APP_CLIENT_ID,
      client_secret: process.env.GITHUB_APP_CLIENT_SECRET,
      ...params,
    }),
    cache: "no-store",
  });
  return (await res.json()) as TokenResponse;
}

export function sessionFromToken(t: TokenResponse, user: Viewer): Session {
  return {
    token: t.access_token!,
    refreshToken: t.refresh_token,
    expiresAt: t.expires_in ? Date.now() + (t.expires_in - 60) * 1000 : undefined,
    ...user,
  };
}

/**
 * The signed-in person and a Git host acting as them. Refreshes an expired
 * GitHub token and stores the new one. Returns null when not signed in.
 */
export async function currentUser(): Promise<{ viewer: Viewer; host: GitHost } | null> {
  const m = mode();
  if (m === "demo") {
    const host: MemoryHost = demoHost();
    return { viewer: { login: "demo-designer", name: "Demo designer", avatar: "" }, host };
  }
  if (m !== "github") return null;
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  let s = raw ? unseal(raw) : null;
  if (!s) return null;
  if (s.expiresAt && Date.now() > s.expiresAt) {
    if (!s.refreshToken) return null;
    const t = await requestToken({ grant_type: "refresh_token", refresh_token: s.refreshToken });
    if (!t.access_token) {
      jar.delete(SESSION_COOKIE);
      return null;
    }
    s = sessionFromToken(t, s);
    jar.set(SESSION_COOKIE, seal(s), { ...cookieOptions, maxAge: 60 * 60 * 24 * 30 });
  }
  return { viewer: { login: s.login, name: s.name, avatar: s.avatar }, host: new GitHubHost(s.token) };
}
