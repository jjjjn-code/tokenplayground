/**
 * Figma sync (F9): turn tokens into Figma variable specs and compare them
 * with the variables already in a Figma file. Pure code, shared by the
 * Figma plugin and the tests; it never touches the Figma API itself.
 */
import { cssVariableName, figmaPath, isPublishedInFigma, parseComponentTokenName } from "../tokens/naming";
import { DEFAULT_FIGMA_GROUP } from "../tokens/rules";
import { isComposite, isReference, type Kind, type Mode, type SimpleValue, type Token, type TokenSet } from "../tokens/types";

export type CollectionKey = "primitives" | "semantic" | "components";
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
  light: FigmaValue;
  /** Only for semantic and component collections. */
  dark?: FigmaValue;
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

export const COLLECTION_MODES: Record<CollectionKey, string[]> = {
  primitives: ["Value"],
  semantic: ["Light", "Dark"],
  components: ["Light", "Dark"],
};

const KIND_TITLE: Record<Kind, string> = {
  color: "Colour",
  spacing: "Spacing",
  sizing: "Sizing",
  typography: "Typography",
  radius: "Radius",
  border: "Border",
  shadow: "Shadow",
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

/** The Figma variable name for a token: groups by type, category or component. */
export function variableName(t: Token, group = DEFAULT_FIGMA_GROUP): string {
  if (t.layer === "component") return figmaPath(t, group) ?? `${group}/${t.name}`;
  if (t.layer === "semantic" && t.kind === "color") return `${title(t.name.split("-")[0])}/${t.name}`;
  return `${KIND_TITLE[t.kind]}/${t.name}`;
}

function typeFor(t: Token): FigmaType | null {
  if (t.kind === "color") return "COLOR";
  const v = t.values.light;
  if (isComposite(v)) return null;
  if (t.name.startsWith("font-family")) return "STRING";
  return "FLOAT";
}

function valueFor(v: SimpleValue, type: FigmaType): FigmaValue | null {
  if (isReference(v)) return { kind: "alias", token: v.ref };
  if (type === "COLOR") {
    const c = typeof v === "string" ? hexToRgba(v) : null;
    return c ? { kind: "color", ...c } : null;
  }
  if (type === "STRING") return { kind: "string", value: String(v) };
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
    const light = valueFor(t.values.light as SimpleValue, type);
    const darkRaw = t.layer === "primitive" ? undefined : ((t.values.dark ?? t.values.light) as SimpleValue);
    const dark = darkRaw === undefined ? undefined : valueFor(darkRaw, type);
    if (!light || (darkRaw !== undefined && !dark)) {
      skipped.push({ token: t.name, reason: "The value cannot become a Figma variable value." });
      continue;
    }
    const missingAlias = [light, dark].find((v) => v?.kind === "alias" && !syncable(v.token));
    if (missingAlias && missingAlias.kind === "alias") {
      skipped.push({ token: t.name, reason: `It refers to ${missingAlias.token}, which is not synced.` });
      continue;
    }
    const p = t.layer === "component" ? parseComponentTokenName(t.name) : null;
    specs.push({
      token: t.name,
      collection: t.layer === "primitive" ? "primitives" : t.layer === "semantic" ? "semantic" : "components",
      name: variableName(t, opts.group),
      type,
      light,
      ...(dark ? { dark } : {}),
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
      const bad = [s.light, s.dark].find((v) => v?.kind === "alias" && !names.has(v.token));
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
  light?: FigmaValue;
  dark?: FigmaValue;
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
export function planSync(specs: VariableSpec[], existing: ExistingVariable[], skipped: SkippedToken[] = []): SyncPlan {
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
    const d: string[] = [];
    if (e.name !== s.name) d.push(`Name: ${e.name} → ${s.name}`);
    if (e.type !== s.type) d.push(`Type: ${e.type} → ${s.type}`);
    const lightLabel = s.collection === "primitives" ? "Value" : "Light";
    if (!sameValue(e.light, s.light)) d.push(`${lightLabel}: ${describeValue(e.light)} → ${describeValue(s.light)}`);
    if (s.dark && !sameValue(e.dark, s.dark)) d.push(`Dark: ${describeValue(e.dark)} → ${describeValue(s.dark)}`);
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

/** Values per mode name, for the plugin. */
export function modeValues(s: VariableSpec): Record<string, FigmaValue> {
  return s.collection === "primitives" ? { Value: s.light } : { Light: s.light, Dark: s.dark ?? s.light };
}

export const MODE_FOR: Record<Mode, string> = { light: "Light", dark: "Dark" };
