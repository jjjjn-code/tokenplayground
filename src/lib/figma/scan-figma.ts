/**
 * Component scan (F12), the Figma side: read a component set into a
 * `ScanInput`, and write the drafted tokens back as variables and bindings.
 * It uses only the small part of the Figma plugin API listed here; the
 * plugin passes the real `figma.variables`, the tests pass a fake.
 */
import { cssVariableName, slug } from "../tokens/naming";
import { DEFAULT_FIGMA_GROUP } from "../tokens/rules";
import type { Issue, Layer } from "../tokens/types";
import type { CollectionLike, RawValue, VariableLike } from "./apply";
import { COLLECTIONS, modeKeyOf, type CollectionKey } from "./plan";
import { localFirst, type Binding, type DraftToken, type Rgba, type ScanInput, type ScannedPaint, type ScanResult, type ScanVariable } from "./scan";

export interface PaintLike {
  type: string;
  visible?: boolean;
  color?: { r: number; g: number; b: number };
  opacity?: number;
  boundVariables?: { color?: { type?: string; id: string } };
}

export interface NodeLike {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  /** A mask is not drawn, so its colour is not read. */
  isMask?: boolean;
  children?: readonly NodeLike[];
  /** Figma gives a symbol (figma.mixed) when a text layer has several fills. */
  fills?: readonly PaintLike[] | symbol;
  strokes?: readonly PaintLike[];
  /** Only on a variant (a component inside a component set). */
  variantProperties?: Record<string, string> | null;
  /** Modes set on this layer, by collection id. */
  explicitVariableModes?: Record<string, string>;
  setExplicitVariableModeForCollection?(collection: CollectionLike, modeId: string): void;
}

export interface ComponentSetLike extends NodeLike {
  type: "COMPONENT_SET";
  children: readonly NodeLike[];
  componentPropertyDefinitions: Record<string, { type: string; variantOptions?: string[] }>;
}

export interface ScanVariablesApi {
  getLocalVariableCollectionsAsync(): Promise<CollectionLike[]>;
  getLocalVariablesAsync(): Promise<VariableLike[]>;
  getVariableByIdAsync(id: string): Promise<VariableLike | null>;
  getVariableCollectionByIdAsync(id: string): Promise<(CollectionLike & { remote?: boolean }) | null>;
  createVariable(name: string, collection: CollectionLike, type: "COLOR"): VariableLike;
  createVariableAlias(variable: VariableLike): { type: "VARIABLE_ALIAS"; id: string };
  setBoundVariableForPaint(paint: PaintLike, field: "color", variable: VariableLike): PaintLike;
}

export interface ScanOptions {
  /** Collection names in this file; defaults to the UAL UI Kit names. */
  names?: Partial<Record<CollectionKey, string>>;
  group?: string;
}

const KEY = "tokenLibrary";
const issue = (severity: Issue["severity"], code: string, message: string): Issue => ({ severity, code, message });

function collectionKey(c: CollectionLike, names: Record<CollectionKey, string>): CollectionKey | null {
  const stored = c.getPluginData?.(KEY) as CollectionKey;
  if (stored && stored in names) return stored;
  return (Object.keys(names) as CollectionKey[]).find((k) => names[k] === c.name) ?? null;
}

function namesOf(opts: ScanOptions): Record<CollectionKey, string> {
  const base = Object.fromEntries(Object.entries(COLLECTIONS).map(([k, c]) => [k, c.name])) as Record<CollectionKey, string>;
  return { ...base, ...(opts.names ?? {}) };
}

/**
 * The layer a variable belongs to. Colour primitives are primitives; in
 * Colour tokens, the component group holds component tokens and the rest
 * are semantic. In any other collection, 1 mode means a primitive.
 */
function layerOf(v: VariableLike, key: CollectionKey | null, c: CollectionLike | null, group: string): Layer | null {
  if (key === "colour-primitives") return "primitive";
  if (key === "colour-tokens") return v.name.startsWith(`${group}/`) ? "component" : "semantic";
  if (!c) return null;
  return c.modes.length === 1 ? "primitive" : "semantic";
}

/** Tool name of a variable: the name stored by a sync, or the last part of the Figma name. */
export function tokenNameOf(v: VariableLike, layer: Layer | null): string {
  const stored = v.getPluginData?.("token");
  if (stored) return stored;
  const last = v.name.split("/").pop()!.trim();
  if (layer !== "component") return last;
  // Interactive/Control/Surface/surface-hover → control-surface-hover
  const parts = v.name.split("/");
  return parts.length >= 3 ? `${slug(parts[1])}-${last}` : last;
}

