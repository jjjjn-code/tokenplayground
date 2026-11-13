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
  normaliseTokenInput,
  noveltyMessage,
  parseComponentTokenName,
  type Novelty,
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

/**
 * What a component name adds that the component does not have yet. A
 * missing role is a plain mistake (red). A new category, role or state is
 * amber, with a link to the guided flow; a new state alone does not block.
 */
export function NoveltyNotice({ component, novelty, name, className }: { component: string; novelty: Novelty; name: string; className?: string }) {
  const message = noveltyMessage(component, novelty, name);
  if (novelty.roleShapeChanges && !novelty.role) {
    return (
      <p className={cn("flex gap-1.5 text-destructive", className)} role="alert">
        <CircleX className="mt-px size-3.5 shrink-0" /> {message}
      </p>
    );
  }
  return (
    <div className={cn("flex gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2", className)} role="alert">
      <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" />
      <div className="grid gap-1.5">
        <span>{message}</span>
        <Button asChild size="sm" variant="outline" className="h-7 justify-self-start text-xs">
          <Link href={createComponentHref(component, name)}>Open Create component tokens</Link>
        </Button>
      </div>
    </div>
  );
}

/** The token name at the top of the details panel, with a pencil to rename it. */
export function RenameTitle({ token, onRenamed }: { token: Token; onRenamed: (name: string) => void }) {
  const { set, history, rename } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(token.name);
  // Show messages only after the person leaves the field or pushes Save, never while typing.
  const [revealed, setRevealed] = useState(false);

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
  const canSave = changed && !!next && !errors.length && !novelty?.blocking;

  const start = () => {
    setName(token.name);
    setRevealed(false);
    setEditing(true);
  };
  const show = revealed && changed;
  const save = () => {
    // Show problems, or the "already in code" warning, before saving.
    if (!canSave || (!revealed && pushed)) {
      setRevealed(true);
      return;
    }
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
          onChange={(e) => {
            setName(normaliseTokenInput(e.target.value));
            setRevealed(false);
          }}
          onBlur={(e) => {
            // Leaving for the Save or Cancel button is not "finished typing".
            const to = e.relatedTarget as HTMLElement | null;
            if (!to?.closest("[data-rename-action]")) setRevealed(true);
          }}
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
            show && errors.length && "border-destructive/60",
            show && !errors.length && novelty?.blocking && "border-warning/60",
          )}
        />
        <Button type="submit" size="icon" className="size-9" aria-label="Save new name" disabled={!changed} data-rename-action>
          <Check className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="size-9" aria-label="Cancel rename" onClick={() => setEditing(false)} data-rename-action>
          <X className="size-4" />
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">{namingGuide({ tokens: set.tokens.filter((t) => t.name !== token.name) }, token.layer, token.kind, token.component)}</p>
      {show && errors.length ? (
        <p className="flex gap-1.5 text-xs text-destructive" role="alert">
          <CircleX className="mt-px size-3.5 shrink-0" /> {errors[0].message}
        </p>
      ) : null}
      {show && !errors.length && novelty && token.component ? (
        <NoveltyNotice component={token.component} novelty={novelty} name={next} className="text-xs" />
      ) : null}
      {show && canSave ? (
        <div className="grid gap-1 text-xs text-muted-foreground">
          <span>
            New code name: <span className="font-mono text-foreground">{cssVariableName(candidate)}</span>
          </span>
          {dependants ? (
            <span>
              {direct === 1 ? "1 token refers to this token. The reference changes to the new name." : `${direct} tokens refer to this token. The references change to the new name.`}
              {dependants > direct ? ` ${dependants - direct} more ${dependants - direct === 1 ? "token uses" : "tokens use"} it through other tokens.` : ""}
            </span>
          ) : null}
          {pushed ? (
            <span className="flex gap-1.5 text-warning">
              <AlertTriangle className="mt-px size-3.5 shrink-0" /> The code uses the name {cssVariableName(token)}. After the next push, developers must change all uses of the old name.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
