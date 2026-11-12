/**
 * Set-level checks. `validateTokenSet` runs every rule over a whole set;
 * `checkBeforeSave` is what the create and edit form calls (F2): any error
 * it returns blocks the save.
 */
import { checkName, parseComponentTokenName } from "./naming";
import { indexTokens, referencesIn, referencesOf, resolveToken, type TokenIndex } from "./references";
import { LAYER_RANK, LAYERS_BY_KIND } from "./rules";
import { isComposite, isReference, type Issue, type Token, type TokenSet, type TokenValue } from "./types";

const HEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

export function validateTokenSet(set: TokenSet): Issue[] {
  const index = indexTokens(set);
  const out: Issue[] = [];
  out.push(...checkDuplicates(set));
  for (const t of set.tokens) out.push(...checkToken(t, index));
  out.push(...checkComponents(set));
  return out;
}

function checkDuplicates(set: TokenSet): Issue[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const t of set.tokens) (seen.has(t.name) ? dupes : seen).add(t.name);
  return [...dupes].map((n) => ({
    severity: "error" as const,
    code: "name.duplicate",
    message: `"${n}" already exists. Token names must be unique.`,
    token: n,
  }));
}

/** Every rule that looks at 1 token, with access to the rest of the set for references. */
export function checkToken(t: Token, index: TokenIndex): Issue[] {
  const out: Issue[] = [...checkName(t)];
  const err = (code: string, message: string) => out.push({ severity: "error", code, message, token: t.name });
  const warn = (code: string, message: string) => out.push({ severity: "warning", code, message, token: t.name });
  const info = (code: string, message: string) => out.push({ severity: "info", code, message, token: t.name });

  if (!LAYERS_BY_KIND[t.kind].includes(t.layer)) {
    err("layer.kind", `${t.kind} tokens have no ${t.layer} layer in v1. Only colour has component-specific tokens.`);
  }
  if (t.layer !== "component" && t.component) {
    err("layer.component", `"${t.name}" is a ${t.layer} token, so it cannot belong to a component.`);
  }

  // Modes
  if (t.layer === "primitive" && t.values.dark !== undefined) {
    err("mode.primitive", `Primitives do not change between modes. Remove the dark value from "${t.name}".`);
  }
  if (t.kind === "color" && t.layer !== "primitive" && t.values.dark === undefined) {
    err("mode.missing", `"${t.name}" has no dark value. Colour tokens need a light and a dark value.`);
  }
  if (t.kind === "color" && t.layer !== "primitive" && t.values.dark !== undefined) {
    // Compare final colours, so a token pointing to a semantic token that
    // changes between modes is not flagged.
    const l = resolveToken(index, t.name, "light");
    const d = resolveToken(index, t.name, "dark");
    if (!l.error && !d.error && l.value === d.value) {
      info("mode.same", `"${t.name}" is ${String(l.value)} in both light and dark. Correct for brand colours that do not change, worth checking otherwise.`);
    }
  }

  // Values and references
  for (const v of [t.values.light, t.values.dark]) {
    if (v === undefined) continue;
    if (t.layer === "primitive" && referencesIn(v).length) {
      err("ref.primitive", `Primitives hold raw values. "${t.name}" points to another token.`);
    }
    if (t.layer !== "primitive" && hasRawSimpleValue(v)) {
      warn("ref.raw", `"${t.name}" holds a raw value. Semantic and component tokens should point to another token.`);
    }
    if (t.kind === "color" && typeof v === "string" && !HEX.test(v)) {
      err("value.colour", `"${v}" is not a colour. Use a hex value such as #FF5000.`);
    }
  }

  for (const ref of referencesOf(t)) {
    const target = index.get(ref);
    if (!target) {
      err("ref.missing", `"${t.name}" points to "${ref}", which does not exist.`);
      continue;
    }
    if (LAYER_RANK[target.layer] >= LAYER_RANK[t.layer]) {
      err("ref.layer", `"${t.name}" (${t.layer}) points to "${ref}" (${target.layer}). A token can only point to a token in a lower layer.`);
    }
    const simple = [t.values.light, t.values.dark].some((v) => isReference(v) && v.ref === ref);
    if (simple && target.kind !== t.kind) {
      err("ref.kind", `"${t.name}" is a ${t.kind} token but points to "${ref}", a ${target.kind} token.`);
    }
    if (target.status === "deprecated" && t.status !== "deprecated") {
      warn("ref.deprecated", `"${t.name}" points to "${ref}", which is deprecated.`);
    }
  }

  for (const mode of ["light", "dark"] as const) {
    const r = resolveToken(index, t.name, mode);
    if (r.error?.kind === "cycle") {
      err("ref.cycle", `References loop back on themselves: ${r.error.chain.join(" > ")}.`);
      break;
    }
  }
  return out;
}

