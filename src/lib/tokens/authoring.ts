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
  /** The roles the component has today, for messages. */
  roles: string[];
  /**
   * True when the name needs the guided flow: a new category or role, or a
   * change of pattern. A new state only gets a note and can be added here.
   */
  blocking: boolean;
}

/**
 * What a new component token name adds that the component does not have
 * yet. New roles and categories belong in the guided component flow, which
 * makes the full set at once; a new state is allowed with a note. Null when
 * there is nothing new.
 */
export function componentNovelty(set: TokenSet, component: string, name: string): Novelty | null {
  const p = parseComponentTokenName(name);
  if (!p || p.component !== component) return null;
  if (!(COMPONENT_CATEGORIES as readonly string[]).includes(p.category)) return null; // a plain naming error, not novelty
  const v = componentVocabulary(set, component);
  if (!v.states.length) return null; // brand-new component: nothing to compare with
  const n: Novelty = { roleShapeChanges: !!p.role !== v.roles.length > 0, roles: v.roles, blocking: false };
  if (!v.categories.includes(p.category)) n.category = p.category;
  if (p.role && v.roles.length && !v.roles.includes(p.role)) n.role = p.role;
  if (p.role && !v.roles.length) n.role = p.role;
  if (!v.states.includes(p.state)) n.state = p.state;
  n.blocking = n.roleShapeChanges || !!n.category || (!!n.role && v.roles.length > 0);
  return n.category || n.role || n.state || n.roleShapeChanges ? n : null;
}

/** A plain-English message for a novelty, shown in amber in the sheet. */
export function noveltyMessage(component: string, n: Novelty, name?: string): string {
  const p = name ? parseComponentTokenName(name) : null;
  if (n.roleShapeChanges && n.role) {
    return `${component} tokens do not have a role, such as primary. Your name adds the role "${n.role}". To add roles to ${component}, use Create component tokens.`;
  }
  if (n.roleShapeChanges) {
    const example = p ? `${component}-${p.category}-${n.roles[0] ?? "primary"}-${p.state}` : `${component}-surface-${n.roles[0] ?? "primary"}-default`;
    const roles = n.roles.length > 1 ? `${n.roles.slice(0, -1).join(", ")} or ${n.roles[n.roles.length - 1]}` : n.roles[0];
    return `Each ${component} token has a role, such as ${roles}. Add a role after the category. Example: ${example}.`;
  }
  if (n.category) {
    return `${component} does not use the category "${n.category}" yet. To add a category, use Create component tokens. It adds the category with all the states.`;
  }
  if (n.role) {
    return `${component} does not have the role "${n.role}". To add a role, use Create component tokens. It adds the role with all the categories and states.`;
  }
  return `${component} tokens do not have the state "${n.state}" yet. Other ${component} categories can also need it. To add it to all of them at the same time, use Create component tokens.`;
}

/** As an Issue, for lists of problems. */
export function noveltyIssue(component: string, n: Novelty, token: string): Issue {
  return { severity: "warning", code: "component.novelty", message: noveltyMessage(component, n, token), token, component };
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
