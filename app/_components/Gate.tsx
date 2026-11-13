"use client";

import { AlertTriangle, GitBranch, Loader2, LogIn, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "../_lib/store";

/**
 * Shows the page only once there are tokens to show: a loading state,
 * a sign-in prompt, or a problem reaching GitHub otherwise.
 */
export function Gate({ children }: { children: React.ReactNode }) {
  const { mode, viewer, ready, loadError, repos, reload } = useStore();

  if (mode === "github" && !viewer) {
    return (
      <Centre>
        <div className="flex size-11 items-center justify-center rounded-full bg-muted">
          <GitBranch className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">Sign in to Token Library</h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Your GitHub account is used to read tokens, save tokens and open pull requests.
        </p>
        <Button asChild>
          <a href="/api/auth/login"><LogIn className="size-4" /> Sign in with GitHub</a>
        </Button>
      </Centre>
    );
  }

  if (loadError) {
    return (
      <Centre>
        <AlertTriangle className="size-6 text-warning" />
        <h1 className="text-lg font-semibold">The tokens cannot load</h1>
        <p className="max-w-md text-center text-sm text-muted-foreground">{loadError}</p>
        <Button variant="outline" onClick={() => void reload()}><RotateCw className="size-4" /> Try again</Button>
      </Centre>
    );
  }

  if (!ready) {
    return (
      <Centre>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading tokens{repos ? ` from ${repos.data}` : ""}</p>
      </Centre>
    );
  }

  return <>{children}</>;
}

function Centre({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">{children}</div>;
}
