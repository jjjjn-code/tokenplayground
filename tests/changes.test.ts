import { describe, expect, it } from "vitest";
import { branchName, changelogMarkdown, diffSets, filesTouched, mergeEdits, type Token } from "@/src/lib/tokens";
import { colour, dummy } from "./helpers";

const edit = (t: Token, patch: Partial<Token>): Token => ({ ...t, ...patch });

describe("diffSets", () => {
  const base = dummy();

  it("finds added, changed and removed tokens with their files", () => {
    const after = structuredClone(base);
    after.tokens = after.tokens.filter((t) => t.name !== "tag-line-default");
    const red = after.tokens.find((t) => t.name === "red-700")!;
    red.values.light = "#B00000";
    after.tokens.push(colour("button-surface-primary-selected", "component", { ref: "orange-700" }, { component: "button" }));
    const changes = diffSets(base, after);
    expect(changes.map((c) => [c.type, c.name, c.file])).toEqual([
      ["changed", "red-700", "styles/colors.css"],
      ["added", "button-surface-primary-selected", "components/button/button.css"],
      ["removed", "tag-line-default", "components/tag/tag.css"],
    ]);
    expect(filesTouched(changes)).toEqual(["styles/colors.css", "components/button/button.css", "components/tag/tag.css"]);
  });

  it("ignores changes that do not reach the CSS, such as a description", () => {
    const after = structuredClone(base);
    after.tokens[0].description = "New note";
    expect(diffSets(base, after)).toEqual([]);
  });

  it("counts a status change", () => {
    const after = structuredClone(base);
    after.tokens.find((t) => t.name === "blue-400")!.status = "deprecated";
    expect(diffSets(base, after).map((c) => c.name)).toEqual(["blue-400"]);
  });
});

describe("changelog", () => {
  it("follows the PRD format", () => {
    const base = dummy();
    const after = structuredClone(base);
    after.tokens.find((t) => t.name === "red-700")!.values.light = "#B00000";
    after.tokens.push(colour("button-surface-primary-selected", "component", { ref: "orange-700-aa" }, { component: "button", values: { light: { ref: "orange-700-aa" }, dark: { ref: "orange-400" } } }));
    const md = changelogMarkdown({ title: "button hover states", summary: "new selected state.", author: "jane", changes: diffSets(base, after) });
    expect(md).toContain("## Token update: button hover states");
    expect(md).toContain("Summary (written by the author): new selected state.");
    expect(md).toContain("| Change | Token | Before | After | File |");
    expect(md).toContain("| Changed | red-700 | #A80000 | #B00000 | styles/colors.css |");
    expect(md).toContain("| Added | button-surface-primary-selected | none | orange-700-aa / orange-400 | components/button/button.css |");
    expect(md).toContain("2 tokens: 1 added, 1 changed.");
  });
});

describe("branchName", () => {
  it("is dated and readable", () => {
    expect(branchName("Button hover states!", new Date("2026-11-12T10:00:00Z"))).toBe("tokens/2026-11-12-button-hover-states");
    expect(branchName("", new Date("2026-11-12T10:00:00Z"))).toBe("tokens/2026-11-12-update");
  });
});

describe("mergeEdits after a conflict", () => {
  const base = { tokens: [colour("white", "primitive", "#FFFFFF"), colour("black", "primitive", "#000000"), colour("red-700", "primitive", "#A80000")] };

  it("keeps their changes and your changes when they touch different tokens", () => {
    const mine = { tokens: base.tokens.map((t) => (t.name === "white" ? edit(t, { values: { light: "#FEFEFE" } }) : t)) };
    const theirs = { tokens: [...base.tokens.map((t) => (t.name === "black" ? edit(t, { values: { light: "#010101" } }) : t)), colour("blue-400", "primitive", "#0000FF")] };
    const { merged, conflicts } = mergeEdits(base, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.tokens.map((t) => `${t.name}:${t.values.light}`)).toEqual(["white:#FEFEFE", "black:#010101", "red-700:#A80000", "blue-400:#0000FF"]);
  });

  it("reports tokens you both changed and keeps yours", () => {
    const mine = { tokens: base.tokens.map((t) => (t.name === "red-700" ? edit(t, { values: { light: "#B00000" } }) : t)) };
    const theirs = { tokens: base.tokens.map((t) => (t.name === "red-700" ? edit(t, { values: { light: "#C00000" } }) : t)) };
    const { merged, conflicts } = mergeEdits(base, mine, theirs);
    expect(conflicts).toEqual(["red-700"]);
    expect(merged.tokens.find((t) => t.name === "red-700")!.values.light).toBe("#B00000");
  });

  it("keeps your new tokens", () => {
    const mine = { tokens: [...base.tokens, colour("green-700", "primitive", "#008400")] };
    const { merged, conflicts } = mergeEdits(base, mine, base);
    expect(conflicts).toEqual([]);
    expect(merged.tokens.map((t) => t.name)).toContain("green-700");
  });
});

describe("line diff", () => {
  it("marks added and removed lines", async () => {
    const { lineDiff, diffHunks } = await import("@/src/lib/tokens");
    const d = lineDiff("a\nb\nc\nd\ne\nf\ng", "a\nb\nc\nD\ne\nf\ng");
    expect(d.filter((l) => l.type !== " ")).toEqual([{ type: "-", text: "d" }, { type: "+", text: "D" }]);
    const h = diffHunks(d, 1);
    expect(h.map((l) => (l ? l.type + l.text : "…"))).toEqual([" c", "-d", "+D", " e"]);
    expect(diffHunks(lineDiff("1\n2\n3\n4\n5\n6", "1\nX\n3\n4\n5\nY"), 0).map((l) => (l ? l.type + l.text : "…"))).toEqual(["-2", "+X", "…", "-6", "+Y"]);
  });
});
