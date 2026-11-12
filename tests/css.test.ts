import { describe, expect, it } from "vitest";
import { BLOCK_END, BLOCK_START, componentCss, cssFiles, parentCss, replaceManagedBlock } from "@/src/lib/tokens";
import { colour, dummy } from "./helpers";

describe("CSS output", () => {
  const set = dummy();

  it("writes primitives and semantic light values in @theme, dark values in .dark", () => {
    const css = parentCss(set);
    expect(css.startsWith(BLOCK_START)).toBe(true);
    expect(css.endsWith(BLOCK_END)).toBe(true);
    expect(css).toContain("@theme {\n  --color-white: #FFFFFF;");
    expect(css).toContain("--color-surface-default: var(--color-neutral-100);");
    expect(css).toContain(".dark {\n  --color-surface-default: var(--color-neutral-700);");
    expect(css).toContain("--color-purple-400: #7A00FF; /* deprecated */");
    expect(css).not.toContain("button-");
  });

  it("keeps references as var() and never writes the raw value", () => {
    const css = parentCss(set);
    expect(css).not.toMatch(/--color-surface-default: #/);
  });

  it("writes composite tokens", () => {
    const css = parentCss(set);
    expect(css).toContain("--border-default: var(--border-width-1) solid var(--color-neutral-700);");
    expect(css).toContain("--shadow-elevated: 0px 2px 8px 0px var(--color-black);");
    expect(css).toContain("--text-body: var(--font-size-16);");
    expect(css).toContain("--text-body--line-height: var(--line-height-145);");
  });

  it("scopes component tokens to the component class, matching the repo contract", () => {
    const css = componentCss(set, "button");
    expect(css).toContain(".button {\n  --button-surface-primary-default: var(--color-orange-700);\n  --button-surface-primary-hover: var(--color-orange-700-aa);");
    expect(css).toContain(".dark .button {\n  --button-surface-primary-default: var(--color-orange-700);\n  --button-surface-primary-hover: var(--color-orange-400);");
    expect(css).toContain("--button-line-secondary-default: var(--color-line-default);");
  });

  it("lists 1 parent file and 1 file per component", () => {
    expect(cssFiles(set).map((f) => f.path)).toEqual(["styles/colors.css", "components/button/button.css", "components/tag/tag.css"]);
  });

  it("marks a missing reference instead of failing", () => {
    const css = parentCss({ tokens: [colour("surface-default", "semantic", { ref: "nothing" })] });
    expect(css).toContain("/* missing token: nothing */");
  });
});

describe("managed block", () => {
  const block = `${BLOCK_START}\n.tag {}\n${BLOCK_END}`;

  it("replaces only the managed block", () => {
    const file = `${BLOCK_START}\nold\n${BLOCK_END}\n\n.tag { padding: 4px; }\n`;
    expect(replaceManagedBlock(file, block)).toBe(`${block}\n\n.tag { padding: 4px; }\n`);
  });

  it("adds the block at the top when there is none", () => {
    expect(replaceManagedBlock(".tag { padding: 4px; }\n", block)).toBe(`${block}\n\n.tag { padding: 4px; }\n`);
  });
});