function hasRawSimpleValue(v: TokenValue): boolean {
  return !isReference(v) && !isComposite(v);
}

/** Per-component checks: a default for every group, and consistent use of roles. */
function checkComponents(set: TokenSet): Issue[] {
  const out: Issue[] = [];
  const byComponent = new Map<string, Token[]>();
  for (const t of set.tokens) {
    if (t.layer !== "component" || !t.component) continue;
    byComponent.set(t.component, [...(byComponent.get(t.component) ?? []), t]);
  }
  for (const [component, tokens] of byComponent) {
    const parts = tokens.map((t) => parseComponentTokenName(t.name)).filter((p) => p !== null);
    const groups = new Map<string, Set<string>>();
    for (const p of parts) {
      const g = [p.category, p.role].filter(Boolean).join("-");
      groups.set(g, (groups.get(g) ?? new Set()).add(p.state));
    }
    for (const [g, states] of groups) {
      if (!states.has("default")) {
        out.push({
          severity: "error",
          code: "component.default",
          message: `${component}-${g} has no -default token. -default is always written.`,
          component,
        });
      }
    }
    const withRole = parts.filter((p) => p.role).length;
    if (withRole && withRole !== parts.length) {
      out.push({
        severity: "warning",
        code: "component.roles",
        message: `${component} mixes tokens with and without a role. Either every token has a role or none do.`,
        component,
      });
    }
    if (parts.length && !withRole) {
      out.push({
        severity: "info",
        code: "component.no-role",
        message: `${component} has no role segment. If a second variant is added later, every ${component} token must be renamed.`,
        component,
      });
    }
  }
  return out;
}

/**
 * The "never a mix" rule. `usage` maps each component to the token names its
 * CSS uses (from the code scan in F10). A component must use Base semantic
 * tokens throughout, or only its own tokens.
 */
export function checkComponentMix(set: TokenSet, usage: Record<string, string[]>): Issue[] {
  const index = indexTokens(set);
  const out: Issue[] = [];
  for (const [component, names] of Object.entries(usage)) {
    const used = names.map((n) => index.get(n)).filter((t): t is Token => !!t && t.kind === "color");
    const own = used.filter((t) => t.layer === "component" && t.component === component);
    const semantic = used.filter((t) => t.layer === "semantic");
    const primitive = used.filter((t) => t.layer === "primitive");
    const foreign = used.filter((t) => t.layer === "component" && t.component !== component);
    if (own.length && semantic.length) {
      out.push({
        severity: "warning",
        code: "component.mix",
        message: `${component} mixes its own tokens with Base semantic tokens (${semantic.map((t) => t.name).join(", ")}). Use one or the other.`,
        component,
      });
    }
    if (primitive.length) {
      out.push({
        severity: "warning",
        code: "component.primitive",
        message: `${component} uses primitives directly (${primitive.map((t) => t.name).join(", ")}). Use a semantic or component token instead.`,
        component,
      });
    }
    if (foreign.length) {
      out.push({
        severity: "warning",
        code: "component.foreign",
        message: `${component} uses another component's tokens (${foreign.map((t) => t.name).join(", ")}).`,
        component,
      });
    }
  }
  return out;
}

/**
 * Called before saving new or edited tokens. Returns every issue that
 * concerns the candidate tokens; the save is blocked when any is an error.
 * Candidates replace existing tokens with the same name only when listed
 * in `replacing` (an edit); otherwise a matching name is a duplicate.
 */
export function checkBeforeSave(
  set: TokenSet,
  candidates: Token[],
  replacing: string[] = [],
): { ok: boolean; issues: Issue[] } {
  const kept = set.tokens.filter((t) => !replacing.includes(t.name));
  const merged: TokenSet = { tokens: [...kept, ...candidates] };
  const names = new Set(candidates.map((t) => t.name));
  const components = new Set(candidates.map((t) => t.component).filter(Boolean));
  const issues = validateTokenSet(merged).filter(
    (i) => (i.token && names.has(i.token)) || (i.component && components.has(i.component)),
  );
  return { ok: !issues.some((i) => i.severity === "error"), issues };
}
