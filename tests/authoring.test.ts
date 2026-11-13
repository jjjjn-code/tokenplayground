import { describe, expect, it } from "vitest";
import { componentNovelty, componentVocabulary, historyFor, namingGuide, renameToken, resolveToken, indexTokens, type HistoryEntry } from "@/src/lib/tokens";
import { dummy } from "./helpers";

describe("component vocabulary and guide", () => {
  it("lists what a component uses", () => {
    expect(componentVocabulary(dummy(), "tag")).toEqual({ categories: ["surface", "content", "line"], roles: [], states: ["default"] });
    expect(componentVocabulary(dummy(), "button").roles).toEqual(["primary", "secondary"]);
  });

  it("gives a 1-line guide per group", () => {
    expect(namingGuide(dummy(), "component", "color", "tag")).toBe(
      "Pattern: tag-[category]-[state]. In tag today: Categories: surface, content, line; no roles; states: default.",
    );
    expect(namingGuide(dummy(), "semantic", "color")).toContain("[category]-[variant]");
  });
});

describe("novelty", () => {
  const set = dummy();
  it("is null for a name that fits what the component has", () => {
    expect(componentNovelty(set, "button", "button-content-secondary-hover")).toBeNull();
  });
  it("spots a new state, role and category", () => {
    expect(componentNovelty(set, "tag", "tag-surface-hover")).toMatchObject({ state: "hover" });
    expect(componentNovelty(set, "button", "button-surface-tertiary-default")).toMatchObject({ role: "tertiary" });
    expect(componentNovelty(set, "tag", "tag-icon-default")).toMatchObject({ category: "icon" });
  });
  it("spots a change of pattern, adding a role to a component without roles", () => {
    expect(componentNovelty(set, "tag", "tag-surface-primary-default")).toMatchObject({ roleShapeChanges: true });
  });
  it("leaves plain naming errors to the rules", () => {
    expect(componentNovelty(set, "tag", "tag-background-default")).toBeNull();
  });
});

describe("renameToken", () => {
  it("renames and repoints references, keeping them as references", () => {
    const { set, repointed } = renameToken(dummy(), "line-default", "line-strong");
    expect(set.tokens.some((t) => t.name === "line-default")).toBe(false);
    expect(repointed).toEqual(["button-line-secondary-default"]);
    const btn = set.tokens.find((t) => t.name === "button-line-secondary-default")!;
    expect(btn.values).toEqual({ light: { ref: "line-strong" }, dark: { ref: "line-strong" } });
    expect(resolveToken(indexTokens(set), btn.name, "light").value).toBe("#171717");
  });
  it("repoints references inside composite values", () => {
    const { set } = renameToken(dummy(), "font-size-16", "font-size-body");
    expect(set.tokens.find((t) => t.name === "text-body")!.values.light).toMatchObject({ fontSize: { ref: "font-size-body" } });
  });
});

describe("history across a rename", () => {
  it("keeps the earlier history under the new name", () => {
    const log: HistoryEntry[] = [
      { id: "1", token: "surface-brand", action: "created", at: "2026-11-13T09:00:00Z", by: "jane" },
      { id: "2", token: "surface-accent", action: "renamed", from: "surface-brand", at: "2026-11-13T10:00:00Z", by: "jane" },
    ];
    expect(historyFor(log, "surface-accent").map((e) => e.action)).toEqual(["created", "renamed"]);
  });
});

describe("messages people asked for", async () => {
  const { checkName, normaliseTokenInput, componentNovelty: novelty, noveltyMessage } = await import("@/src/lib/tokens");
  const { colour } = await import("./helpers");
  const msg = (t: Parameters<typeof checkName>[0]) => checkName(t)[0]?.message;

  it("tidies typing: lower case, spaces and underscores become hyphens", () => {
    expect(normaliseTokenInput("Surface Brand")).toBe("surface-brand");
    expect(normaliseTokenInput("orange_700")).toBe("orange-700");
    expect(normaliseTokenInput("--color-orange-700")).toBe("--color-orange-700");
    expect(normaliseTokenInput("tag--surface")).toBe("tag-surface");
  });

  it("asks 'Do you mean ...?' for common category words", () => {
    expect(msg(colour("background-brand", "semantic", { ref: "white" }))).toBe('"background" is not a category in our system. Do you mean "surface"?');
    expect(msg(colour("tag-border-default", "component", { ref: "white" }, { component: "tag" }))).toBe('"border" is not a category in our system. Do you mean "line"?');
    expect(msg(colour("shade-brand", "semantic", { ref: "white" }))).toBe('"shade" is not a category. Use surface, content or line.');
  });

  it("says which part is missing or extra", () => {
    expect(msg(colour("tag-surface", "component", { ref: "white" }, { component: "tag" }))).toBe("The state is missing. Add a state to the end of the name. Example: tag-surface-default.");
    expect(msg(colour("button-surface-primary-hover-strong", "component", { ref: "white" }, { component: "button" }))).toBe(
      'Token names use the format [component]-[category]-[role]-[state]. This name has 1 extra part: "strong". Ask the design system team if you need help.',
    );
  });

  it("names the symbols to remove", () => {
    expect(msg(colour("orange&700", "primitive", "#FF5000"))).toBe('Use only letters, numbers and hyphens. Remove "&".');
  });

  it("allows a new state with a note, but sends new roles and categories to the guided flow", () => {
    const set = dummy();
    expect(novelty(set, "tag", "tag-surface-hover")).toMatchObject({ state: "hover", blocking: false });
    expect(novelty(set, "button", "button-surface-tertiary-default")).toMatchObject({ role: "tertiary", blocking: true });
    expect(novelty(set, "tag", "tag-icon-default")).toMatchObject({ category: "icon", blocking: true });
    const missingRole = novelty(set, "button", "button-surface-hover")!;
    expect(noveltyMessage("button", missingRole, "button-surface-hover")).toBe(
      "Each button token has a role, such as primary or secondary. Add a role after the category. Example: button-surface-primary-hover.",
    );
  });
});
