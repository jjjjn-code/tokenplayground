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
import { COLUMN_SETS, columnSetFor, type ColumnSetId } from "./rules";

export type TokenIndex = Map<string, Token>;

export const indexTokens = (set: TokenSet): TokenIndex => new Map(set.tokens.map((t) => [t.name, t]));

/** The column set a token uses. */
export const columnSetOf = (t: Pick<Token, "layer" | "kind">): ColumnSetId => columnSetFor(t.layer, t.kind);

/** The modes (columns) a token has, default first. */
export const modesOf = (t: Pick<Token, "layer" | "kind">): { key: Mode; label: string }[] => [...COLUMN_SETS[columnSetOf(t)].modes];

/** The default mode of a token: `value`, `light`, `min` or `default`. */
export const defaultMode = (t: Pick<Token, "layer" | "kind">): Mode => COLUMN_SETS[columnSetOf(t)].modes[0].key;

/**
 * The value a token holds in a mode. A token without a value for that mode
 * (a primitive read in dark mode, or a light-only border) uses its default
 * value. Values saved before column sets existed are keyed `light`; they are
 * read as the default.
 */
export function valueInMode(t: Pick<Token, "layer" | "kind" | "values">, mode: Mode): TokenValue {
  if (t.values[mode] !== undefined) return t.values[mode];
  const d = t.values[defaultMode(t)];
  if (d !== undefined) return d;
  return t.values.light ?? Object.values(t.values)[0] ?? "";
}

/** The value a token holds in its default mode. */
export const defaultValue = (t: Pick<Token, "layer" | "kind" | "values">): TokenValue => valueInMode(t, defaultMode(t));

/**
 * Values keyed by the token's own modes. Fixes values saved with older keys
 * (for example `light` on a primitive, which is now `value`).
 */
export function normaliseValues<T extends Pick<Token, "layer" | "kind" | "values">>(t: T): T {
  const modes = modesOf(t).map((m) => m.key);
  if (Object.keys(t.values).every((k) => modes.includes(k))) return t;
  const values: Record<Mode, TokenValue> = {};
  for (const m of modes) if (t.values[m] !== undefined) values[m] = t.values[m];
  if (values[modes[0]] === undefined) values[modes[0]] = valueInMode(t, modes[0]);
  return { ...t, values };
}

/** Every token name a value points to directly (including inside composites). */
export function referencesIn(v: TokenValue | undefined): string[] {
  if (v === undefined) return [];
  if (isReference(v)) return [v.ref];
  if (isComposite(v)) return Object.values(v).flatMap((p) => (isReference(p) ? [p.ref] : []));
  return [];
}

/** Every token name a token points to directly, across all modes. */
export function referencesOf(t: Token): string[] {
  return [...new Set(Object.values(t.values).flatMap((v) => referencesIn(v)))];
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
  // A token without that mode (a primitive) gives its default value.
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

/** The label for a mode in the interface, for example `reduced-motion` gives "Reduced motion". */
export function modeLabel(mode: Mode): string {
  if (mode === "fluid") return "Min to max";
  if (mode === "base") return "Default";
  for (const set of Object.values(COLUMN_SETS)) {
    const m = set.modes.find((x) => x.key === mode);
    if (m) return m.label;
  }
  return mode;
}