function toRgba(raw: RawValue): Rgba | null {
  if (typeof raw === "object" && raw && "r" in raw) return { r: raw.r, g: raw.g, b: raw.b, a: raw.a ?? 1 };
  return null;
}

/** Read colour variables into the scan's shape: every local one, plus any bound library variable and what it points to. */
async function readVariables(api: ScanVariablesApi, boundIds: string[], opts: ScanOptions): Promise<ScanVariable[]> {
  const names = namesOf(opts);
  const group = opts.group ?? DEFAULT_FIGMA_GROUP;
  const collections = new Map<string, CollectionLike | null>((await api.getLocalVariableCollectionsAsync()).map((c) => [c.id, c]));
  const vars = new Map<string, VariableLike>((await api.getLocalVariablesAsync()).map((v) => [v.id, v]));

  // Library variables are not local: fetch them, and everything they point to.
  const queue = boundIds.filter((id) => !vars.has(id));
  while (queue.length) {
    const id = queue.shift()!;
    if (vars.has(id)) continue;
    const v = await api.getVariableByIdAsync(id);
    if (!v) continue;
    vars.set(id, v);
    for (const raw of Object.values(v.valuesByMode)) {
      if (typeof raw === "object" && raw && "type" in raw && raw.type === "VARIABLE_ALIAS" && !vars.has(raw.id)) queue.push(raw.id);
    }
  }
  for (const v of vars.values()) {
    if (!collections.has(v.variableCollectionId)) collections.set(v.variableCollectionId, await api.getVariableCollectionByIdAsync(v.variableCollectionId));
  }

  const out: ScanVariable[] = [];
  for (const v of vars.values()) {
    if (v.resolvedType !== "COLOR") continue;
    const c = collections.get(v.variableCollectionId) ?? null;
    const key = c ? collectionKey(c, names) : null;
    const layer = layerOf(v, key, c, group);
    const values: ScanVariable["values"] = {};
    for (const m of c?.modes ?? []) {
      const raw = v.valuesByMode[m.modeId];
      if (raw === undefined) continue;
      const mode = c!.modes.length === 1 ? "value" : modeKeyOf(m.name);
      if (typeof raw === "object" && raw && "type" in raw && raw.type === "VARIABLE_ALIAS") values[mode] = { alias: raw.id };
      else {
        const color = toRgba(raw);
        if (color) values[mode] = { color };
      }
    }
    out.push({ id: v.id, token: tokenNameOf(v, layer), name: v.name, collection: key, layer, values, remote: !!v.remote });
  }
  return out;
}

const isSymbol = (x: unknown): x is symbol => typeof x === "symbol";

const SHAPES = new Set(["VECTOR", "BOOLEAN_OPERATION", "STAR", "POLYGON", "LINE"]);

/**
 * The part a layer most likely is, from what it is (24 Nov 2026), so the
 * designer does not have to rename layers: a stroke is line, text and
 * icon shapes are content, any other fill is surface. The designer can
 * change it in the plugin.
 */
export function autoCategory(n: NodeLike, field: "fills" | "strokes"): string {
  if (field === "strokes" && n.type !== "TEXT" && !SHAPES.has(n.type)) return "line";
  if (n.type === "TEXT" || SHAPES.has(n.type)) return "content";
  return "surface";
}

const STOP_WORDS = /\b(light|dark|copy|mode|theme)\b/gi;

/** The component name from a component set's name, without words such as light, dark and copy. */
export function suggestComponentName(name: string): string {
  const cleaned = name.replace(STOP_WORDS, " ").replace(/[\s/_-]+/g, " ").trim();
  return cleaned || name.trim();
}

/** A guess at each variant's state, for a set without a State property: known option names first, then the usual order. */
export function guessStates(set: ComponentSetLike): Record<string, string> {
  const kids = set.children.filter((c) => c.type === "COMPONENT");
  const known = ["Default", "Hover", "Pressed", "Disabled", "Selected", "Loading", "On", "Off"];
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const k of kids) {
    const value = Object.values(k.variantProperties ?? {}).map((v) => known.find((s) => s.toLowerCase() === slug(v)));
    const hit = value.find((v) => v && !used.has(v));
    if (hit) {
      out[k.id] = hit;
      used.add(hit);
    }
  }
  for (const k of kids) {
    if (out[k.id]) continue;
    const next = known.find((s) => !used.has(s));
    if (next) {
      out[k.id] = next;
      used.add(next);
    }
  }
  return out;
}

