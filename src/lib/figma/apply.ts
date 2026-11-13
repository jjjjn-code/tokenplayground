/**
 * Read and write Figma variables through the small part of the Figma
 * plugin API this sync needs. The plugin passes the real `figma.variables`;
 * the tests pass a fake.
 */
import { COLLECTION_MODES, type CollectionKey, type ExistingVariable, type FigmaType, type FigmaValue, type SyncPlan, type VariableSpec, modeValues } from "./plan";

export interface ModeLike {
  modeId: string;
  name: string;
}

export interface CollectionLike {
  id: string;
  name: string;
  modes: ModeLike[];
  addMode(name: string): string;
  renameMode(modeId: string, name: string): void;
  getPluginData(key: string): string;
  setPluginData(key: string, value: string): void;
}

export type RawValue = { r: number; g: number; b: number; a?: number } | number | string | boolean | { type: "VARIABLE_ALIAS"; id: string };

export interface VariableLike {
  id: string;
  name: string;
  resolvedType: string;
  variableCollectionId: string;
  valuesByMode: Record<string, RawValue>;
  hiddenFromPublishing: boolean;
  description: string;
  codeSyntax: { WEB?: string };
  setValueForMode(modeId: string, value: RawValue): void;
  setVariableCodeSyntax(platform: "WEB", value: string): void;
  getPluginData(key: string): string;
  setPluginData(key: string, value: string): void;
  remove(): void;
}

export interface VariablesApi {
  getLocalVariableCollectionsAsync(): Promise<CollectionLike[]>;
  getLocalVariablesAsync(): Promise<VariableLike[]>;
  createVariableCollection(name: string): CollectionLike;
  createVariable(name: string, collection: CollectionLike, type: FigmaType): VariableLike;
  createVariableAlias(variable: VariableLike): { type: "VARIABLE_ALIAS"; id: string };
}

export type CollectionNames = Record<CollectionKey, string>;

export const DEFAULT_COLLECTION_NAMES: CollectionNames = {
  primitives: "Primitives",
  semantic: "Semantic",
  components: "Components",
};

const KEY = "tokenLibrary";

function collectionKeyOf(c: CollectionLike, names: CollectionNames): CollectionKey | null {
  const stored = c.getPluginData(KEY) as CollectionKey;
  if (stored && stored in names) return stored;
  const found = (Object.keys(names) as CollectionKey[]).find((k) => names[k] === c.name);
  return found ?? null;
}

function toFigmaValue(raw: RawValue | undefined, byId: Map<string, VariableLike>): FigmaValue | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "object" && "type" in raw && raw.type === "VARIABLE_ALIAS") {
    const target = byId.get(raw.id);
    return { kind: "alias", token: target ? target.getPluginData("token") || target.name : raw.id };
  }
  if (typeof raw === "object" && "r" in raw) return { kind: "color", r: raw.r, g: raw.g, b: raw.b, a: raw.a ?? 1 };
  if (typeof raw === "number") return { kind: "float", value: raw };
  return { kind: "string", value: String(raw) };
}

/** Every variable in the file, in the shape the plan compares. */
export async function readExisting(api: VariablesApi, names: CollectionNames = DEFAULT_COLLECTION_NAMES): Promise<ExistingVariable[]> {
  const collections = await api.getLocalVariableCollectionsAsync();
  const variables = await api.getLocalVariablesAsync();
  const byId = new Map(variables.map((v) => [v.id, v]));
  const colById = new Map(collections.map((c) => [c.id, c]));
  return variables.map((v) => {
    const c = colById.get(v.variableCollectionId);
    const key = c ? collectionKeyOf(c, names) : null;
    const mode = (n: string) => c?.modes.find((m) => m.name === n)?.modeId;
    const first = c?.modes[0]?.modeId;
    const lightId = key === "primitives" ? mode("Value") ?? first : mode("Light") ?? first;
    const darkId = key && key !== "primitives" ? mode("Dark") : undefined;
    return {
      id: v.id,
      token: v.getPluginData("token") || undefined,
      collection: key,
      name: v.name,
      type: v.resolvedType,
      light: lightId ? toFigmaValue(v.valuesByMode[lightId], byId) : undefined,
      dark: darkId ? toFigmaValue(v.valuesByMode[darkId], byId) : undefined,
      hiddenFromPublishing: v.hiddenFromPublishing,
      description: v.description ?? "",
      codeSyntax: v.codeSyntax?.WEB,
    };
  });
}

