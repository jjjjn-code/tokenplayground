import { describe, expect, it } from "vitest";
import drift from "@/fixtures/drift-cases.json";
import log from "@/data/dummy/history.json";
import { checkHistoryEntry, historyFor, isReference, lastChange, validateTokenSet, type HistoryEntry, type Kind } from "@/src/lib/tokens";
import { dummy } from "./helpers";

const set = dummy();
const find = (n: string) => set.tokens.find((t) => t.name === n);

describe("dummy token set", () => {
  it("passes every rule with no errors", () => {
    expect(validateTokenSet(set).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("has no warnings apart from the deliberate deprecated token", () => {
    expect(validateTokenSet(set).filter((i) => i.severity === "warning")).toEqual([]);
    expect(find("purple-400")?.status).toBe("deprecated");
  });

  it("covers every layer", () => {
    for (const layer of ["primitive", "semantic", "component"]) expect(set.tokens.some((t) => t.layer === layer)).toBe(true);
  });

  it("covers every token type", () => {
    const kinds: Kind[] = ["color", "spacing", "sizing", "typography", "radius", "border", "shadow", "motion"];
    for (const k of kinds) expect(set.tokens.some((t) => t.kind === k), k).toBe(true);
  });

  it("covers references, composites and every column set", () => {
    expect(set.tokens.some((t) => isReference(t.values.light))).toBe(true);
    expect(set.tokens.some((t) => isReference(t.values.value))).toBe(true); // a primitive pointing to a primitive
    expect(set.tokens.some((t) => t.values.dark !== undefined)).toBe(true);
    expect(set.tokens.some((t) => t.values.min !== undefined && t.values.max !== undefined)).toBe(true);
    expect(set.tokens.some((t) => t.values["reduced-motion"] !== undefined)).toBe(true);
    expect(set.tokens.some((t) => typeof t.values.light === "object" && !isReference(t.values.light))).toBe(true);
  });

  it("follows the groups of the Figma file", () => {
    for (const n of ["spacing-min-s", "spacing-max-negative-s", "grid-min-gutter", "font-size-max-step-0", "duration-fast", "space-s-m", "space-s-l", "paragraph-spacing-step-0"]) {
      expect(find(n), n).toBeDefined();
    }
    expect(find("spacing-max-3xs")?.figma).toBe("spacing/max/3xs");
  });

  it("covers components with roles and without", () => {
    expect(find("button-surface-primary-hover")).toBeDefined();
    expect(find("tag-surface-default")).toBeDefined();
  });

  it("holds the design system values the drift cases test against", () => {
    expect(drift.cases).toHaveLength(6);
    expect(find("red-700")?.values.value).toBe("#A80000"); // 01
    expect(find("orange-700-aa")?.values.value).toBe("#D33704"); // 02
    for (const n of ["line-inverse", "line-disabled", "line-danger"]) expect(find(n)).toBeDefined(); // 03
    expect(find("line-default")?.layer).toBe("semantic"); // 04
    expect(find("hover")).toBeUndefined(); // 05
    expect(find("active")).toBeUndefined();
  });

  it("uses the corrected light references, not the Colour page labels", () => {
    expect(find("content-danger")?.values).toEqual({ light: { ref: "red-700" }, dark: { ref: "red-400" } });
    expect(find("surface-default")?.values).toEqual({ light: { ref: "neutral-100" }, dark: { ref: "neutral-700" } });
  });
});

describe("dummy history", () => {
  const entries = log as HistoryEntry[];

  it("has complete entries", () => {
    for (const e of entries) expect(checkHistoryEntry(e)).toEqual([]);
  });

  it("gives a timeline and last change per token", () => {
    expect(historyFor(entries, "button-surface-primary-hover").map((e) => e.action)).toEqual(["created", "edited"]);
    expect(lastChange(entries, "button-surface-primary-hover")?.id).toBe("h-0002");
  });

  it("requires a reason for a decline", () => {
    const e: HistoryEntry = { id: "x", token: "red-700", action: "declined", at: "2026-11-12T12:00:00Z", by: "dummy-designer", prUrl: "https://example.com/pr/1" };
    expect(checkHistoryEntry(e).map((i) => i.code)).toEqual(["history.reason"]);
  });
});
