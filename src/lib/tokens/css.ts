/**
 * Turns tokens into the CSS developers use. Phase 2 uses it for the local
 * export; phase 3 uses the same functions to write files in a pull request.
 *
 * Parent file: primitives and semantic tokens. Default values (value, light,
 * default motion) in `@theme`, dark values in `.dark`, reduced motion values
 * in a `prefers-reduced-motion` media query. Fluid tokens (min and max) are
 * 1 `clamp()` value in `@theme`.
 * Component files: the component's own tokens, scoped to its class, with
 * dark values under `.dark .component`.
 * Everything sits inside the managed `tokens:start` and `tokens:end` block.
 */
import { fluidClamp, toPx } from "./fluid";
import { cssVariableName } from "./naming";
import { columnSetOf, formatValue, indexTokens, modesOf, resolveToken, valueInMode, type TokenIndex } from "./references";
import { BLOCK_END, BLOCK_START, componentCssPath, PARENT_CSS_PATH } from "./repo";
import { isComposite, isReference, type CompositeValue, type Mode, type SimpleValue, type Token, type TokenSet, type TokenValue } from "./types";

/** Where a value goes in the CSS: the default rule, the dark rule or the reduced motion media query. */
export type CssContext = "base" | "dark" | "reduced-motion";

/** The mode name used for a fluid token's single `clamp()` value. */
export const FLUID_MODE = "fluid";

const contextOf = (mode: Mode): CssContext => (mode === "dark" ? "dark" : mode === "reduced-motion" ? "reduced-motion" : "base");

export const REDUCED_MOTION_QUERY = "@media (prefers-reduced-motion: reduce)";

const INDENT = "  ";

/**
 * Sizes are plain numbers in Figma (pixels). In CSS they need a unit, so a
 * plain number for a size type is written in px. Font weights and line
 * heights stay plain numbers.
 */
function needsPx(t: Pick<Token, "kind" | "name">): boolean {
  if (t.kind === "spacing" || t.kind === "sizing" || t.kind === "radius") return true;
  if (t.kind === "typography") return t.name.startsWith("font-size") || t.name.startsWith("paragraph-spacing");
  if (t.kind === "border") return t.name.startsWith("border-width");
  return false;
}

function simpleToCss(v: SimpleValue, index: TokenIndex, t?: Pick<Token, "kind" | "name">): string {
  if (isReference(v)) {
    const target = index.get(v.ref);
    return target ? `var(${cssVariableName(target)})` : `/* missing token: ${v.ref} */`;
  }
  if (typeof v === "number" && t && needsPx(t) && v !== 0) return `${v}px`;
  return String(v);
}

/** CSS declarations for 1 token in 1 mode. Composite tokens may produce several lines. */
export function declarations(t: Token, v: TokenValue, index: TokenIndex): string[] {
  const name = cssVariableName(t);
  const note = t.status === "deprecated" ? " /* deprecated */" : "";
  if (!isComposite(v)) return [`${name}: ${simpleToCss(v as SimpleValue, index, t)};${note}`];

  const c = v as CompositeValue;
  const part = (k: string) => (c[k] === undefined ? undefined : simpleToCss(c[k], index));
  const join = (keys: string[]) => keys.map(part).filter(Boolean).join(" ");

  switch (t.kind) {
    case "border":
      return [`${name}: ${join(["width", "style", "color"])};${note}`];
    case "shadow":
      return [`${name}: ${join(["offsetX", "offsetY", "blur", "spread", "color"])};${note}`];
    case "typography": {
      // PROVISIONAL: Tailwind style, where the font size is the main value.
      const lines = [`${name}: ${part("fontSize") ?? "inherit"};${note}`];
      if (c.lineHeight !== undefined) lines.push(`${name}--line-height: ${part("lineHeight")};`);
      if (c.fontWeight !== undefined) lines.push(`${name}--font-weight: ${part("fontWeight")};`);
      if (c.fontFamily !== undefined) lines.push(`${name}--font-family: ${part("fontFamily")};`);
      return lines;
    }
    default:
      return Object.keys(c).map((k) => `${name}-${k}: ${part(k)};`);
  }
}

