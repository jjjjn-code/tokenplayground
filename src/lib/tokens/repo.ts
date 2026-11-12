/**
 * Where tokens live in the code repo.
 * PROVISIONAL: the exact paths are still to be confirmed with developers.
 */
import type { Token } from "./types";

export const PARENT_CSS_PATH = "styles/colors.css";

export const componentCssPath = (component: string) => `components/${component}/${component}.css`;

/** The file a token is written to. */
export const cssFileFor = (t: Pick<Token, "layer" | "component">): string =>
  t.layer === "component" && t.component ? componentCssPath(t.component) : PARENT_CSS_PATH;

export const BLOCK_START = "/* tokens:start (managed by the token tool) */";
export const BLOCK_END = "/* tokens:end */";
