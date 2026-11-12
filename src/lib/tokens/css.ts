/**
 * Turns tokens into the CSS developers use. Phase 2 uses it for the local
 * export; phase 3 uses the same functions to write files in a pull request.
 *
 * Parent file: primitives and semantic tokens. Light values in `@theme`,
 * dark values in `.dark`.
 * Component files: the component's own tokens, scoped to its class, with
 * dark values under `.dark .component`.
 * Everything sits inside the managed `tokens:start` and `tokens:end` block.
 */
import { cssVariableName } from "./naming";
import { indexTokens, type TokenIndex } from "./references";
import { BLOCK_END, BLOCK_START, componentCssPath, PARENT_CSS_PATH } from "./repo";
import { isComposite, isReference, type CompositeValue, type SimpleValue, type Token, type TokenSet, type TokenValue } from "./types";

const INDENT = "  ";

function simpleToCss(v: SimpleValue, index: TokenIndex): string {
  if (isReference(v)) {
    const target = index.get(v.ref);
    return target ? `var(${cssVariableName(target)})` : `/* missing token: ${v.ref} */`;
  }
  return String(v);
}

/** CSS declarations for 1 token in 1 mode. Composite tokens may produce several lines. */
export function declarations(t: Token, v: TokenValue, index: TokenIndex): string[] {
  const name = cssVariableName(t);
  const note = t.status === "deprecated" ? " /* deprecated */" : "";
  if (!isComposite(v)) return [`${name}: ${simpleToCss(v as SimpleValue, index)};${note}`];

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

const rule = (selector: string, lines: string[]) =>
  `${selector} {\n${lines.map((l) => INDENT + l).join("\n")}\n}`;

const wrap = (body: string) => `${BLOCK_START}\n${body}\n${BLOCK_END}`;

/** The managed block for the parent CSS file. */
export function parentCss(set: TokenSet): string {
  const index = indexTokens(set);
  const tokens = set.tokens.filter((t) => t.layer !== "component");
  const light = tokens.flatMap((t) => declarations(t, t.values.light, index));
  const dark = tokens
    .filter((t) => t.values.dark !== undefined)
    .flatMap((t) => declarations(t, t.values.dark!, index));
  const parts = [rule("@theme", light)];
  if (dark.length) parts.push(rule(".dark", dark));
  return wrap(parts.join("\n\n"));
}

/** The managed block for 1 component's CSS file. */
export function componentCss(set: TokenSet, component: string): string {
  const index = indexTokens(set);
  const tokens = set.tokens.filter((t) => t.layer === "component" && t.component === component);
  const light = tokens.flatMap((t) => declarations(t, t.values.light, index));
  const dark = tokens
    .filter((t) => t.values.dark !== undefined)
    .flatMap((t) => declarations(t, t.values.dark!, index));
  const parts = [rule(`.${component}`, light)];
  if (dark.length) parts.push(rule(`.dark .${component}`, dark));
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