/** The `clamp()` line for a fluid token, with the 2 tokens it comes from in a comment. */
function fluidDeclarations(t: Token, index: TokenIndex): string[] {
  const name = cssVariableName(t);
  const note = t.status === "deprecated" ? " /* deprecated */" : "";
  const [min, max] = ["min", "max"].map((m) => toPx(resolveToken(index, t.name, m).value));
  const from = ["min", "max"].map((m) => `${m}: ${formatValue(valueInMode(t, m)).replace(/[{}]/g, "")}`).join(", ");
  if (min === null || max === null) return [`${name}: /* missing size (${from}) */;${note}`];
  return [`${name}: ${fluidClamp(min, max)};${note || ` /* ${from} */`}`];
}

export interface TokenOutput {
  context: CssContext;
  /** The token's mode, or `fluid` for a fluid token's clamp(). */
  mode: Mode;
  lines: string[];
}

/** Everything 1 token writes to the CSS, by context. */
export function tokenDeclarations(t: Token, index: TokenIndex): TokenOutput[] {
  if (columnSetOf(t) === "fluid") return [{ context: "base", mode: FLUID_MODE, lines: fluidDeclarations(t, index) }];
  const first = modesOf(t)[0].key;
  return modesOf(t)
    .filter((m, i) => i === 0 || t.values[m.key] !== undefined)
    // Reduced motion only overrides what changes, for example durations but not easing.
    .filter((m) => m.key !== "reduced-motion" || JSON.stringify(t.values[m.key]) !== JSON.stringify(t.values[first]))
    .map((m) => ({ context: contextOf(m.key), mode: m.key, lines: declarations(t, valueInMode(t, m.key), index) }));
}

const rule = (selector: string, lines: string[]) =>
  `${selector} {\n${lines.map((l) => INDENT + l).join("\n")}\n}`;

const media = (query: string, selector: string, lines: string[]) =>
  `${query} {\n${rule(selector, lines).split("\n").map((l) => INDENT + l).join("\n")}\n}`;

function linesByContext(tokens: Token[], index: TokenIndex): Record<CssContext, string[]> {
  const out: Record<CssContext, string[]> = { base: [], dark: [], "reduced-motion": [] };
  for (const t of tokens) for (const o of tokenDeclarations(t, index)) out[o.context].push(...o.lines);
  return out;
}

const wrap = (body: string) => `${BLOCK_START}\n${body}\n${BLOCK_END}`;

/** The managed block for the parent CSS file. */
export function parentCss(set: TokenSet): string {
  const index = indexTokens(set);
  const tokens = set.tokens.filter((t) => t.layer !== "component");
  const lines = linesByContext(tokens, index);
  const parts = [rule("@theme", lines.base)];
  if (lines.dark.length) parts.push(rule(".dark", lines.dark));
  if (lines["reduced-motion"].length) parts.push(media(REDUCED_MOTION_QUERY, ":root", lines["reduced-motion"]));
  return wrap(parts.join("\n\n"));
}

/** The managed block for 1 component's CSS file. */
export function componentCss(set: TokenSet, component: string): string {
  const index = indexTokens(set);
  const tokens = set.tokens.filter((t) => t.layer === "component" && t.component === component);
  const lines = linesByContext(tokens, index);
  const parts = [rule(`.${component}`, lines.base)];
  if (lines.dark.length) parts.push(rule(`.dark .${component}`, lines.dark));
  return wrap(parts.join("\n"));
}

export interface CssFile {
  path: string;
  block: string;
}

/** Every file the tool manages, with its generated block. */
export function cssFiles(set: TokenSet): CssFile[] {
  const components = [...new Set(set.tokens.filter((t) => t.layer === "component" && t.component).map((t) => t.component!))];
  return [
    { path: PARENT_CSS_PATH, block: parentCss(set) },
    ...components.map((c) => ({ path: componentCssPath(c), block: componentCss(set, c) })),
  ];
}

/**
 * Put a generated block into an existing file. Replaces the old managed
 * block when there is one, otherwise adds the block at the top. Anything
 * outside the block is never touched.
 */
export function replaceManagedBlock(existing: string, block: string): string {
  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END);
  if (start !== -1 && end > start) {
    return existing.slice(0, start) + block + existing.slice(end + BLOCK_END.length);
  }
  return existing.trim() ? `${block}\n\n${existing}` : `${block}\n`;
}
