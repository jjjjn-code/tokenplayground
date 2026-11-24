import { describe, expect, it } from "vitest";
import { applyPlan, readExisting } from "@/src/lib/figma/apply";
import { buildSpecs, hexToRgba, planSync } from "@/src/lib/figma/plan";
import { checkDrafts, draftsToTokens, scanComponent, summarise, withChoices, type Choices } from "@/src/lib/figma/scan";
import { donePreview, scanView } from "@/src/lib/figma/scan-view";
import { parseDtcg } from "@/src/lib/tokens";
import { applyScan, readComponentSet, type ComponentSetLike, type NodeLike, type PaintLike } from "@/src/lib/figma/scan-figma";
import { FakeFigma } from "./fake-figma";
import { codes, dummy } from "./helpers";

/** A Figma file with the dummy set synced into it, as the UAL UI Kit has its variables. */
async function file() {
  const fig = new FakeFigma();
  const { specs, skipped } = buildSpecs(dummy());
  await applyPlan(fig, planSync(specs, await readExisting(fig), skipped));
  return fig;
}

/** A paint bound to the variable with this Figma name, or a raw hex colour. */
function paint(fig: FakeFigma, value: string): PaintLike {
  if (value.startsWith("#")) {
    const { r, g, b, a } = hexToRgba(value)!;
    return { type: "SOLID", color: { r, g, b }, opacity: a };
  }
  const v = fig.byName(value);
  if (!v) throw new Error(`No variable ${value}`);
  return { type: "SOLID", color: { r: 0, g: 0, b: 0 }, boundVariables: { color: { type: "VARIABLE_ALIAS", id: v.id } } };
}

let n = 0;
const node = (name: string, extra: Partial<NodeLike> = {}): NodeLike => ({ id: `N:${++n}`, name, type: "FRAME", ...extra });

type Parts = Record<string, { fill?: string; stroke?: string }>;

/** A component set; each variant has 1 layer per part, named after the part. */
function componentSet(fig: FakeFigma, name: string, variants: Record<string, Parts>, props?: Record<string, string[]>): ComponentSetLike {
  const children = Object.entries(variants).map(([vname, parts]) => {
    const variantProperties = Object.fromEntries(vname.split(", ").map((kv) => kv.split("=")));
    return node(vname, {
      type: "COMPONENT",
      variantProperties,
      children: Object.entries(parts).map(([layer, p]) =>
        node(layer, { fills: p.fill ? [paint(fig, p.fill)] : [], strokes: p.stroke ? [paint(fig, p.stroke)] : [] }),
      ),
    });
  });
  const defs: ComponentSetLike["componentPropertyDefinitions"] = {};
  for (const [k, opts] of Object.entries(props ?? { State: Object.keys(variants).map((v) => v.split("=")[1]) })) defs[k] = { type: "VARIANT", variantOptions: opts };
  return { id: `N:${++n}`, name, type: "COMPONENT_SET", children, componentPropertyDefinitions: defs };
}

const P = (s: string) => s; // primitives sit at the top of Colour primitives
const S = (s: string) => `Base/${s.split("-")[0].replace(/^./, (c) => c.toUpperCase())}/${s}`;

/** The control from the handoff, with the sample bindings. */
function control(fig: FakeFigma) {
  return componentSet(fig, "Control", {
    "State=Default": { surface: { fill: P("transparent") }, line: { stroke: S("line-default") }, content: { fill: S("content-default") } },
    "State=Hover": { surface: { fill: P("neutral-200") }, line: { stroke: S("line-default") }, content: { fill: S("content-default") } },
    "State=Pressed": { surface: { fill: P("neutral-600") }, line: { stroke: S("line-default") }, content: { fill: S("content-on-inverse") } },
    "State=Disabled": { surface: { fill: P("transparent") }, line: { stroke: S("line-disabled") }, content: { fill: P("neutral-400") } },
  });
}

const DARK: Choices = {
  "control-surface-hover": { dark: "neutral-600" },
  "control-surface-pressed": { dark: "neutral-200" },
  "control-content-disabled": { dark: "neutral-400" },
};