/**
 * Write states named in the plugin into Figma: each variant becomes
 * State=[name], in the component set and in a dark copy that is also a
 * component set. Run with Apply to layers.
 */
export function writeStates(set: ComponentSetLike, dark: NodeLike | null, states: Record<string, string>): number {
  const kids = set.children.filter((c) => c.type === "COMPONENT");
  let n = 0;
  kids.forEach((k, i) => {
    const s = states[k.id];
    if (!s) return;
    const label = s.charAt(0).toUpperCase() + s.slice(1);
    const d = dark && dark.type === "COMPONENT_SET" ? darkVariantFor(dark, k, i, kids.length) : null;
    (k as { name: string }).name = `State=${label}`;
    if (d) (d as { name: string }).name = `State=${label}`;
    n += 1;
  });
  return n;
}

/**
 * Which of 2 selected layers is the dark copy. In order (agreed 24 Nov 2026):
 * the Appearance set in Figma (dark mode, then the one not in light mode);
 * "dark" in the name; the one that is not the component set. Null when the
 * plugin cannot tell; the plugin then shows both and a Swap button.
 */
export function whichIsDark(
  nodes: [NodeLike, NodeLike],
  darkModeIds: string[] = [],
  opts: { lightModeIds?: string[]; hasSet?: [boolean, boolean] } = {},
): 0 | 1 | null {
  const decide = (flags: boolean[]) => (flags[0] !== flags[1] ? (flags[0] ? 0 : 1) : undefined);
  const modes = (n: NodeLike) => Object.values(n.explicitVariableModes ?? {});
  return (
    decide(nodes.map((n) => modes(n).some((m) => darkModeIds.includes(m)))) ??
    decide(nodes.map((n) => !modes(n).some((m) => (opts.lightModeIds ?? []).includes(m)))) ??
    decide(nodes.map((n) => /\bdark\b/i.test(n.name))) ??
    (opts.hasSet ? decide(opts.hasSet.map((x) => !x)) : undefined) ??
    null
  );
}

/** The dark copy's variants: its children, leaving out text layers, which are notes. */
const darkVariantsOf = (dark: NodeLike) => (dark.children ?? []).filter((c) => c.type !== "TEXT");

/** The dark copy's variant for a light variant: the one with the same name, or else the one in the same position. */
function darkVariantFor(dark: NodeLike, light: NodeLike, index: number, lightCount: number): NodeLike | null {
  const kids = darkVariantsOf(dark);
  const byName = kids.filter((k) => k.name === light.name);
  if (byName.length === 1) return byName[0];
  return kids.length === lightCount ? (kids[index] ?? null) : null;
}

/** The matching layer in the dark copy: same position, same kind of layer. Null when the copy does not line up. */
function darkChild(d: NodeLike | null, n: NodeLike, index: number, count: number): NodeLike | null {
  if (!d) return null;
  const kids = d.children ?? [];
  if (kids.length !== count) return null;
  const k = kids[index];
  return k && k.type === n.type ? k : null;
}

/**
 * Read a component set: its variants, every solid colour on every layer,
 * and the variables they use. With a dark copy (a duplicate with only the
 * colours changed), each paint is paired with the same paint in the copy,
 * which gives its dark value.
 */
