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
