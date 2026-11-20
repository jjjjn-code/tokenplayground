/**
 * Naming rules configuration.
 *
 * Everything the owner may want to change later (categories, variants,
 * suggested roles and states) sits here, so the rules engine itself does
 * not need editing.
 */
import type { Kind, Layer, Mode } from "./types";

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
  motion: ["primitive"],
};

/**
 * Column sets: which values (modes) a token has. Each token set in the
 * tool, and each collection in Figma, uses 1 column set. The first mode is
 * the default value. To add a new set (for example high contrast), add it
 * here and choose where it is used in `columnSetFor`.
 */
export const COLUMN_SETS = {
  value: { title: "Value", modes: [{ key: "value", label: "Value" }] },
  motion: {
    title: "Default and reduced motion",
    modes: [
      { key: "default", label: "Default" },
      { key: "reduced-motion", label: "Reduced motion" },
    ],
  },
  theme: {
    title: "Light and dark",
    modes: [
      { key: "light", label: "Light" },
      { key: "dark", label: "Dark" },
    ],
  },
  fluid: {
    title: "Min and max",
    modes: [
      { key: "min", label: "Min" },
      { key: "max", label: "Max" },
    ],
  },
} as const satisfies Record<string, { title: string; modes: readonly { key: Mode; label: string }[] }>;

export type ColumnSetId = keyof typeof COLUMN_SETS;

/**
 * The column set for a layer and type. Primitives have 1 value, except
 * motion. Theming starts at the semantic layer: colour by light and dark,
 * spacing and type by min and max (fluid). PROVISIONAL for sizing, radius,
 * border and shadow, which are not in the Figma file yet.
 */
export function columnSetFor(layer: Layer, kind: Kind): ColumnSetId {
  if (layer === "primitive") return kind === "motion" ? "motion" : "value";
  switch (kind) {
    case "color":
    case "border":
    case "shadow":
      return "theme";
    case "spacing":
    case "sizing":
    case "typography":
      return "fluid";
    default:
      return "value";
  }
}

/**
 * PROVISIONAL. Screen widths, in pixels, between which fluid tokens grow
 * from their min value to their max value, as in the Utopia calculator.
 * Change these to the widths the UAL grid uses.
 */
export const FLUID_VIEWPORT = { min: 400, max: 1600, rootFontSize: 16 };

/**
 * PROVISIONAL. Name prefixes for non-colour tokens, by layer. The naming
 * rules for these types are an open question in the PRD; until they are
 * agreed, a non-colour token name must start with one of these words.
 * They follow the groups in the Figma file.
 */
export const NON_COLOUR_PREFIXES: Record<"primitive" | "semantic", Record<Exclude<Kind, "color">, string[]>> = {
  primitive: {
    spacing: ["spacing", "grid"],
    sizing: ["size"],
    typography: ["font-family", "font-size", "font-weight", "line-height"],
    radius: ["radius"],
    border: ["border"],
    shadow: ["shadow"],
    motion: ["duration", "ease"],
  },
  semantic: {
    spacing: ["space", "grid"],
    sizing: ["size"],
    typography: ["step", "paragraph-spacing", "text"],
    radius: ["radius"],
    border: ["border"],
    shadow: ["shadow"],
    motion: ["duration", "ease"],
  },
};

/** Layer order, used to check that references only point downwards. */
export const LAYER_RANK: Record<Layer, number> = { primitive: 0, semantic: 1, component: 2 };

/** Name prefixes allowed for a non-colour token in a layer. Empty for colour. */
export function namePrefixes(layer: Layer, kind: Kind): string[] {
  if (kind === "color") return [];
  return NON_COLOUR_PREFIXES[layer === "primitive" ? "primitive" : "semantic"][kind];
}