async function ensureCollections(api: VariablesApi, names: CollectionNames, needed: Set<CollectionKey>) {
  const all = await api.getLocalVariableCollectionsAsync();
  const out = new Map<CollectionKey, CollectionLike>();
  for (const key of needed) {
    let c = all.find((x) => collectionKeyOf(x, names) === key);
    if (!c) c = api.createVariableCollection(names[key]);
    c.setPluginData(KEY, key);
    const wanted = COLLECTION_MODES[key];
    // A new collection starts with 1 mode called "Mode 1": rename it.
    if (!c.modes.some((m) => m.name === wanted[0])) c.renameMode(c.modes[0].modeId, wanted[0]);
    for (const w of wanted.slice(1)) if (!c.modes.some((m) => m.name === w)) c.addMode(w);
    out.set(key, c);
  }
  return out;
}

function toRaw(v: FigmaValue, tokenVars: Map<string, VariableLike>, api: VariablesApi): RawValue {
  if (v.kind === "alias") {
    const target = tokenVars.get(v.token);
    if (!target) throw new Error(`The variable for ${v.token} is missing.`);
    return api.createVariableAlias(target);
  }
  if (v.kind === "color") return { r: v.r, g: v.g, b: v.b, a: v.a };
  return v.value;
}

export interface ApplyResult {
  added: string[];
  changed: string[];
  removed: string[];
}

/** Make the file match the plan. Values are set after every variable exists, so aliases can point anywhere. */
export async function applyPlan(api: VariablesApi, plan: SyncPlan, names: CollectionNames = DEFAULT_COLLECTION_NAMES): Promise<ApplyResult> {
  const work: VariableSpec[] = [...plan.add, ...plan.change.map((c) => c.spec)];
  const collections = await ensureCollections(api, names, new Set(work.map((s) => s.collection)));
  const all = await api.getLocalVariablesAsync();
  const byId = new Map(all.map((v) => [v.id, v]));

  // Create new variables, and rename or recreate changed ones.
  const varFor = new Map<string, VariableLike>();
  for (const c of plan.change) {
    let v = byId.get(c.existing.id)!;
    if (v.resolvedType !== c.spec.type) {
      v.remove(); // Figma cannot change a variable's type.
      v = api.createVariable(c.spec.name, collections.get(c.spec.collection)!, c.spec.type);
    } else if (v.name !== c.spec.name) v.name = c.spec.name;
    v.setPluginData("token", c.spec.token);
    varFor.set(c.spec.token, v);
  }
  for (const s of plan.add) {
    const v = api.createVariable(s.name, collections.get(s.collection)!, s.type);
    v.setPluginData("token", s.token);
    varFor.set(s.token, v);
  }

  // Every linked variable, for aliases to tokens that did not change.
  const tokenVars = new Map<string, VariableLike>();
  for (const v of await api.getLocalVariablesAsync()) {
    const t = v.getPluginData("token");
    if (t) tokenVars.set(t, v);
  }
  for (const [t, v] of varFor) tokenVars.set(t, v);

  for (const s of work) {
    const v = varFor.get(s.token)!;
    const c = collections.get(s.collection)!;
    for (const [modeName, value] of Object.entries(modeValues(s))) {
      const modeId = c.modes.find((m) => m.name === modeName)!.modeId;
      v.setValueForMode(modeId, toRaw(value, tokenVars, api));
    }
    v.hiddenFromPublishing = s.hiddenFromPublishing;
    v.description = s.description;
    v.setVariableCodeSyntax("WEB", s.codeSyntax);
  }

  for (const e of plan.remove) byId.get(e.id)?.remove();
  return { added: plan.add.map((s) => s.token), changed: plan.change.map((c) => c.spec.token), removed: plan.remove.map((e) => e.token ?? e.name) };
}
