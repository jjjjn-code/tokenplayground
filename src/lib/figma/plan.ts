/**
 * Figma sync (F9): turn tokens into Figma variable specs and compare them
 * with the variables already in a Figma file. Pure code, shared by the
 * Figma plugin and the tests; it never touches the Figma API itself.
 */
import { cssVariableName, figmaPath, isPublishedInFigma, parseComponentTokenName } from "../tokens/naming";
import { columnSetOf, modesOf, valueInMode } from "../tokens/references";
import { COLUMN_SETS, DEFAULT_FIGMA_GROUP, type ColumnSetId } from "../tokens/rules";
import { isComposite, isReference, type Kind, type Mode, type SimpleValue, type Token, type TokenSet } from "../tokens/types";

/**
 * The Figma collections the tool writes to, as in the UAL UI Kit file. Each
 * collection has 1 column set; its modes are the Figma modes.
 */
export const COLLECTIONS = {
  "colour-primitives": { name: "Colour primitives", columns: "value" },
  "type-primitives": { name: "Type primitives", columns: "value" },
  "space-primitives": { name: "Space primitives", columns: "value" },
  "other-primitives": { name: "Other primitives", columns: "value" },
  // The Motion collection in Figma has 2 modes; primitives write to its first mode only.
  motion: { name: "Motion", columns: "value" },
  "motion-tokens": { name: "Motion tokens", columns: "motion" },
  "colour-tokens": { name: "Colour tokens", columns: "theme" },
  "fluid-tokens": { name: "Fluid tokens", columns: "fluid" },
  "other-tokens": { name: "Other tokens", columns: "value" },
} as const satisfies Record<string, { name: string; columns: ColumnSetId }>;

export type CollectionKey = keyof typeof COLLECTIONS;
export type FigmaType = "COLOR" | "FLOAT" | "STRING";

export type FigmaValue =
  | { kind: "color"; r: number; g: number; b: number; a: number }
  | { kind: "float"; value: number }
  | { kind: "string"; value: string }
  | { kind: "alias"; token: string };

export interface VariableSpec {
  /** Token name; stored on the Figma variable so a later sync finds it again. */
  token: string;
  collection: CollectionKey;
  /** Figma variable name. Slashes make groups. */
  name: string;
  type: FigmaType;
  /** Values by mode key (`value`, `light`, `dark`, `min`, `max`, `default`, `reduced-motion`). */
  values: Record<Mode, FigmaValue>;
  hiddenFromPublishing: boolean;
  description: string;
  /** Shown to developers in Figma Dev Mode. */
  codeSyntax: string;
}

export interface SkippedToken {
  token: string;
  reason: string;
}

export interface SyncOptions {
  includeDrafts?: boolean;
  /** Top-level group for component variables. */
  group?: string;
}

/** The modes a collection has, default first. */
export const collectionModes = (key: CollectionKey) => COLUMN_SETS[COLLECTIONS[key].columns].modes;

/**
 * A Figma mode name as a mode key, so "Reduced motion", "reduced-motion" and
 * "Reduced-Motion" all match `reduced-motion`.
 */
export const modeKeyOf = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, "-");

/** The collection a token goes in. Component tokens sit in Colour tokens, under the Interactive group. */
export function collectionFor(t: Pick<Token, "layer" | "kind">): CollectionKey {
  if (t.layer === "primitive") {
    switch (t.kind) {
      case "color":
        return "colour-primitives";
      case "typography":
        return "type-primitives";
      case "spacing":
      case "sizing":
        return "space-primitives";
      case "motion":
        return "motion";
      default:
        return "other-primitives";
    }
  }
  const set = columnSetOf(t);
  if (set === "motion") return "motion-tokens";
  if (set === "theme") return "colour-tokens";
  if (set === "fluid") return "fluid-tokens";
  return "other-tokens";
}

const KIND_TITLE: Record<Kind, string> = {
  color: "Colour",
  spacing: "Spacing",
  sizing: "Sizing",
  typography: "Typography",
  radius: "Radius",
  border: "Border",
  shadow: "Shadow",
  motion: "Motion",
};

