/**
 * Component scan (F12): read a finished component set and, when any part
 * uses a primitive or a raw value, draft a complete set of component tokens
 * for the whole component. Pure code, shared by the Figma plugin and the
 * tests; the plugin reads the file into a `ScanInput` (see `scan-figma.ts`).
 *
 * The rules are in the PRD, section "Component scan (F12)".
 */
import { buildComponentTokenName, figmaPath, normaliseComponentName } from "../tokens/naming";
import { COMPONENT_CATEGORIES, DEFAULT_FIGMA_GROUP, FORBIDDEN_STATES, SUGGESTED_ROLES, SUGGESTED_STATES } from "../tokens/rules";
import { checkBeforeSave } from "../tokens/validate";
import type { Issue, Layer, Mode, Token, TokenSet } from "../tokens/types";
import type { CollectionKey } from "./plan";

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A colour variable, as the scan sees it. */
export interface ScanVariable {
  id: string;
  /** Name in the tool, for example `neutral-200` or `line-default`. */
  token: string;
  /** Name in Figma, with slashes for groups. */
  name: string;
  collection: CollectionKey | null;
  /** Worked out from the collection and group; null when the scan cannot tell. */
  layer: Layer | null;
  /** By mode key (`value`, `light`, `dark`): a colour, or the id of another variable. */
  values: Record<Mode, { color: Rgba } | { alias: string }>;
  /** From a library, not from this file. When a name is in both, this file's variable is used. */
  remote?: boolean;
}

/** This file's variables first, so a name that is also in a library resolves to this file's variable. */
export const localFirst = (vars: ScanVariable[]): ScanVariable[] => [...vars.filter((v) => !v.remote), ...vars.filter((v) => v.remote)];

export type Binding = { kind: "variable"; id: string } | { kind: "raw"; color: Rgba };

/** 1 colour on 1 layer in 1 variant. */
export interface ScannedPaint {
  variantId: string;
  /** The variant's name in Figma, for example `State=Hover`. */
  variant: string;
  /** Slug of the `State` value, for example `hover`. */
  state: string;
  /** Slug of the other variant property, when the component has more than 1 variant. */
  role?: string;
  nodeId: string;
  layerName: string;
  paint: "fills" | "strokes";
  index: number;
  binding: Binding;
  /**
   * The same paint in the dark copy (24 Nov 2026): its layer and binding.
   * Undefined when no dark copy was selected; null when the dark copy has
   * no matching layer.
   */
  dark?: { nodeId: string; binding: Binding } | null;
  /**
   * The category when it does not come from the layer name: the variant
   * frame's own fill (surface) and stroke (line), and layers inside an
   * instance such as an icon (content).
   */
  category?: string;
}

export interface ScanInput {
  /** The component set's name in Figma, for example `Control`. */
  componentName: string;
  variants: { id: string; name: string; state: string; role?: string }[];
  paints: ScannedPaint[];
  variables: ScanVariable[];
  /** Problems found while reading, for example no `State` property. */
  issues: Issue[];
  /** The dark copy's name, when one was selected. Dark values then come from it. */
  darkName?: string;
}

/** A primitive and its colour in 1 mode. */
export interface Resolved {
  /** Tool name of the primitive behind the value; null for a raw colour with no matching primitive. */
  primitive: string | null;
  color: Rgba;
}

export type Source =
  | { kind: "semantic"; token: string; light: Resolved; dark: Resolved }
  | { kind: "component"; token: string; own: boolean; light: Resolved; dark: Resolved }
  | { kind: "primitive"; token: string; value: Resolved }
  | { kind: "raw"; value: Resolved }
  | { kind: "missing"; id: string };

export interface ScannedLayer {
  paint: ScannedPaint;
  /** The category from the layer name; null when the name is not recognised. */
  category: string | null;
  source: Source;
  /** The matching paint in the dark copy, resolved in dark mode. Absent when there is no dark copy or no match. */
  darkSource?: Source;
  /** A dark copy was selected, but it has no layer that matches this one. */
  noMatch: boolean;
  /** Shows the same in light and dark because it uses a primitive or a raw value, and no dark copy gives its dark value. */
  sameInBoth: boolean;
}

