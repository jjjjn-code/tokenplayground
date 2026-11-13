"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  checkBeforeSave,
  cssVariableName,
  LAYER_RANK,
  NON_COLOUR_PREFIXES,
  type Kind,
  type Layer,
  type SimpleValue,
  type Token,
  type TokenIndex,
  type TokenSet,
} from "@/src/lib/tokens";
import { ValuePicker } from "./ValuePicker";
import { StatusBadge } from "./ui";

function placeholderFor(layer: Layer, kind: Kind, component?: string): string {
  if (layer === "component") return `${component}-category-role-state`;
  if (kind === "color") return layer === "primitive" ? "colour-step, for example orange-800" : "category-variant, for example surface-brand";
  return `${NON_COLOUR_PREFIXES[kind as Exclude<Kind, "color">][0]}-name`;
}

/**
 * A new token typed straight into the sheet, in the group it belongs to,
 * like "Create variable" in Figma. The rules are checked as you type.
 */
export function NewTokenRow({
  layer,
  kind,
  component,
  set,
  index,
  onCreate,
  onCancel,
}: {
  layer: Layer;
  kind: Kind;
  component?: string;
  set: TokenSet;
  index: TokenIndex;
  onCreate: (t: Token) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(component ? `${component}-` : "");
  const [light, setLight] = useState<SimpleValue | "">("");
  const [dark, setDark] = useState<SimpleValue | "">("");
  const [darkTouched, setDarkTouched] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLTableRowElement>(null);
  const hasDark = layer !== "primitive";

  useEffect(() => {
    nameRef.current?.focus();
    const end = nameRef.current?.value.length ?? 0;
    nameRef.current?.setSelectionRange(end, end);
  }, []);

  const draft: Token = {
    name: name.trim(),
    layer,
    kind,
    ...(component ? { component } : {}),
    values: { light, ...(hasDark ? { dark: darkTouched ? dark : light } : {}) },
    status: "draft",
  };

  const { ok, issues } = useMemo(() => checkBeforeSave(set, [draft], []), [set, JSON.stringify(draft)]); // eslint-disable-line react-hooks/exhaustive-deps
  const nameTyped = draft.name.length > 0 && draft.name !== `${component}-`;
  const firstError = issues.find((i) => i.severity === "error");
  const firstWarning = issues.find((i) => i.severity === "warning");

  const candidates = set.tokens.filter((t) => LAYER_RANK[t.layer] < LAYER_RANK[layer] && t.kind === kind && t.status !== "deprecated");

  const create = () => {
    if (ok && nameTyped) onCreate(draft);
  };

  const focusLight = () => rowRef.current?.querySelector<HTMLButtonElement>('[data-new="light"] button')?.focus();

  return (
    <tr ref={rowRef} className="bg-row-selected/60" onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <td className="sticky-col">
        <div className="flex h-full items-center gap-3 pl-[10px]">
          <span className="size-4 shrink-0" aria-hidden="true" />
          <input
            ref={nameRef}
            aria-label="New token name"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (ok && nameTyped) create();
                else focusLight();
              }
            }}
            placeholder={placeholderFor(layer, kind, component)}
            autoComplete="off"
            spellCheck={false}
            className={cn(
              "h-8 w-full min-w-0 rounded-md border bg-background px-2 font-mono text-[12.5px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              nameTyped && issues.some((i) => i.severity === "error" && i.code.startsWith("name")) && "border-destructive/60",
            )}
          />
        </div>
      </td>
      <td className="px-1.5" data-new="light">
        <ValuePicker
          label={layer === "primitive" ? "Value" : "Light value"}
          value={light}
          onChange={(v) => setLight(v)}
          candidates={candidates}
          index={index}
          mode="light"
          allowRaw={layer !== "component"}
          allowRef={layer !== "primitive"}
        />
      </td>
      <td className="px-1.5">
        {hasDark ? (
          <ValuePicker
            label="Dark value"
            value={darkTouched ? dark : light}
            onChange={(v) => {
              setDark(v);
              setDarkTouched(true);
            }}
            candidates={candidates}
            index={index}
            mode="dark"
            allowRaw={layer !== "component"}
            allowRef
          />
        ) : (
          <div className="cell-btn text-muted-foreground/60">—</div>
        )}
      </td>
      <td>
        <div className="cell-btn"><StatusBadge status="draft" /></div>
      </td>
      <td colSpan={2}>
        <div className="cell-btn text-[12px]" aria-live="polite">
          {!nameTyped ? (
            <span className="truncate text-muted-foreground">Type a name. Enter to create, Esc to cancel.</span>
          ) : firstError ? (
            <span className="truncate text-destructive" title={firstError.message}>{firstError.message}</span>
          ) : firstWarning ? (
            <span className="truncate text-warning" title={firstWarning.message}>{firstWarning.message}</span>
          ) : (
            <span className="truncate text-muted-foreground">Ready: <span className="font-mono">{cssVariableName(draft)}</span></span>
          )}
        </div>
      </td>
      <td>
        <div className="flex items-center justify-center gap-0.5">
          <Button size="icon" variant="ghost" className="size-7" aria-label="Create token" disabled={!ok || !nameTyped} onClick={create}>
            <Check className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" aria-label="Cancel" onClick={onCancel}>
            <X className="size-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