export async function readComponentSet(
  api: ScanVariablesApi,
  set: ComponentSetLike,
  opts: ScanOptions & {
    dark?: NodeLike | null;
    /** States named in the plugin, by variant id. Used when the set has no State property yet. */
    states?: Record<string, string>;
  } = {},
): Promise<ScanInput> {
  const darkRoot = opts.dark ?? null;
  const named = opts.states ?? {};
  const issues: Issue[] = [];
  const defs = Object.entries(set.componentPropertyDefinitions ?? {}).filter(([, d]) => d.type === "VARIANT");
  const stateProp = defs.find(([n]) => n.trim().toLowerCase() === "state")?.[0];
  const lightKids = set.children.filter((c) => c.type === "COMPONENT");
  const namedInPlugin = !stateProp && lightKids.length > 0 && lightKids.every((c) => named[c.id]);
  if (!stateProp && !namedInPlugin) {
    issues.push(issue("error", "scan.state", `${set.name} has no State property. Add a variant property called State, with values such as Default, Hover, Pressed and Disabled.`));
  }
  // PROVISIONAL: the role comes from the 1 other variant property with more than 1 value.
  // States named in the plugin replace the set's properties, so there is no role then.
  const roleProps = namedInPlugin ? [] : defs.filter(([n, d]) => n !== stateProp && (d.variantOptions?.length ?? 0) > 1).map(([n]) => n);
  if (roleProps.length > 1) {
    issues.push(issue("error", "scan.roles", `${set.name} has ${roleProps.length} variant properties apart from State (${roleProps.join(", ")}). The scan can read 1 property as the role. Keep 1 property apart from State.`));
  }
  const roleProp = roleProps.length === 1 ? roleProps[0] : undefined;

  const variants: ScanInput["variants"] = [];
  const paints: ScannedPaint[] = [];
  const lightVariants = set.children.filter((c) => c.type === "COMPONENT");
  if (darkRoot) {
    const darkCount = darkVariantsOf(darkRoot).length;
    if (darkCount !== lightVariants.length) {
      issues.push(issue("warning", "scan.dark-variants", `${set.name} has ${lightVariants.length} variants and ${darkRoot.name} has ${darkCount}. Make the dark copy a duplicate of the component set, with only the colours changed.`));
    }
  }
  for (const [vi, node] of lightVariants.entries()) {
    const props = node.variantProperties ?? {};
    const state = namedInPlugin ? slug(named[node.id]) : stateProp ? slug(props[stateProp] ?? "") : "";
    const role = roleProp ? slug(props[roleProp] ?? "") || undefined : undefined;
    if ((stateProp || namedInPlugin) && !state) issues.push(issue("error", "scan.state-value", `The variant ${node.name} has no State value. Give it a State value.`));
    variants.push({ id: node.id, name: node.name, state, role });

    /**
     * `category` forces a category: the variant frame's fill is surface and
     * its stroke is line; every colour inside an instance (an icon) is content.
     */
    const darkVariant = darkRoot ? darkVariantFor(darkRoot, node, vi, lightVariants.length) : null;
    const read = (n: NodeLike, d: NodeLike | null, layerName: string, category: (field: "fills" | "strokes") => string | undefined) => {
      const auto = (field: "fills" | "strokes") => autoCategory(n, field);
      if (n.isMask) return;
      for (const field of ["fills", "strokes"] as const) {
        const list = n[field];
        if (!list) continue;
        const darkList = d?.[field];
        const darkPaints = darkList && !isSymbol(darkList) ? darkList : null;
        if (isSymbol(list)) {
          issues.push(issue("warning", "scan.mixed", `The text layer "${n.name}" in ${node.name} has more than 1 colour. The scan does not read it. Give the text 1 colour.`));
          continue;
        }
        list.forEach((p, index) => {
          if (p.visible === false || p.type !== "SOLID") return;
          const bound = p.boundVariables?.color?.id;
          const dp = darkPaints && darkPaints.length === list.length ? darkPaints[index] : undefined;
          const darkPair =
            !darkRoot ? undefined : dp && dp.visible !== false && dp.type === "SOLID" && d ? { nodeId: d.id, binding: bindingOf(dp) } : null;
          paints.push({
            variantId: node.id,
            variant: node.name,
            state,
            role,
            nodeId: n.id,
            layerName,
            paint: field,
            index,
            binding: bound ? { kind: "variable", id: bound } : { kind: "raw", color: { ...p.color!, a: p.opacity ?? 1 } },
            dark: darkPair,
            category: category(field),
            autoCategory: auto(field),
          });
        });
      }
    };
    const walk = (n: NodeLike, d: NodeLike | null, inInstance: string | null) => {
      if (n.visible === false) return;
      read(n, d, inInstance ? `${n.name} in ${inInstance}` : n.name, () => (inInstance ? "content" : undefined));
      const inside = inInstance ?? (n.type === "INSTANCE" ? n.name : null);
      const kids = n.children ?? [];
      kids.forEach((c, i) => walk(c, darkChild(d, c, i, kids.length), inside));
    };
    read(node, darkVariant, "variant frame", (field) => (field === "fills" ? "surface" : "line"));
    const top = node.children ?? [];
    top.forEach((c, i) => walk(c, darkChild(darkVariant, c, i, top.length), null));
  }
  if ((stateProp || namedInPlugin) && !variants.some((v) => v.state === "default")) {
    issues.push(issue("error", "scan.no-default", `${set.name} has no variant with State=Default. Add a default variant.`));
  }
  const seen = new Map<string, number>();
  for (const v of variants) if (v.state) seen.set(`${v.role ?? ""}|${v.state}`, (seen.get(`${v.role ?? ""}|${v.state}`) ?? 0) + 1);
  for (const [k, count] of seen) {
    if (count > 1) issues.push(issue("error", "scan.same-state", `${count} variants have the state ${k.split("|")[1]}${k.split("|")[0] ? ` for the role ${k.split("|")[0]}` : ""}. Give each variant its own state.`));
  }
  const names = namesOf(opts);
  const local = await api.getLocalVariableCollectionsAsync();
  if (!local.some((c) => collectionKey(c, names) === "colour-tokens")) {
    issues.push(
      issue(
        "error",
        "scan.library",
        `${names["colour-tokens"]} is not a collection of this file. It comes from a library, and a plugin cannot add variables to a library from a different file. Run the scan in the file that has ${names["colour-tokens"]}, for example the UAL UI Kit or a copy of it.`,
      ),
    );
  }
  const boundIds = paints.flatMap((p) => [p.binding, p.dark?.binding].flatMap((b) => (b?.kind === "variable" ? [b.id] : [])));
  const variables = await readVariables(api, boundIds, opts);
  return { componentName: set.name, variants, paints, variables, issues, darkName: darkRoot?.name };
}

