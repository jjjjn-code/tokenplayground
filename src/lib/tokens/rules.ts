/**
 * Naming rules configuration.
 *
 * Everything the owner may want to change later (categories, variants,
 * suggested roles and states) sits here, so the rules engine itself does
 * not need editing.
 */
import type { Kind, Layer } from "./types";

/** Closed list of categories for component-specific tokens. */
export const COMPONENT_CATEGORIES = ["surface", "content", "line", "icon"] as const;

/** Categories for semantic (Base) colour tokens. */
export const SEMANTIC_CATEGORIES = ["surface", "content", "line"] as const;

/** Semantic variants in use today. A new variant is allowed but flagged for a check. */
export const SEMANTIC_VARIANTS = [
  "default",
  "elevated",
  "inverse",
  "primary",
  "secondary",
  "disabled",
  "on-inverse",
  "success",
  "danger",
  "success-on-inverse",
  "danger-on-inverse",
] as const;

/** Roles offered as chips. Custom roles can be added. */
export const SUGGESTED_ROLES = ["primary", "secondary", "tertiary"] as const;

/** States offered as chips. `default` is locked on. Custom states can be added. */
export const SUGGESTED_STATES = [
  "default",
  "hover",
  "pressed",
  "disabled",
  "selected",
  "loading",
  "on",
  "off",
] as const;

/** States that may never be used. Focus uses the system default. */
export const FORBIDDEN_STATES = ["focus", "focused", "focusvisible"] as const;

/** Default Figma group for component variables. */
export const DEFAULT_FIGMA_GROUP = "Interactive";

/**
 * Which layers each token type may use in v1.
 * Only colour has a component-specific layer today.
 */
export const LAYERS_BY_KIND: Record<Kind, Layer[]> = {
  color: ["primitive", "semantic", "component"],
  spacing: ["primitive", "semantic"],
  sizing: ["primitive", "semantic"],
  typography: ["primitive", "semantic"],
  radius: ["primitive", "semantic"],
  border: ["primitive", "semantic"],
  shadow: ["primitive", "semantic"],
};

/**
 * PROVISIONAL. Name prefixes for non-colour tokens. The naming rules for
 * these types are an open question in the PRD; until they are agreed, a
 * non-colour token name must start with one of these words.
 */
export const NON_COLOUR_PREFIXES: Record<Exclude<Kind, "color">, string[]> = {
  spacing: ["spacing"],
  sizing: ["size"],
  typography: ["font-family", "font-size", "font-weight", "line-height", "text"],
  radius: ["radius"],
  border: ["border"],
  shadow: ["shadow"],
};

/** Layer order, used to check that references only point downwards. */
export const LAYER_RANK: Record<Layer, number> = { primitive: 0, semantic: 1, component: 2 };