export interface DraftToken {
  /** Full name, as in the tool and the code: `control-surface-hover`. */
  name: string;
  /** Name inside its Figma group: `surface-hover`. */
  figmaName: string;
  /** Full Figma variable name: `Interactive/Control/Surface/surface-hover`. */
  figmaPath: string;
  component: string;
  category: string;
  role?: string;
  state: string;
  /** Only `-default` tokens are published. */
  published: boolean;
  /** Where the value comes from, for the review screen. */
  source: string;
  /** Primitive in light; null until the designer chooses one. */
  light: string | null;
  /** Primitive in dark; null until the designer chooses one. */
  dark: string | null;
  /** The designer must choose the dark value: the part used a primitive or a raw value. */
  needsDark: boolean;
  /** The designer must choose the light value: a raw colour that matches no primitive. */
  needsLight: boolean;
  /** The dark value was read from the dark copy, so a primitive that is the same in both is worth a check. */
  fromDarkCopy: boolean;
}

export interface LayerChange {
  layer: ScannedLayer;
  /** The draft token the layer is bound to after the scan. */
  token: string;
  /** True when the state looks the same as the default, so the layer uses the `-default` token. */
  reused: boolean;
}

export type ScanStatus =
  /** Every part uses a semantic token: nothing to do. */
  | "fine"
  /** Every part already uses this component's own tokens. */
  | "own-tokens"
  /** Component tokens are drafted. */
  | "draft"
  /** The scan cannot go on; see the issues. */
  | "blocked";

export interface ScanResult {
  status: ScanStatus;
  /** Component slug, for example `control`. */
  component: string;
  /** The name as typed in Figma, for example `Control`. */
  title: string;
  variants: number;
  /** The dark copy's name, when one was selected. */
  darkName?: string;
  layers: ScannedLayer[];
  /** Coloured layers with a name the scan does not know. They are not changed. */
  unknown: ScannedLayer[];
  tokens: DraftToken[];
  changes: LayerChange[];
  issues: Issue[];
}

const CATEGORIES: readonly string[] = COMPONENT_CATEGORIES;
/** The order of the review screen, as in the handoff: Surface, Line, Content, then Icon. */
const CATEGORY_ORDER = ["surface", "line", "content", "icon"];
const TRANSPARENT_ALPHA = 0.001;

const issue = (severity: Issue["severity"], code: string, message: string, token?: string): Issue => ({ severity, code, message, token });

