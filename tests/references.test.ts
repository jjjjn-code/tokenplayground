import { describe, expect, it } from "vitest";
import { allDependants, directDependants, formatValue, indexTokens, resolveToken } from "@/src/lib/tokens";
import { colour, dummy } from "./helpers";

describe("resolving references", () => {
  const set = dummy();
  const index = indexTokens(set);

  it("resolves a semantic token in each mode", () => {
    expect(resolveToken(index, "surface-default", "light")).toMatchObject({ value: "#F6F6F6", chain: ["surface-default", "neutral-100"] });
    expect(resolveToken(index, "surface-default", "dark")).toMatchObject({ value: "#171717", chain: ["surface-default", "neutral-700"] });
  });

  it("follows a component token through a semantic token, using the same mode", () => {
    expect(resolveToken(index, "button-line-secondary-default", "light")).toMatchObject({
      value: "#171717",
      chain: ["button-line-secondary-default", "line-default", "neutral-700"],
    });
    expect(resolveToken(index, "button-line-secondary-default", "dark").value).toBe("#F6F6F6");
  });

  it("resolves every part of a composite token", () => {
    expect(resolveToken(index, "border-default", "dark").value).toEqual({ color: "#F6F6F6", width: "1px", style: "solid" });
  });

  it("resolves min and max, and reads a primitive's single value in any mode", () => {
    expect(resolveToken(index, "space-s-l", "min")).toMatchObject({ value: 16, chain: ["space-s-l", "spacing-min-s"] });
    expect(resolveToken(index, "space-s-l", "max").value).toBe(38);
    expect(resolveToken(index, "spacing-base", "value")).toMatchObject({ value: 38, chain: ["spacing-base", "spacing-max-l"] });
  });

  it("keeps references as references when shown", () => {
    const t = set.tokens.find((x) => x.name === "button-surface-primary-hover")!;
    expect(formatValue(t.values.light)).toBe("{orange-700-aa}");
  });

  it("reports missing tokens and loops", () => {
    const broken = indexTokens({
      tokens: [
        colour("surface-default", "semantic", { ref: "nothing-here" }),
        colour("content-default", "semantic", { ref: "line-default" }),
        colour("line-default", "semantic", { ref: "content-default" }),
      ],
    });
    expect(resolveToken(broken, "surface-default", "light").error).toEqual({ kind: "missing", ref: "nothing-here" });
    expect(resolveToken(broken, "content-default", "light").error).toEqual({
      kind: "cycle",
      chain: ["content-default", "line-default", "content-default"],
    });
  });
});

describe("dependants", () => {
  const set = dummy();

  it("lists tokens pointing directly to a token", () => {
    expect(directDependants(set, "orange-700-aa").sort()).toEqual(["button-surface-primary-hover", "button-surface-primary-pressed"]);
  });

  it("lists every token that depends on it, through other tokens", () => {
    const all = allDependants(set, "neutral-700");
    expect(all).toContain("line-default");
    expect(all).toContain("button-line-secondary-default");
    expect(all).toContain("border-default");
    expect(directDependants(set, "neutral-700")).not.toContain("button-line-secondary-default");
  });
});
