/**
 * Component scan (F12): what the plugin window shows. Turns a scan result
 * into plain data (names, hex values, labels) that can be sent from the
 * Figma side to the window, and builds the Done preview.
 */
import { componentCss } from "../tokens/css";
import { serialiseDtcg } from "../tokens/dtcg";
import type { Issue, Token } from "../tokens/types";
import { colourIn, localFirst, draftsToTokens, rgbaToHex, sourceLabel, variablesToTokenSet, withChoices, type Choices, type ScannedLayer, type ScanResult, type ScanStatus, type ScanVariable, type Source } from "./scan";

export interface Swatch {
  hex: string;
  /** Primitive name, or the hex value for a raw colour. */
  label: string;
}

export type BindingKind = "semantic" | "primitive" | "component" | "raw" | "missing";

export interface LayerView {
  variant: string;
  state: string;
  layer: string;
  category: string | null;
  paint: "Fill" | "Stroke";
  kind: BindingKind;
  /** The token name, or the hex value. */
  label: string;
  light: Swatch | null;
  dark: Swatch | null;
  /** The binding in the dark copy, when it differs from the light one. */
  darkLabel?: string;
  /** A dark copy was selected, but it has no matching layer. */
  noMatch: boolean;
  sameInBoth: boolean;
}

export interface ChangeView {
  before: LayerView;
  /** Full token name it will be bound to. */
  token: string;
  reused: boolean;
}

export interface TokenView {
  name: string;
  figmaName: string;
  figmaPath: string;
  /** Category title for grouping: Surface, Line, Content or Icon. */
  group: string;
  published: boolean;
  source: string;
  light: string | null;
  dark: string | null;
  needsDark: boolean;
  needsLight: boolean;
  fromDarkCopy: boolean;
}

export interface ScanView {
  status: ScanStatus;
  title: string;
  component: string;
  variants: number;
  /** The dark copy's name, when one was selected. */
  darkName?: string;
  layers: LayerView[];
  unknown: LayerView[];
  changes: ChangeView[];
  tokens: TokenView[];
  issues: Issue[];
  /** Every primitive in the file, for the pickers. */
  primitives: Swatch[];
}

const title = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function swatchOf(source: Source, mode: "light" | "dark"): Swatch | null {
  const c = colourIn(source, mode);
  if (!c) return null;
  const hex = rgbaToHex(c);
  let label = hex;
  if (source.kind === "semantic" || source.kind === "component") label = source[mode].primitive ?? hex;
  if (source.kind === "primitive") label = source.token;
  if (source.kind === "raw") label = source.value.primitive ? `${hex} (${source.value.primitive})` : hex;
  return { hex, label };
}

function layerView(l: ScannedLayer): LayerView {
  // With a dark copy, the dark swatch is the copy's paint in dark mode.
  const darkFromCopy = l.darkSource ? swatchOf(l.darkSource, "dark") : null;
  const darkLabel = l.darkSource && sourceLabel(l.darkSource) !== sourceLabel(l.source) ? sourceLabel(l.darkSource) : undefined;
  return {
    variant: l.paint.variant,
    state: l.paint.state,
    layer: l.paint.layerName,
    category: l.category,
    paint: l.paint.paint === "fills" ? "Fill" : "Stroke",
    kind: l.source.kind,
    label: sourceLabel(l.source),
    light: swatchOf(l.source, "light"),
    dark: darkFromCopy ?? swatchOf(l.source, "dark"),
    darkLabel,
    noMatch: l.noMatch,
    sameInBoth: l.sameInBoth,
  };
}

/** Every primitive in the file with its colour, sorted by name. */
export function primitiveSwatches(vars: ScanVariable[]): Swatch[] {
  const index = variablesToTokenSet(vars);
  const byName = new Map(index.tokens.map((t) => [t.name, t]));
  const hexOf = (name: string, seen: string[] = []): string | null => {
    const t = byName.get(name);
    const v = t?.values.value;
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && "ref" in v && typeof v.ref === "string" && !seen.includes(v.ref)) return hexOf(v.ref, [...seen, name]);
    return null;
  };
  const seen = new Set<string>();
  return localFirst(vars)
    .filter((v) => v.layer === "primitive" && !seen.has(v.token) && seen.add(v.token))
    .map((v) => ({ label: v.token, hex: hexOf(v.token) ?? "" }))
    .filter((s) => s.hex)
    .sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));
}

export function scanView(result: ScanResult, vars: ScanVariable[]): ScanView {
  return {
    status: result.status,
    title: result.title,
    component: result.component,
    variants: result.variants,
    darkName: result.darkName,
    layers: result.layers.map(layerView),
    unknown: result.unknown.map(layerView),
    changes: result.changes.map((c) => ({ before: layerView(c.layer), token: c.token, reused: c.reused })),
    tokens: result.tokens.map((t) => ({
      name: t.name,
      figmaName: t.figmaName,
      figmaPath: t.figmaPath,
      group: title(t.category),
      published: t.published,
      source: t.source,
      light: t.light,
      dark: t.dark,
      needsDark: t.needsDark,
      needsLight: t.needsLight,
      fromDarkCopy: t.fromDarkCopy,
    })),
    issues: result.issues,
    primitives: primitiveSwatches(vars),
  };
}