function bindingOf(p: PaintLike): Binding {
  const bound = p.boundVariables?.color?.id;
  return bound ? { kind: "variable", id: bound } : { kind: "raw", color: { ...p.color!, a: p.opacity ?? 1 } };
}

export interface PublishResult {
  created: string[];
  updated: string[];
}

export interface BindResult {
  /** Paints in the component set bound to a new variable. */
  layers: number;
  /** Paints in the dark copy bound to a new variable. */
  darkLayers: number;
}

export type ApplyScanResult = PublishResult & BindResult;

export type ScanStep = "variables" | "layers";

type Progress = { onStep?: (step: ScanStep, done: number, total: number) => void };

function findNode(root: NodeLike, id: string): NodeLike | null {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
}

async function colourTokens(api: ScanVariablesApi, opts: ScanOptions) {
  const names = namesOf(opts);
  const collection = (await api.getLocalVariableCollectionsAsync()).find((c) => collectionKey(c, names) === "colour-tokens");
  if (!collection) throw new Error(`This file has no ${names["colour-tokens"]} collection. Add it, or run Sync from tool first.`);
  const light = collection.modes.find((m) => modeKeyOf(m.name) === "light");
  const dark = collection.modes.find((m) => modeKeyOf(m.name) === "dark");
  if (!light || !dark) throw new Error(`The ${collection.name} collection must have a light and a dark mode.`);
  return { collection, light, dark };
}

/**
 * Save and publish (step 5): create (or update) the drafted variables in
 * Colour tokens. No layer changes. `drafts` are the result's tokens with
 * the designer's choices applied; each must have a light and a dark value.
 */
export async function publishScan(api: ScanVariablesApi, drafts: DraftToken[], vars: ScanVariable[], opts: ScanOptions & Progress = {}): Promise<PublishResult> {
  const { collection, light, dark } = await colourTokens(api, opts);
  const missing = drafts.filter((d) => !d.light || !d.dark);
  if (missing.length) throw new Error(`Choose light and dark values for ${missing.map((d) => d.name).join(", ")}.`);

  const primitive = async (token: string) => {
    // This file's primitive, not a library copy with the same name.
    const sv = localFirst(vars).find((v) => v.token === token && v.layer === "primitive");
    const v = sv ? await api.getVariableByIdAsync(sv.id) : null;
    if (!v) throw new Error(`The primitive ${token} is not in this file.`);
    return v;
  };

  const local = (await api.getLocalVariablesAsync()).filter((v) => v.variableCollectionId === collection.id);
  const created: string[] = [];
  const updated: string[] = [];
  for (const [i, d] of drafts.entries()) {
    let v = local.find((x) => x.name === d.figmaPath || x.getPluginData("token") === d.name);
    if (v) updated.push(d.name);
    else {
      v = api.createVariable(d.figmaPath, collection, "COLOR");
      created.push(d.name);
    }
    if (v.name !== d.figmaPath) v.name = d.figmaPath;
    v.setPluginData("token", d.name);
    v.setValueForMode(light.modeId, api.createVariableAlias(await primitive(d.light!)));
    v.setValueForMode(dark.modeId, api.createVariableAlias(await primitive(d.dark!)));
    v.hiddenFromPublishing = !d.published;
    v.description = d.state === "default" ? "" : `State: ${d.state}.`;
    v.setVariableCodeSyntax("WEB", `var(${cssVariableName({ name: d.name, kind: "color", layer: "component" })})`);
    opts.onStep?.("variables", i + 1, drafts.length);
  }
  return { created, updated };
}