const title = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** A hex colour as Figma's 0 to 1 channels. */
export function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = (i: number) => Math.round((parseInt(h.slice(i, i + 2), 16) / 255) * 10000) / 10000;
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
}

/**
 * The Figma variable name for a token. A token keeps the name it has in
 * Figma (`figma`), so groups such as `spacing/max/3xs` stay as they are.
 * Without one: colour primitives sit at the top, semantic colours under
 * Base, component tokens under Interactive, and other tokens under their type.
 */
export function variableName(t: Token, group = DEFAULT_FIGMA_GROUP): string {
  if (t.figma) return t.figma;
  if (t.layer === "component") return figmaPath(t, group) ?? `${group}/${t.name}`;
  if (t.kind === "color") return t.layer === "primitive" ? t.name : `Base/${title(t.name.split("-")[0])}/${t.name}`;
  return `${KIND_TITLE[t.kind]}/${t.name}`;
}

function typeFor(t: Token): FigmaType | null {
  if (t.kind === "color") return "COLOR";
  if (Object.values(t.values).some((v) => isComposite(v))) return null;
  if (t.name.startsWith("font-family") || t.name.startsWith("ease")) return "STRING";
  return "FLOAT";
}

function valueFor(v: SimpleValue, type: FigmaType): FigmaValue | null {
  if (isReference(v)) return { kind: "alias", token: v.ref };
  if (type === "COLOR") {
    const c = typeof v === "string" ? hexToRgba(v) : null;
    return c ? { kind: "color", ...c } : null;
  }
  if (type === "STRING") return { kind: "string", value: String(v) };
  // Durations such as 150ms are numbers in Figma.
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? { kind: "float", value: n } : null;
}

/** Every token as a Figma variable spec, and the tokens that cannot be variables, with why. */
export function buildSpecs(set: TokenSet, opts: SyncOptions = {}): { specs: VariableSpec[]; skipped: SkippedToken[] } {
  const specs: VariableSpec[] = [];
  const skipped: SkippedToken[] = [];
  const byName = new Map(set.tokens.map((t) => [t.name, t]));
  const syncable = (name: string) => {
    const t = byName.get(name);
    return !!t && (opts.includeDrafts || t.status !== "draft");
  };

  for (const t of set.tokens) {
    if (t.status === "draft" && !opts.includeDrafts) {
      skipped.push({ token: t.name, reason: "Draft. Change its status to active, or select Include drafts." });
      continue;
    }
    const type = typeFor(t);
    if (!type) {
      skipped.push({ token: t.name, reason: `Figma variables cannot hold a ${t.kind} token with several parts. Use a Figma style for it.` });
      continue;
    }
    const collection = collectionFor(t);
    const values: Record<Mode, FigmaValue> = {};
    let bad = false;
    for (const m of modesOf(t)) {
      const v = valueFor(valueInMode(t, m.key) as SimpleValue, type);
      if (!v) bad = true;
      else values[m.key] = v;
    }
    if (bad) {
      skipped.push({ token: t.name, reason: "The value cannot become a Figma variable value." });
      continue;
    }
    const missingAlias = Object.values(values).find((v) => v.kind === "alias" && !syncable(v.token));
    if (missingAlias && missingAlias.kind === "alias") {
      skipped.push({ token: t.name, reason: `It refers to ${missingAlias.token}, which is not synced.` });
      continue;
    }
    const p = t.layer === "component" ? parseComponentTokenName(t.name) : null;
    specs.push({
      token: t.name,
      collection,
      name: variableName(t, opts.group),
      type,
      values,
      hiddenFromPublishing: !isPublishedInFigma(t) || t.status === "deprecated",
      description: [t.status === "deprecated" ? "Deprecated." : "", t.description ?? "", p && p.state !== "default" ? `State: ${p.state}.` : ""]
        .filter(Boolean)
        .join(" "),
      codeSyntax: `var(${cssVariableName(t)})`,
    });
  }
  // A token can be skipped after others already refer to it; drop those too.
  let changed = true;
  while (changed) {
    changed = false;
    const names = new Set(specs.map((s) => s.token));
    for (let i = specs.length - 1; i >= 0; i -= 1) {
      const s = specs[i];
      const bad = Object.values(s.values).find((v) => v.kind === "alias" && !names.has(v.token));
      if (bad && bad.kind === "alias") {
        skipped.push({ token: s.token, reason: `It refers to ${bad.token}, which is not synced.` });
        specs.splice(i, 1);
        changed = true;
      }
    }
  }
  return { specs, skipped };
}

