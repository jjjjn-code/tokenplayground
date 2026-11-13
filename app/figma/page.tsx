"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, KeyRound, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "../_lib/store";
import { formatDate } from "../_components/ui";

/** F9: set up the Figma plugin and see when tokens were last synced. */
export default function FigmaPage() {
  const { mode, history, unsavedNames } = useStore();
  const [key, setKey] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const remote = mode === "github" || mode === "demo";

  const lastSync = useMemo(() => {
    const synced = history.filter((e) => e.action === "synced");
    if (!synced.length) return null;
    const latest = synced.reduce((a, b) => (a.at > b.at ? a : b));
    const same = synced.filter((e) => e.at.slice(0, 16) === latest.at.slice(0, 16));
    return { at: latest.at, by: latest.by, count: same.length, reason: latest.reason };
  }, [history]);

  const makeKey = async () => {
    setMaking(true);
    setProblem(null);
    try {
      const res = await fetch("/api/figma/key", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Token Library did not make a key.");
      setKey(body.key);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Token Library did not make a key. Try again.");
    } finally {
      setMaking(false);
    }
  };

  const copyKey = async () => {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      toast.success("The sync key is copied.");
    } catch {
      toast.error("The copy did not work. Select the key and copy it.");
    }
  };

  const step = (n: number, title: string, body: React.ReactNode) => (
    <li className="grid grid-cols-[28px_1fr] gap-3">
      <span className="flex size-7 items-center justify-center rounded-full border text-xs font-medium tabular-nums">{n}</span>
      <div className="min-w-0 pt-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{body}</div>
      </div>
    </li>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b px-4 py-2 pl-16 md:pl-4">
        <div>
          <h1 className="text-sm font-medium">Sync to Figma</h1>
          <p className="text-xs text-muted-foreground">The Token Library plugin makes Figma variables from the saved tokens.</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-6">
          <section className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Last sync</div>
            {lastSync ? (
              <div className="mt-1 text-sm">
                <span className="font-medium">{formatDate(lastSync.at)}</span> by {lastSync.by}. {lastSync.count} {lastSync.count === 1 ? "token" : "tokens"} changed.
                {lastSync.reason ? <div className="text-muted-foreground">{lastSync.reason}</div> : null}
              </div>
            ) : (
              <div className="mt-1 text-sm">No sync yet.</div>
            )}
            {unsavedNames.length ? (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{unsavedNames.length} {unsavedNames.length === 1 ? "token has" : "tokens have"} changes that are not saved. The plugin reads only saved tokens. Save your changes first.</span>
              </p>
            ) : null}
          </section>

          <ol className="flex flex-col gap-5">
            {step(
              1,
              "Download the plugin",
              <>
                <p>Unzip the file. Keep the folder in a place where it stays, for example Documents.</p>
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <a href="/token-library-figma-plugin.zip" download><Download className="size-3.5" /> Download plugin</a>
                </Button>
              </>,
            )}
            {step(
              2,
              "Add the plugin to Figma",
              <p>
                Use the Figma desktop app. Open a design file. In the menu, select Plugins, then Development, then Import plugin from manifest. Select{" "}
                <code className="font-mono text-[12.5px] text-foreground">manifest.json</code> in the folder you unzipped. You do this 1 time only.
              </p>,
            )}
            {step(
              3,
              "Make a sync key",
              <>
                <p>The key lets the plugin read your tokens. It works for you only. Do not share it. Make a new key if the plugin asks for one.</p>
                {!remote ? (
                  <p className="mt-2 text-foreground">Sign in with GitHub to make a key.</p>
                ) : key ? (
                  <div className="mt-2 grid gap-2">
                    <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
                      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground" title="Sync key">{key}</code>
                      <Button size="sm" onClick={copyKey}><Copy className="size-3.5" /> Copy</Button>
                    </div>
                    <p className="text-xs">Token Library shows this key 1 time. Paste it into the plugin now.</p>
                  </div>
                ) : (
                  <Button size="sm" className="mt-2" onClick={makeKey} disabled={making}>
                    <KeyRound className="size-3.5" /> {making ? "Making key" : "Make a sync key"}
                  </Button>
                )}
                {problem ? <p className="mt-2 text-sm text-destructive" role="alert">{problem}</p> : null}
              </>,
            )}
            {step(
              4,
              "Sync",
              <p>
                In Figma, select Plugins, then Development, then Token Library. Paste the key and push Check for changes. Read the list, then push Sync. Each token&apos;s history
                in Token Library shows the sync.
              </p>,
            )}
          </ol>

          <section className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">What the plugin does</div>
            <ul className="list-disc space-y-1 pl-5">
              <li>Makes 3 variable collections: Primitives, Semantic (Light and Dark) and Components (Light and Dark).</li>
              <li>Keeps references as variable aliases.</li>
              <li>Hides component states other than default, and deprecated tokens, from publishing.</li>
              <li>Removes only variables that an earlier sync made. Variables you made by hand stay.</li>
              <li>Does not sync draft tokens, unless you select Include draft tokens.</li>
              <li>Does not sync typography, border and shadow tokens. Figma variables cannot hold them.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
