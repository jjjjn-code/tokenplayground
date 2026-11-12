import { describe, expect, it } from "vitest";
import usage from "@/fixtures/component-usage.json";
import { checkBeforeSave, checkComponentMix, validateTokenSet, type Token } from "@/src/lib/tokens";
import { codes, colour, dummy } from "./helpers";

const prims: Token[] = [
  colour("orange-700", "primitive", "#FF5000"),
  colour("orange-400", "primitive", "#FF8500"),
  colour("white", "primitive", "#FFFFFF"),
];

describe("references and layers", () => {
  it("blocks a primitive that points to another token", () => {
    const set = { tokens: [...prims, colour("red-700", "primitive", { ref: "orange-700" })] };
    expect(codes(validateTokenSet(set))).toContain("ref.primitive");
  });

  it("blocks pointing upwards or sideways between layers", () => {
    const set = {
      tokens: [
        ...prims,
        colour("surface-default", "semantic", { ref: "white" }),
        colour("surface-elevated", "semantic", { ref: "surface-default" }),
        colour("tag-surface-default", "component", { ref: "white" }, { component: "tag" }),
        colour("content-default", "semantic", { ref: "tag-surface-default" }),
      ],
    };
    const issues = validateTokenSet(set).filter((i) => i.code === "ref.layer");
    expect(issues.map((i) => i.token).sort()).toEqual(["content-default", "surface-elevated"]);
  });

  it("blocks a reference to a token that does not exist", () => {
    expect(codes(validateTokenSet({ tokens: [colour("surface-default", "semantic", { ref: "grey-500" })] }))).toContain("ref.missing");
  });

  it("blocks a colour token pointing to a spacing token", () => {
    const set = {
      tokens: [
        { name: "spacing-4", layer: "primitive" as const, kind: "spacing" as const, values: { light: "16px" }, status: "active" as const },
        colour("surface-default", "semantic", { ref: "spacing-4" }),
      ],
    };
    expect(codes(validateTokenSet(set))).toContain("ref.kind");
  });

  it("warns when a semantic token holds a raw value instead of a reference", () => {
    const issues = validateTokenSet({ tokens: [colour("surface-default", "semantic", "#F6F6F6")] });
    expect(issues.find((i) => i.code === "ref.raw")?.severity).toBe("warning");
  });

  it("warns when something points to a deprecated token", () => {
    const set = { tokens: [colour("purple-400", "primitive", "#7A00FF", { status: "deprecated" }), colour("surface-brand", "semantic", { ref: "purple-400" })] };
    expect(codes(validateTokenSet(set))).toContain("ref.deprecated");
  });

  it("blocks a raw colour that is not a hex value", () => {
    expect(codes(validateTokenSet({ tokens: [colour("orange-700", "primitive", "orange")] }))).toContain("value.colour");
  });
});

describe("modes", () => {
  it("blocks a colour token with no dark value", () => {
    const t: Token = { ...colour("surface-default", "semantic", { ref: "white" }), values: { light: { ref: "white" } } };
    expect(codes(validateTokenSet({ tokens: [...prims, t] }))).toContain("mode.missing");
  });

  it("blocks a dark value on a primitive", () => {
    const t: Token = { ...colour("orange-700", "primitive", "#FF5000"), values: { light: "#FF5000", dark: "#FF8500" } };
    expect(codes(validateTokenSet({ tokens: [t] }))).toContain("mode.primitive");
  });

  it("notes when a token is the same colour in both modes", () => {
    const issues = validateTokenSet({ tokens: [...prims, colour("surface-inverse", "semantic", { ref: "white" })] });
    expect(issues.find((i) => i.code === "mode.same")?.severity).toBe("info");
  });
});

describe("components", () => {
  const button = (name: string) => colour(name, "component", { ref: "orange-700" }, { component: "button" });

  it("requires a -default token for every category and role", () => {
    const set = { tokens: [...prims, button("button-surface-primary-default"), button("button-content-primary-hover")] };
    const issue = validateTokenSet(set).find((i) => i.code === "component.default");
    expect(issue?.message).toContain("button-content-primary");
  });

  it("warns when some tokens have a role and others do not", () => {
    const set = { tokens: [...prims, button("button-surface-primary-default"), button("button-content-default")] };
    expect(codes(validateTokenSet(set))).toContain("component.roles");
  });

  it("blocks component tokens for types other than colour", () => {
    const t: Token = { name: "button-spacing-default", layer: "component", component: "button", kind: "spacing", values: { light: "16px" }, status: "active" };
    expect(codes(validateTokenSet({ tokens: [t] }))).toContain("layer.kind");
  });

  it("applies the never-a-mix rule to code usage", () => {
    const issues = checkComponentMix(dummy(), usage.usage);
    expect(issues.filter((i) => i.code === "component.mix").map((i) => i.component)).toEqual(["tag"]);
    expect(issues.filter((i) => i.code === "component.primitive").map((i) => i.component)).toEqual(["card"]);
    expect(issues.some((i) => i.component === "button" || i.component === "alert")).toBe(false);
  });
});

describe("check before save (F2)", () => {
  it("blocks a duplicate of an existing token", () => {
    const res = checkBeforeSave(dummy(), [colour("surface-default", "semantic", { ref: "white" })]);
    expect(res.ok).toBe(false);
    expect(codes(res.issues)).toContain("name.duplicate");
  });

  it("allows an edit of an existing token when it is being replaced", () => {
    const edit = { ...colour("surface-default", "semantic", { ref: "white" }), values: { light: { ref: "white" }, dark: { ref: "neutral-800" } } };
    expect(checkBeforeSave(dummy(), [edit], ["surface-default"]).ok).toBe(true);
  });

  it("allows a valid new component and reports its info notes", () => {
    const res = checkBeforeSave(dummy(), [
      colour("chip-surface-default", "component", { ref: "neutral-100" }, { component: "chip", values: { light: { ref: "neutral-100" }, dark: { ref: "neutral-800" } } }),
    ]);
    expect(res.ok).toBe(true);
    expect(codes(res.issues)).toContain("component.no-role");
  });

  it("blocks an invalid name", () => {
    const res = checkBeforeSave(dummy(), [colour("chip-background-default", "component", { ref: "white" }, { component: "chip" })]);
    expect(res.ok).toBe(false);
  });

  it("does not report problems from unrelated tokens", () => {
    const res = checkBeforeSave(dummy(), [colour("surface-brand", "semantic", { ref: "orange-700" }, { values: { light: { ref: "orange-700" }, dark: { ref: "orange-400" } } })]);
    expect(res.issues.every((i) => i.token === "surface-brand")).toBe(true);
  });
});

describe("empty values and category checks", () => {
  it("reports a missing value once, naming the modes", () => {
    const t: Token = { ...colour("surface-brand", "semantic", ""), values: { light: "", dark: "" } };
    const issues = validateTokenSet({ tokens: [t] });
    expect(issues.filter((i) => i.code === "value.empty")).toHaveLength(1);
    expect(issues.find((i) => i.code === "value.empty")?.message).toContain("light and dark");
    expect(codes(issues)).not.toContain("mode.same");
  });

  it("warns when a component token points to a semantic token of another category", () => {
    const set = dummy();
    const bad = colour("chip-surface-default", "component", { ref: "content-default" }, { component: "chip" });
    expect(codes(checkBeforeSave(set, [bad]).issues)).toContain("ref.category");
    const icon = colour("chip-icon-default", "component", { ref: "content-default" }, { component: "chip" });
    expect(codes(checkBeforeSave(set, [icon]).issues)).not.toContain("ref.category");
  });
});