describe("component scan: reading", () => {
  it("reads every named layer in every variant, with the state from the State property", async () => {
    const fig = await file();
    const input = await readComponentSet(fig, control(fig));
    expect(input.variants.map((v) => v.state)).toEqual(["default", "hover", "pressed", "disabled"]);
    expect(input.paints).toHaveLength(12);
    expect(input.issues).toEqual([]);
    const r = scanComponent(input);
    expect(r.component).toBe("control");
    const hover = r.layers.filter((l) => l.paint.state === "hover");
    expect(hover.map((l) => [l.category, l.source.kind, l.sameInBoth])).toEqual([
      ["surface", "primitive", true],
      ["line", "semantic", false],
      ["content", "semantic", false],
    ]);
  });

  it("resolves a semantic binding to its primitive in light and dark", async () => {
    const fig = await file();
    const r = scanComponent(await readComponentSet(fig, control(fig)));
    const line = r.layers.find((l) => l.category === "line")!.source;
    expect(line).toMatchObject({ kind: "semantic", token: "line-default", light: { primitive: "neutral-700" }, dark: { primitive: "neutral-100" } });
  });

  it("stops when the State property is missing", async () => {
    const fig = await file();
    const set = componentSet(fig, "Control", { "Size=Small": { surface: { fill: P("neutral-200") } } }, { Size: ["Small"] });
    const r = scanComponent(await readComponentSet(fig, set));
    expect(r.status).toBe("blocked");
    expect(codes(r.issues)).toContain("scan.state");
  });
});

