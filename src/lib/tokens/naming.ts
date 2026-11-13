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

/**
 * Words people often use for a category, mapped to the category our system
 * uses, so a message can ask "Do you mean ...?".
 */
const CATEGORY_SYNONYMS: Record<string, string> = {
  background: "surface",
  bg: "surface",
  fill: "surface",
  backdrop: "surface",
  text: "content",
  foreground: "content",
  fg: "content",
  font: "content",
  label: "content",
  border: "line",
  stroke: "line",
  outline: "line",
  divider: "line",
  separator: "line",
  rule: "line",
  icons: "icon",
  glyph: "icon",
};

function categoryMessage(category: string, allowed: readonly string[]): string {
  const suggestion = CATEGORY_SYNONYMS[category];
  if (suggestion && allowed.includes(suggestion)) {
    return `"${category}" is not a category in our system. Do you mean "${suggestion}"?`;
  }
  const list = allowed.length === 3 ? `${allowed[0]}, ${allowed[1]} or ${allowed[2]}` : `${allowed.slice(0, -1).join(", ")} or ${allowed[allowed.length - 1]}`;
  return `"${category}" is not a category. Use ${list}.`;
}

/**
 * Tidy what a person types into a name: lower case, and spaces or
 * underscores become hyphens. A leading "--" stays, so the prefix message
 * can still explain it.
 */
export function normaliseTokenInput(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/(?!^)-{2,}/g, (m, offset: number) => (offset === 0 ? m : "-"));
}

/** Check the name of 1 token on its own. Set-level checks live in `validate.ts`. */
export function checkName(token: Token): Issue[] {
  const n = token.name;
  const out: Issue[] = [];

  if (!n) return [issue("error", "name.empty", "The name is empty. Type a name for the token.")];

  const prefix = n.startsWith("--color-") ? "--color-" : n.startsWith("--") ? "--" : n.startsWith("color-") ? "color-" : null;
  if (prefix) {
    const clean = n.slice(prefix.length);
    out.push(issue("error", "name.prefix", `Do not type the prefix "${prefix}". Type "${clean}". The prefix is added in the code.`, n));
    return out;
  }

  if (!HYPHENATED.test(n)) {
    const bad = [...new Set(n.replace(/[a-z0-9-]/g, "").split(""))].join("");
    out.push(
      issue(
        "error",
        "name.characters",
        bad ? `Use only letters, numbers and hyphens. Remove "${bad}".` : "Use 1 hyphen between parts. Do not start or end the name with a hyphen.",
        n,
      ),
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
    return [issue("error", "name.primitive.category", "This is a semantic name. For a primitive, use the format [colour]-[step]. Example: orange-700.", n)];
  }
  // `white`, `orange-700`, `orange-700-aa`
  if (!/^[a-z]+(-\d+)?(-[a-z0-9]+)?$/.test(n)) {
    return [issue("error", "name.primitive.pattern", "Use the format [colour]-[step]. Example: orange-700.", n)];
  }
  return [];
}

function checkSemanticColourName(n: string): Issue[] {
  const [category, ...rest] = n.split("-");
  const variant = rest.join("-");
  if (category === "icon") {
    return [issue("error", "name.semantic.category", 'Do not use "icon" for a semantic token. Start the name with surface, content or line.', n)];
  }
  if (!(SEMANTIC_CATEGORIES as readonly string[]).includes(category)) {
    return [issue("error", "name.semantic.category", categoryMessage(category, SEMANTIC_CATEGORIES), n)];
  }
  if (!variant) {
    return [issue("error", "name.semantic.variant", `Add a variant to the name. Example: ${category}-default.`, n)];
  }
  if (!(SEMANTIC_VARIANTS as readonly string[]).includes(variant)) {
    return [issue("info", "name.semantic.new-variant", `"${variant}" is a new variant. Make sure that the design system needs it.`, n)];
  }
  return [];
}

function checkComponentName(token: Token): Issue[] {
  const n = token.name;
  const out: Issue[] = [];
  const segs = n.split("-");
  const component = token.component ?? segs[0];

  if (segs.length < 3) {
    const missing = segs.length === 1 ? "The category and the state are missing." : "The state is missing. Add a state to the end of the name.";
    const example = segs.length === 2 ? `${segs[0]}-${segs[1]}-default` : `${component}-surface-default`;
    return [issue("error", "name.component.segments", `${missing} Example: ${example}.`, n)];
  }
  if (segs.length > 4) {
    const extra = segs.slice(4);
    return [
      issue(
        "error",
        "name.component.segments",
        `Token names use the format [component]-[category]-[role]-[state]. This name has ${extra.length} extra ${extra.length === 1 ? "part" : "parts"}: "${extra.join("-")}". Ask the design system team if you need help.`,
        n,
      ),
    ];
  }

  const p = parseComponentTokenName(n)!;
  if (!token.component) {
    out.push(issue("error", "name.component.missing", "Select a component for this token.", n));
  } else if (p.component !== token.component) {
    out.push(issue("error", "name.component.mismatch", `Start the name with "${token.component}-".`, n));
  }
  if (!(COMPONENT_CATEGORIES as readonly string[]).includes(p.category)) {
    out.push(issue("error", "name.component.category", categoryMessage(p.category, COMPONENT_CATEGORIES), n));
  }
  for (const s of [p.component, p.role, p.state]) {
    if (s !== undefined && !SEGMENT.test(s)) {
      out.push(issue("error", "name.component.segment", `Use 1 word for each part. Change "${s}".`, n));
    }
  }
  if ((FORBIDDEN_STATES as readonly string[]).includes(p.state)) {
    out.push(issue("error", "name.component.focus", "Do not make focus tokens. The system default shows focus.", n));
  }
  return out;
}

function checkNonColourName(token: Token): Issue[] {
  const n = token.name;
  const prefixes = NON_COLOUR_PREFIXES[token.kind as Exclude<Token["kind"], "color">];
  const ok = prefixes.some((p) => n === p || n.startsWith(`${p}-`));
  if (!ok) {
    return [
      issue("error", "name.kind.prefix", `Start the name with "${prefixes[0]}-". Example: ${prefixes[0]}-small. This rule is temporary.`, n),
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
