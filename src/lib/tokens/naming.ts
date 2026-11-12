/**
 * Naming rules engine: builds names from parts, parses them back, and
 * checks a single token's name against the agreed convention.
 */
import {
  COMPONENT_CATEGORIES,
  DEFAULT_FIGMA_GROUP,
  FORBIDDEN_STATES,
  NON_COLOUR_PREFIXES,
  SEMANTIC_CATEGORIES,
  SEMANTIC_VARIANTS,
} from "./rules";
import type { Issue, Token } from "./types";

export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

export interface ComponentNameParts {
  component: string;
  category: string;
  /** Omitted when the component has only 1 variant. */
  role?: string;
  state: string;
}

/** Lower case, letters and numbers only. Used for components, roles and states. */
export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Normalise a component name typed by a person. "Icon button" becomes
 * `iconbutton`; `changed` tells the interface to let the person know.
 */
export function normaliseComponentName(input: string): { slug: string; changed: boolean } {
  const s = slug(input.trim());
  return { slug: s, changed: input.trim() !== s };
}

export function buildComponentTokenName(p: ComponentNameParts): string {
  return [p.component, p.category, p.role, p.state].filter(Boolean).join("-");
}

/**
 * Split a component token name into its parts. Returns null when the name
 * cannot be read as `[component]-[category]-[role]-[state]`.
 */
export function parseComponentTokenName(name: string): ComponentNameParts | null {
  const segs = name.split("-");
  if (segs.length < 3 || segs.length > 4) return null;
  const [component, category, ...rest] = segs;
  if (rest.length === 1) return { component, category, state: rest[0] };
  return { component, category, role: rest[0], state: rest[1] };
}

const SEGMENT = /^[a-z0-9]+$/;
const HYPHENATED = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function issue(severity: Issue["severity"], code: string, message: string, token?: string): Issue {
  return { severity, code, message, token };
}

/** Check the name of 1 token on its own. Set-level checks live in `validate.ts`. */
export function checkName(token: Token): Issue[] {
  const n = token.name;
  const out: Issue[] = [];

  if (!n) return [issue("error", "name.empty", "The token has no name.")];

  if (n.startsWith("--") || n.startsWith("color-")) {
    out.push(
      issue("error", "name.prefix", `Leave out the code prefix. Write "${n.replace(/^--/, "").replace(/^color-/, "")}"; the push script adds the prefix.`, n),
    );
    return out;
  }

  if (!HYPHENATED.test(n)) {
    out.push(
      issue("error", "name.characters", `"${n}" can only use lower-case letters, numbers and single hyphens.`, n),
    );
    return out;
  }

  if (token.kind !== "color") return [...out, ...checkNonColourName(token)];

  switch (token.layer) {
    case "primitive":
      out.push(...checkPrimitiveColourName(n));
      break;
    case "semantic":
      out.push(...checkSemanticColourName(n));
      break;
    case "component":
      out.push(...checkComponentName(token));
      break;
  }
  return out;
}

function checkPrimitiveColourName(n: string): Issue[] {
  const first = n.split("-")[0];
  if ((COMPONENT_CATEGORIES as readonly string[]).includes(first)) {
    return [
      issue("error", "name.primitive.category", `"${n}" looks like a semantic name. Primitives are named [colour]-[step], for example orange-700.`, n),
    ];
  }
  // `white`, `orange-700`, `orange-700-aa`
  if (!/^[a-z]+(-\d+)?(-[a-z0-9]+)?$/.test(n)) {
    return [
      issue("error", "name.primitive.pattern", `"${n}" does not follow [colour]-[step], for example orange-700 or neutral-100.`, n),
    ];
  }
  return [];
}

function checkSemanticColourName(n: string): Issue[] {
  const [category, ...rest] = n.split("-");
  const variant = rest.join("-");
  if (category === "icon") {
    return [issue("error", "name.semantic.category", `"icon" is only used for component tokens. Semantic categories are ${SEMANTIC_CATEGORIES.join(", ")}.`, n)];
  }
  if (!(SEMANTIC_CATEGORIES as readonly string[]).includes(category)) {
    return [
      issue("error", "name.semantic.category", `"${n}" must start with a category: ${SEMANTIC_CATEGORIES.join(", ")}. The pattern is [category]-[variant].`, n),
    ];
  }
  if (!variant) {
    return [issue("error", "name.semantic.variant", `"${n}" has no variant. Write ${category}-default rather than ${category}.`, n)];
  }
  if (!(SEMANTIC_VARIANTS as readonly string[]).includes(variant)) {
    return [
      issue("info", "name.semantic.new-variant", `"${variant}" is a new semantic variant. Check it is needed before adding it.`, n),
    ];
  }
  return [];
}

