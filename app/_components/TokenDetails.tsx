"use client";

import { useMemo } from "react";
import { ArrowRight, Copy, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export type DetailsTab = "references" | "history";

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  edited: "Edited",
  deprecated: "Deprecated",
  pushed: "Pushed",
  pulled: "Pulled",
  accepted: "Accepted",
  declined: "Declined",
  restored: "Restored",
  synced: "Synced to Figma",
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
  const { set, history } = useStore();
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
      toast.error("Copy failed");
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
                {e.reason ? <div className="mt-1">{e.reason}</div> : null}
                {e.before && e.after && JSON.stringify(e.before.values) !== JSON.stringify(e.after.values) ? (
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    {formatValue(e.before.values.light)}
                    {e.before.values.dark !== undefined ? ` / ${formatValue(e.before.values.dark)}` : ""} → {formatValue(e.after.values.light)}
                    {e.after.values.dark !== undefined ? ` / ${formatValue(e.after.values.dark)}` : ""}
                  </div>
                ) : null}
                {e.before && e.after && e.before.status !== e.after.status ? (
                  <div className="mt-1 text-xs text-muted-foreground">Status: {e.before.status} → {e.after.status}</div>
                ) : null}
                {e.prUrl ? <a className="text-xs underline" href={e.prUrl}>Pull request</a> : null}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted-foreground">Restoring an earlier version arrives in phase 4.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
