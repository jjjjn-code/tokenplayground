"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Copy,
  History,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  checkBeforeSave,
  cssFileFor,
  cssVariableName,
  formatValue,
  indexTokens,
  isComposite,
  isPublishedInFigma,
  isReference,
  LAYER_RANK,
  lastChange,
  resolveToken,
  validateTokenSet,
  type Kind,
  type Layer,
  type Mode,
  type SimpleValue,
  type Status,
  type Token,
  type TokenIndex,
} from "@/src/lib/tokens";
import { useStore } from "../_lib/store";
import { inSet, KIND_ORDER, KIND_TITLE, LAYER_TITLE, parseSet, setTitle } from "../_lib/sets";
import { TokenDetails, type DetailsTab } from "./TokenDetails";
import { TokenEditor } from "./TokenEditor";
import { TokenCommandList } from "./ValuePicker";
import { NewTokenRow } from "./NewTokenRow";
import { AliasPill, relativeDate, resolvedText, StatusBadge, Swatch } from "./ui";

const COLS = 6; // name, light, dark, status, last change, in code

interface Group {
  key: string;
  title: string;
  href: string;
  tokens: Token[];
}

function groupTokens(tokens: Token[]): Group[] {
  const groups = new Map<string, Group>();
  const order = (t: Token) =>
    LAYER_RANK[t.layer] * 100 + (t.layer === "component" ? 0 : KIND_ORDER.indexOf(t.kind));
  for (const t of [...tokens].sort((a, b) => order(a) - order(b))) {
    const key = t.layer === "component" ? `component/${t.component}` : `${t.layer}/${t.kind}`;
    const title = t.layer === "component" ? `${LAYER_TITLE.component} · ${t.component}` : `${LAYER_TITLE[t.layer]} · ${KIND_TITLE[t.kind]}`;
    if (!groups.has(key)) groups.set(key, { key, title, href: `/?set=${key}`, tokens: [] });
    groups.get(key)!.tokens.push(t);
  }
  return [...groups.values()];
}

/** What a cell shows for 1 mode: swatch, alias pill and resolved value. */
function ValueDisplay({ token, mode, index }: { token: Token; mode: Mode; index: TokenIndex }) {
  const v = mode === "dark" ? token.values.dark ?? token.values.light : token.values.light;
  const r = resolveToken(index, token.name, mode);
  if (isComposite(v)) {
    const resolved = (r.value ?? {}) as Record<string, unknown>;
    const colour = Object.values(resolved).find((x) => typeof x === "string" && x.startsWith("#"));
    const summary = Object.entries(resolved)
      .filter(([k]) => k !== "color" && k !== "fontFamily")
      .map(([, x]) => String(x))
      .join(" · ");
    return (
      <>
        <Swatch value={colour} />
        <span className="truncate font-mono text-[12.5px]" title={resolvedText(r.value)}>
          {r.error ? <span className="text-destructive">broken reference</span> : summary}
        </span>
      </>
    );
  }
  if (isReference(v)) {
    return (
      <>
        <Swatch value={r.value} />
        <AliasPill name={v.ref} broken={!!r.error} className="max-w-[60%]" />
        <span className="ml-auto truncate font-mono text-[11.5px] text-muted-foreground">{r.error ? "broken" : resolvedText(r.value)}</span>
      </>
    );
  }
  return (
    <>
      <Swatch value={v} />
      <span className="truncate font-mono text-[12.5px]">{v === "" ? <span className="text-destructive">missing</span> : String(v)}</span>
    </>
  );
}

