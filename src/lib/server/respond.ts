import "server-only";
import { NextResponse } from "next/server";
import { ConflictError, HostError } from "../git/host";

export function errorResponse(e: unknown) {
  if (e instanceof ConflictError) return NextResponse.json({ error: "conflict", message: e.message }, { status: 409 });
  if (e instanceof HostError) return NextResponse.json({ error: "host", message: e.message }, { status: e.status && e.status < 600 ? e.status : 502 });
  console.error(e);
  return NextResponse.json({ error: "server", message: "An error occurred on the server. Try again." }, { status: 500 });
}

export const notSignedIn = () =>
  NextResponse.json({ error: "auth", message: "Sign in with GitHub." }, { status: 401 });
