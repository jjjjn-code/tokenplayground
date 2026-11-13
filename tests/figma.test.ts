import { describe, expect, it } from "vitest";
import { applyPlan, readExisting, type CollectionLike, type RawValue, type VariableLike, type VariablesApi } from "@/src/lib/figma/apply";
import { buildSpecs, hexToRgba, planSync } from "@/src/lib/figma/plan";
import { dummy } from "./helpers";

/** A fake of the parts of figma.variables the sync uses. */
class FakeFigma implements VariablesApi {
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
}

const sync = async (fig: FakeFigma, set = dummy()) => {
  const { specs, skipped } = buildSpecs(set);
  const plan = planSync(specs, await readExisting(fig), skipped);
  await applyPlan(fig, plan);
  return plan;
};

describe("buildSpecs", () => {
  const { specs, skipped } = buildSpecs(dummy());
  const get = (n: string) => specs.find((s) => s.token === n)!;

  it("turns colours into colours, sizes into numbers and font families into text", () => {
    expect(get("orange-700")).toMatchObject({ collection: "primitives", name: "Colour/orange-700", type: "COLOR", light: hexToRgba("#FF5000") ? { kind: "color" } : {} });
    expect(get("spacing-4")).toMatchObject({ type: "FLOAT", light: { kind: "float", value: 16 } });
    expect(get("font-family-sans")).toMatchObject({ type: "STRING" });
  });

  it("keeps references as aliases, per mode", () => {
    expect(get("surface-default")).toMatchObject({ collection: "semantic", name: "Surface/surface-default", light: { kind: "alias", token: "neutral-100" }, dark: { kind: "alias", token: "neutral-700" } });
  });

  it("uses the Figma path for component tokens and hides non-default states", () => {
    expect(get("button-surface-primary-hover")).toMatchObject({ collection: "components", name: "Interactive/Button/Surface/surface-primary-hover", hiddenFromPublishing: true });
    expect(get("button-surface-primary-default").hiddenFromPublishing).toBe(false);
  });

  it("gives developers the CSS name as code syntax", () => {
    expect(get("surface-default").codeSyntax).toBe("var(--color-surface-default)");
  });

  it("skips tokens with several parts, and says why", () => {
    expect(skipped.map((s) => s.token).sort()).toEqual(["border-default", "shadow-elevated", "text-body"]);
    expect(skipped[0].reason).toContain("Figma style");
  });

  it("hides deprecated tokens from publishing", () => {
    expect(get("purple-400")).toMatchObject({ hiddenFromPublishing: true, description: "Deprecated. Dummy only. Tests deprecated tokens and warnings when something still points to one." });
  });
});

describe("sync to a Figma file", () => {
  it("creates 3 collections with the right modes, and every variable", async () => {
    const fig = new FakeFigma();
    const plan = await sync(fig);
    expect(plan.add.length).toBe(65);
    expect(fig.collections.map((c) => [c.name, c.modes.map((m) => m.name)])).toEqual([
      ["Primitives", ["Value"]],
      ["Semantic", ["Light", "Dark"]],
      ["Components", ["Light", "Dark"]],
    ]);
    expect(fig.variables).toHaveLength(65);
  });

  it("links aliases to the right variables", async () => {
    const fig = new FakeFigma();
    await sync(fig);
    const surface = fig.variables.find((v) => v.getPluginData("token") === "surface-default")!;
    const neutral100 = fig.variables.find((v) => v.getPluginData("token") === "neutral-100")!;
    const semantic = fig.collections.find((c) => c.name === "Semantic")!;
    const light = semantic.modes.find((m) => m.name === "Light")!.modeId;
    expect(surface.valuesByMode[light]).toEqual({ type: "VARIABLE_ALIAS", id: neutral100.id });
    expect(surface.codeSyntax.WEB).toBe("var(--color-surface-default)");
  });

  it("finds nothing to do on a second sync", async () => {
    const fig = new FakeFigma();
    await sync(fig);
    const { specs } = buildSpecs(dummy());
    const again = planSync(specs, await readExisting(fig));
    expect([again.add.length, again.change.length, again.remove.length, again.unchanged]).toEqual([0, 0, 0, 65]);
  });

  it("updates a changed value and reports the difference", async () => {
    const fig = new FakeFigma();
    await sync(fig);
    const set = dummy();
    set.tokens.find((t) => t.name === "surface-default")!.values.dark = { ref: "neutral-800" };
    const { specs } = buildSpecs(set);
    const plan = planSync(specs, await readExisting(fig));
    expect(plan.change.map((c) => [c.spec.token, c.differences])).toEqual([["surface-default", ["Dark: neutral-700 → neutral-800"]]]);
    await applyPlan(fig, plan);
    expect(planSync(buildSpecs(set).specs, await readExisting(fig)).change).toEqual([]);
  });

  it("removes only variables made by a sync", async () => {
    const fig = new FakeFigma();
    await sync(fig);
    const own = fig.createVariable("My own colour", fig.collections[0], "COLOR");
    const set = dummy();
    set.tokens = set.tokens.filter((t) => t.name !== "blue-400");
    const plan = planSync(buildSpecs(set).specs, await readExisting(fig));
    expect(plan.remove.map((r) => r.token)).toEqual(["blue-400"]);
    await applyPlan(fig, plan);
    expect(fig.variables.includes(own)).toBe(true);
  });

  it("adopts a hand-made variable with the same name instead of making a copy", async () => {
    const fig = new FakeFigma();
    const prim = fig.createVariableCollection("Primitives");
    fig.createVariable("Colour/orange-700", prim, "COLOR");
    const plan = await sync(fig);
    expect(plan.change.find((c) => c.spec.token === "orange-700")?.differences).toContain("Linked to Token Library");
    expect(fig.variables.filter((v) => v.name === "Colour/orange-700")).toHaveLength(1);
  });
});