describe("component scan: drafting (the control)", async () => {
  const fig = await file();
  const set = control(fig);
  const input = await readComponentSet(fig, set);
  const r = scanComponent(input);
  const get = (name: string) => r.tokens.find((t) => t.name === name)!;

  it("drafts a full set of 8 component tokens, because some parts use primitives", () => {
    expect(r.status).toBe("draft");
    expect(r.tokens.map((t) => t.name)).toEqual([
      "control-surface-default",
      "control-surface-hover",
      "control-surface-pressed",
      "control-line-default",
      "control-line-disabled",
      "control-content-default",
      "control-content-pressed",
      "control-content-disabled",
    ]);
  });

  it("names them for Figma without the component prefix, in Interactive / Control / [Category]", () => {
    expect(get("control-surface-hover")).toMatchObject({ figmaName: "surface-hover", figmaPath: "Interactive/Control/Surface/surface-hover" });
    expect(get("control-line-default").figmaPath).toBe("Interactive/Control/Line/line-default");
  });

  it("publishes only the -default tokens", () => {
    expect(r.tokens.filter((t) => t.published).map((t) => t.name)).toEqual(["control-surface-default", "control-line-default", "control-content-default"]);
  });

  it("points every token to a primitive, taking the primitive behind each semantic in each mode", () => {
    expect(get("control-line-default")).toMatchObject({ light: "neutral-700", dark: "neutral-100", needsDark: false, source: "From line-default" });
    expect(get("control-line-disabled")).toMatchObject({ light: "neutral-400", dark: "neutral-400" });
    expect(get("control-content-pressed")).toMatchObject({ light: "white", dark: "black", source: "From content-on-inverse" });
  });

  it("asks for a dark value when a part uses a primitive, but not for transparent", () => {
    expect(r.tokens.filter((t) => t.needsDark).map((t) => t.name)).toEqual(["control-surface-hover", "control-surface-pressed", "control-content-disabled"]);
    expect(get("control-surface-hover")).toMatchObject({ light: "neutral-200", dark: null });
    expect(get("control-surface-default")).toMatchObject({ light: "transparent", dark: "transparent", needsDark: false });
  });

  it("reuses the -default token when a state looks the same as the default", () => {
    const reused = r.changes.filter((c) => c.reused).map((c) => `${c.layer.paint.state} ${c.layer.category} → ${c.token}`);
    expect(reused).toEqual([
      "disabled surface → control-surface-default",
      "hover line → control-line-default",
      "pressed line → control-line-default",
      "hover content → control-content-default",
    ]);
    expect(r.changes).toHaveLength(12);
  });

  it("blocks Create until every dark value is chosen, then passes the token namer checks", () => {
    const before = checkDrafts(r, input.variables);
    expect(before.ok).toBe(false);
    expect(before.issues.filter((i) => i.code === "mode.missing").map((i) => i.token)).toEqual([
      "control-surface-hover",
      "control-surface-pressed",
      "control-content-disabled",
    ]);
    const after = checkDrafts(r, input.variables, DARK);
    expect(after.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(codes(after.issues)).toContain("component.no-role");
    expect(after.issues.find((i) => i.code === "scan.same-primitive")?.token).toBe("control-content-disabled");
  });

  it("sums up what Create and sync will do", () => {
    expect(summarise(r, input.variables).sentence).toBe(
      "This creates 8 variables in Colour tokens / Interactive / Control, hides 5 from publishing, changes 12 layers across 4 variants, and adds 8 tokens to Token Library.",
    );
  });

  it("gives tool tokens that point to primitives", () => {
    const t = draftsToTokens(withChoices(r.tokens, DARK)).find((x) => x.name === "control-surface-hover");
    expect(t).toEqual({ name: "control-surface-hover", layer: "component", kind: "color", component: "control", values: { light: { ref: "neutral-200" }, dark: { ref: "neutral-600" } }, status: "active" });
  });
});

describe("component scan: writing to Figma", () => {
  it("creates the variables, binds every layer, and fixes the dark theme", async () => {
    const fig = await file();
    const set = control(fig);
    const input = await readComponentSet(fig, set);
    const r = scanComponent(input);
    const drafts = withChoices(r.tokens, DARK);
    const result = await applyScan(fig, set, r, drafts, input.variables);
    expect(result).toMatchObject({ created: drafts.map((d) => d.name), updated: [], layers: 12 });

    const hover = fig.byName("Interactive/Control/Surface/surface-hover")!;
    expect(hover).toMatchObject({ hiddenFromPublishing: true, codeSyntax: { WEB: "var(--control-surface-hover)" } });
    expect(hover.getPluginData("token")).toBe("control-surface-hover");
    expect(fig.byName("Interactive/Control/Surface/surface-default")!.hiddenFromPublishing).toBe(false);

    // Hover surface: neutral-200 in light, neutral-600 in dark (before the scan it was neutral-200 in both).
    const hoverVariant = set.children.find((c) => c.name === "State=Hover")!;
    const surface = hoverVariant.children!.find((c) => c.name === "surface")!;
    const bound = (surface.fills as PaintLike[])[0].boundVariables!.color!.id;
    expect(bound).toBe(hover.id);
    expect(fig.resolve(bound, "Light")).toMatchObject(hexToRgba("#D1D1D1")!);
    expect(fig.resolve(bound, "Dark")).toMatchObject(hexToRgba("#3B3B3B")!);

    // Hover line reuses the default token.
    const line = hoverVariant.children!.find((c) => c.name === "line")!;
    expect((line.strokes as PaintLike[])[0].boundVariables!.color!.id).toBe(fig.byName("Interactive/Control/Line/line-default")!.id);
  });

  it("finds its own tokens on a second scan, and updates instead of duplicating", async () => {
    const fig = await file();
    const set = control(fig);
    const input = await readComponentSet(fig, set);
    const r = scanComponent(input);
    await applyScan(fig, set, r, withChoices(r.tokens, DARK), input.variables);
    const again = scanComponent(await readComponentSet(fig, set));
    expect(again.status).toBe("own-tokens");
    expect(again.layers.every((l) => l.source.kind === "component")).toBe(true);
  });

  it("refuses to write while a dark value is missing", async () => {
    const fig = await file();
    const set = control(fig);
    const input = await readComponentSet(fig, set);
    const r = scanComponent(input);
    await expect(applyScan(fig, set, r, r.tokens, input.variables)).rejects.toThrow(/Choose light and dark values/);
  });
});

describe("component scan: other cases", () => {
  it("says the component is fine when every part uses a semantic token", async () => {
    const fig = await file();
    const set = componentSet(fig, "Card", {
      "State=Default": { surface: { fill: S("surface-default") }, content: { fill: S("content-default") } },
      "State=Hover": { surface: { fill: S("surface-elevated") }, content: { fill: S("content-default") } },
    });
    const r = scanComponent(await readComponentSet(fig, set));
    expect(r.status).toBe("fine");
    expect(r.tokens).toEqual([]);
  });

  it("lists a coloured layer with another name as unknown and leaves it alone", async () => {
    const fig = await file();
    const set = componentSet(fig, "Control", {
      "State=Default": { surface: { fill: P("neutral-200") }, arrow: { fill: S("content-default") } },
    });
    const r = scanComponent(await readComponentSet(fig, set));
    expect(r.unknown.map((l) => l.paint.layerName)).toEqual(["arrow"]);
    expect(codes(r.issues)).toContain("scan.unknown");
    expect(r.changes.map((c) => c.layer.paint.layerName)).toEqual(["surface"]);
  });

  it("matches a raw value to the primitive with the same colour, and asks for both values when none matches", async () => {
    const fig = await file();
    const set = componentSet(fig, "Control", {
      "State=Default": { surface: { fill: "#D1D1D1" } },
      "State=Hover": { surface: { fill: "#123456" } },
    });
    const r = scanComponent(await readComponentSet(fig, set));
    expect(r.tokens.map((t) => [t.name, t.light, t.needsLight, t.needsDark])).toEqual([
      ["control-surface-default", "neutral-200", false, true],
      ["control-surface-hover", null, true, true],
    ]);
    expect(r.tokens[1].source).toBe("Raw value #123456, no primitive has this colour");
  });

  it("treats a raw transparent fill as the transparent primitive", async () => {
    const fig = await file();
    const set = componentSet(fig, "Control", {
      "State=Default": { surface: { fill: "#00000000" }, line: { stroke: P("neutral-200") } },
    });
    const r = scanComponent(await readComponentSet(fig, set));
    expect(r.tokens[0]).toMatchObject({ name: "control-surface-default", light: "transparent", dark: "transparent", needsDark: false });
  });

  it("adds the role when the component has a second variant property", async () => {
    const fig = await file();
    const set = componentSet(
      fig,
      "Icon button",
      {
        "Variant=Primary, State=Default": { surface: { fill: P("orange-700") } },
        "Variant=Primary, State=Hover": { surface: { fill: P("orange-700-aa") } },
        "Variant=Secondary, State=Default": { surface: { fill: S("surface-elevated") } },
      },
      { Variant: ["Primary", "Secondary"], State: ["Default", "Hover"] },
    );
    const r = scanComponent(await readComponentSet(fig, set));
    expect(r.tokens.map((t) => t.name)).toEqual(["iconbutton-surface-primary-default", "iconbutton-surface-primary-hover", "iconbutton-surface-secondary-default"]);
    expect(r.tokens[0].figmaPath).toBe("Interactive/Iconbutton/Surface/surface-primary-default");
  });

  it("blocks when the default variant lacks a part that another state has", async () => {
    const fig = await file();
    const set = componentSet(fig, "Control", {
      "State=Default": { surface: { fill: P("neutral-200") } },
      "State=Pressed": { surface: { fill: P("neutral-600") }, line: { stroke: S("line-default") } },
    });
    const r = scanComponent(await readComponentSet(fig, set));
    expect(r.status).toBe("blocked");
    expect(r.issues.find((i) => i.code === "scan.default")?.message).toBe(
      "The default variant has no line layer, so control-line-default has no value. Add a line layer to the default variant.",
    );
  });

  it("blocks when 2 layers with the same name in 1 state have different colours", async () => {
    const fig = await file();
    const set = componentSet(fig, "Control", { "State=Default": { surface: { fill: P("neutral-200") } } });
    const v = set.children[0] as NodeLike & { children: NodeLike[] };
    v.children.push(node("surface", { fills: [paint(fig, P("neutral-600"))] }));
    const r = scanComponent(await readComponentSet(fig, set));
    expect(codes(r.issues)).toContain("scan.conflict");
    expect(r.status).toBe("blocked");
  });
});

describe("component scan: what the plugin shows", () => {
  it("gives every layer its binding and colour in light and dark", async () => {
    const fig = await file();
    const input = await readComponentSet(fig, control(fig));
    const v = scanView(scanComponent(input), input.variables);
    const hover = v.layers.find((l) => l.state === "hover" && l.category === "surface")!;
    expect(hover).toMatchObject({ kind: "primitive", label: "neutral-200", paint: "Fill", sameInBoth: true, light: { hex: "#D1D1D1", label: "neutral-200" }, dark: { hex: "#D1D1D1" } });
    const line = v.layers.find((l) => l.state === "default" && l.category === "line")!;
    expect(line).toMatchObject({ kind: "semantic", label: "line-default", paint: "Stroke", light: { label: "neutral-700" }, dark: { label: "neutral-100" } });
    expect(v.tokens.map((t) => t.group)).toEqual(["Surface", "Surface", "Surface", "Line", "Line", "Content", "Content", "Content"]);
    expect(v.primitives.find((p) => p.label === "transparent")).toEqual({ label: "transparent", hex: "#00000000" });
  });

  it("previews the tokens, the JSON for Token Library and the CSS that Send to code writes", async () => {
    const fig = await file();
    const input = await readComponentSet(fig, control(fig));
    const done = donePreview(scanComponent(input), input.variables, DARK);
    expect(done.tokens).toHaveLength(8);
    expect(parseDtcg(done.json).tokens.map((t) => t.name)).toEqual(done.tokens.map((t) => t.name));
    expect(done.css).toContain(".control {");
    expect(done.css).toContain("--control-surface-hover: var(--color-neutral-200);");
    expect(done.css).toContain(".dark .control {");
    expect(done.css).toContain("--control-surface-hover: var(--color-neutral-600);");
  });
});

describe("component scan: the structure of the real control (UAL UI Sandbox, 23 Nov)", () => {
  /** Fill and stroke on the variant frame; the arrow is a vector inside an icon instance, with a mask. Disabled has no fill. */
  function realControl(fig: FakeFigma) {
    const variant = (state: string, fill: string | null, stroke: string, arrow: string): NodeLike => ({
      id: `N:${++n}`,
      name: `State=${state}`,
      type: "COMPONENT",
      variantProperties: { State: state },
      fills: fill ? [paint(fig, fill)] : [],
      strokes: [paint(fig, stroke)],
      children: [
        {
          id: `N:${++n}`,
          name: "Icon",
          type: "INSTANCE",
          fills: [],
          children: [
            { id: `N:${++n}`, name: "Bounding box", type: "RECTANGLE", isMask: true, fills: [paint(fig, "#D9D9D9")] },
            { id: `N:${++n}`, name: "icon", type: "VECTOR", fills: [paint(fig, arrow)] },
          ],
        },
      ],
    });
    return {
      id: `N:${++n}`,
      name: "Control",
      type: "COMPONENT_SET",
      componentPropertyDefinitions: { State: { type: "VARIANT", variantOptions: ["Default", "Hover", "Pressed", "Disabled"] } },
      children: [
        variant("Default", P("transparent"), S("line-default"), S("content-default")),
        variant("Hover", P("neutral-200"), S("line-default"), S("content-default")),
        variant("Pressed", P("neutral-600"), S("line-default"), S("content-on-inverse")),
        variant("Disabled", null, S("line-disabled"), P("neutral-400")),
      ],
    } as ComponentSetLike;
  }

  it("reads the frame's fill as surface, its stroke as line, and the arrow as content, and skips the mask", async () => {
    const fig = await file();
    const input = await readComponentSet(fig, realControl(fig));
    const r = scanComponent(input);
    expect(r.unknown).toEqual([]);
    expect(r.layers.filter((l) => l.paint.state === "default").map((l) => [l.paint.layerName, l.paint.paint, l.category])).toEqual([
      ["variant frame", "fills", "surface"],
      ["variant frame", "strokes", "line"],
      ["icon in Icon", "fills", "content"],
    ]);
    expect(r.tokens.map((t) => t.name)).toEqual([
      "control-surface-default",
      "control-surface-hover",
      "control-surface-pressed",
      "control-line-default",
      "control-line-disabled",
      "control-content-default",
      "control-content-pressed",
      "control-content-disabled",
    ]);
    expect(summarise(r, input.variables).sentence).toBe(
      "This creates 8 variables in Colour tokens / Interactive / Control, hides 5 from publishing, changes 11 layers across 4 variants, and adds 8 tokens to Token Library.",
    );
  });

  it("binds the frame and the arrow inside the icon to the new variables", async () => {
    const fig = await file();
    const set = realControl(fig);
    const input = await readComponentSet(fig, set);
    const r = scanComponent(input);
    await applyScan(fig, set, r, withChoices(r.tokens, DARK), input.variables);
    const hover = set.children[1];
    expect((hover.fills as PaintLike[])[0].boundVariables!.color!.id).toBe(fig.byName("Interactive/Control/Surface/surface-hover")!.id);
    const arrow = hover.children![0].children![1];
    expect((arrow.fills as PaintLike[])[0].boundVariables!.color!.id).toBe(fig.byName("Interactive/Control/Content/content-default")!.id);
    const mask = hover.children![0].children![0];
    expect((mask.fills as PaintLike[])[0].boundVariables).toBeUndefined();
  });

  it("stops when Colour tokens comes from a library", async () => {
    const fig = await file();
    // In a file that uses the library, Colour tokens and its variables are not local; they are read by id.
    const lib = fig.collections.find((c) => c.name === "Colour tokens")!;
    const localCollections = fig.collections.filter((c) => c !== lib);
    const localVariables = fig.variables.filter((v) => v.variableCollectionId !== lib.id);
    fig.getLocalVariableCollectionsAsync = async () => localCollections;
    fig.getLocalVariablesAsync = async () => localVariables;
    const r = scanComponent(await readComponentSet(fig, realControl(fig)));
    expect(r.status).toBe("blocked");
    expect(r.issues.find((i) => i.code === "scan.library")?.message).toMatch(/^Colour tokens is not a collection of this file/);
  });
});

describe("component scan: layers pasted from a file that uses the library", () => {
  /** The file plus a library copy of every variable (same names, other ids), and a control bound to the library copies. */
  async function pasted() {
    const fig = await file();
    const lib = await file();
    const id = (x: string) => `L${x}`;
    for (const c of lib.collections) c.id = id(c.id);
    for (const v of lib.variables) {
      v.id = id(v.id);
      v.variableCollectionId = id(v.variableCollectionId);
      v.remote = true;
      for (const [m, raw] of Object.entries(v.valuesByMode)) {
        delete v.valuesByMode[m];
        v.valuesByMode[id(m)] = typeof raw === "object" && raw && "type" in raw ? { type: "VARIABLE_ALIAS", id: id(raw.id) } : raw;
      }
    }
    for (const c of lib.collections) for (const m of c.modes) m.modeId = id(m.modeId);
    const localCollections = [...fig.collections];
    const localVariables = [...fig.variables];
    fig.collections.push(...lib.collections);
    fig.variables.push(...lib.variables);
    fig.getLocalVariableCollectionsAsync = async () => localCollections;
    fig.getLocalVariablesAsync = async () => fig.variables.filter((v) => !v.remote);
    const set = control(lib); // bound to the library copies
    return { fig, lib, set, localVariables };
  }

  it("points the new tokens at this file's primitives, and lists each primitive once", async () => {
    const { fig, set } = await pasted();
    const input = await readComponentSet(fig, set);
    const r = scanComponent(input);
    expect(r.status).toBe("draft");
    expect(r.layers.every((l) => l.source.kind !== "missing")).toBe(true);
    const v = scanView(r, input.variables);
    expect(v.primitives.filter((p) => p.label === "neutral-200")).toHaveLength(1);
    expect(checkDrafts(r, input.variables, DARK).ok).toBe(true);

    await applyScan(fig, set, r, withChoices(r.tokens, DARK), input.variables);
    const hover = fig.byName("Interactive/Control/Surface/surface-hover")!;
    expect(hover.remote).toBeFalsy();
    const targets = Object.values(hover.valuesByMode).map((raw) => fig.variables.find((x) => typeof raw === "object" && "id" in raw && x.id === raw.id)!);
    expect(targets.map((t) => [t.name, !!t.remote])).toEqual([
      ["neutral-200", false],
      ["neutral-600", false],
    ]);
  });
});
