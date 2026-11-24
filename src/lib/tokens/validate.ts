/**
 * Set-level checks. `validateTokenSet` runs every rule over a whole set;
 * `checkBeforeSave` is what the create and edit form calls (F2): any error
 * it returns blocks the save.
 */
import { checkName, parseComponentTokenName } from "./naming";
import { toPx } from "./fluid";
import { columnSetOf, indexTokens, modesOf, referencesIn, referencesOf, resolveToken, type TokenIndex } from "./references";
import { LAYER_RANK, LAYERS_BY_KIND } from "./rules";
import { isComposite, isReference, type Issue, type Token, type TokenSet, type TokenValue } from "./types";

const HEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

const kindWord = (k: string) => (k === "color" ? "colour" : k);

/** Size types may refer to each other, for example paragraph spacing that uses a spacing size. */
const SIZE_KINDS: string[] = ["spacing", "sizing", "typography"];

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
    message: "This name is already used. Type a different name.",
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
    err(
      "layer.kind",
      "Only colour tokens can be component tokens. Make this a primitive or a semantic token.",
    );
  }
  if (t.layer !== "component" && t.component) {
    err("layer.component", `A ${t.layer} token cannot be part of a component. Remove the component.`);
  }

  // Modes: the token's column set says which values it has.
  const set = columnSetOf(t);
  const modes = modesOf(t);
  const label = (key: string) => modes.find((m) => m.key === key)?.label.toLowerCase() ?? key;
  const extra = Object.keys(t.values).filter((k) => !modes.some((m) => m.key === k));
  if (extra.length) {
    if (set === "value") err("mode.primitive", `Remove the ${extra.join(" and ")} value. A primitive has 1 value for all modes.`);
    else err("mode.extra", `Remove the ${extra.join(" and ")} value. This token has ${modes.map((m) => m.label.toLowerCase()).join(" and ")} values.`);
  }
  // Light-only borders and shadows use the light value in dark mode. Every other set needs all its values.
  const optional = set === "theme" && t.kind !== "color";
  const missing = optional ? [] : modes.filter((m) => t.values[m.key] === undefined);
  if (missing.length) {
    err("mode.missing", `The ${missing.map((m) => m.label.toLowerCase()).join(" and ")} value is empty. Select a ${missing[0].label.toLowerCase()} value.`);
  }
  if (set === "theme" && t.kind === "color" && t.values.dark !== undefined) {
    // Compare final colours, so a token pointing to a semantic token that
    // changes between modes is not flagged.
    const l = resolveToken(index, t.name, "light");
    const d = resolveToken(index, t.name, "dark");
    if (!l.error && !d.error && l.value !== "" && l.value === d.value) {
      info("mode.same", `This token is ${String(l.value)} in light and dark. This is correct for brand colours. For other tokens, make sure that this is correct.`);
    }
  }

  // Values and references
  const isEmpty = (v: TokenValue | undefined) => v === "" || (v !== undefined && isComposite(v) && Object.values(v).some((p) => p === ""));
  const emptyModes = modes.filter((m) => isEmpty(t.values[m.key])).map((m) => m.key);
  if (emptyModes.length) {
    const present = modes.filter((m) => t.values[m.key] !== undefined);
    if (present.length <= 1) err("value.empty", "The value is empty. Select a token or type a value.");
    else if (emptyModes.length === present.length) {
      err("value.empty", `The ${present.map((m) => m.label.toLowerCase()).join(" and ")} values are empty. ${present.map((m) => `Select a ${m.label.toLowerCase()} value`).join(" and ")}.`.replace(/ and Select/, " and select"));
    } else err("value.empty", `The ${label(emptyModes[0])} value is empty. Select a ${label(emptyModes[0])} value.`);
  }
  for (const v of Object.values(t.values)) {
    if (v === undefined || isEmpty(v)) continue;
    if (t.layer !== "primitive" && hasRawSimpleValue(v)) {
      warn("ref.raw", "This token has a raw value. Semantic and component tokens must refer to a token. Select a token.");
    }
    if (t.kind === "color" && typeof v === "string" && !HEX.test(v)) {
      err("value.colour", `"${v}" is not a colour. Type a hex value. Example: #FF5000.`);
    }
    if (set === "fluid" && isComposite(v)) {
      err("value.fluid", "A fluid token has 1 size for min and 1 size for max. Select a size token.");
    }
  }
  if (set === "fluid" && !emptyModes.length && !missing.length) {
    // Each end must come out as a size, so the tool can write the clamp().
    for (const m of modes) {
      const r = resolveToken(index, t.name, m.key);
      if (!r.error && toPx(r.value) === null) {
        err("value.fluid", `The ${m.label.toLowerCase()} value is ${String(r.value)}, which is not a size. Select a size token. Example: ${t.kind === "typography" ? "font-size-min-step-0" : "spacing-min-s"}.`);
        break;
      }
    }
  }

  for (const ref of referencesOf(t)) {
    const target = index.get(ref);
    if (!target) {
      err("ref.missing", `The token "${ref}" does not exist. Select a different token.`);
      continue;
    }
    // Primitives may point to other primitives (for example a base size that
    // follows 1 step of the scale); other layers only point downwards.
    const sameLayerOk = t.layer === "primitive" && target.layer === "primitive";
    if (!sameLayerOk && LAYER_RANK[target.layer] >= LAYER_RANK[t.layer]) {
      err("ref.layer", `A ${t.layer} token cannot refer to a ${target.layer} token. Select a token from a lower layer: ${t.layer === "component" ? "primitive or semantic" : "primitive"}.`);
    }
    const simple = Object.values(t.values).some((v) => isReference(v) && v.ref === ref);
    if (simple && target.kind !== t.kind && !(SIZE_KINDS.includes(t.kind) && SIZE_KINDS.includes(target.kind))) {
      err("ref.kind", `A ${kindWord(t.kind)} token cannot refer to a ${kindWord(target.kind)} token. Select a ${kindWord(t.kind)} token.`);
    }
    if (t.layer === "component" && target.layer === "semantic" && t.kind === "color") {
      const cat = t.name.split("-")[1];
      const targetCat = target.name.split("-")[0];
      if (cat && targetCat !== cat && !(cat === "icon" && targetCat === "content")) {
        warn("ref.category", `This ${cat} token refers to a ${targetCat} token. Make sure that this is correct.`);
      }
    }
    if (target.status === "deprecated" && t.status !== "deprecated") {
      warn("ref.deprecated", `"${ref}" is deprecated. Select a different token.`);
    }
  }

  for (const { key: mode } of modes) {
    const r = resolveToken(index, t.name, mode);
    if (r.error?.kind === "cycle") {
      err("ref.cycle", `The references make a loop: ${r.error.chain.join(" > ")}. Change 1 of the references.`);
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
          message: `${component}-${g} does not have a default token. Add ${component}-${g}-default.`,
          component,
        });
      }
    }
    const withRole = parts.filter((p) => p.role).length;
    if (withRole && withRole !== parts.length) {
      out.push({
        severity: "warning",
        code: "component.roles",
        message: `Some ${component} tokens have a role and some do not. Use a role in all ${component} tokens or in no ${component} tokens.`,
        component,
      });
    }
    if (parts.length && !withRole) {
      out.push({
        severity: "info",
        code: "component.no-role",
        message: `${component} does not use roles. If you add a second variant later, you must change the names of all ${component} tokens.`,
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
        message: `A component must use only its own tokens or only Base semantic tokens, not both. ${component} uses its own tokens and ${semantic.map((t) => t.name).join(", ")}. Change ${component} to use 1 type for all its parts.`,
        component,
      });
    }
    if (primitive.length) {
      out.push({
        severity: "warning",
        code: "component.primitive",
        message: `${component} uses primitives (${primitive.map((t) => t.name).join(", ")}). Use semantic tokens or component tokens.`,
        component,
      });
    }
    if (foreign.length) {
      out.push({
        severity: "warning",
        code: "component.foreign",
        message: `${component} uses tokens from a different component (${foreign.map((t) => t.name).join(", ")}). Use ${component} tokens or semantic tokens.`,
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
