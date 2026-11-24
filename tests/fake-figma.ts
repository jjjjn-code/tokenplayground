/** A fake of the parts of figma.variables that sync and the component scan use. */
import type { CollectionLike, RawValue, VariableLike, VariablesApi } from "@/src/lib/figma/apply";
import type { PaintLike, ScanVariablesApi } from "@/src/lib/figma/scan-figma";

export class FakeFigma implements VariablesApi, ScanVariablesApi {
  collections: CollectionLike[] = [];
  variables: VariableLike[] = [];
  private n = 0;
  private id(p: string) {
    this.n += 1;
    return `${p}:${this.n}`;
  }
  async getLocalVariableCollectionsAsync() {
    return this.collections;
  }
  async getLocalVariablesAsync() {
    return this.variables;
  }
  createVariableCollection(name: string): CollectionLike {
    const data: Record<string, string> = {};
    const self = this;
    const c: CollectionLike = {
      id: this.id("C"),
      name,
      modes: [{ modeId: this.id("M"), name: "Mode 1" }],
      addMode(n) {
        const modeId = self.id("M");
        c.modes.push({ modeId, name: n });
        return modeId;
      },
      renameMode(modeId, n) {
        c.modes.find((m) => m.modeId === modeId)!.name = n;
      },
      getPluginData: (k) => data[k] ?? "",
      setPluginData: (k, v) => {
        data[k] = v;
      },
    };
    this.collections.push(c);
    return c;
  }
  createVariable(name: string, collection: CollectionLike, type: string): VariableLike {
    const data: Record<string, string> = {};
    const self = this;
    const v: VariableLike = {
      id: this.id("V"),
      name,
      resolvedType: type,
      variableCollectionId: collection.id,
      valuesByMode: {},
      hiddenFromPublishing: false,
      description: "",
      codeSyntax: {},
      setValueForMode(modeId: string, value: RawValue) {
        v.valuesByMode[modeId] = value;
      },
      setVariableCodeSyntax(_p, value) {
        v.codeSyntax.WEB = value;
      },
      getPluginData: (k) => data[k] ?? "",
      setPluginData: (k, val) => {
        data[k] = val;
      },
      remove() {
        self.variables = self.variables.filter((x) => x !== v);
      },
    };
    this.variables.push(v);
    return v;
  }
  createVariableAlias(variable: VariableLike) {
    return { type: "VARIABLE_ALIAS" as const, id: variable.id };
  }
  async getVariableByIdAsync(id: string) {
    return this.variables.find((v) => v.id === id) ?? null;
  }
  async getVariableCollectionByIdAsync(id: string) {
    return this.collections.find((c) => c.id === id) ?? null;
  }
  setBoundVariableForPaint(paint: PaintLike, field: "color", variable: VariableLike): PaintLike {
    return { ...paint, boundVariables: { ...(paint.boundVariables ?? {}), [field]: { type: "VARIABLE_ALIAS", id: variable.id } } };
  }
  /** A variable by its Figma name. */
  byName(name: string) {
    return this.variables.find((v) => v.name === name);
  }
  /** Follow aliases to a colour, as Figma shows it in a mode of the variable's collection. */
  resolve(id: string, modeName: string): { r: number; g: number; b: number; a?: number } | null {
    const v = this.variables.find((x) => x.id === id);
    const c = v && this.collections.find((x) => x.id === v.variableCollectionId);
    if (!v || !c) return null;
    const mode = c.modes.length === 1 ? c.modes[0] : c.modes.find((m) => m.name.toLowerCase() === modeName.toLowerCase());
    const raw = mode && v.valuesByMode[mode.modeId];
    if (!raw) return null;
    if (typeof raw === "object" && "type" in raw && raw.type === "VARIABLE_ALIAS") return this.resolve(raw.id, modeName);
    return typeof raw === "object" && "r" in raw ? raw : null;
  }
}