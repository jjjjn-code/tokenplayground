import { describe, expect, it } from "vitest";
import { applyPlan, readExisting } from "@/src/lib/figma/apply";
import { buildSpecs, hexToRgba, planSync } from "@/src/lib/figma/plan";
import { FakeFigma } from "./fake-figma";
import { dummy } from "./helpers";

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
    expect(get("orange-700")).toMatchObject({ collection: "colour-primitives", name: "orange-700", type: "COLOR", values: { value: { kind: "color", ...hexToRgba("#FF5000") } } });
    expect(get("spacing-max-3xs")).toMatchObject({ collection: "space-primitives", name: "spacing/max/3xs", type: "FLOAT", values: { value: { kind: "float", value: 5 } } });
    expect(get("font-family-body")).toMatchObject({ collection: "type-primitives", name: "fontFamilies/body", type: "STRING" });
  });

  it("puts motion primitives in Motion with 1 value", () => {
    expect(get("duration-fast")).toMatchObject({
      collection: "motion",
      name: "duration/duration-fast",
      type: "FLOAT",
      values: { value: { kind: "float", value: 150 } },
    });
    expect(get("ease-standard")).toMatchObject({ type: "STRING", values: { value: { kind: "string", value: "cubic-bezier(0.22, 1, 0.36, 1)" } } });
  });

  it("puts fluid tokens in Fluid tokens with min and max aliases", () => {
    expect(get("space-s-l")).toMatchObject({
      collection: "fluid-tokens",
      name: "Space size/Custom space pairs/S-L",
      values: { min: { kind: "alias", token: "spacing-min-s" }, max: { kind: "alias", token: "spacing-max-l" } },
    });
  });

  it("keeps references as aliases, per mode", () => {
    expect(get("surface-default")).toMatchObject({
      collection: "colour-tokens",
      name: "Base/Surface/surface-default",
      values: { light: { kind: "alias", token: "neutral-100" }, dark: { kind: "alias", token: "neutral-700" } },
    });
  });

  it("uses the Figma path for component tokens and hides non-default states", () => {
    expect(get("button-surface-primary-hover")).toMatchObject({ collection: "colour-tokens", name: "Interactive/Button/Surface/surface-primary-hover", hiddenFromPublishing: true });
    expect(get("button-surface-primary-default").hiddenFromPublishing).toBe(false);
  });

  it("gives developers the CSS name as code syntax", () => {
    expect(get("surface-default").codeSyntax).toBe("var(--color-surface-default)");
  });

  it("skips tokens with several parts, and says why", () => {
    expect(skipped.map((s) => s.token).sort()).toEqual(["border-default", "shadow-elevated"]);
    expect(skipped[0].reason).toContain("Figma style");
  });

  it("hides deprecated tokens from publishing", () => {
    expect(get("purple-400")).toMatchObject({ hiddenFromPublishing: true, description: "Deprecated. Dummy only. Tests deprecated tokens and warnings when something still points to one." });
  });
});

describe("sync to a Figma file", () => {
  it("creates the UI Kit collections with the right modes, and every variable", async () => {
    const fig = new FakeFigma();
    const plan = await sync(fig);
    expect(plan.add.length).toBe(106);
    expect(Object.fromEntries(fig.collections.map((c) => [c.name, c.modes.map((m) => m.name)]))).toEqual({
      "Colour primitives": ["Value"],
      "Space primitives": ["Value"],
      "Type primitives": ["Value"],
      "Other primitives": ["Value"],
      Motion: ["Value"],
      "Colour tokens": ["Light", "Dark"],
      "Fluid tokens": ["Min", "Max"],
      "Other tokens": ["Value"],
    });
    expect(fig.variables).toHaveLength(106);
  });

  it("uses the collections and modes already in the file, whatever their case or name", async () => {
    const fig = new FakeFigma();
    const type = fig.createVariableCollection("Type primitives");
    type.renameMode(type.modes[0].modeId, "primitives/typography");
    const colours = fig.createVariableCollection("Colour tokens");
    colours.renameMode(colours.modes[0].modeId, "dark");
    colours.addMode("light");
    const motion = fig.createVariableCollection("Motion");
    motion.renameMode(motion.modes[0].modeId, "default");
    motion.addMode("reduced-motion");
    await sync(fig);
    expect(type.modes.map((m) => m.name)).toEqual(["primitives/typography"]);
    expect(colours.modes.map((m) => m.name)).toEqual(["dark", "light"]);
    expect(motion.modes.map((m) => m.name)).toEqual(["default", "reduced-motion"]);
    const surface = fig.variables.find((v) => v.getPluginData("token") === "surface-default")!;
    const neutral100 = fig.variables.find((v) => v.getPluginData("token") === "neutral-100")!;
    const light = colours.modes.find((m) => m.name === "light")!.modeId;
    expect(surface.valuesByMode[light]).toEqual({ type: "VARIABLE_ALIAS", id: neutral100.id });
  });

  it("never deletes a variable to change its type; it lists it instead", async () => {
    const fig = new FakeFigma();
    const motion = fig.createVariableCollection("Motion");
    const hand = fig.createVariable("duration/duration-fast", motion, "STRING");
    const plan = await sync(fig);
    expect(fig.variables.includes(hand)).toBe(true);
    expect(plan.skipped.find((s) => s.token === "duration-fast")?.reason).toContain("Change it by hand");
  });

  it("links aliases to the right variables", async () => {
    const fig = new FakeFigma();
    await sync(fig);
    const surface = fig.variables.find((v) => v.getPluginData("token") === "surface-default")!;
    const neutral100 = fig.variables.find((v) => v.getPluginData("token") === "neutral-100")!;
    const semantic = fig.collections.find((c) => c.name === "Colour tokens")!;
    const light = semantic.modes.find((m) => m.name === "Light")!.modeId;
    expect(surface.valuesByMode[light]).toEqual({ type: "VARIABLE_ALIAS", id: neutral100.id });
    expect(surface.codeSyntax.WEB).toBe("var(--color-surface-default)");
  });

  it("finds nothing to do on a second sync", async () => {
    const fig = new FakeFigma();
    await sync(fig);
    const { specs } = buildSpecs(dummy());
    const again = planSync(specs, await readExisting(fig));
    expect([again.add.length, again.change.length, again.remove.length, again.unchanged]).toEqual([0, 0, 0, 106]);
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
    const prim = fig.createVariableCollection("Colour primitives");
    fig.createVariable("orange-700", prim, "COLOR");
    const plan = await sync(fig);
    expect(plan.change.find((c) => c.spec.token === "orange-700")?.differences).toContain("Linked to Token Library");
    expect(fig.variables.filter((v) => v.name === "orange-700")).toHaveLength(1);
  });
});
