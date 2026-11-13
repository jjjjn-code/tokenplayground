"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CircleX, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  allDependants,
  checkBeforeSave,
  componentNovelty,
  cssVariableName,
  directDependants,
  historyFor,
  namingGuide,
  noveltyMessage,
  parseComponentTokenName,
  type Token,
} from "@/src/lib/tokens";
import { useStore } from "../_lib/store";

/** Link to the guided component flow, filled in with what the new name adds. */
export function createComponentHref(component: string, name: string): string {
  const p = parseComponentTokenName(name);
  const q = new URLSearchParams({ component });
  if (p?.category) q.set("category", p.category);
  if (p?.role) q.set("role", p.role);
  if (p?.state) q.set("state", p.state);
  return `/create?${q.toString()}`;
}

/** The token name at the top of the details panel, with a pencil to rename it. */
export function RenameTitle({ token, onRenamed }: { token: Token; onRenamed: (name: string) => void }) {
  const { set, history, rename } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(token.name);

  const next = name.trim();
  const changed = next !== token.name;
  const candidate: Token = { ...token, name: next };
  const { issues } = useMemo(() => checkBeforeSave(set, [candidate], [token.name]), [set, next]); // eslint-disable-line react-hooks/exhaustive-deps
  const errors = issues.filter((i) => i.severity === "error" && i.token === next);
  const novelty = useMemo(() => {
    if (token.layer !== "component" || !token.component || !changed) return null;
    const others = { tokens: set.tokens.filter((t) => t.name !== token.name) };
    return componentNovelty(others, token.component, next);
  }, [set, token, next, changed]);
  const dependants = allDependants(set, token.name).length;
  const direct = directDependants(set, token.name).length;
  const pushed = historyFor(history, token.name).some((e) => e.action === "pushed");
  const canSave = changed && !!next && !errors.length && !novelty;

  const start = () => {
    setName(token.name);
    setEditing(true);
  };
  const save = () => {
    if (!canSave) return;
    rename(token.name, next);
    setEditing(false);
    onRenamed(next);
  };

  if (!editing) {
    return (
      <div className="flex items-start gap-1.5 pr-8">
        <SheetTitle className="font-mono text-base break-all">{token.name}</SheetTitle>
        <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Rename ${token.name}`} onClick={start}>
          <Pencil className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2 pr-8">
      <SheetTitle className="sr-only">Rename {token.name}</SheetTitle>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          autoFocus
          aria-label="New name"
          value={name}
          onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setEditing(false);
            }
          }}
          spellCheck={false}
          autoComplete="off"
          className={cn(
            "h-9 min-w-0 flex-1 rounded-md border bg-background px-2.5 font-mono text-[14px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            changed && errors.length && "border-destructive/60",
            changed && !errors.length && novelty && "border-warning/60",
          )}
        />
        <Button type="submit" size="icon" className="size-9" aria-label="Save new name" disabled={!canSave}>
          <Check className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="size-9" aria-label="Cancel rename" onClick={() => setEditing(false)}>
          <X className="size-4" />
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">{namingGuide({ tokens: set.tokens.filter((t) => t.name !== token.name) }, token.layer, token.kind, token.component)}</p>
      {changed && errors.length ? (
        <p className="flex gap-1.5 text-xs text-destructive" role="alert">
          <CircleX className="mt-px size-3.5 shrink-0" /> {errors[0].message}
        </p>
      ) : null}
      {changed && !errors.length && novelty && token.component ? (
        <div className="flex gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs" role="alert">
          <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" />
          <div className="grid gap-1.5">
            <span>{noveltyMessage(token.component, novelty)}</span>
            <Button asChild size="sm" variant="outline" className="h-7 justify-self-start text-xs">
              <Link href={createComponentHref(token.component, next)}>Open Create component tokens</Link>
            </Button>
          </div>
        </div>
      ) : null}
      {changed && canSave ? (
        <div className="grid gap-1 text-xs text-muted-foreground">
          <span>
            In code: <span className="font-mono text-foreground">{cssVariableName(candidate)}</span>
          </span>
          {dependants ? (
            <span>
              {direct} {direct === 1 ? "token points" : "tokens point"} to it{dependants > direct ? ` (${dependants} in total, through others)` : ""}; they will be updated to the new name.
            </span>
          ) : null}
          {pushed ? (
            <span className="flex gap-1.5 text-warning">
              <AlertTriangle className="mt-px size-3.5 shrink-0" /> Already in code as {cssVariableName(token)}. After the next push, developers will need to update anything that uses the old name.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