/**
 * Apply to layers (step 6): bind every scanned layer to its variable, which
 * Save and publish made. The dark copy is bound to the same variables and
 * set to dark mode, so it looks the same as before.
 */
export async function bindScan(api: ScanVariablesApi, set: ComponentSetLike, result: ScanResult, opts: ScanOptions & Progress & { dark?: NodeLike | null } = {}): Promise<BindResult> {
  const { collection, dark: darkMode } = await colourTokens(api, opts);
  const local = (await api.getLocalVariablesAsync()).filter((v) => v.variableCollectionId === collection.id);
  const tokens = new Set(result.changes.map((c) => c.token));
  const byToken = new Map<string, VariableLike>();
  for (const t of tokens) {
    const draft = result.tokens.find((d) => d.name === t);
    const v = local.find((x) => x.getPluginData("token") === t || (draft && x.name === draft.figmaPath));
    if (!v) throw new Error(`The variable for ${t} is not in this file. Use Save and publish first.`);
    byToken.set(t, v);
  }

  // Paints on 1 node and field are set together.
  type Entry = { node: NodeLike; field: "fills" | "strokes"; items: { index: number; variable: VariableLike }[]; dark: boolean };
  const byNode = new Map<string, Entry>();
  const add = (root: NodeLike, nodeId: string, field: "fills" | "strokes", index: number, variable: VariableLike, dark: boolean, what: string) => {
    const key = `${nodeId}|${field}`;
    const node = byNode.get(key)?.node ?? findNode(root, nodeId);
    if (!node) throw new Error(`The layer ${what} is gone. Scan again.`);
    const entry = byNode.get(key) ?? { node, field, items: [], dark };
    entry.items.push({ index, variable });
    byNode.set(key, entry);
  };
  for (const c of result.changes) {
    const variable = byToken.get(c.token)!;
    const p = c.layer.paint;
    add(set, p.nodeId, p.paint, p.index, variable, false, `${p.layerName} in ${p.variant}`);
    if (p.dark && opts.dark) add(opts.dark, p.dark.nodeId, p.paint, p.index, variable, true, `${p.layerName} in the dark copy of ${p.variant}`);
  }
  let layers = 0;
  let darkLayers = 0;
  const total = [...byNode.values()].reduce((n, e) => n + e.items.length, 0);
  for (const { node, field, items, dark } of byNode.values()) {
    const list = node[field];
    if (!list || isSymbol(list)) continue;
    const next = [...list];
    for (const { index, variable } of items) {
      next[index] = api.setBoundVariableForPaint(next[index], "color", variable);
      if (dark) darkLayers += 1;
      else layers += 1;
    }
    (node as { fills?: readonly PaintLike[]; strokes?: readonly PaintLike[] })[field] = next;
    opts.onStep?.("layers", layers + darkLayers, total);
  }
  // The dark copy now uses the same tokens as the component, so it shows dark mode to keep its look.
  opts.dark?.setExplicitVariableModeForCollection?.(collection, darkMode.modeId);
  return { layers, darkLayers };
}

/** Save and publish, then Apply to layers, in 1 go. Used by the tests and kept for scripts. */
export async function applyScan(
  api: ScanVariablesApi,
  set: ComponentSetLike,
  result: ScanResult,
  drafts: DraftToken[],
  vars: ScanVariable[],
  opts: ScanOptions & Progress & { dark?: NodeLike | null } = {},
): Promise<ApplyScanResult> {
  const published = await publishScan(api, drafts, vars, opts);
  const bound = await bindScan(api, set, result, opts);
  return { ...published, ...bound };
}