/** A variable already in the Figma file, as the plugin reads it. */
export interface ExistingVariable {
  id: string;
  /** Token name stored by an earlier sync, if any. */
  token?: string;
  collection: CollectionKey | null;
  name: string;
  type: FigmaType | string;
  /** Values by mode key, read from the collection's modes. */
  values: Record<Mode, FigmaValue | undefined>;
  hiddenFromPublishing: boolean;
  description: string;
  codeSyntax?: string;
}

export interface SyncChange {
  spec: VariableSpec;
  existing: ExistingVariable;
  /** What differs, in plain words, for the preview. */
  differences: string[];
}

export interface SyncPlan {
  add: VariableSpec[];
  change: SyncChange[];
  remove: ExistingVariable[];
  unchanged: number;
  skipped: SkippedToken[];
}

const sameValue = (a?: FigmaValue, b?: FigmaValue) => {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "color" && b.kind === "color") {
    const close = (x: number, y: number) => Math.abs(x - y) < 0.002;
    return close(a.r, b.r) && close(a.g, b.g) && close(a.b, b.b) && close(a.a, b.a);
  }
  return JSON.stringify(a) === JSON.stringify(b);
};

export function describeValue(v?: FigmaValue): string {
  if (!v) return "none";
  if (v.kind === "alias") return v.token;
  if (v.kind === "color") {
    const h = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0").toUpperCase();
    return `#${h(v.r)}${h(v.g)}${h(v.b)}${v.a < 1 ? h(v.a) : ""}`;
  }
  return String(v.value);
}

/**
 * Compare the specs with the file's variables. Variables made by an earlier
 * sync are matched by their stored token name; others by collection and
 * name, so an existing hand-made variable is adopted instead of copied.
 * Only variables made by a sync are ever removed.
 */
export function planSync(specs: VariableSpec[], existing: ExistingVariable[], alreadySkipped: SkippedToken[] = []): SyncPlan {
  const skipped = [...alreadySkipped];
  const byToken = new Map(existing.filter((e) => e.token).map((e) => [e.token!, e]));
  const byName = new Map(existing.filter((e) => e.collection).map((e) => [`${e.collection}|${e.name}`, e]));
  const used = new Set<string>();
  const add: VariableSpec[] = [];
  const change: SyncChange[] = [];
  let unchanged = 0;

  for (const s of specs) {
    const e = byToken.get(s.token) ?? byName.get(`${s.collection}|${s.name}`);
    if (!e || e.collection !== s.collection) {
      add.push(s);
      continue;
    }
    used.add(e.id);
    if (e.type !== s.type) {
      // Changing the type means deleting the variable, which unbinds every layer that uses it. Leave it to a person.
      skipped.push({ token: s.token, reason: `In Figma, ${e.name} is a ${e.type} variable; the tool would make a ${s.type} variable. Change it by hand in Figma.` });
      continue;
    }
    const d: string[] = [];
    if (e.name !== s.name) d.push(`Name: ${e.name} → ${s.name}`);
    for (const m of collectionModes(s.collection)) {
      if (!sameValue(e.values[m.key], s.values[m.key])) d.push(`${m.label}: ${describeValue(e.values[m.key])} → ${describeValue(s.values[m.key])}`);
    }
    if (e.hiddenFromPublishing !== s.hiddenFromPublishing) d.push(s.hiddenFromPublishing ? "Hidden from publishing" : "Published");
    if ((e.description ?? "") !== s.description) d.push("Description");
    if ((e.codeSyntax ?? "") !== s.codeSyntax) d.push("Code syntax");
    if (!e.token) d.push("Linked to Token Library");
    if (d.length) change.push({ spec: s, existing: e, differences: d });
    else unchanged += 1;
  }
  const remove = existing.filter((e) => e.token && !used.has(e.id) && !specs.some((s) => s.token === e.token));
  return { add, change, remove, unchanged, skipped };
}
