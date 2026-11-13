"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, CircleCheck, ExternalLink, FileCode2, GitPullRequestArrow, Loader2, RotateCw } from "lucide-react";
import rawTokens from "@/data/dummy/tokens.json";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  changelogMarkdown,
  componentCss,
  diffHunks,
  diffSets,
  filesTouched,
  formatValue,
  indexTokens,
  lineDiff,
  parentCss,
  parseDtcg,
  PARENT_CSS_PATH,
  replaceManagedBlock,
  resolveToken,
  type Change,
  type Token,
} from "@/src/lib/tokens";
import { useStore } from "../_lib/store";
import { relativeDate } from "../_components/ui";
import { ValueChange } from "../_components/ValueChange";

interface PlannedFile {
  path: string;
  before: string | null;
  after: string;
}

interface Plan {
  changes: Change[];
  files: PlannedFile[];
  author: string;
}

const TYPE_STYLE: Record<Change["type"], string> = {
  added: "border-success/40 text-success",
  changed: "border-warning/50 text-warning",
  removed: "border-destructive/40 text-destructive",
};

/** Send to code (F5): change set, title and summary, preview, pull request. */
export default function PushPage() {
  const { mode, set, repos, lastPush, unsavedNames, savedHead, applyPush, author } = useStore();
  const remote = mode === "demo" || mode === "github";
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [pushing, setPushing] = useState(false);
  const [done, setDone] = useState<{ prUrl: string; prNumber: number; branch: string; count: number } | null>(null);

  // Local mode: preview against the dummy set, so the screen can still be tried.
  const localPlan = useMemo<Plan | null>(() => {
    if (mode !== "local") return null;
    const baseline = parseDtcg(structuredClone(rawTokens));
    const changes = diffSets(baseline, set);
    const files = filesTouched(changes).map((path) => {
      const before = path === PARENT_CSS_PATH ? parentCss(baseline) : componentCss(baseline, path.split("/")[1]);
      const after = path === PARENT_CSS_PATH ? parentCss(set) : componentCss(set, path.split("/")[1]);
      return { path, before, after: replaceManagedBlock(before, after) };
    });
    return { changes, files, author };
  }, [mode, set, author]);

  const fetchPlan = useCallback(async () => {
    if (!remote) return;
    setLoading(true);
    setPlanError(null);
    try {
      const res = await fetch(`/api/push/preview${savedHead ? `?head=${savedHead}` : ""}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      setPlan(body as Plan);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "The changes cannot load. Try again.");
    } finally {
      setLoading(false);
    }
  }, [remote, savedHead]);

  useEffect(() => {
    void fetchPlan();
  }, [fetchPlan, savedHead]);

  const shown = remote ? plan : localPlan;
  const index = useMemo(() => indexTokens(set), [set]);
  const changelog = shown ? changelogMarkdown({ title: title.trim() || "[title]", summary, author: shown.author, changes: shown.changes }) : "";
  const unsaved = unsavedNames.length;
  const canPush = remote && !!shown?.changes.length && !!title.trim() && !unsaved && !pushing;

  const push = async () => {
    if (!canPush) return;
    setPushing(true);
    try {
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, summary, dataHead: savedHead }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      setDone({ prUrl: body.prUrl, prNumber: body.prNumber, branch: body.branch, count: body.changes.length });
      toast.success(`Pull request #${body.prNumber} is open.`);
      setTitle("");
      setSummary("");
      applyPush(body);
    } catch (e) {
      toast.error("The changes are not pushed.", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b px-4 py-2 pl-16 md:pl-4">
        <div>
          <h1 className="text-sm font-medium">Send to code</h1>
          <p className="text-xs text-muted-foreground">
            {remote && repos ? (
              <>Saved tokens in <span className="font-mono">{repos.data}</span> <ArrowRight className="inline size-3" /> pull request to <span className="font-mono">{repos.code}</span> ({repos.codeBranch})</>
            ) : (
              "Writes the CSS into the code repo and opens a pull request with a changelog."
            )}
          </p>
        </div>
        {remote ? (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => void fetchPlan()} disabled={loading}>
            <RotateCw className={cn("size-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 content-start gap-5">
            {mode === "local" ? (
              <Notice tone="info" title="Not connected to GitHub">
                This preview compares your tokens with the dummy token set. To send to code, connect GitHub. Refer to <span className="font-mono">docs/SETUP.md</span>.
              </Notice>
            ) : null}
            {remote && unsaved ? (
              <Notice tone="warning" title={`You have ${unsaved} unsaved ${unsaved === 1 ? "change" : "changes"}`}>
                Only saved changes are sent. Save your changes first, then send them.
              </Notice>
            ) : null}
            {done ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/40 bg-success/5 p-4">
                <CircleCheck className="size-5 text-success" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">Pull request #{done.prNumber} is open with {done.count} {done.count === 1 ? "change" : "changes"}.</div>
                  <div className="truncate font-mono text-xs text-muted-foreground">{done.branch}</div>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <a href={done.prUrl} target="_blank" rel="noreferrer">Open on GitHub <ExternalLink className="size-3.5" /></a>
                </Button>
              </div>
            ) : null}
            {planError ? <Notice tone="warning" title="The changes cannot load">{planError}</Notice> : null}

            <section className="overflow-hidden rounded-lg border">
              <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
                <h2 className="text-sm font-medium">Changes since you last sent to code</h2>
                <span className="font-mono text-xs text-muted-foreground">{shown ? shown.changes.length : "…"}</span>
              </div>
              {!shown ? (
                <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Working out what changed</div>
              ) : !shown.changes.length ? (
                <div className="p-6 text-sm text-muted-foreground">
                  There are no changes to send. The saved tokens are the same as the last time you sent to code. To make changes, go to the <Link href="/" className="underline">overview</Link>.
                </div>
              ) : (
                <table className="w-full table-fixed text-[13px]">
                  <colgroup>
                    <col style={{ width: 96 }} />
                    <col style={{ width: "38%" }} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Change</th>
                      <th className="px-2 py-2 font-medium">Token</th>
                      <th className="px-2 py-2 font-medium">Before and after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.changes.map((c) => (
                      <tr key={c.name} className="border-b last:border-b-0">
                        <td className="px-4 py-2">
                          <Badge variant="outline" className={cn("capitalize", TYPE_STYLE[c.type])}>{c.type}</Badge>
                        </td>
                        <td className="px-2 py-2">
                          <div className="truncate font-mono text-[12.5px]">{c.name}</div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground">{c.file}</div>
                        </td>
                        <td className="px-2 py-2">
                          <ValueChange before={c.before} after={c.after} layer={(c.after ?? c.before)!.layer} index={index} />
                          {(c.after ?? c.before)!.status === "deprecated" ? <div className="mt-1 text-[11px] text-muted-foreground">deprecated</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {shown?.changes.length ? (
              <Tabs defaultValue="files">
                <TabsList>
                  <TabsTrigger value="files"><FileCode2 className="size-3.5" /> Files ({shown.files.length})</TabsTrigger>
                  <TabsTrigger value="pr"><GitPullRequestArrow className="size-3.5" /> Pull request text</TabsTrigger>
                </TabsList>
                <TabsContent value="files" className="grid gap-3 pt-2">
                  {shown.files.map((f) => (
                    <FileDiff key={f.path} file={f} />
                  ))}
                </TabsContent>
                <TabsContent value="pr" className="pt-2">
                  <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-4 font-mono text-[12px] leading-5 whitespace-pre-wrap">{changelog}</pre>
                </TabsContent>
              </Tabs>
            ) : null}
          </div>

          <aside className="grid content-start gap-4 lg:sticky lg:top-0">
            <form
              className="grid gap-4 rounded-lg border p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void push();
              }}
            >
              <h2 className="text-sm font-medium">Pull request</h2>
              <div className="grid gap-1.5">
                <Label htmlFor="push-title">Title</Label>
                <Input id="push-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Button hover states" autoComplete="off" />
                <p className="text-xs text-muted-foreground">Becomes &quot;Token update: {title.trim() || "…"}&quot; and the branch name.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="push-summary">Summary</Label>
                <Textarea id="push-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} placeholder="What changed and why, for the developers reviewing it." />
              </div>
              <Button type="submit" disabled={!canPush}>
                {pushing ? <Loader2 className="size-4 animate-spin" /> : <GitPullRequestArrow className="size-4" />}
                {shown?.changes.length ? `Open pull request with ${shown.changes.length} ${shown.changes.length === 1 ? "change" : "changes"}` : "Open pull request"}
              </Button>
              {!remote ? <p className="text-xs text-muted-foreground">Available once GitHub is connected.</p> : null}
            </form>

            <div className="rounded-lg border p-4 text-sm">
              <h2 className="mb-2 text-sm font-medium">Last sent to code</h2>
              {lastPush ? (
                <div className="grid gap-1 text-[13px]">
                  <div>{lastPush.title}</div>
                  <div className="text-xs text-muted-foreground">by {lastPush.by} · {relativeDate(lastPush.at)}</div>
                  {lastPush.prUrl ? (
                    <a href={lastPush.prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">
                      Pull request <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{remote ? "Nothing is sent yet." : "Not connected."}</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Notice({ tone, title, children }: { tone: "info" | "warning"; title: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex gap-3 rounded-lg border p-4 text-sm", tone === "warning" ? "border-warning/40 bg-warning/5" : "bg-muted/30")}>
      <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", tone === "warning" ? "text-warning" : "text-muted-foreground")} />
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function FileDiff({ file }: { file: PlannedFile }) {
  const lines = useMemo(() => diffHunks(lineDiff(file.before ?? "", file.after), 2), [file]);
  const added = lines.filter((l) => l?.type === "+").length;
  const removed = lines.filter((l) => l?.type === "-").length;
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs">
        <span className="truncate font-mono">{file.path}</span>
        {file.before === null ? <Badge variant="outline">new file</Badge> : null}
        <span className="ml-auto font-mono text-success">+{added}</span>
        <span className="font-mono text-destructive">-{removed}</span>
      </div>
      <pre className="overflow-x-auto py-1 font-mono text-[12px] leading-5">
        {lines.map((l, i) =>
          l === null ? (
            <div key={i} className="bg-muted/40 px-3 text-muted-foreground">⋯</div>
          ) : (
            <div
              key={i}
              className={cn("px-3 whitespace-pre", l.type === "+" && "bg-success/10", l.type === "-" && "bg-destructive/10 text-muted-foreground")}
            >
              <span className="mr-3 inline-block w-3 select-none text-muted-foreground">{l.type}</span>
              {l.text}
            </div>
          ),
        )}
      </pre>
    </div>
  );
}
