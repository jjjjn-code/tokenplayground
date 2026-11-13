import "server-only";
import { NextResponse } from "next/server";

/**
 * The Figma plugin calls from an iframe with no origin, using a sync key in
 * the Authorization header (never cookies), so any origin may call these.
 */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export const preflight = () => new NextResponse(null, { status: 204, headers: CORS_HEADERS });

export function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || null;
