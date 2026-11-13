"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, CircleCheck, CircleX, ExternalLink, GitPullRequestArrow, Loader2, RotateCw } from "lucide-react";
import rawTokens from "@/data/dummy/tokens.json";
import rawHistory from "@/data/dummy/history.json";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { simulateDeveloperDrift } from "@/src/lib/git/drift";
import { seedFiles } from "@/src/lib/git/sync";
import {
  cssVariableName,
  discrepancyLabel,
  findDiscrepancies,
  indexTokens,
  parseDtcg,
  pullFiles,
  resolveToken,
  type Decision,
  type Discrepancy,
  type DiscrepancyKind,
  type HistoryEntry,
  lastChange,
  type Mode,
} from "@/src/lib/tokens";
import { useStore } from "../_lib/store";
import { Swatch } from "../_components/ui";

interface Plan {
  dataHead: string;
  codeHead: string;
  releaseBranch: string;
  discrepancies: Discrepancy[];
}

interface Draft {
  decision?: "accept" | "decline";
  reason: string;
  name?: string;
}

const KIND_TONE: Record<DiscrepancyKind, string> = {
  changed: "border-warning/50 text-warning",
  flattened: "border-warning/50 text-warning",
  missing: "border-destructive/40 text-destructive",
  extra: "border-foreground/20 text-foreground",
  renamed: "border-destructive/40 text-destructive",
};

function explain(d: Discrepancy): string {
  switch (d.kind) {
    case "changed":
      return "A developer changed this value in the code.";
    case "flattened":
      return "The code has a raw value. The tool has a reference to a token.";
    case "missing":
      return "This token is not in the code.";
    case "extra":
      return "This token is only in the code. It is not in the tool.";
    case "renamed":
      return `The code uses the name ${d.codeName}. The correct name is ${d.expectedCodeName}.`;
  }
}

function choices(d: Discrepancy): { accept: string; decline: string } {
  switch (d.kind) {
    case "missing":
      return { accept: "Accept: delete the token from the tool", decline: "Decline: add it back to the code" };
    case "extra":
      return { accept: "Accept: add it to the tool", decline: "Decline: remove it from the code" };
    case "renamed":
      return { accept: "Accept", decline: "Decline: put the correct name back" };
    default:
      return { accept: "Accept: use the code value", decline: "Decline: keep the tool value" };
  }
}

