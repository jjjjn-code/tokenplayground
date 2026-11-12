import { describe, expect, it } from "vitest";
import {
  checkName,
  cssVariableName,
  figmaPath,
  generateComponentTokens,
  isPublishedInFigma,
  normaliseComponentName,
  parseComponentTokenName,
} from "@/src/lib/tokens";
import { codes, colour } from "./helpers";

const comp = (name: string, component = name.split("-")[0]) => colour(name, "component", { ref: "orange-700" }, { component });

describe("component names", () => {
  it("strips spaces and capitals and says so", () => {
    expect(normaliseComponentName("Icon button")).toEqual({ slug: "iconbutton", changed: true });
    expect(normaliseComponentName("button")).toEqual({ slug: "button", changed: false });
  });

  it("parses names with and without a role", () => {
    expect(parseComponentTokenName("button-surface-primary-hover")).toEqual({ component: "button", category: "surface", role: "primary", state: "hover" });
    expect(parseComponentTokenName("tag-line-default")).toEqual({ component: "tag", category: "line", state: "default" });
    expect(parseComponentTokenName("button-surface")).toBeNull();
  });

  it("accepts valid names", () => {
    for (const n of ["button-surface-primary-hover", "tag-line-default", "iconbutton-icon-secondary-pressed"]) {
      expect(checkName(comp(n))).toEqual([]);
    }
  });

  it("rejects categories outside the closed list", () => {
    expect(codes(checkName(comp("button-background-primary-default")))).toContain("name.component.category");
  });

  it("rejects too few or too many segments", () => {
    expect(codes(checkName(comp("button-surface")))).toContain("name.component.segments");
    expect(codes(checkName(comp("button-surface-primary-hover-strong")))).toContain("name.component.segments");
  });

  it("rejects focus tokens", () => {
    expect(codes(checkName(comp("button-surface-primary-focus")))).toContain("name.component.focus");
  });

  it("rejects a name that does not start with its component", () => {
    expect(codes(checkName(comp("btn-surface-primary-default", "button")))).toContain("name.component.mismatch");
  });

  it("rejects capitals, spaces and the code prefix", () => {
    expect(codes(checkName(comp("Button-surface-default", "button")))).toContain("name.characters");
    expect(codes(checkName(colour("--color-orange-700", "primitive", "#FF5000")))).toContain("name.prefix");
    expect(codes(checkName(colour("color-orange-700", "primitive", "#FF5000")))).toContain("name.prefix");
  });
});

describe("primitive and semantic colour names", () => {
  it("accepts [colour]-[step] and plain colours", () => {
    for (const n of ["orange-700", "neutral-100", "orange-700-aa", "white", "black"]) {
      expect(checkName(colour(n, "primitive", "#FFFFFF"))).toEqual([]);
    }
  });

  it("rejects a primitive with a semantic name", () => {
    expect(codes(checkName(colour("surface-default", "primitive", "#FFFFFF")))).toContain("name.primitive.category");
  });

  it("accepts [category]-[variant]", () => {
    for (const n of ["surface-default", "content-on-inverse", "content-danger-on-inverse", "line-disabled"]) {
      expect(checkName(colour(n, "semantic", { ref: "white" }))).toEqual([]);
    }
  });

  it("requires -default to be written", () => {
    expect(codes(checkName(colour("surface", "semantic", { ref: "white" })))).toContain("name.semantic.variant");
  });

  it("rejects icon and unknown categories in the semantic layer", () => {
    expect(codes(checkName(colour("icon-default", "semantic", { ref: "white" })))).toContain("name.semantic.category");
    expect(codes(checkName(colour("hover", "semantic", { ref: "white" })))).toContain("name.semantic.category");
  });

  it("flags a new semantic variant without blocking it", () => {
    const issues = checkName(colour("surface-brand", "semantic", { ref: "white" }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "info", code: "name.semantic.new-variant" });
  });
});

describe("non-colour names (provisional)", () => {
  it("requires the type word at the start", () => {
    const t = { name: "gap-4", layer: "primitive" as const, kind: "spacing" as const, values: { light: "16px" }, status: "active" as const };
    expect(codes(checkName(t))).toContain("name.kind.prefix");
    expect(checkName({ ...t, name: "spacing-4" })).toEqual([]);
  });
});

describe("code names, Figma paths and publishing", () => {
  it("adds the --color- prefix for primitive and semantic colours", () => {
    expect(cssVariableName({ name: "orange-700", kind: "color", layer: "primitive" })).toBe("--color-orange-700");
    expect(cssVariableName({ name: "surface-default", kind: "color", layer: "semantic" })).toBe("--color-surface-default");
    expect(cssVariableName({ name: "button-surface-primary-hover", kind: "color", layer: "component" })).toBe("--button-surface-primary-hover");
  });

  it("builds the Figma path from the name", () => {
    expect(figmaPath(comp("button-surface-primary-hover"))).toBe("Interactive/Button/Surface/surface-primary-hover");
    expect(figmaPath(comp("tag-line-default"), "Display")).toBe("Display/Tag/Line/line-default");
  });

  it("publishes only -default component tokens", () => {
    expect(isPublishedInFigma(comp("button-surface-primary-default"))).toBe(true);
    expect(isPublishedInFigma(comp("button-surface-primary-hover"))).toBe(false);
    expect(isPublishedInFigma(colour("orange-700", "primitive", "#FF5000"))).toBe(true);
  });
});

describe("generating names from chips", () => {
  it("creates every combination, always including default", () => {
    const list = generateComponentTokens({ component: "Icon button", categories: ["surface", "content"], roles: ["primary"], states: ["hover"] });
    expect(list.map((t) => t.name)).toEqual([
      "iconbutton-surface-primary-default",
      "iconbutton-surface-primary-hover",
      "iconbutton-content-primary-default",
      "iconbutton-content-primary-hover",
    ]);
  });

  it("omits the role when none is picked, and skips unticked cells", () => {
    const list = generateComponentTokens({
      component: "tag",
      categories: ["surface", "line"],
      roles: [],
      states: ["default", "hover"],
      excluded: new Set(["line|hover"]),
    });
    expect(list.map((t) => t.name)).toEqual(["tag-surface-default", "tag-surface-hover", "tag-line-default"]);
  });
});