/** Token overview (F1) as a spreadsheet, with inline editing (F3) and the row menu (F4). */
export function Overview() {
  const { set, history, saveTokens, deprecate, reactivate } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const filter = parseSet(params.get("set"));
  const index = useMemo(() => indexTokens(set), [set]);
  const issues = useMemo(() => validateTokenSet(set), [set]);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(params.get("token"));
  const [tab, setTab] = useState<DetailsTab>("references");
  const [editCell, setEditCell] = useState<{ name: string; mode: Mode; seed: string } | null>(null);
  const [editing, setEditing] = useState<Token | null>(null);
  const [creating, setCreating] = useState(params.get("new") === "token");
  const [preset, setPreset] = useState<{ layer: Layer; kind: Kind } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [statusChange, setStatusChange] = useState<{ names: string[]; to: "deprecated" | "active" } | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setOpen(params.get("token"));
    if (params.get("new") === "token") setCreating(true);
  }, [params]);
  useEffect(() => setSelection(new Set()), [params]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return set.tokens.filter((t) => {
      if (!inSet(t, filter)) return false;
      if (status !== "all" && t.status !== status) return false;
      if (!needle) return true;
      const hay = [
        t.name,
        cssVariableName(t),
        formatValue(t.values.light),
        formatValue(t.values.dark),
        resolvedText(resolveToken(index, t.name, "light").value),
        resolvedText(resolveToken(index, t.name, "dark").value),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, index, q, status, params]);

  const groups = useMemo(() => groupTokens(rows), [rows]);
  const flat = groups.flatMap((g) => g.tokens);
  const issuesFor = useCallback((name: string) => issues.filter((i) => i.token === name && i.severity !== "info"), [issues]);
  const errorCount = issues.filter((i) => i.severity === "error").length;

  const copy = async (text: string, label = text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${label}`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const openDetails = (name: string, t: DetailsTab = "references") => {
    setTab(t);
    setOpen(name);
  };

  /** Inline edit of 1 mode, checked by the rules engine before saving. */
  const commitCell = (token: Token, mode: Mode, value: SimpleValue) => {
    const current = mode === "dark" ? token.values.dark : token.values.light;
    if (JSON.stringify(current) === JSON.stringify(value)) {
      setEditCell(null);
      return;
    }
    const updated: Token = { ...token, values: { ...token.values, [mode]: value } };
    const res = checkBeforeSave(set, [updated], [token.name]);
    const firstError = res.issues.find((i) => i.severity === "error");
    if (firstError) {
      toast.error("Not saved", { description: firstError.message });
      return;
    }
    saveTokens([updated], [token.name]);
    setEditCell(null);
    const warning = res.issues.find((i) => i.severity === "warning");
    if (warning) toast.warning(`Updated ${token.name}`, { description: warning.message });
    else toast.success(`Updated ${token.name}`, { description: `${mode === "light" && token.layer !== "primitive" ? "Light" : mode === "dark" ? "Dark" : "Value"}: ${formatValue(value)}` });
  };

  const candidatesFor = (t: Token) =>
    set.tokens.filter((c) => LAYER_RANK[c.layer] < LAYER_RANK[t.layer] && c.kind === t.kind && c.status !== "deprecated");

  type Action = { label: string; icon: React.ReactNode; onSelect: () => void; separator?: boolean; destructive?: boolean };
  const actions = (t: Token): Action[] => [
    { label: "Copy name", icon: <Copy />, onSelect: () => copy(t.name) },
    { label: "Copy code name", icon: <Copy />, onSelect: () => copy(cssVariableName(t)) },
    { label: "View references", icon: <Link2 />, onSelect: () => openDetails(t.name, "references"), separator: true },
    { label: "View history", icon: <History />, onSelect: () => openDetails(t.name, "history") },
    { label: "Edit", icon: <Pencil />, onSelect: () => setEditing(t), separator: true },
    t.status === "deprecated"
      ? { label: "Make active again", icon: <ArchiveRestore />, onSelect: () => { setReason(""); setStatusChange({ names: [t.name], to: "active" }); } }
      : { label: "Deprecate", icon: <Archive />, destructive: true, onSelect: () => { setReason(""); setStatusChange({ names: [t.name], to: "deprecated" }); } },
  ];

  /** Arrow keys move between cells, like a spreadsheet. */
  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const el = e.target as HTMLElement;
    const r = Number(el.dataset.row);
    const c = Number(el.dataset.col);
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    let nr = r + m[0];
    let nc = c + m[1];
    while (nr >= 0 && nr < flat.length && nc >= 0 && nc < COLS) {
      const next = document.querySelector<HTMLElement>(`[data-row="${nr}"][data-col="${nc}"]`);
      if (next) {
        next.focus();
        return;
      }
      nr += m[0];
      nc += m[1];
    }
  };

  const selectedToken = open ? set.tokens.find((t) => t.name === open) ?? null : null;
  const allSelected = flat.length > 0 && flat.every((t) => selection.has(t.name));
  const toggleRow = (n: string) =>
    setSelection((s) => {
      const x = new Set(s);
      if (x.has(n)) x.delete(n);
      else x.add(n);
      return x;
    });

  let rowIndex = -1;

  const valueCell = (t: Token, mode: Mode, r: number, c: number) => {
    if (mode === "dark" && t.layer === "primitive") {
      return (
        <td key={mode}>
          <div className="cell-btn text-muted-foreground/60" title="Primitives have 1 value for every mode">—</div>
        </td>
      );
    }
    const composite = isComposite(mode === "dark" ? t.values.dark ?? t.values.light : t.values.light);
    const isOpen = editCell?.name === t.name && editCell.mode === mode;
    const label = `${t.name}, ${t.layer === "primitive" ? "value" : mode}. Press Enter to change.`;
    if (composite) {
      return (
        <td key={mode}>
          <button type="button" className="cell-btn" data-editable="true" data-row={r} data-col={c} aria-label={label} onClick={() => setEditing(t)}>
            <ValueDisplay token={t} mode={mode} index={index} />
          </button>
        </td>
      );
    }
    const current = mode === "dark" ? t.values.dark : t.values.light;
    const currentText = current === undefined || current === "" ? "" : formatValue(current).replace(/[{}]/g, "");
    const modeLabel = t.layer === "primitive" ? "Value" : mode === "light" ? "Light" : "Dark";
    return (
      <td key={mode}>
        <Popover open={isOpen} onOpenChange={(o) => setEditCell(o ? { name: t.name, mode, seed: currentText } : null)}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn("cell-btn", isOpen && "bg-accent")}
              data-editable="true"
              data-row={r}
              data-col={c}
              aria-label={label}
              onKeyDown={(e) => {
                // Like a spreadsheet: start typing on a selected cell to edit it.
                if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && e.key !== " ") {
                  e.preventDefault();
                  setEditCell({ name: t.name, mode, seed: e.key });
                }
              }}
            >
              <ValueDisplay token={t} mode={mode} index={index} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[max(var(--radix-popover-trigger-width),340px)] p-0"
            align="start"
            side="bottom"
            sideOffset={-40}
            avoidCollisions
          >
            <TokenCommandList
              key={`${t.name}-${mode}-${editCell?.seed ?? ""}`}
              initialSearch={editCell?.seed ?? ""}
              placeholder={`${modeLabel}: ${t.layer === "primitive" ? "type a value, for example #FF5000" : t.layer === "component" ? "type a token name" : "type a token name or a value"}`}
              candidates={candidatesFor(t)}
              index={index}
              mode={mode}
              selected={isReference(current) ? current.ref : undefined}
              allowRaw={t.layer !== "component"}
              allowRef={t.layer !== "primitive"}
              onPick={(v) => commitCell(t, mode, v)}
            />
          </PopoverContent>
        </Popover>
      </td>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b px-4 py-2 pl-16 md:pl-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
          {setTitle(filter).map((p, i, a) => (
            <Fragment key={p}>
              {i > 0 ? <span className="text-muted-foreground">/</span> : null}
              <span className={i === a.length - 1 ? "font-medium" : "text-muted-foreground"}>{p}</span>
            </Fragment>
          ))}
          <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">{rows.length}</span>
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search tokens"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or value"
              className="h-8 w-56 pl-8 text-[13px]"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as Status | "all")}>
            <SelectTrigger size="sm" className="w-36 text-[13px]" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="deprecated">Deprecated</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm"><Plus className="size-4" /> New <ChevronDown className="size-3.5 opacity-70" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem asChild>
                <Link href="/create">Component tokens<span className="ml-auto text-xs text-muted-foreground">guided</span></Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCreating(true)}>Primitive or semantic token</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Status strip or bulk actions */}
      <div className="flex h-10 items-center gap-3 border-b bg-muted/30 px-4 text-[13px]">
        {selection.size ? (
          <>
            <span className="font-medium">{selection.size} selected</span>
            <Button variant="ghost" size="sm" className="h-7" onClick={() => copy([...selection].join("\n"), `${selection.size} names`)}>
              <Copy className="size-3.5" /> Copy names
            </Button>
            <Button variant="ghost" size="sm" className="h-7" onClick={() => { setReason(""); setStatusChange({ names: [...selection].filter((n) => set.tokens.find((t) => t.name === n)?.status !== "deprecated"), to: "deprecated" }); }}>
              <Archive className="size-3.5" /> Deprecate
            </Button>
            <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => setSelection(new Set())}>
              <X className="size-3.5" /> Clear
            </Button>
          </>
        ) : (
          <>
            <span className="hidden text-muted-foreground sm:inline">Click a value to change it. Right-click a row for more.</span>
            <span className={cn("ml-auto", errorCount ? "text-destructive" : "text-muted-foreground")}>
              {errorCount ? `${errorCount} rule ${errorCount === 1 ? "error" : "errors"} in the set` : "All tokens pass the naming rules"}
            </span>
          </>
        )}
      </div>

      {/* Sheet */}
      <div className="min-h-0 flex-1 overflow-auto" onKeyDown={onGridKeyDown}>
        <table className="sheet-table min-w-[1060px]">
          <colgroup>
            <col style={{ width: 300 }} />
            <col style={{ width: 230 }} />
            <col style={{ width: 230 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 120 }} />
            <col />
            <col style={{ width: 64 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="sticky-col">
                <div className="flex items-center gap-3">
                  <Checkbox
                    aria-label="Select all shown tokens"
                    checked={allSelected ? true : selection.size ? "indeterminate" : false}
                    onCheckedChange={(v) => setSelection(v ? new Set(flat.map((t) => t.name)) : new Set())}
                  />
                  Name
                </div>
              </th>
              <th>Light</th>
              <th>Dark</th>
              <th>Status</th>
              <th>Last change</th>
              <th>In code</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
                {groups.length > 1 || !filter.layer ? (
                  <tr className="group-row">
                    <td colSpan={7} className="sticky-col">
                      <Link href={g.href} className="flex items-center gap-2 px-3 text-xs font-medium text-muted-foreground hover:text-foreground">
                        {g.title}
                        <span className="font-mono tabular-nums opacity-70">{g.tokens.length}</span>
                      </Link>
                    </td>
                  </tr>
                ) : null}
                {g.tokens.map((t) => {
                  rowIndex += 1;
                  const r = rowIndex;
                  const errs = issuesFor(t.name);
                  const last = lastChange(history, t.name);
                  const hidden = t.layer === "component" && !isPublishedInFigma(t);
                  return (
                    <ContextMenu key={t.name}>
                      <ContextMenuTrigger asChild>
                        <tr data-selected={selection.has(t.name) || open === t.name}>
                          <td className="sticky-col">
                            <div className="flex h-full items-center gap-3 pl-[10px]">
                              <Checkbox aria-label={`Select ${t.name}`} checked={selection.has(t.name)} onCheckedChange={() => toggleRow(t.name)} />
                              <button
                                type="button"
                                className={cn("cell-btn -ml-1 min-w-0 flex-1 pl-1 font-mono text-[12.5px]", t.status === "deprecated" && "text-muted-foreground line-through")}
                                data-editable="true"
                                data-row={r}
                                data-col={0}
                                onClick={() => openDetails(t.name)}
                              >
                                <span className="truncate">{t.name}</span>
                                {hidden ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="shrink-0 rounded border px-1 font-sans text-[10px] text-muted-foreground no-underline">hidden</span>
                                    </TooltipTrigger>
                                    <TooltipContent>Hidden from publishing in Figma</TooltipContent>
                                  </Tooltip>
                                ) : null}
                                {errs.length ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className={cn("ml-auto size-2 shrink-0 rounded-full", errs.some((e) => e.severity === "error") ? "bg-destructive" : "bg-warning")} aria-label={`${errs.length} issues`} />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">{errs.map((e) => e.message).join(" ")}</TooltipContent>
                                  </Tooltip>
                                ) : null}
                              </button>
                            </div>
                          </td>
                          {valueCell(t, "light", r, 1)}
                          {valueCell(t, "dark", r, 2)}
                          <td>
                            <div className="cell-btn" tabIndex={-1} data-row={r} data-col={3}><StatusBadge status={t.status} /></div>
                          </td>
                          <td>
                            <div className="cell-btn text-[12px] whitespace-nowrap text-muted-foreground" title={last ? `${last.action} by ${last.by}` : undefined}>
                              {last ? <span className="truncate"><span className="text-foreground capitalize">{last.action}</span> · {relativeDate(last.at)}</span> : "—"}
                            </div>
                          </td>
                          <td>
                            <div className="cell-btn" title={cssFileFor(t)}>
                              <span className="truncate font-mono text-[12px] text-muted-foreground">{cssVariableName(t)}</span>
                            </div>
                          </td>
                          <td>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="mx-auto flex size-7" aria-label={`Actions for ${t.name}`}>
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                {actions(t).map((a) => (
                                  <Fragment key={a.label}>
                                    {a.separator ? <DropdownMenuSeparator /> : null}
                                    <DropdownMenuItem onSelect={a.onSelect} variant={a.destructive ? "destructive" : "default"}>
                                      {a.icon} {a.label}
                                    </DropdownMenuItem>
                                  </Fragment>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-52">
                        <div className="truncate px-2 py-1.5 font-mono text-xs text-muted-foreground">{t.name}</div>
                        {actions(t).map((a) => (
                          <Fragment key={a.label}>
                            {a.separator ? <ContextMenuSeparator /> : null}
                            <ContextMenuItem onSelect={a.onSelect} variant={a.destructive ? "destructive" : "default"}>
                              {a.icon} {a.label}
                            </ContextMenuItem>
                          </Fragment>
                        ))}
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
                {(() => {
                  const [gLayer, rest] = g.key.split("/") as [Layer, string];
                  const gKind: Kind = gLayer === "component" ? "color" : (rest as Kind);
                  const gComponent = gLayer === "component" ? rest : undefined;
                  if (adding === g.key) {
                    return (
                      <NewTokenRow
                        key={`new-${g.key}`}
                        layer={gLayer}
                        kind={gKind}
                        component={gComponent}
                        set={set}
                        index={index}
                        onCancel={() => setAdding(null)}
                        onCreate={(t) => {
                          saveTokens([t], []);
                          setAdding(null);
                          toast.success(`Created ${t.name}`, { description: "Saved as a draft in your unsaved changes." });
                        }}
                      />
                    );
                  }
                  const composite = gLayer === "semantic" && ["typography", "border", "shadow"].includes(gKind);
                  return (
                    <tr className="group-row" key={`add-${g.key}`}>
                      <td colSpan={7} className="sticky-col">
                        <button
                          type="button"
                          className="flex h-full w-full items-center gap-2 px-3 text-left text-[13px] text-muted-foreground hover:bg-row-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                          onClick={() => {
                            if (composite) {
                              setPreset({ layer: gLayer, kind: gKind });
                              setCreating(true);
                            } else setAdding(g.key);
                          }}
                        >
                          <Plus className="size-3.5" /> Create token
                          <span className="text-xs opacity-70">in {g.title}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })()}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!rows.length ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            No tokens match.
            {q || status !== "all" ? <Button variant="outline" size="sm" onClick={() => { setQ(""); setStatus("all"); }}>Clear search</Button> : null}
          </div>
        ) : null}
      </div>

      {/* Details */}
      <Sheet open={!!selectedToken} onOpenChange={(o) => { if (!o) { setOpen(null); if (params.get("token")) router.replace(`/?set=${params.get("set") ?? "all"}`); } }}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
          {selectedToken ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-base break-all">{selectedToken.name}</SheetTitle>
                <SheetDescription className="sr-only">Details, references and history</SheetDescription>
              </SheetHeader>
              <TokenDetails token={selectedToken} tab={tab} onTab={setTab} onSelect={(n) => setOpen(n)} onEdit={() => setEditing(selectedToken)} />
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-mono">{editing?.name}</DialogTitle>
            <DialogDescription>Change values, status or description. The rules are checked as you go.</DialogDescription>
          </DialogHeader>
          {editing ? <TokenEditor key={editing.name} token={editing} onDone={(saved) => { setEditing(null); if (saved) toast.success(`Saved ${saved.name}`); }} /> : null}
        </DialogContent>
      </Dialog>

      {/* Create a primitive or semantic token */}
      <Dialog open={creating} onOpenChange={(o) => { setCreating(o); if (!o && params.get("new")) router.replace("/"); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>New token</DialogTitle>
            <DialogDescription>Create a primitive or semantic token. For component tokens, use the guided flow.</DialogDescription>
          </DialogHeader>
          {creating ? (
            <TokenEditor
              initialLayer={preset?.layer}
              initialKind={preset?.kind}
              onDone={(saved) => {
                setCreating(false);
                setPreset(null);
                if (saved) {
                  toast.success(`Created ${saved.name}`);
                  router.replace(`/?set=${saved.layer}/${saved.kind}&token=${saved.name}`);
                } else if (params.get("new")) router.replace("/");
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Deprecate or make active */}
      <Dialog open={!!statusChange} onOpenChange={(o) => !o && setStatusChange(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {statusChange?.to === "active"
                ? `Make ${statusChange.names[0]} active again`
                : statusChange && statusChange.names.length > 1
                  ? `Deprecate ${statusChange.names.length} tokens`
                  : `Deprecate ${statusChange?.names[0] ?? ""}`}
            </DialogTitle>
            <DialogDescription>
              {statusChange?.to === "active"
                ? "The token will be treated as active again."
                : "Deprecated tokens stay in code and in Figma, but the tool warns when anything points to them."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!statusChange || !reason.trim()) return;
              for (const n of statusChange.names) {
                if (statusChange.to === "active") reactivate(n, reason.trim());
                else deprecate(n, reason.trim());
              }
              toast.success(statusChange.to === "active" ? "Made active" : `Deprecated ${statusChange.names.length} ${statusChange.names.length === 1 ? "token" : "tokens"}`);
              setStatusChange(null);
              setSelection(new Set());
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="st-reason">Reason</Label>
              <Input id="st-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" required placeholder="Saved in the history" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStatusChange(null)}>Cancel</Button>
              <Button type="submit" variant={statusChange?.to === "active" ? "default" : "destructive"} disabled={!reason.trim() || !statusChange?.names.length}>
                {statusChange?.to === "active" ? "Make active" : "Deprecate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
