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
import type { DraftToken, Rgba, ScanInput, ScannedPaint, ScanResult, ScanVariable } from "./scan";

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
    out.push({ id: v.id, token: tokenNameOf(v, layer), name: v.name, collection: key, layer, values });
  }
  return out;
}

const isSymbol = (x: unknown): x is symbol => typeof x === "symbol";

/** Read a component set: its variants, every solid colour on every layer, and the variables they use. */
export async function readComponentSet(api: ScanVariablesApi, set: ComponentSetLike, opts: ScanOptions = {}): Promise<ScanInput> {
  const issues: Issue[] = [];
  const defs = Object.entries(set.componentPropertyDefinitions ?? {}).filter(([, d]) => d.type === "VARIANT");
  const stateProp = defs.find(([n]) => n.trim().toLowerCase() === "state")?.[0];
  if (!stateProp) {
    issues.push(issue("error", "scan.state", `${set.name} has no State property. Add a variant property called State, with values such as Default, Hover, Pressed and Disabled.`));
  }
  // PROVISIONAL: the role comes from the 1 other variant property with more than 1 value.
  const roleProps = defs.filter(([n, d]) => n !== stateProp && (d.variantOptions?.length ?? 0) > 1).map(([n]) => n);
  if (roleProps.length > 1) {
    issues.push(issue("error", "scan.roles", `${set.name} has ${roleProps.length} variant properties apart from State (${roleProps.join(", ")}). The scan can read 1 property as the role. Keep 1 property apart from State.`));
  }
  const roleProp = roleProps.length === 1 ? roleProps[0] : undefined;

  const variants: ScanInput["variants"] = [];
  const paints: ScannedPaint[] = [];
  for (const node of set.children) {
    if (node.type !== "COMPONENT") continue;
    const props = node.variantProperties ?? {};
    const state = stateProp ? slug(props[stateProp] ?? "") : "";
    const role = roleProp ? slug(props[roleProp] ?? "") || undefined : undefined;
    if (stateProp && !state) issues.push(issue("error", "scan.state-value", `The variant ${node.name} has no State value. Give it a State value.`));
    variants.push({ id: node.id, name: node.name, state, role });

    /**
     * `category` forces a category: the variant frame's fill is surface and
     * its stroke is line; every colour inside an instance (an icon) is content.
     */
    const read = (n: NodeLike, layerName: string, category: (field: "fills" | "strokes") => string | undefined) => {
      if (n.isMask) return;
      for (const field of ["fills", "strokes"] as const) {
        const list = n[field];
        if (!list) continue;
        if (isSymbol(list)) {
          issues.push(issue("warning", "scan.mixed", `The text layer "${n.name}" in ${node.name} has more than 1 colour. The scan does not read it. Give the text 1 colour.`));
          continue;
        }
        list.forEach((p, index) => {
          if (p.visible === false || p.type !== "SOLID") return;
          const bound = p.boundVariables?.color?.id;
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
            category: category(field),
          });
        });
      }
    };
    const walk = (n: NodeLike, inInstance: string | null) => {
      if (n.visible === false) return;
      read(n, inInstance ? `${n.name} in ${inInstance}` : n.name, () => (inInstance ? "content" : undefined));
      const inside = inInstance ?? (n.type === "INSTANCE" ? n.name : null);
      for (const c of n.children ?? []) walk(c, inside);
    };
    read(node, "variant frame", (field) => (field === "fills" ? "surface" : "line"));
    for (const c of node.children ?? []) walk(c, null);
  }
  if (stateProp && !variants.some((v) => v.state === "default")) {
    issues.push(issue("error", "scan.no-default", `${set.name} has no variant with State=Default. Add a default variant.`));
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
  const boundIds = paints.flatMap((p) => (p.binding.kind === "variable" ? [p.binding.id] : []));
  const variables = await readVariables(api, boundIds, opts);
  return { componentName: set.name, variants, paints, variables, issues };
}

export interface ApplyScanResult {
  created: string[];
  updated: string[];
  /** Paints bound to a new variable. */
  layers: number;
}

export type ScanStep = "variables" | "layers";

function findNode(root: NodeLike, id: string): NodeLike | null {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
}

/**
 * Create (or update) the drafted variables in Colour tokens and bind every
 * scanned layer to its new variable. `drafts` are the result's tokens with
 * the designer's choices applied; each must have a light and a dark value.
 */
export async function applyScan(
  api: ScanVariablesApi,
  set: ComponentSetLike,
  result: ScanResult,
  drafts: DraftToken[],
  vars: ScanVariable[],
  opts: ScanOptions & { onStep?: (step: ScanStep, done: number, total: number) => void } = {},
): Promise<ApplyScanResult> {
  const names = namesOf(opts);
  const collection = (await api.getLocalVariableCollectionsAsync()).find((c) => collectionKey(c, names) === "colour-tokens");
  if (!collection) throw new Error(`This file has no ${names["colour-tokens"]} collection. Add it, or run Sync from tool first.`);
  const light = collection.modes.find((m) => modeKeyOf(m.name) === "light");
  const dark = collection.modes.find((m) => modeKeyOf(m.name) === "dark");
  if (!light || !dark) throw new Error(`The ${collection.name} collection must have a light and a dark mode.`);

  const missing = drafts.filter((d) => !d.light || !d.dark);
  if (missing.length) throw new Error(`Choose light and dark values for ${missing.map((d) => d.name).join(", ")}.`);

  const primitive = async (token: string) => {
    const sv = vars.find((v) => v.token === token && v.layer === "primitive");
    const v = sv ? await api.getVariableByIdAsync(sv.id) : null;
    if (!v) throw new Error(`The primitive ${token} is not in this file.`);
    return v;
  };

  const local = (await api.getLocalVariablesAsync()).filter((v) => v.variableCollectionId === collection.id);
  const byToken = new Map<string, VariableLike>();
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
    byToken.set(d.name, v);
    opts.onStep?.("variables", i + 1, drafts.length);
  }

  // Bind layers. Paints on 1 node and field are set together.
  const byNode = new Map<string, { node: NodeLike; field: "fills" | "strokes"; items: { index: number; variable: VariableLike }[] }>();
  for (const c of result.changes) {
    const variable = byToken.get(c.token);
    if (!variable) throw new Error(`The variable for ${c.token} is missing.`);
    const key = `${c.layer.paint.nodeId}|${c.layer.paint.paint}`;
    const node = byNode.get(key)?.node ?? findNode(set, c.layer.paint.nodeId);
    if (!node) throw new Error(`The layer ${c.layer.paint.layerName} in ${c.layer.paint.variant} is gone. Scan again.`);
    const entry = byNode.get(key) ?? { node, field: c.layer.paint.paint, items: [] };
    entry.items.push({ index: c.layer.paint.index, variable });
    byNode.set(key, entry);
  }
  let layers = 0;
  for (const { node, field, items } of byNode.values()) {
    const list = node[field];
    if (!list || isSymbol(list)) continue;
    const next = [...list];
    for (const { index, variable } of items) {
      next[index] = api.setBoundVariableForPaint(next[index], "color", variable);
      layers += 1;
    }
    (node as { fills?: readonly PaintLike[]; strokes?: readonly PaintLike[] })[field] = next;
    opts.onStep?.("layers", layers, result.changes.length);
  }
  return { created, updated, layers };
}