export interface DonePreview {
  /** The new tokens in the tool's format. */
  tokens: Token[];
  /** The same tokens as W3C design tokens JSON, to send to the tool or download. */
  json: Record<string, unknown>;
  /** The CSS that Send to code (F5) will write for the component. */
  css: string;
}

/** What the Done screen shows, and what is sent to Token Library. */
export function donePreview(result: ScanResult, vars: ScanVariable[], choices: Choices = {}): DonePreview {
  const tokens = draftsToTokens(withChoices(result.tokens, choices)).map((t) => ({
    ...t,
    description: `Made by the component scan in Figma.`,
  }));
  const context = variablesToTokenSet(vars);
  const primitives = context.tokens.filter((t) => t.layer === "primitive");
  const css = componentCss({ tokens: [...primitives, ...tokens] }, result.component);
  return { tokens, json: serialiseDtcg({ tokens }, `Component tokens for ${result.title}, made by the component scan in Figma.`), css };
}

/** 1 box in the token map: 1 part in 1 state. */
export interface MapCell {
  state: string;
  /** The token the layers will use. */
  token: string;
  /** This state looks the same as Default, so it uses the -default token. */
  reused: boolean;
  published: boolean;
  /** After: the token's colours. */
  light: Swatch | null;
  dark: Swatch | null;
  /** Before: what the layers used, in light and in dark. */
  beforeLight: { label: string; swatch: Swatch | null };
  beforeDark: { label: string; swatch: Swatch | null };
  /** The designer still has to choose a value. */
  needsLight: boolean;
  needsDark: boolean;
  /** The layers in this box, for Show on canvas and the part menu. */
  layers: { nodeId: string; darkNodeId?: string; name: string; paint: "Fill" | "Stroke"; key: string; category: string }[];
}

/** 1 row of the token map: 1 part (and role). */
export interface MapRow {
  key: string;
  category: string;
  role?: string;
  label: string;
  cells: (MapCell | null)[];
}

export interface TokenMap {
  /** The states in order, as column headings. */
  states: string[];
  rows: MapRow[];
}

const STATE_ORDER = ["default", "hover", "pressed", "disabled", "selected", "loading", "on", "off"];
const rankOf = (s: string) => (STATE_ORDER.indexOf(s) === -1 ? STATE_ORDER.length : STATE_ORDER.indexOf(s));
const CAT_ORDER = ["surface", "line", "content", "icon"];

/**
 * The token map (24 Nov 2026): parts against states, each box with the
 * token's light and dark colours and what the layers used before.
 * `choices` are the designer's picks, so the boxes show them straight away.
 */
export function tokenMap(result: ScanResult, vars: ScanVariable[], choices: Choices = {}): TokenMap {
  const prims = primitiveSwatches(vars);
  const sw = (name: string | null | undefined): Swatch | null => (name ? prims.find((p) => p.label === name) ?? null : null);
  const tokens = new Map(withChoices(result.tokens, choices).map((t) => [t.name, t]));
  const states = [...new Set(result.changes.map((c) => c.layer.paint.state))].sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b));
  const rows = new Map<string, MapRow>();
  for (const c of result.changes) {
    const p = c.layer.paint;
    const category = c.layer.category!;
    const key = [category, p.role].filter(Boolean).join("|");
    const row = rows.get(key) ?? { key, category, role: p.role, label: [title(category), p.role ? `(${p.role})` : ""].filter(Boolean).join(" "), cells: states.map(() => null) };
    const i = states.indexOf(p.state);
    const t = tokens.get(c.token);
    const before = layerView(c.layer);
    const cell: MapCell = row.cells[i] ?? {
      state: p.state,
      token: c.token,
      reused: c.reused,
      published: !!t?.published,
      light: sw(t?.light),
      dark: sw(t?.dark),
      beforeLight: { label: before.label, swatch: before.light },
      beforeDark: { label: before.darkLabel ?? before.label, swatch: before.dark },
      needsLight: !!t && t.needsLight && !t.light,
      needsDark: !!t && t.needsDark && !t.dark,
      layers: [],
    };
    cell.layers.push({ nodeId: p.nodeId, darkNodeId: p.dark?.nodeId, name: p.layerName, paint: p.paint === "fills" ? "Fill" : "Stroke", key: `${p.layerName}|${p.paint}`, category });
    row.cells[i] = cell;
    rows.set(key, row);
  }
  const ordered = [...rows.values()].sort((a, b) => (a.role ?? "").localeCompare(b.role ?? "") || CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category));
  return { states, rows: ordered };
}
