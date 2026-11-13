"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  isReference,
  resolveToken,
  type Layer,
  type Mode,
  type SimpleValue,
  type Token,
  type TokenIndex,
} from "@/src/lib/tokens";
import { LAYER_TITLE } from "../_lib/sets";
import { AliasPill, resolvedText, Swatch } from "./ui";

/**
 * Searchable list of tokens to point to (F3), with swatches and resolved
 * values. When raw values are allowed, typing a value offers to use it.
 */
export function TokenCommandList({
  candidates,
  index,
  mode,
  selected,
  allowRaw,
  allowRef = true,
  onPick,
  placeholder,
  initialSearch = "",
}: {
  candidates: Token[];
  index: TokenIndex;
  mode: Mode;
  selected?: string;
  allowRaw: boolean;
  allowRef?: boolean;
  onPick: (v: SimpleValue) => void;
  placeholder?: string;
  /** Text already in the box when it opens: a typed first letter, or the current value to overwrite. */
  initialSearch?: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  // A prefilled current value is selected, so typing replaces it; a typed
  // first letter is not, so typing carries on after it.
  const selectAll = initialSearch.length > 1;
  const layers: Layer[] = ["primitive", "semantic"];
  const raw = search.trim();
  // Offer the typed text as a raw value only when it looks like one, or when
  // no token matches, so Enter on a token name picks the token.
  const looksRaw = !!raw && (/^[#0-9.]/.test(raw) || !allowRef || !candidates.some((c) => c.name.includes(raw.toLowerCase())));
  return (
    <Command>
      <CommandInput
        value={search}
        onValueChange={setSearch}
        autoFocus
        onFocus={(e) => {
          if (selectAll) e.currentTarget.select();
          else e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length);
        }}
        placeholder={placeholder ?? (allowRaw && allowRef ? "Search tokens or type a value" : allowRaw ? "Type a value, for example #FF5000" : "Search tokens")}
      />
      <CommandList className="max-h-72">
        {allowRaw && looksRaw ? (
          <CommandGroup heading="Raw value">
            <CommandItem value={`__raw__${raw}`} onSelect={() => onPick(raw)} forceMount>
              <Swatch value={raw} size="sm" />
              Use <span className="font-mono">{raw}</span>
            </CommandItem>
          </CommandGroup>
        ) : null}
        {allowRef ? <CommandEmpty>No matching token.</CommandEmpty> : null}
        {allowRef
          ? layers.map((l) => {
              const opts = candidates.filter((c) => c.layer === l);
              if (!opts.length) return null;
              return (
                <CommandGroup key={l} heading={LAYER_TITLE[l]}>
                  {opts.map((c) => {
                    const r = resolveToken(index, c.name, mode);
                    return (
                      <CommandItem key={c.name} value={c.name} keywords={[resolvedText(r.value)]} onSelect={() => onPick({ ref: c.name })}>
                        <Swatch value={r.value} size="sm" />
                        <span className="truncate font-mono text-[12.5px]">{c.name}</span>
                        <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{typeof r.value === "object" ? "" : resolvedText(r.value)}</span>
                        <Check className={cn("size-3.5", selected === c.name ? "opacity-100" : "opacity-0")} />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })
          : null}
      </CommandList>
    </Command>
  );
}

/** A form field that holds a reference or a raw value, opening the searchable list. */
export function ValuePicker({
  id,
  label,
  value,
  onChange,
  candidates,
  index,
  mode,
  allowRaw,
  allowRef,
  invalid,
}: {
  id?: string;
  label: string;
  value: SimpleValue | "";
  onChange: (v: SimpleValue | "") => void;
  candidates: Token[];
  index: TokenIndex;
  mode: Mode;
  allowRaw: boolean;
  allowRef: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState("");
  const refName = isReference(value) ? value.ref : "";
  const resolved = refName ? resolveToken(index, refName, mode) : null;
  const rawValue = !isReference(value) && value !== "" ? String(value) : "";

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSeed("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          onKeyDown={(e) => {
            // Start typing on the box to search straight away.
            if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && e.key !== " ") {
              e.preventDefault();
              setSeed(e.key);
              setOpen(true);
            }
          }}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-2.5 text-left text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30",
            invalid && "border-destructive/60",
          )}
        >
          {refName ? (
            <>
              <Swatch value={resolved?.value} size="sm" />
              <AliasPill name={refName} broken={!!resolved?.error} className="min-w-0" />
            </>
          ) : rawValue ? (
            <>
              <Swatch value={rawValue} size="sm" />
              <span className="truncate font-mono text-[12.5px]">{rawValue}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{allowRef ? "Pick a token" : "Enter a value"}</span>
          )}
          <ChevronsUpDown className="ml-auto size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <TokenCommandList
          candidates={candidates}
          index={index}
          mode={mode}
          selected={refName}
          allowRaw={allowRaw}
          allowRef={allowRef}
          initialSearch={seed}
          onPick={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