/** Pull and discrepancy review (F6) with the decline follow-up (F8). */
export default function PullPage() {
  const { mode, set, history, repos, unsavedNames, savedHead, reload, saveToRepo, saving } = useStore();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAgain, setReviewAgain] = useState<Set<string>>(new Set());
  const remote = mode === "demo" || mode === "github";
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [attempted, setAttempted] = useState(false);
  const [serverProblems, setServerProblems] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState<{ accepted: number; declined: number; restorePr: { url: string; number: number } | null } | null>(null);
  const index = useMemo(() => indexTokens(set), [set]);
  const byCodeName = useMemo(() => new Map(set.tokens.map((t) => [cssVariableName(t), t.name])), [set]);

  // Local mode: an example of developer changes, so the screen can be tried.
  const localPlan = useMemo<Plan | null>(() => {
    if (mode !== "local") return null;
    const base = parseDtcg(structuredClone(rawTokens));
    const { code } = seedFiles(base, rawHistory as HistoryEntry[]);
    const drifted = simulateDeveloperDrift(code);
    const files = Object.fromEntries(pullFiles(set).map((p) => [p, drifted[p] ?? null]));
    return { dataHead: "", codeHead: "", releaseBranch: "main", discrepancies: findDiscrepancies(set, files) };
  }, [mode, set]);

  const fetchPlan = useCallback(async () => {
    if (!remote) return;
    setLoading(true);
    setPlanError(null);
    try {
      const res = await fetch(`/api/pull${savedHead ? `?head=${savedHead}` : ""}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      setPlan(body as Plan);
      // Keep decisions already made for differences that are still there.
      const ids = new Set((body as Plan).discrepancies.map((d) => d.id));
      setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id))));
      setAttempted(false);
      setServerProblems({});
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "The code cannot load. Try again.");
    } finally {
      setLoading(false);
    }
  }, [remote, savedHead]);

  useEffect(() => {
    void fetchPlan();
  }, [fetchPlan]);

  const shown = remote ? plan : localPlan;
  /**
   * A difference already declined stays in the code until someone merges the
   * restore pull request. Show it as waiting instead of asking again.
   */
  const waitingFor = (d: Discrepancy) => {
    if (reviewAgain.has(d.id)) return null;
    // Declined, or accepted under a new name: both wait for the follow-up pull request.
    const renamed = d.kind === "extra" ? [...history].reverse().find((e) => e.action === "accepted" && e.from === d.codeName && e.prUrl) : undefined;
    if (renamed) return renamed;
    const last = lastChange(history, d.token ?? d.suggestedName ?? d.codeName);
    return last?.prUrl && (last.action === "declined" || (last.action === "accepted" && last.from)) ? last : null;
  };
  const all = shown?.discrepancies ?? [];
  const waiting = all.filter((d) => waitingFor(d));
  const list = all.filter((d) => !waitingFor(d));
  const decided = list.filter((d) => drafts[d.id]?.decision).length;
  const unsaved = unsavedNames.length;

  const problemFor = (d: Discrepancy): string | null => {
    const dr = drafts[d.id];
    if (serverProblems[d.id]) return serverProblems[d.id];
    if (!attempted || !dr?.decision) return null;
    if (!dr.reason.trim()) return "Type a reason for the decision.";
    if (dr.decision === "accept" && d.kind === "extra" && !(dr.name ?? d.suggestedName ?? "").trim()) return "Type a name for the token.";
    return null;
  };

  const setDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((x) => ({ ...x, [id]: { ...(x[id] ?? { reason: "" }), ...patch } }));
    setServerProblems((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
  };

  const chosen = list.filter((d) => drafts[d.id]?.decision);
  const acceptCount = chosen.filter((d) => drafts[d.id].decision === "accept").length;
  const declineCount = chosen.length - acceptCount;
  const renamedCount = chosen.filter((d) => d.kind === "extra" && drafts[d.id].decision === "accept" && (drafts[d.id].name ?? d.suggestedName) !== d.suggestedName).length;
  /** Only declines, and tokens accepted under a new name, change the code. */
  const needsPr = declineCount > 0 || renamedCount > 0;

  /** Check every chosen difference has a note, then show the summary before sending. */
  const openReview = () => {
    setAttempted(true);
    if (!chosen.length) {
      toast.error("Select an option on 1 difference or more.");
      return;
    }
    const missing = chosen.find((d) => !drafts[d.id].reason.trim() || (drafts[d.id].decision === "accept" && d.kind === "extra" && !(drafts[d.id].name ?? d.suggestedName ?? "").trim()));
    if (missing) {
      document.getElementById(`card-${missing.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setReviewOpen(true);
  };

  const apply = async () => {
    if (!plan || !remote || !chosen.length) return;
    const decisions: Decision[] = chosen.map((d) => ({
      id: d.id,
      decision: drafts[d.id].decision!,
      reason: drafts[d.id].reason.trim(),
      ...(d.kind === "extra" ? { name: (drafts[d.id].name ?? d.suggestedName ?? "").trim() } : {}),
    }));
    setApplying(true);
    try {
      const res = await fetch("/api/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codeHead: plan.codeHead, dataHead: plan.dataHead, decisions }),
      });
      const body = await res.json();
      if (res.status === 422 && Array.isArray(body.problems)) {
        setServerProblems(Object.fromEntries(body.problems.map((p: { id: string; message: string }) => [p.id, p.message])));
        toast.error("The decisions are not applied.", { description: "Correct the problems that show below, then try again." });
        return;
      }
      if (!res.ok) throw new Error(body.message);
      setDone({ accepted: body.accepted, declined: body.declined, restorePr: body.restorePr });
      setReviewOpen(false);
      toast.success(`${body.accepted} accepted, ${body.declined} declined.`);
      await reload(body.dataHead);
    } catch (e) {
      toast.error("The decisions are not applied.", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setApplying(false);
    }
  };

  /** A CSS value with a swatch: a hex, or what a var() refers to. */
  const CssValue = ({ value, mode: m }: { value: string | null; mode: Mode }) => {
    if (value === null) return <span className="text-muted-foreground">none</span>;
    const ref = /^var\((--[A-Za-z0-9-]+)\)$/.exec(value)?.[1];
    const name = ref ? byCodeName.get(ref) : undefined;
    const colour = ref ? (name ? resolveToken(index, name, m).value : undefined) : value;
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[12px]">
        <Swatch value={colour} size="sm" />
        <span className="truncate">{name ?? (ref ? ref : value)}</span>
      </span>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b px-4 py-2 pl-16 md:pl-4">
        <div>
          <h1 className="text-sm font-medium">Pull from code</h1>
          <p className="text-xs text-muted-foreground">
            {remote && repos ? (
              <>Compare <span className="font-mono">{repos.code}</span> ({shown?.releaseBranch ?? "main"}) <ArrowRight className="inline size-3" /> saved tokens</>
            ) : (
              "Compare the code with the tool, then accept or decline each difference."
            )}
          </p>
        </div>
        {remote ? (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => { setDone(null); void fetchPlan(); }} disabled={loading}>
            <RotateCw className={cn("size-3.5", loading && "animate-spin")} /> Pull again
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-5xl gap-4 p-5">
          {mode === "local" ? (
            <Notice title="Not connected to GitHub">This is an example. It compares your tokens with simulated developer changes. To pull for real, connect GitHub. Refer to docs/SETUP.md.</Notice>
          ) : null}
          {remote && unsaved ? (
            <Notice tone="warning" title={`You have ${unsaved} unsaved ${unsaved === 1 ? "change" : "changes"}`}>
              <span className="block">Pull compares the code with saved tokens only. Save your changes, then send your decisions.</span>
              <Button
                size="sm"
                className="mt-2"
                disabled={saving}
                onClick={async () => {
                  const r = await saveToRepo(`Save ${unsaved} ${unsaved === 1 ? "change" : "changes"} before the code review`);
                  if (r.ok) toast.success(`${unsaved} ${unsaved === 1 ? "change is" : "changes are"} saved.`);
                  else toast.error("Your changes are not saved.", { description: r.message });
                }}
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : null} Save now
              </Button>
            </Notice>
          ) : null}
          {planError ? <Notice tone="warning" title="The code cannot load">{planError}</Notice> : null}
          {done ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/40 bg-success/5 p-4">
              <CircleCheck className="size-5 text-success" />
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium">{done.accepted} accepted, {done.declined} declined. The decisions are in the history of each token.</div>
                {done.restorePr ? <div className="text-muted-foreground">Pull request #{done.restorePr.number} is open. It puts the declined values back in the code.</div> : null}
              </div>
              {done.restorePr ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={done.restorePr.url} target="_blank" rel="noreferrer">Open on GitHub <ExternalLink className="size-3.5" /></a>
                </Button>
              ) : null}
            </div>
          ) : null}

          {!shown ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Reading the code</div>
          ) : !all.length ? (
            <div className="rounded-lg border p-6 text-sm text-muted-foreground">The code and the saved tokens are the same. There is nothing to review.</div>
          ) : (
            <>
              {!list.length ? (
                <div className="rounded-lg border p-6 text-sm text-muted-foreground">You decided all the differences. The ones below go when their pull request is merged.</div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{list.length} {list.length === 1 ? "difference" : "differences"} to review</span>
                {(["changed", "flattened", "renamed", "missing", "extra"] as DiscrepancyKind[]).map((k) => {
                  const n = list.filter((d) => d.kind === k).length;
                  return n ? <Badge key={k} variant="outline" className={KIND_TONE[k]}>{n} {discrepancyLabel(k).toLowerCase()}</Badge> : null;
                })}
              </div>

              {list.map((d) => {
                const dr = drafts[d.id] ?? { reason: "" };
                const c = choices(d);
                const problem = problemFor(d);
                return (
                  <section key={d.id} id={`card-${d.id}`} className={cn("grid gap-3 scroll-mt-24 rounded-lg border p-4", dr.decision && !problem && "border-foreground/30", problem && "border-destructive/50")} aria-label={d.token ?? d.codeName}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] font-medium">{d.token ?? d.codeName}</span>
                      <Badge variant="outline" className={KIND_TONE[d.kind]}>{discrepancyLabel(d.kind)}</Badge>
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground">{d.file}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{explain(d)}</p>
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full min-w-[420px] text-[13px]">
                        <thead>
                          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                            <th className="w-20 px-3 py-1.5 font-medium">Mode</th>
                            <th className="px-3 py-1.5 font-medium">In the tool</th>
                            <th className="px-3 py-1.5 font-medium">In the code</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.differences.map((x) => (
                            <tr key={x.mode} className="border-b last:border-b-0">
                              <td className="px-3 py-1.5 text-xs text-muted-foreground">{x.mode === "light" ? "Light" : "Dark"}</td>
                              <td className="px-3 py-1.5"><CssValue value={x.tool} mode={x.mode} /></td>
                              <td className="px-3 py-1.5"><CssValue value={x.code} mode={x.mode} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-wrap gap-2" role="group" aria-label="Decision">
                      <Button
                        type="button"
                        size="sm"
                        variant={dr.decision === "accept" ? "default" : "outline"}
                        aria-pressed={dr.decision === "accept"}
                        disabled={!!d.acceptBlockedReason}
                        onClick={() => setDraft(d.id, { decision: dr.decision === "accept" ? undefined : "accept" })}
                      >
                        {c.accept}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={dr.decision === "decline" ? "default" : "outline"}
                        aria-pressed={dr.decision === "decline"}
                        onClick={() => setDraft(d.id, { decision: dr.decision === "decline" ? undefined : "decline" })}
                      >
                        {c.decline}
                      </Button>
                    </div>
                    {d.acceptBlockedReason ? <p className="text-xs text-muted-foreground">{d.acceptBlockedReason}</p> : null}

                    {dr.decision ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {dr.decision === "accept" && d.kind === "extra" ? (
                          <div className="grid gap-1">
                            <label className="text-xs font-medium" htmlFor={`name-${d.id}`}>Name in the tool</label>
                            <Input id={`name-${d.id}`} value={dr.name ?? d.suggestedName ?? ""} onChange={(e) => setDraft(d.id, { name: e.target.value.toLowerCase().replace(/[\s_]+/g, "-") })} className="h-8 font-mono text-[12.5px]" autoComplete="off" />
                          </div>
                        ) : null}
                        <div className={cn("grid gap-1", !(dr.decision === "accept" && d.kind === "extra") && "sm:col-span-2")}>
                          <label className="text-xs font-medium" htmlFor={`reason-${d.id}`}>Reason</label>
                          <Input id={`reason-${d.id}`} value={dr.reason} onChange={(e) => setDraft(d.id, { reason: e.target.value })} placeholder="For example: agreed with developers in the design review" className="h-8 text-[13px]" autoComplete="off" />
                        </div>
                      </div>
                    ) : null}
                    {problem ? (
                      <p className="flex gap-1.5 text-xs text-destructive" role="alert"><CircleX className="mt-px size-3.5 shrink-0" />{problem}</p>
                    ) : dr.decision && dr.reason.trim() ? (
                      <p className="flex gap-1.5 text-xs text-success"><CircleCheck className="mt-px size-3.5 shrink-0" />Decided. Review all your decisions from the bar at the bottom.</p>
                    ) : null}
                  </section>
                );
              })}
              {waiting.length ? (
                <div className="grid gap-2">
                  <h2 className="mt-2 text-sm font-medium">Waiting for a pull request ({waiting.length})</h2>
                  {waiting.map((d) => {
                    const w = waitingFor(d)!;
                    const pr = /\/pull\/(\d+)/.exec(w.prUrl ?? "")?.[1];
                    return (
                      <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed p-3 text-sm">
                        <span className="font-mono text-[13px]">{d.token ?? d.codeName}</span>
                        <Badge variant="outline" className={KIND_TONE[d.kind]}>{discrepancyLabel(d.kind)}</Badge>
                        <span className="min-w-0 flex-1 text-muted-foreground">{w.action === "declined" ? "Declined" : `Accepted as ${w.token}`} by {w.by}: {w.reason}</span>
                        <a href={w.prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">
                          Pull request{pr ? ` #${pr}` : ""} <ExternalLink className="size-3" />
                        </a>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setReviewAgain((x) => new Set(x).add(d.id))}>Review again</Button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {list.length ? (
        <div className="flex flex-wrap items-center gap-3 border-t bg-background px-5 py-3">
          <span className="text-sm">
            {decided ? (
              <>
                <span className="font-medium">{decided} decided:</span>{" "}
                <span className="text-muted-foreground">{acceptCount} accepted, {declineCount} declined. You can leave the others for later.</span>
              </>
            ) : (
              <span className="text-muted-foreground">Select an option on each difference you want to decide now. You can leave the others for later.</span>
            )}
          </span>
          <Button className="ml-auto" onClick={openReview} disabled={!remote || applying || !!unsaved || !decided}>
            {unsaved ? "Save first" : `Review ${decided ? `${decided} ` : ""}${decided === 1 ? "decision" : "decisions"}`}
          </Button>
        </div>
      ) : null}

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review {chosen.length} {chosen.length === 1 ? "decision" : "decisions"}</DialogTitle>
            <DialogDescription>Examine your decisions. Nothing changes until you push {needsPr ? "Save and open pull request" : "Save decisions"}.</DialogDescription>
          </DialogHeader>
          {(() => {
            const inTool = chosen.filter((d) => drafts[d.id].decision === "accept");
            const toCode = chosen.filter((d) => drafts[d.id].decision === "decline");
            /** What changes for 1 decision, in plain words, with from and to values. */
            const change = (d: Discrepancy) => {
              const dr = drafts[d.id];
              const accept = dr.decision === "accept";
              if (d.kind === "missing") return <span>{accept ? "Deleted from the tool." : "Added back to the code."}</span>;
              if (d.kind === "extra") {
                return accept ? (
                  <span>Added to the tool as <span className="font-mono">{dr.name ?? d.suggestedName}</span>.{(dr.name ?? d.suggestedName) !== d.suggestedName ? " Its new name also goes to developers." : ""}</span>
                ) : (
                  <span>Removed from the code.</span>
                );
              }
              if (d.kind === "renamed") return <span>Code name corrected to <span className="font-mono">{d.expectedCodeName}</span>.</span>;
              return (
                <span className="grid gap-0.5">
                  {d.differences.map((x) => (
                    <span key={x.mode} className="flex flex-wrap items-center gap-1.5">
                      <span className="w-10 text-xs text-muted-foreground">{x.mode === "light" ? "Light" : "Dark"}</span>
                      <CssValue value={accept ? x.tool : x.code} mode={x.mode} />
                      <ArrowRight className="size-3 text-muted-foreground" aria-label="changes to" />
                      <CssValue value={accept ? x.code : x.tool} mode={x.mode} />
                    </span>
                  ))}
                </span>
              );
            };
            const group = (title: string, caption: string, items: Discrepancy[]) =>
              items.length ? (
                <section className="grid gap-2">
                  <h3 className="text-sm font-medium">{title} ({items.length})</h3>
                  <ul className="grid gap-2">
                    {items.map((d) => (
                      <li key={d.id} className="grid gap-1 rounded-md border p-2.5 text-sm">
                        <span className="font-mono text-[13px]">{d.token ?? d.codeName}</span>
                        {change(d)}
                        <span className="text-muted-foreground">Note: {drafts[d.id].reason}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">{caption}</p>
                </section>
              ) : null;
            return (
              <div className="grid gap-4">
                {group(
                  "Changes in the tool",
                  `The code already has ${inTool.length === 1 ? "this value" : "these values"}. Nothing is sent to developers${renamedCount ? ", except new names" : ""}.`,
                  inTool,
                )}
                {group(
                  "Sent to developers",
                  `1 pull request asks developers to change the code. Your ${toCode.length === 1 ? "note is" : "notes are"} in its description.`,
                  toCode,
                )}
                <p className="text-sm text-muted-foreground">All decisions go in each token's history with your name and note.</p>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Back</Button>
            <Button onClick={() => void apply()} disabled={applying}>
              {applying ? <Loader2 className="size-4 animate-spin" /> : needsPr ? <GitPullRequestArrow className="size-4" /> : null}
              {needsPr ? "Save and open pull request" : "Save decisions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Notice({ tone, title, children }: { tone?: "warning"; title: string; children: React.ReactNode }) {
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
