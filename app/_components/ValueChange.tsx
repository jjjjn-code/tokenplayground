"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatValue,
  isReference,
  resolveToken,
  type Layer,
  type Mode,
  type Token,
  type TokenIndex,
  type TokenValue,
} from "@/src/lib/tokens";
import { Swatch } from "./ui";

type Values = Pick<Token, "values"> | undefined;

const text = (v: TokenValue | undefined) => (v === undefined ? "none" : formatValue(v).replace(/[{}]/g, ""));

/** The colour a value shows, for the swatch: a raw hex, or what a reference resolves to today. */
function colourOf(v: TokenValue | undefined, index: TokenIndex, mode: Mode): unknown {
  if (v === undefined) return undefined;
  if (typeof v === "string") return v;
  if (isReference(v)) return resolveToken(index, v.ref, mode).value;
  return undefined;
}

function Value({ v, index, mode, tone }: { v: TokenValue | undefined; index: TokenIndex; mode: Mode; tone: "old" | "new" | "same" }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 font-mono text-[12px]",
        tone === "old" && "bg-destructive/10 text-destructive line-through decoration-destructive/60",
        tone === "new" && "bg-success/10 text-success",
        tone === "same" && "text-muted-foreground",
      )}
    >
      <Swatch value={colourOf(v, index, mode)} size="sm" />
      <span className="truncate">{text(v)}</span>
    </span>
  );
}

/**
 * Before and after for each mode, labelled Light and Dark. Changed values
 * show the old one in red, struck through, and the new one in green.
 */
export function ValueChange({ before, after, layer, index }: { before: Values; after: Values; layer: Layer; index: TokenIndex }) {
  const modes: { mode: Mode; label: string }[] =
    layer === "primitive" ? [{ mode: "light", label: "Value" }] : [{ mode: "light", label: "Light" }, { mode: "dark", label: "Dark" }];
  const get = (s: Values, m: Mode) => (s ? (m === "dark" ? s.values.dark ?? s.values.light : s.values.light) : undefined);
  return (
    <div className="grid gap-1">
      {modes.map(({ mode, label }) => {
        const b = get(before, mode);
        const a = get(after, mode);
        const changed = JSON.stringify(b) !== JSON.stringify(a);
        return (
          <div key={mode} className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
            <span className="flex min-w-0 flex-wrap items-center gap-1">
              {!changed ? (
                <>
                  <Value v={a} index={index} mode={mode} tone="same" />
                  <span className="text-[11px] text-muted-foreground">no change</span>
                </>
              ) : (
                <>
                  {b !== undefined ? <Value v={b} index={index} mode={mode} tone="old" /> : null}
                  {b !== undefined && a !== undefined ? <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-label="changed to" /> : null}
                  {a !== undefined ? <Value v={a} index={index} mode={mode} tone="new" /> : <span className="text-[11px] text-destructive">removed</span>}
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