export function rgbaToHex(c: Rgba): string {
  const h = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${h(c.r)}${h(c.g)}${h(c.b)}${c.a < 1 ? h(c.a) : ""}`;
}

const sameColour = (a: Rgba, b: Rgba) => {
  const close = (x: number, y: number) => Math.abs(x - y) < 0.002;
  // Every fully transparent colour looks the same.
  if (a.a < TRANSPARENT_ALPHA && b.a < TRANSPARENT_ALPHA) return true;
  return close(a.r, b.r) && close(a.g, b.g) && close(a.b, b.b) && close(a.a, b.a);
};

const isTransparent = (c: Rgba) => c.a < TRANSPARENT_ALPHA;

/** The category a layer name gives: `surface`, `line`, `content` or `icon`; null for any other name. */
export function categoryOfLayer(name: string): string | null {
  const n = name.trim().toLowerCase();
  return CATEGORIES.includes(n) ? n : null;
}

/** States in a steady order: default first, then the suggested states, then any others. */
function stateRank(s: string): number {
  const i = (SUGGESTED_STATES as readonly string[]).indexOf(s);
  return i === -1 ? SUGGESTED_STATES.length : i;
}

const title = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Follow a variable to a colour in 1 mode. A variable with 1 mode (a
 * primitive) has the same value in every mode. The primitive behind the
 * value is the first primitive met on the way.
 */
function resolveVariable(byId: Map<string, ScanVariable>, id: string, mode: Mode, seen: string[] = []): Resolved | null {
  const v = byId.get(id);
  if (!v || seen.includes(id)) return null;
  const keys = Object.keys(v.values);
  const value = v.values[mode] ?? (keys.length === 1 ? v.values[keys[0]] : v.values.light ?? v.values[keys[0]]);
  if (!value) return null;
  if ("color" in value) return { primitive: v.layer === "primitive" ? v.token : null, color: value.color };
  const next = resolveVariable(byId, value.alias, mode, [...seen, id]);
  if (!next) return null;
  return v.layer === "primitive" ? { primitive: v.token, color: next.color } : next;
}

/** A primitive with exactly this colour, for a raw value. Transparent matches `transparent` first. */
function matchPrimitive(vars: ScanVariable[], byId: Map<string, ScanVariable>, color: Rgba): string | null {
  const prims = localFirst(vars).filter((v) => v.layer === "primitive");
  if (isTransparent(color)) {
    const t = prims.find((v) => v.token === "transparent");
    if (t) return t.token;
  }
  for (const p of prims) {
    const r = resolveVariable(byId, p.id, "value");
    if (r && sameColour(r.color, color)) return p.token;
  }
  return null;
}

function sourceOf(binding: Binding, component: string, vars: ScanVariable[], byId: Map<string, ScanVariable>): Source {
  if (binding.kind === "raw") {
    return { kind: "raw", value: { primitive: matchPrimitive(vars, byId, binding.color), color: binding.color } };
  }
  const v = byId.get(binding.id);
  const light = resolveVariable(byId, binding.id, "light");
  const dark = resolveVariable(byId, binding.id, "dark");
  if (!v || !light || !dark) return { kind: "missing", id: binding.id };
  if (v.layer === "primitive") return { kind: "primitive", token: v.token, value: light };
  if (v.layer === "component") return { kind: "component", token: v.token, own: v.token.startsWith(`${component}-`), light, dark };
  return { kind: "semantic", token: v.token, light, dark };
}

/** The colour a source shows in a mode, for the scan screen. */
export function colourIn(source: Source, mode: "light" | "dark"): Rgba | null {
  switch (source.kind) {
    case "semantic":
    case "component":
      return source[mode].color;
    case "primitive":
    case "raw":
      return source.value.color;
    default:
      return null;
  }
}

/** A short label for a binding: the token name, or the raw hex value. */
export function sourceLabel(source: Source): string {
  switch (source.kind) {
    case "semantic":
    case "component":
    case "primitive":
      return source.token;
    case "raw":
      return rgbaToHex(source.value.color);
    default:
      return "a variable the plugin cannot read";
  }
}

/** What a part will look like, per mode, as primitive names (or hex values when there is no primitive). */
interface Look {
  light: string | null;
  dark: string | null;
  needsDark: boolean;
  needsLight: boolean;
  source: string;
}

function lookOf(source: Source): Look | null {
  const key = (r: Resolved) => r.primitive;
  switch (source.kind) {
    case "semantic":
      return { light: key(source.light), dark: key(source.dark), needsDark: false, needsLight: false, source: `From ${source.token}` };
    case "component":
      return { light: key(source.light), dark: key(source.dark), needsDark: false, needsLight: false, source: source.own ? `Kept from ${source.token}` : `From ${source.token}, a token of a different component` };
    case "primitive": {
      // A primitive has no modes. Transparent is the same in every theme; any other primitive needs a dark decision.
      const t = isTransparent(source.value.color);
      return { light: source.token, dark: t ? source.token : null, needsDark: !t, needsLight: false, source: t ? `${source.token} in both themes` : source.token };
    }
    case "raw": {
      const p = source.value.primitive;
      const t = isTransparent(source.value.color);
      const hex = rgbaToHex(source.value.color);
      return {
        light: p,
        dark: t && p ? p : null,
        needsDark: !(t && p),
        needsLight: !p,
        source: p ? `Raw value ${hex}, the same as ${p}` : `Raw value ${hex}, no primitive has this colour`,
      };
    }
    default:
      return null;
  }
}

/** The primitive (or hex value) a source shows in dark: its dark mode, or the value of a primitive or raw colour. */
function darkKey(source: Source): { primitive: string | null; hex: string } | null {
  switch (source.kind) {
    case "semantic":
    case "component":
      return { primitive: source.dark.primitive, hex: rgbaToHex(source.dark.color) };
    case "primitive":
      return { primitive: source.token, hex: rgbaToHex(source.value.color) };
    case "raw":
      return { primitive: source.value.primitive, hex: rgbaToHex(source.value.color) };
    default:
      return null;
  }
}

/**
 * True when the dark copy binds the same semantic or component token as the
 * light side: that token already has its own dark value, so the copy adds
 * nothing. A primitive has no modes, so the copy's primitive is always the
 * dark answer, even when it is the same as the light one.
 */
const sameBinding = (a: Source, b: Source | undefined) =>
  !!b && (a.kind === "semantic" || a.kind === "component") && a.kind === b.kind && "token" in b && a.token === b.token;

/** What a part will look like, with the dark value taken from the dark copy when there is one. */
function lookWithDark(layer: ScannedLayer): Look | null {
  const look = lookOf(layer.source);
  if (!look || !layer.darkSource || sameBinding(layer.source, layer.darkSource)) return look;
  const d = darkKey(layer.darkSource);
  if (!d) return { ...look, dark: null, needsDark: true };
  // The dark copy agrees with what the light side already gives (for example transparent): nothing to add.
  if (!look.needsDark && look.dark && look.dark === d.primitive) return look;
  const label = layer.darkSource.kind === "raw" ? `raw value ${d.hex}` : sourceLabel(layer.darkSource);
  return {
    ...look,
    dark: d.primitive,
    needsDark: !d.primitive,
    source: `${look.source}; dark from the dark copy (${label}${d.primitive || layer.darkSource.kind !== "raw" ? "" : ", no primitive has this colour"})`,
  };
}

/**
 * The value a part has, for comparing states. A part that needs a dark
 * decision compares on what it shows today, so 2 states bound to the same
 * primitive count as the same.
 */
function signature(layer: ScannedLayer): string {
  const source = layer.source;
  if (layer.darkSource && !sameBinding(source, layer.darkSource)) {
    const light = signature({ ...layer, darkSource: undefined }).split("|")[0];
    const d = darkKey(layer.darkSource);
    return `${light}|${d ? (d.primitive ?? d.hex) : "missing"}`;
  }
  switch (source.kind) {
    case "semantic":
    case "component":
      return `${source.light.primitive ?? rgbaToHex(source.light.color)}|${source.dark.primitive ?? rgbaToHex(source.dark.color)}`;
    case "primitive":
      return isTransparent(source.value.color) ? "transparent|transparent" : `${source.token}|${source.token}`;
    case "raw": {
      if (isTransparent(source.value.color)) return "transparent|transparent";
      const k = source.value.primitive ?? rgbaToHex(source.value.color);
      return `${k}|${k}`;
    }
    default:
      return "missing";
  }
}

/** Scan a component set and draft its tokens when it needs them. */
export function scanComponent(input: ScanInput, group = DEFAULT_FIGMA_GROUP): ScanResult {
  const component = normaliseComponentName(input.componentName).slug;
  const byId = new Map(input.variables.map((v) => [v.id, v]));
  const issues: Issue[] = [...input.issues];

  // Focus has no tokens: focus uses the system default, so focus variants are not read.
  const forbidden = new Set<string>(FORBIDDEN_STATES);
  for (const v of input.variants.filter((x) => forbidden.has(x.state))) {
    issues.push(issue("warning", "scan.focus", `The variant ${v.name} is not read. There are no focus tokens, because focus uses the system default.`));
  }
  // A state or role that the naming rules do not know is allowed, but flagged so the designer can check it.
  const knownStates = new Set<string>(SUGGESTED_STATES);
  const knownRoles = new Set<string>(SUGGESTED_ROLES);
  for (const state of new Set(input.variants.map((v) => v.state))) {
    if (state && !knownStates.has(state) && !forbidden.has(state)) {
      issues.push(issue("warning", "scan.new-state", `State=${title(state)} is not a state in the naming rules. It becomes a new state, for example ${component || "control"}-surface-${state}. Make sure that this is correct, or rename the option in Figma.`));
    }
  }
  for (const role of new Set(input.variants.map((v) => v.role).filter((r): r is string => !!r))) {
    if (!knownRoles.has(role)) {
      issues.push(issue("warning", "scan.new-role", `The role ${role} is not a role in the naming rules. It is used as a new role. Make sure that this is correct, or rename the option in Figma.`));
    }
  }

  const all: ScannedLayer[] = input.paints
    .filter((paint) => !forbidden.has(paint.state))
    .map((paint) => {
      const source = sourceOf(paint.binding, component, input.variables, byId);
      const darkSource = paint.dark ? sourceOf(paint.dark.binding, component, input.variables, byId) : undefined;
      const noMatch = paint.dark === null;
      // Transparent looks the same in every theme, so it is not flagged. A dark copy gives the dark value.
      const fixed = !darkSource && (source.kind === "primitive" || source.kind === "raw") && !isTransparent(source.value.color);
      return { paint, category: paint.category ?? categoryOfLayer(paint.layerName), source, darkSource, noMatch, sameInBoth: fixed };
    });
  const layers = all.filter((l) => l.category);
  const unknown = all.filter((l) => !l.category);

  const result = (status: ScanStatus, tokens: DraftToken[] = [], changes: LayerChange[] = []): ScanResult => ({
    status,
    component,
    title: input.componentName,
    variants: input.variants.length,
    darkName: input.darkName,
    layers,
    unknown,
    tokens,
    changes,
    issues,
  });

  if (!component) issues.push(issue("error", "scan.name", "The component set has no name. Give it a name in Figma, for example Control."));
  for (const l of unknown) {
    issues.push(
      issue(
        "warning",
        "scan.unknown",
        `The layer "${l.paint.layerName}" in ${l.paint.variant} has a colour, but its name is not surface, line, content or icon. The scan does not change it. Rename it to 1 of these names to include it.`,
      ),
    );
  }
  for (const l of layers.filter((x) => x.noMatch)) {
    issues.push(
      issue(
        "warning",
        "scan.no-match",
        `The ${l.paint.layerName} ${l.paint.paint === "fills" ? "fill" : "stroke"} in ${l.paint.variant} has no matching layer in ${input.darkName ?? "the dark copy"}. Make the dark copy a duplicate with the same layers, or choose the dark value in Accept names.`,
      ),
    );
  }
  for (const l of all.filter((x) => x.source.kind === "missing" || x.darkSource?.kind === "missing")) {
    issues.push(issue("error", "scan.missing", `The ${l.paint.layerName} layer in ${l.paint.variant} uses a variable that the plugin cannot read. Bind it to a variable in this file.`));
  }
  if (!layers.length && !issues.some((i) => i.severity === "error")) {
    issues.push(issue("error", "scan.empty", "No layer is called surface, line, content or icon. Rename the coloured layers, then scan again."));
  }
  if (issues.some((i) => i.severity === "error")) return result("blocked");

  // With a dark copy, a part only counts as unchanged when the dark copy binds the same token.
  const darkAgrees = (l: ScannedLayer) => !l.darkSource || sameBinding(l.source, l.darkSource);
  if (layers.every((l) => l.source.kind === "semantic" && darkAgrees(l))) return result("fine");
  if (layers.every((l) => l.source.kind === "component" && l.source.own && darkAgrees(l))) return result("own-tokens");

  // Group parts by category, role and state.
  const groupKey = (category: string, role: string | undefined) => [category, role].filter(Boolean).join("|");
  const parts = new Map<string, Map<string, ScannedLayer[]>>();
  for (const l of layers) {
    const g = groupKey(l.category!, l.paint.role);
    const byState = parts.get(g) ?? new Map<string, ScannedLayer[]>();
    byState.set(l.paint.state, [...(byState.get(l.paint.state) ?? []), l]);
    parts.set(g, byState);
  }

  const tokens: DraftToken[] = [];
  const changes: LayerChange[] = [];
  const ordered = [...parts.entries()].sort(([a], [b]) => {
    const [ca, ra = ""] = a.split("|");
    const [cb, rb = ""] = b.split("|");
    return ra.localeCompare(rb) || CATEGORY_ORDER.indexOf(ca) - CATEGORY_ORDER.indexOf(cb);
  });
  for (const [g, byState] of ordered) {
    const [category, role] = g.split("|") as [string, string | undefined];
    const label = [category, role].filter(Boolean).join(" ");
    // Every layer of a part in 1 state must look the same, as they will share 1 token.
    let conflict = false;
    for (const ls of byState.values()) {
      if (new Set(ls.map((l) => signature(l))).size > 1) {
        conflict = true;
        issues.push(
          issue(
            "error",
            "scan.conflict",
            `In ${ls[0].paint.variant}, the ${category} layers have different colours (${ls.map((l) => sourceLabel(l.source)).join(", ")}). Layers with the same name in 1 state share 1 token. Give them the same colour.`,
          ),
        );
      }
    }
    if (conflict) continue;
    const def = byState.get("default");
    if (!def) {
      const name = buildComponentTokenName({ component, category, role, state: "default" });
      issues.push(issue("error", "scan.default", `The default variant has no ${label} layer, so ${name} has no value. Add a ${category} layer to the default variant.`, name));
      continue;
    }
    const states = [...byState.keys()].sort((a, b) => stateRank(a) - stateRank(b) || a.localeCompare(b));
    const defSig = signature(def[0]);
    for (const state of states) {
      const ls = byState.get(state)!;
      const reuse = state !== "default" && signature(ls[0]) === defSig;
      const name = buildComponentTokenName({ component, category, role, state: reuse ? "default" : state });
      if (!reuse) {
        const look = lookWithDark(ls[0])!;
        const fromDarkCopy = !!ls[0].darkSource && !sameBinding(ls[0].source, ls[0].darkSource);
        const draft: Token = { name, layer: "component", kind: "color", component, values: {}, status: "active" };
        const path = figmaPath(draft, group)!;
        tokens.push({
          name,
          figmaName: path.split("/").pop()!,
          figmaPath: path,
          component,
          category,
          role,
          state,
          published: state === "default",
          source: look.source,
          light: look.light,
          dark: look.dark,
          needsDark: look.needsDark,
          needsLight: look.needsLight,
          fromDarkCopy,
        });
      }
      for (const l of ls) changes.push({ layer: l, token: name, reused: reuse });
    }
  }
  if (issues.some((i) => i.severity === "error")) return result("blocked", tokens, changes);
  return result("draft", tokens, changes);
}

/** The designer's choice of primitives, by draft token name. */
export type Choices = Record<string, { light?: string; dark?: string }>;

/** Drafts with the designer's choices applied. */
export function withChoices(tokens: DraftToken[], choices: Choices = {}): DraftToken[] {
  return tokens.map((t) => ({ ...t, light: choices[t.name]?.light ?? t.light, dark: choices[t.name]?.dark ?? t.dark }));
}

/** Drafts as tool tokens, pointing to primitives. A value not yet chosen is left out, so the checks report it. */
export function draftsToTokens(tokens: DraftToken[]): Token[] {
  return tokens.map((d) => {
    const values: Token["values"] = {};
    if (d.light) values.light = { ref: d.light };
    if (d.dark) values.dark = { ref: d.dark };
    return { name: d.name, layer: "component", kind: "color", component: d.component, values, status: "active" };
  });
}

/** The variables in the file as a token set, so the tool's checks can run on them. */
export function variablesToTokenSet(vars: ScanVariable[]): TokenSet {
  const byId = new Map(vars.map((v) => [v.id, v]));
  const tokens: Token[] = [];
  const seen = new Set<string>();
  for (const v of localFirst(vars)) {
    if (!v.layer || seen.has(v.token)) continue;
    seen.add(v.token);
    const modes = v.layer === "primitive" ? ["value"] : ["light", "dark"];
    const values: Token["values"] = {};
    for (const m of modes) {
      const keys = Object.keys(v.values);
      const raw = v.values[m] ?? (keys.length === 1 ? v.values[keys[0]] : undefined);
      if (!raw) continue;
      if ("color" in raw) values[m] = rgbaToHex(raw.color);
      else {
        const target = byId.get(raw.alias);
        if (target) values[m] = { ref: target.token };
      }
    }
    tokens.push({ name: v.token, layer: v.layer, kind: "color", component: v.layer === "component" ? v.token.split("-")[0] : undefined, values, status: "active" });
  }
  return { tokens };
}

/**
 * The checks from the token namer (F2), run on the drafts with the
 * designer's choices: naming rules, duplicates, missing modes, the same
 * primitive in both modes and the role warning. Tokens of this component
 * already in the file are replaced, not duplicated.
 */
export function checkDrafts(result: ScanResult, vars: ScanVariable[], choices: Choices = {}): { ok: boolean; issues: Issue[] } {
  const context = variablesToTokenSet(vars);
  const drafts = withChoices(result.tokens, choices);
  const own = context.tokens.filter((t) => t.layer === "component" && t.component === result.component).map((t) => t.name);
  const { issues } = checkBeforeSave(context, draftsToTokens(drafts), own);
  // "The same in light and dark" is only worth a check where the designer chose the value (scan.same-primitive below).
  // A token copied from a semantic token, or transparent, is the same in both themes on purpose.
  const out = issues.filter((i) => i.code !== "mode.same");
  for (const d of drafts) {
    const p = d.light && vars.find((v) => v.token === d.light);
    const q = d.dark && vars.find((v) => v.token === d.dark);
    if ((d.light && !p) || (d.dark && !q)) out.push(issue("error", "scan.primitive", `${d.name} uses a primitive that is not in this file. Select a different primitive.`, d.name));
    if ((p && p.layer !== "primitive") || (q && q.layer !== "primitive")) {
      out.push(issue("error", "scan.not-primitive", `${d.name} must point to a primitive. Select a primitive, for example neutral-200.`, d.name));
    }
    if ((d.needsDark || d.fromDarkCopy) && d.light && d.light === d.dark && d.light !== "transparent") {
      const where = d.fromDarkCopy && !d.needsDark ? " The dark copy has the same colour as the light component." : "";
      out.push(issue("warning", "scan.same-primitive", `${d.name} uses ${d.light} in light and dark.${where} This is correct for some tokens, for example a brand colour. Make sure that this is correct.`, d.name));
    }
  }
  return { ok: !out.some((i) => i.severity === "error"), issues: out };
}

export interface ScanSummary {
  /** Variables to create in Figma. */
  create: number;
  /** Variables of this component already in the file, to update. */
  update: number;
  /** Variables hidden from publishing. */
  hidden: number;
  /** Layers (paints) to bind in the component set. */
  layers: number;
  variants: number;
  /** Paints in the dark copy that are bound too. */
  darkLayers: number;
  /** Tokens to add to the tool. */
  tokens: number;
  /** Save and publish, for example "This creates 8 variables in Colour tokens / Interactive / Control and hides 5 from publishing." */
  sentence: string;
  /** Apply to layers, for example "This binds 12 layers across 4 variants to the new variables." */
  applySentence: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]);

/** What Save and publish, and then Apply to layers, will do. */
export function summarise(result: ScanResult, vars: ScanVariable[], collectionName = "Colour tokens", group = DEFAULT_FIGMA_GROUP): ScanSummary {
  const existing = new Set(vars.filter((v) => v.collection === "colour-tokens").map((v) => v.name));
  const update = result.tokens.filter((t) => existing.has(t.figmaPath)).length;
  const create = result.tokens.length - update;
  const hidden = result.tokens.filter((t) => !t.published).length;
  const changed = result.changes;
  const layers = changed.length;
  const darkLayers = changed.filter((c) => c.layer.paint.dark).length;
  const variants = new Set(changed.map((c) => c.layer.paint.variantId)).size;
  const where = `${collectionName} / ${group} / ${title(result.component)}`;
  const parts = [
    create ? `creates ${plural(create, "variable")} in ${where}` : "",
    update ? `updates ${plural(update, "variable")} in ${where}` : "",
    hidden ? `hides ${hidden} from publishing` : "",
  ].filter(Boolean);
  const sentence = `This ${list(parts)}.`;
  const dark = darkLayers ? ` It also binds ${plural(darkLayers, "layer")} in ${result.darkName ?? "the dark copy"} and sets it to dark mode, so it looks the same as before.` : "";
  const applySentence = `This binds ${plural(layers, "layer")} across ${plural(variants, "variant")} to the new variables.${dark}`;
  return { create, update, hidden, layers, variants, darkLayers, tokens: result.tokens.length, sentence, applySentence };
}
