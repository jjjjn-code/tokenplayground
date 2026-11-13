"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Copy, Pencil, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  allDependants,
  cssFileFor,
  cssVariableName,
  directDependants,
  figmaPath,
  formatValue,
  historyFor,
  indexTokens,
  isPublishedInFigma,
  resolveToken,
  validateTokenSet,
  type Mode,
  type Token,
} from "@/src/lib/tokens";
import { useStore } from "../_lib/store";
import { KIND_TITLE, LAYER_TITLE } from "../_lib/sets";
import { AliasPill, formatDate, IssueList, resolvedText, StatusBadge, Swatch } from "./ui";
import { ValueChange } from "./ValueChange";

export type DetailsTab = "references" | "history";

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  edited: "Edited",
  deprecated: "Deprecated",
  pushed: "Pushed",
  pulled: "Pulled",
  accepted: "Accepted from code",
  declined: "Declined from code",
  restored: "Restored",
  synced: "Synced to Figma",
  renamed: "Renamed",
};

/** Contents of the details side sheet: values, code, references (F3) and history (F7). */
export function TokenDetails({
  token,
  tab,
  onTab,
  onSelect,
  onEdit,
}: {
  token: Token;
  tab: DetailsTab;
  onTab: (t: DetailsTab) => void;
  onSelect: (name: string) => void;
  onEdit: () => void;
}) {
  const { set, history, restoreVersion } = useStore();
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreReason, setRestoreReason] = useState("");
  const [restoreTried, setRestoreTried] = useState(false);
  const sameValues = (v: Token["values"]) => JSON.stringify(v) === JSON.stringify(token.values);
  const index = useMemo(() => indexTokens(set), [set]);
  const issues = useMemo(() => validateTokenSet(set).filter((i) => i.token === token.name), [set, token.name]);
  const direct = directDependants(set, token.name);
  const all = allDependants(set, token.name);
  const indirect = all.filter((n) => !direct.includes(n));
  const timeline = historyFor(history, token.name).reverse();
  const path = figmaPath(token);
  const modes: Mode[] = token.layer === "primitive" ? ["light"] : ["light", "dark"];

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${text}`);
    } catch {
      toast.error("The copy did not work.");
    }
  };

  const NameLink = ({ n }: { n: string }) => (
    <button type="button" onClick={() => onSelect(n)} className="rounded-sm text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
      <AliasPill name={n} />
    </button>
  );

  return (
    <div className="flex flex-col gap-5 px-4 pb-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{LAYER_TITLE[token.layer]}</Badge>
        <Badge variant="secondary">{KIND_TITLE[token.kind]}</Badge>
        {token.component ? <Badge variant="outline">{token.component}</Badge> : null}
        <StatusBadge status={token.status} />
      </div>
      {token.description ? <p className="text-sm text-muted-foreground">{token.description}</p> : null}

      <div className="grid gap-2">
        {modes.map((m) => {
          const v = m === "dark" ? token.values.dark ?? token.values.light : token.values.light;
          const r = resolveToken(index, token.name, m);
          const label = token.layer === "primitive" ? "All modes" : m === "light" ? "Light" : "Dark";
          return (
            <div key={m} className="flex items-center gap-3 rounded-lg border p-3">
              <Swatch value={r.value} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  {r.chain.length > 1 ? (
                    r.chain.slice(1).map((n, i) => (
                      <span key={n} className="flex items-center gap-1.5">
                        {i > 0 ? <ArrowRight className="size-3 text-muted-foreground" /> : null}
                        <NameLink n={n} />
                      </span>
                    ))
                  ) : typeof v === "object" && !r.error ? null : (
                    <span className="font-mono">{formatValue(v)}</span>
                  )}
                  {r.chain.length > 1 || typeof v === "object" ? (
                    <span className={r.error ? "text-destructive" : "font-mono text-muted-foreground"}>
                      {r.chain.length > 1 ? "= " : ""}
                      {r.error ? "broken reference" : resolvedText(r.value)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {issues.length ? (
        <div className="rounded-lg border bg-muted/40 p-3">
          <IssueList issues={issues} />
        </div>
      ) : null}

      <div className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-sm">
        <span className="text-muted-foreground">In code</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <code className="truncate font-mono text-[12.5px]">{cssVariableName(token)}</code>
          <Button variant="ghost" size="icon" className="size-6" aria-label="Copy code name" onClick={() => copy(cssVariableName(token))}>
            <Copy className="size-3" />
          </Button>
        </span>
        <span className="text-muted-foreground">File</span>
        <span className="truncate font-mono text-[12.5px]">{cssFileFor(token)}</span>
        <span className="text-muted-foreground">Figma</span>
        <span className="min-w-0">
          {path ? <code className="block truncate font-mono text-[12.5px]">{path}</code> : <span className="block text-muted-foreground">Path to confirm</span>}
          <span className="block text-xs text-muted-foreground">{isPublishedInFigma(token) ? "Published" : "Hidden from publishing"}</span>
        </span>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={onEdit}><Pencil className="size-3.5" /> Edit</Button>
        <Button size="sm" variant="outline" onClick={() => copy(token.name)}><Copy className="size-3.5" /> Copy name</Button>
      </div>

      <Separator />

      <Tabs value={tab} onValueChange={(v) => onTab(v as DetailsTab)}>
        <TabsList className="w-full">
          <TabsTrigger value="references">Used by ({all.length})</TabsTrigger>
          <TabsTrigger value="history">History ({timeline.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="references" className="pt-3">
          {!all.length ? <p className="text-sm text-muted-foreground">No other token points to this one.</p> : null}
          {direct.length ? (
            <div className="mb-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Directly ({direct.length})</div>
              <div className="flex flex-wrap gap-1.5">{direct.map((n) => <NameLink key={n} n={n} />)}</div>
            </div>
          ) : null}
          {indirect.length ? (
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">Through other tokens ({indirect.length})</div>
              <div className="flex flex-wrap gap-1.5">{indirect.map((n) => <NameLink key={n} n={n} />)}</div>
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="history" className="pt-3">
          {!timeline.length ? <p className="text-sm text-muted-foreground">No recorded changes yet.</p> : null}
          <ol className="relative ml-1.5 border-l">
            {timeline.map((e) => (
              <li key={e.id} className="relative pb-4 pl-4 text-sm last:pb-0">
                <span className="absolute -left-[5px] top-1.5 size-2.5 rounded-full border-2 border-background bg-foreground" aria-hidden="true" />
                <div className="font-medium">{ACTION_LABEL[e.action] ?? e.action} <span className="font-normal text-muted-foreground">by {e.by}</span></div>
                <div className="text-xs text-muted-foreground">{formatDate(e.at)}</div>
                {e.action === "renamed" && e.from ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1 font-mono text-[12px]">
                    <span className="rounded bg-destructive/10 px-1 text-destructive line-through">{e.from}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="rounded bg-success/10 px-1 text-success">{e.token}</span>
                  </div>
                ) : null}
                {e.reason && !(e.action === "renamed" && e.reason === `Renamed from ${e.from}`) ? <div className="mt-1">{e.reason}</div> : null}
                {(e.before || e.after) && JSON.stringify(e.before?.values) !== JSON.stringify(e.after?.values) ? (
                  <div className="mt-1.5 rounded-md border bg-muted/20 p-2">
                    <ValueChange before={e.before} after={e.after} layer={token.layer} index={index} />
                  </div>
                ) : null}
                {e.before && e.after && e.before.status !== e.after.status ? (
                  <div className="mt-1 text-xs text-muted-foreground">Status: {e.before.status} → {e.after.status}</div>
                ) : null}
                {e.prUrl ? <a className="text-xs underline" href={e.prUrl}>Pull request</a> : null}
                {e.after && e.action !== "renamed" && !sameValues(e.after.values) ? (
                  restoring === e.id ? (
                    <form
                      className="mt-2 grid gap-1.5 rounded-md border p-2"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        setRestoreTried(true);
                        if (!restoreReason.trim()) return;
                        restoreVersion(token.name, e.after!.values, restoreReason.trim());
                        toast.success(`${token.name} is restored to this version.`, { description: "Save to keep the change." });
                        setRestoring(null);
                      }}
                    >
                      <label className="text-xs font-medium" htmlFor={`restore-${e.id}`}>Reason</label>
                      <Input id={`restore-${e.id}`} autoFocus value={restoreReason} onChange={(ev) => { setRestoreReason(ev.target.value); setRestoreTried(false); }} className="h-8 text-[13px]" autoComplete="off" />
                      {restoreTried && !restoreReason.trim() ? <p className="text-xs text-destructive" role="alert">Type a reason for the restore.</p> : null}
                      <div className="flex gap-1.5">
                        <Button type="submit" size="sm" className="h-7">Restore</Button>
                        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setRestoring(null)}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-1.5 h-7 text-xs"
                      onClick={() => { setRestoring(e.id); setRestoreReason(""); setRestoreTried(false); }}
                    >
                      <Undo2 className="size-3.5" /> Restore this version
                    </Button>
                  )
                ) : null}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted-foreground">To go back, push Restore this version on an earlier change.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
