import { describe, expect, it } from "vitest";
import log from "@/data/dummy/history.json";
import { simulateDeveloperDrift } from "@/src/lib/git/drift";
import { seedFiles } from "@/src/lib/git/sync";
import { applyDecisions, findDiscrepancies, parseTokenCss, pullFiles, restoreChangelog, type HistoryEntry } from "@/src/lib/tokens";
import { dummy } from "./helpers";

const codeFiles = (drift: boolean) => {
  const { code } = seedFiles(dummy(), log as HistoryEntry[]);
  return drift ? simulateDeveloperDrift(code) : code;
};
const pick = (files: Record<string, string>) => Object.fromEntries(pullFiles(dummy()).map((p) => [p, files[p] ?? null]));

describe("parseTokenCss", () => {
  it("reads light, dark and component scopes, ignoring developer styles", () => {
    const decls = parseTokenCss("components/button/button.css", codeFiles(false)["components/button/button.css"]);
    expect(decls.find((d) => d.name === "--button-surface-primary-hover" && d.mode === "dark")).toMatchObject({ value: "var(--color-orange-400)", scope: "button" });
    expect(decls.some((d) => d.name === "display")).toBe(false);
  });
});

describe("findDiscrepancies", () => {
  it("finds nothing when the code matches the tool", () => {
    expect(findDiscrepancies(dummy(), pick(codeFiles(false)))).toEqual([]);
  });

  it("finds every drift case from the PRD", () => {
    const found = findDiscrepancies(dummy(), pick(codeFiles(true)));
    const byId = Object.fromEntries(found.map((d) => [d.id, d]));
    expect(byId["red-700"]).toMatchObject({ kind: "changed", differences: [{ mode: "light", tool: "#A80000", code: "#FF3737" }] }); // 01
    expect(byId["orange-700-aa"].kind).toBe("missing"); // 02
    for (const n of ["line-inverse", "line-disabled", "line-danger"]) expect(byId[n].kind).toBe("missing"); // 03
    expect(byId["line-default"]).toMatchObject({ kind: "renamed", codeName: "--line-default", expectedCodeName: "--color-line-default" }); // 04
    const extras = found.filter((d) => d.kind === "extra").map((d) => d.suggestedName).sort();
    expect(extras).toEqual(["active", "hover"]); // 05
    expect(byId["button-surface-primary-hover"]).toMatchObject({ kind: "flattened", differences: [{ mode: "light", tool: "var(--color-orange-700-aa)", code: "#D33704" }] });
    expect(found).toHaveLength(9);
  });
});

describe("applyDecisions", () => {
  const found = () => findDiscrepancies(dummy(), pick(codeFiles(true)));

  it("accepting a changed value updates the tool and the baseline", () => {
    const res = applyDecisions(dummy(), found(), [{ id: "red-700", decision: "accept", reason: "Developers chose this red." }]);
    expect(res.set.tokens.find((t) => t.name === "red-700")!.values.light).toBe("#FF3737");
    expect(res.baseline["red-700"]!.values.light).toBe("#FF3737");
    expect(res.history[0]).toMatchObject({ token: "red-700", action: "accepted", reason: "Developers chose this red." });
  });

  it("accepting a flattened value keeps a raw value only when the code has one", () => {
    const res = applyDecisions(dummy(), found(), [{ id: "button-surface-primary-hover", decision: "accept", reason: "x" }]);
    expect(res.set.tokens.find((t) => t.name === "button-surface-primary-hover")!.values).toEqual({ light: "#D33704", dark: { ref: "orange-400" } });
  });

  it("accepting an extra token creates it, with a name the person can change", () => {
    const d = found().find((x) => x.suggestedName === "hover")!;
    const res = applyDecisions(dummy(), found(), [{ id: d.id, decision: "accept", reason: "Keep it", name: "surface-hover" }]);
    expect(res.set.tokens.find((t) => t.name === "surface-hover")).toMatchObject({ layer: "semantic", values: { light: { ref: "orange-700" }, dark: { ref: "orange-700" } } });
  });

  it("refuses to remove a token that other tokens refer to", () => {
    const res = applyDecisions(dummy(), found(), [{ id: "orange-700-aa", decision: "accept", reason: "Gone" }]);
    expect(res.problems[0].message).toContain("refer to orange-700-aa");
    expect(res.set.tokens.some((t) => t.name === "orange-700-aa")).toBe(true);
  });

  it("does not accept a wrong code name, and needs a reason", () => {
    const res = applyDecisions(dummy(), found(), [
      { id: "line-default", decision: "accept", reason: "x" },
      { id: "red-700", decision: "decline", reason: " " },
    ]);
    expect(res.problems.map((p) => p.id)).toEqual(["line-default", "red-700"]);
  });

  it("declining records the decision and feeds the restore pull request", () => {
    const res = applyDecisions(dummy(), found(), [{ id: "red-700", decision: "decline", reason: "Brand red is #A80000." }]);
    expect(res.set.tokens.find((t) => t.name === "red-700")!.values.light).toBe("#A80000");
    expect(res.history[0]).toMatchObject({ action: "declined", token: "red-700" });
    const md = restoreChangelog(res.declined, "jane");
    expect(md).toContain("| Changed in code | red-700 | Light: #FF3737 | Light: #A80000 | Brand red is #A80000. | styles/colors.css |");
  });
});
