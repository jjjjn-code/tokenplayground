/**
 * Component scan (F12): read a finished component set and, when any part
 * uses a primitive or a raw value, draft a complete set of component tokens
 * for the whole component. Pure code, shared by the Figma plugin and the
 * tests; the plugin reads the file into a `ScanInput` (see `scan-figma.ts`).
 *
 * The rules are in the PRD, section "Component scan (F12)".
 */
import { buildComponentTokenName, figmaPath, normaliseComponentName } from "../tokens/naming";
import { COMPONENT_CATEGORIES, DEFAULT_FIGMA_GROUP, SUGGESTED_STATES } from "../tokens/rules";
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
}

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
}

export interface ScanInput {
  /** The component set's name in Figma, for example `Control`. */
  componentName: string;
  variants: { id: string; name: string; state: string; role?: string }[];
  paints: ScannedPaint[];
  variables: ScanVariable[];
  /** Problems found while reading, for example no `State` property. */
  issues: Issue[];
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
  /** Shows the same in light and dark because it uses a primitive or a raw value. */
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
  const prims = vars.filter((v) => v.layer === "primitive");
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

/**
 * The value a part has, for comparing states. A part that needs a dark
 * decision compares on what it shows today, so 2 states bound to the same
 * primitive count as the same.
 */
function signature(source: Source): string {
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

  const all: ScannedLayer[] = input.paints.map((paint) => {
    const source = sourceOf(paint.binding, component, input.variables, byId);
    return { paint, category: categoryOfLayer(paint.layerName), source, sameInBoth: source.kind === "primitive" || source.kind === "raw" };
  });
  const layers = all.filter((l) => l.category);
  const unknown = all.filter((l) => !l.category);

  const result = (status: ScanStatus, tokens: DraftToken[] = [], changes: LayerChange[] = []): ScanResult => ({
    status,
    component,
    title: input.componentName,
    variants: input.variants.length,
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
  for (const l of all.filter((x) => x.source.kind === "missing")) {
    issues.push(issue("error", "scan.missing", `The ${l.paint.layerName} layer in ${l.paint.variant} uses a variable that the plugin cannot read. Bind it to a variable in this file.`));
  }
  if (!layers.length && !issues.some((i) => i.severity === "error")) {
    issues.push(issue("error", "scan.empty", "No layer is called surface, line, content or icon. Rename the coloured layers, then scan again."));
  }
  if (issues.some((i) => i.severity === "error")) return result("blocked");

  if (layers.every((l) => l.source.kind === "semantic")) return result("fine");
  if (layers.every((l) => l.source.kind === "component" && l.source.own)) return result("own-tokens");

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
      if (new Set(ls.map((l) => signature(l.source))).size > 1) {
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
    const defSig = signature(def[0].source);
    for (const state of states) {
      const ls = byState.get(state)!;
      const reuse = state !== "default" && signature(ls[0].source) === defSig;
      const name = buildComponentTokenName({ component, category, role, state: reuse ? "default" : state });
      if (!reuse) {
        const look = lookOf(ls[0].source)!;
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
  for (const v of vars) {
    if (!v.layer) continue;
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
  const out = [...issues];
  for (const d of drafts) {
    const p = d.light && vars.find((v) => v.token === d.light);
    const q = d.dark && vars.find((v) => v.token === d.dark);
    if ((d.light && !p) || (d.dark && !q)) out.push(issue("error", "scan.primitive", `${d.name} uses a primitive that is not in this file. Select a different primitive.`, d.name));
    if ((p && p.layer !== "primitive") || (q && q.layer !== "primitive")) {
      out.push(issue("error", "scan.not-primitive", `${d.name} must point to a primitive. Select a primitive, for example neutral-200.`, d.name));
    }
    if (d.needsDark && d.light && d.light === d.dark) {
      out.push(issue("warning", "scan.same-primitive", `${d.name} uses ${d.light} in light and dark. This is correct for some tokens, for example a brand colour. Make sure that this is correct.`, d.name));
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
  /** Layers (paints) to rebind. */
  layers: number;
  variants: number;
  /** Tokens to add to the tool. */
  tokens: number;
  /** For example "This creates 8 variables in Colour tokens / Interactive / Control, ...". */
  sentence: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What Create and sync will do, for the Confirm screen. */
export function summarise(result: ScanResult, vars: ScanVariable[], collectionName = "Colour tokens", group = DEFAULT_FIGMA_GROUP): ScanSummary {
  const existing = new Set(vars.filter((v) => v.collection === "colour-tokens").map((v) => v.name));
  const update = result.tokens.filter((t) => existing.has(t.figmaPath)).length;
  const create = result.tokens.length - update;
  const hidden = result.tokens.filter((t) => !t.published).length;
  const changed = result.changes;
  const layers = changed.length;
  const variants = new Set(changed.map((c) => c.layer.paint.variantId)).size;
  const where = `${collectionName} / ${group} / ${title(result.component)}`;
  const parts = [
    create ? `creates ${plural(create, "variable")} in ${where}` : "",
    update ? `updates ${plural(update, "variable")} in ${where}` : "",
    hidden ? `hides ${hidden} from publishing` : "",
    `changes ${plural(layers, "layer")} across ${plural(variants, "variant")}`,
    `adds ${plural(result.tokens.length, "token")} to Token Library`,
  ].filter(Boolean);
  const sentence = `This ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}` : parts[0]}.`;
  return { create, update, hidden, layers, variants, tokens: result.tokens.length, sentence };
}