function checkComponentName(token: Token): Issue[] {
  const n = token.name;
  const out: Issue[] = [];
  const segs = n.split("-");

  if (segs.length < 3) {
    return [issue("error", "name.component.segments", `"${n}" has too few segments. The pattern is [component]-[category]-[role]-[state].`, n)];
  }
  if (segs.length > 4) {
    return [
      issue("error", "name.component.segments", `"${n}" has too many segments. Component, role and state names must be single words, so the pattern is [component]-[category]-[role]-[state].`, n),
    ];
  }

  const p = parseComponentTokenName(n)!;
  if (!token.component) {
    out.push(issue("error", "name.component.missing", `"${n}" is a component token but has no component set.`, n));
  } else if (p.component !== token.component) {
    out.push(issue("error", "name.component.mismatch", `"${n}" must start with its component name, "${token.component}".`, n));
  }
  if (!(COMPONENT_CATEGORIES as readonly string[]).includes(p.category)) {
    out.push(
      issue("error", "name.component.category", `"${p.category}" is not a category. Pick from ${COMPONENT_CATEGORIES.join(", ")}.`, n),
    );
  }
  for (const s of [p.component, p.role, p.state]) {
    if (s !== undefined && !SEGMENT.test(s)) {
      out.push(issue("error", "name.component.segment", `"${s}" must be a single lower-case word.`, n));
    }
  }
  if ((FORBIDDEN_STATES as readonly string[]).includes(p.state)) {
    out.push(issue("error", "name.component.focus", `"${n}": there are no focus tokens. Focus uses the system default.`, n));
  }
  return out;
}

function checkNonColourName(token: Token): Issue[] {
  const n = token.name;
  const prefixes = NON_COLOUR_PREFIXES[token.kind as Exclude<Token["kind"], "color">];
  const ok = prefixes.some((p) => n === p || n.startsWith(`${p}-`));
  if (!ok) {
    return [
      issue("error", "name.kind.prefix", `"${n}" must start with ${prefixes.map((p) => `"${p}-"`).join(" or ")} (provisional rule for ${token.kind} tokens).`, n),
    ];
  }
  return [];
}

/** Code name. Colour tokens take the `--color-` prefix; others are provisional. */
export function cssVariableName(token: Pick<Token, "name" | "kind" | "layer">): string {
  if (token.kind === "color" && token.layer !== "component") return `--color-${token.name}`;
  // Component token prefix is still to be confirmed with developers.
  return `--${token.name}`;
}

/** Only `-default` component tokens are published in Figma. Everything else is published. */
export function isPublishedInFigma(token: Token): boolean {
  if (token.layer !== "component") return true;
  return parseComponentTokenName(token.name)?.state === "default";
}

const title = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Figma variable path for a component token:
 * `[group]/[Component]/[Category]/[category-role-state]`.
 * Paths for primitive and semantic tokens are still to be confirmed.
 */
export function figmaPath(token: Token, group = DEFAULT_FIGMA_GROUP): string | null {
  if (token.layer !== "component") return null;
  const p = parseComponentTokenName(token.name);
  if (!p) return null;
  const variable = [p.category, p.role, p.state].filter(Boolean).join("-");
  return [group, title(p.component), title(p.category), variable].join("/");
}

export interface GenerateOptions {
  component: string;
  categories: string[];
  roles: string[];
  states: string[];
  /** Combinations unticked in the matrix, as `category|role|state` or `category|state`. */
  excluded?: Set<string>;
}

/**
 * Generate every component token name for the chosen chips, as the token
 * namer did. `default` is always included.
 */
export function generateComponentTokens(o: GenerateOptions): (ComponentNameParts & { key: string; name: string })[] {
  const component = slug(o.component);
  const states = o.states.includes("default") ? o.states : ["default", ...o.states];
  const rows = o.roles.length
    ? o.categories.flatMap((c) => o.roles.map((r) => ({ c, r: r as string | undefined })))
    : o.categories.map((c) => ({ c, r: undefined as string | undefined }));
  const out: (ComponentNameParts & { key: string; name: string })[] = [];
  for (const { c, r } of rows) {
    for (const s of states) {
      const key = [c, r, s].filter(Boolean).join("|");
      if (o.excluded?.has(key)) continue;
      const parts = { component, category: c, role: r, state: s };
      out.push({ ...parts, key, name: buildComponentTokenName(parts) });
    }
  }
  return out;
}
