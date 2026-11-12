/**
 * Token references (F3): resolve a reference to its final value, and find
 * every token that depends on a given token. References are never
 * flattened in storage; resolution is for display and checks only.
 */
import {
  isComposite,
  isReference,
  type CompositeValue,
  type Mode,
  type SimpleValue,
  type Token,
  type TokenSet,
  type TokenValue,
} from "./types";

export type TokenIndex = Map<string, Token>;

export const indexTokens = (set: TokenSet): TokenIndex => new Map(set.tokens.map((t) => [t.name, t]));

/** The value a token holds in a mode. Tokens without a dark value use light in both modes. */
export const valueInMode = (t: Token, mode: Mode): TokenValue =>
  mode === "dark" && t.values.dark !== undefined ? t.values.dark : t.values.light;

/** Every token name a value points to directly (including inside composites). */
export function referencesIn(v: TokenValue | undefined): string[] {
  if (v === undefined) return [];
  if (isReference(v)) return [v.ref];
  if (isComposite(v)) return Object.values(v).flatMap((p) => (isReference(p) ? [p.ref] : []));
  return [];
}

/** Every token name a token points to directly, across all modes. */
export function referencesOf(t: Token): string[] {
  return [...new Set([...referencesIn(t.values.light), ...referencesIn(t.values.dark)])];
}

export type ResolveError =
  | { kind: "missing"; ref: string }
  | { kind: "cycle"; chain: string[] };

export interface Resolved {
  /** Final raw value, or null when it could not be resolved. */
  value: string | number | Record<string, string | number> | null;
  /** Names walked through, starting with the token itself, for a simple value. */
  chain: string[];
  error?: ResolveError;
}

/** Resolve a token to its raw value in a mode, following references. */
export function resolveToken(index: TokenIndex, name: string, mode: Mode): Resolved {
  const t = index.get(name);
  if (!t) return { value: null, chain: [], error: { kind: "missing", ref: name } };
  return resolveValue(index, valueInMode(t, mode), mode, [name]);
}

function resolveValue(index: TokenIndex, v: TokenValue, mode: Mode, chain: string[]): Resolved {
  if (isReference(v)) return resolveSimple(index, v, mode, chain);
  if (isComposite(v)) {
    const out: Record<string, string | number> = {};
    for (const [k, part] of Object.entries(v as CompositeValue)) {
      const r = resolveSimple(index, part, mode, chain);
      if (r.error) return { value: null, chain, error: r.error };
      out[k] = r.value as string | number;
    }
    return { value: out, chain };
  }
  return { value: v, chain };
}

function resolveSimple(index: TokenIndex, v: SimpleValue, mode: Mode, chain: string[]): Resolved {
  if (!isReference(v)) return { value: v, chain };
  if (chain.includes(v.ref)) return { value: null, chain, error: { kind: "cycle", chain: [...chain, v.ref] } };
  const target = index.get(v.ref);
  if (!target) return { value: null, chain, error: { kind: "missing", ref: v.ref } };
  // A referenced token is read in the same mode, so a component token that
  // points to a semantic token picks up that token's dark value in dark mode.
  return resolveValue(index, valueInMode(target, mode), mode, [...chain, v.ref]);
}

/** Tokens that point directly to `name`. */
export function directDependants(set: TokenSet, name: string): string[] {
  return set.tokens.filter((t) => referencesOf(t).includes(name)).map((t) => t.name);
}

/** Every token that depends on `name`, directly or through other tokens. */
export function allDependants(set: TokenSet, name: string): string[] {
  const seen = new Set<string>();
  const queue = [name];
  while (queue.length) {
    const current = queue.shift()!;
    for (const d of directDependants(set, current)) {
      if (!seen.has(d) && d !== name) {
        seen.add(d);
        queue.push(d);
      }
    }
  }
  return [...seen];
}

/** Human-readable form of a value, keeping references as `{name}`. */
export function formatValue(v: TokenValue | undefined): string {
  if (v === undefined) return "none";
  if (isReference(v)) return `{${v.ref}}`;
  if (isComposite(v)) {
    return Object.entries(v)
      .map(([k, p]) => `${k}: ${formatValue(p)}`)
      .join(", ");
  }
  return String(v);
}
