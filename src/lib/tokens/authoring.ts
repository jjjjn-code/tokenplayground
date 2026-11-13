/**
 * Helpers for creating and renaming tokens in the sheet: a 1-line naming
 * guide per group, spotting new roles, states and categories, and renaming
 * a token together with everything that points to it.
 */
import { parseComponentTokenName } from "./naming";
import { COMPONENT_CATEGORIES, NON_COLOUR_PREFIXES, SEMANTIC_CATEGORIES } from "./rules";
import { isComposite, isReference, type Issue, type Kind, type Layer, type Token, type TokenSet, type TokenValue } from "./types";

export interface ComponentVocabulary {
  categories: string[];
  roles: string[];
  states: string[];
}

/** The categories, roles and states a component already uses. */
export function componentVocabulary(set: TokenSet, component: string): ComponentVocabulary {
  const parts = set.tokens
    .filter((t) => t.layer === "component" && t.component === component)
    .map((t) => parseComponentTokenName(t.name))
    .filter((p) => p !== null);
  const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])];
  return { categories: uniq(parts.map((p) => p.category)), roles: uniq(parts.map((p) => p.role)), states: uniq(parts.map((p) => p.state)) };
}

/** A 1-line explanation of how to name a token in a group. */
export function namingGuide(set: TokenSet, layer: Layer, kind: Kind, component?: string): string {
  if (layer === "component" && component) {
    const v = componentVocabulary(set, component);
    const pattern = v.roles.length ? `${component}-[category]-[role]-[state]` : `${component}-[category]-[state]`;
    const bits = [
      `Categories: ${v.categories.join(", ") || "none yet"}`,
      v.roles.length ? `roles: ${v.roles.join(", ")}` : "no roles",
      `states: ${v.states.join(", ") || "none yet"}`,
    ];
    return `Pattern: ${pattern}. In ${component} today: ${bits.join("; ")}.`;
  }
  if (kind === "color") {
    return layer === "primitive"
      ? "Pattern: [colour]-[step], for example orange-800. Leave out the --color- prefix."
      : `Pattern: [category]-[variant], for example surface-brand. Categories: ${SEMANTIC_CATEGORIES.join(", ")}.`;
  }
  const prefixes = NON_COLOUR_PREFIXES[kind as Exclude<Kind, "color">];
  return `Provisional pattern: start with ${prefixes.map((p) => `${p}-`).join(" or ")}, for example ${prefixes[0]}-small.`;
}

export interface Novelty {
  category?: string;
  role?: string;
  state?: string;
  /** The component has no roles today, but this name adds one (or the other way round). */
  roleShapeChanges: boolean;
}

/**
 * What a new component token name adds that the component does not have
 * yet. New roles, states and categories belong in the guided component flow,
 * which creates the full set at once; null when there is nothing new.
 */
export function componentNovelty(set: TokenSet, component: string, name: string): Novelty | null {
  const p = parseComponentTokenName(name);
  if (!p || p.component !== component) return null;
  if (!(COMPONENT_CATEGORIES as readonly string[]).includes(p.category)) return null; // a plain naming error, not novelty
  const v = componentVocabulary(set, component);
  if (!v.states.length) return null; // brand-new component: nothing to compare with
  const n: Novelty = { roleShapeChanges: !!p.role !== v.roles.length > 0 };
  if (!v.categories.includes(p.category)) n.category = p.category;
  if (p.role && v.roles.length && !v.roles.includes(p.role)) n.role = p.role;
  if (!v.states.includes(p.state)) n.state = p.state;
  return n.category || n.role || n.state || n.roleShapeChanges ? n : null;
}

/** A plain-English message for a novelty, used in amber in the sheet. */
export function noveltyMessage(component: string, n: Novelty): string {
  if (n.roleShapeChanges) {
    return `${component} ${n.role === undefined ? "uses roles" : "has no roles"} today, so this name changes its pattern. Use Create component tokens to set up roles for the whole component.`;
  }
  const what = [n.category && `the category "${n.category}"`, n.role && `the role "${n.role}"`, n.state && `the state "${n.state}"`].filter(Boolean).join(" and ");
  return `This adds ${what}, which ${component} does not have yet. New categories, roles and states are added in Create component tokens, so every combination is created together.`;
}

/** As an Issue, for lists of problems. */
export function noveltyIssue(component: string, n: Novelty, token: string): Issue {
  return { severity: "warning", code: "component.novelty", message: noveltyMessage(component, n), token, component };
}

function renameIn(v: TokenValue, from: string, to: string): TokenValue {
  if (isReference(v)) return v.ref === from ? { ref: to } : v;
  if (isComposite(v)) return Object.fromEntries(Object.entries(v).map(([k, p]) => [k, isReference(p) && p.ref === from ? { ref: to } : p]));
  return v;
}

/**
 * Rename a token and repoint every reference to it. References stay
 * references; only the name they point at changes.
 */
export function renameToken(set: TokenSet, from: string, to: string): { set: TokenSet; repointed: string[] } {
  const repointed: string[] = [];
  const tokens = set.tokens.map((t) => {
    let next = t.name === from ? { ...t, name: to } : t;
    const light = renameIn(next.values.light, from, to);
    const dark = next.values.dark === undefined ? undefined : renameIn(next.values.dark, from, to);
    if (JSON.stringify(light) !== JSON.stringify(next.values.light) || JSON.stringify(dark) !== JSON.stringify(next.values.dark)) {
      next = { ...next, values: { light, ...(dark !== undefined ? { dark } : {}) } };
      repointed.push(next.name);
    }
    return next;
  });
  return { set: { tokens }, repointed };
}
