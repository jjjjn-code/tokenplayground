"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CircleCheck, CircleX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  checkBeforeSave,
  componentNovelty,
  cssVariableName,
  namingGuide,
  normaliseTokenInput,
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
import { NoveltyNotice } from "./RenameTitle";

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
  // Messages wait until the person finishes: never on load, never while typing.
  // "name": after leaving the name field or pushing Enter. "all": after pushing Create.
  const [reveal, setReveal] = useState<"none" | "name" | "all">("none");
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
    status: "active",
  };

  const { ok, issues } = useMemo(() => checkBeforeSave(set, [draft], []), [set, JSON.stringify(draft)]); // eslint-disable-line react-hooks/exhaustive-deps
  const nameTyped = draft.name.length > 0 && draft.name !== `${component}-`;
  const nameError = issues.find((i) => i.severity === "error" && i.code.startsWith("name"));
  const firstWarning = issues.find((i) => i.severity === "warning");
  // A new role, state or category belongs in the guided component flow.
  const novelty = layer === "component" && component && nameTyped && !nameError ? componentNovelty(set, component, draft.name) : null;
  const canCreate = ok && nameTyped && !novelty?.blocking;
  const guide = namingGuide(set, layer, kind, component);

  const candidates = set.tokens.filter((t) => LAYER_RANK[t.layer] < LAYER_RANK[layer] && t.kind === kind && t.status !== "deprecated");

  const create = () => {
    if (canCreate) onCreate(draft);
    else setReveal("all");
  };
  const showName = reveal !== "none" && nameTyped;
  const valueError = issues.find((i) => i.severity === "error" && !i.code.startsWith("name"));

  const focusLight = () => rowRef.current?.querySelector<HTMLButtonElement>('[data-new="light"] button')?.focus();

  return (
    <tr ref={rowRef} className="bg-row-selected/60" onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <td className="sticky-col align-top">
        <div className="grid gap-1.5 py-1.5 pr-2 pl-[38px]">
          <input
            ref={nameRef}
            aria-label="New token name"
            aria-describedby="new-token-guide new-token-message"
            value={name}
            onChange={(e) => {
              setName(normaliseTokenInput(e.target.value));
              setReveal("none");
            }}
            onBlur={() => {
              if (nameTyped) setReveal((r) => (r === "none" ? "name" : r));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (canCreate) create();
                else if (!nameError && !novelty?.blocking && nameTyped) {
                  setReveal("name");
                  focusLight();
                } else setReveal("name");
              }
            }}
            placeholder={placeholderFor(layer, kind, component)}
            autoComplete="off"
            spellCheck={false}
            className={cn(
              "h-8 w-full min-w-0 rounded-md border bg-background px-2 font-mono text-[12.5px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              showName && nameError && "border-destructive/60",
              showName && novelty?.blocking && "border-warning/60",
            )}
          />
          <p id="new-token-guide" className="text-[11.5px] leading-snug text-muted-foreground">{guide}</p>
          <div id="new-token-message" aria-live="polite" className="text-[12px] leading-snug">
            {!showName ? null : novelty?.blocking && component ? (
              <NoveltyNotice component={component} novelty={novelty} name={draft.name} />
            ) : nameError ? (
              <p className="flex gap-1.5 text-destructive"><CircleX className="mt-px size-3.5 shrink-0" />{nameError.message}</p>
            ) : reveal === "all" && valueError ? (
              <p className="flex gap-1.5 text-destructive"><CircleX className="mt-px size-3.5 shrink-0" />{valueError.message}</p>
            ) : canCreate ? (
              <p className="flex gap-1.5 text-success">
                <CircleCheck className="mt-px size-3.5 shrink-0" />
                <span>The token is correct. Push Enter to add <span className="font-mono">{cssVariableName(draft)}</span>.</span>
              </p>
            ) : (
              <p className="flex gap-1.5 text-muted-foreground">
                <CircleCheck className="mt-px size-3.5 shrink-0" />
                <span>The name is correct. Select the values.</span>
              </p>
            )}
            {showName && novelty && !novelty.blocking && !nameError && component ? (
              <NoveltyNotice component={component} novelty={novelty} name={draft.name} className="mt-1.5" />
            ) : null}
            {showName && !novelty && !nameError && canCreate && firstWarning ? (
              <p className="mt-1 flex gap-1.5 text-warning"><AlertTriangle className="mt-px size-3.5 shrink-0" />{firstWarning.message}</p>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-1.5 pt-1.5 align-top" data-new="light">
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
      <td className="px-1.5 pt-1.5 align-top">
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
      <td className="align-top">
        <div className="cell-btn h-auto"><StatusBadge status="active" /></div>
      </td>
      <td colSpan={2} className="align-top">
        <div className="cell-btn h-auto text-[12px] text-muted-foreground">Esc to cancel</div>
      </td>
      <td className="align-top">
        <div className="flex h-[39px] items-center justify-center gap-0.5">
          <Button size="icon" variant="ghost" className="size-7" aria-label="Create token" disabled={!nameTyped} onClick={create}>
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
