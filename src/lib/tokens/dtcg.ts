/**
 * Read and write the token data files, which use the W3C design tokens
 * (DTCG) format.
 *
 * File layout:
 *   primitive.<kind>.<name>
 *   semantic.<kind>.<name>
 *   component.<component>.<name>
 *
 * `$value` holds the light (default) value. Values the DTCG format has no
 * place for (dark mode, layer kind, status) sit under
 * `$extensions["uk.ac.ual.tokens"]`. References are written as DTCG
 * aliases such as `{primitive.color.orange-700}`; they are never flattened.
 */
import {
  isComposite,
  isReference,
  type Kind,
  type Layer,
  type SimpleValue,
  type Status,
  type Token,
  type TokenSet,
  type TokenValue,
} from "./types";

export const EXTENSION_KEY = "uk.ac.ual.tokens";

type DtcgSimple = string | number;
type DtcgValue = DtcgSimple | Record<string, DtcgSimple>;

interface DtcgToken {
  $type: string;
  $value: DtcgValue;
  $description?: string;
  $extensions?: {
    [EXTENSION_KEY]?: {
      kind?: Kind;
      status?: Status;
      modes?: { dark?: DtcgValue };
    };
  };
}

type DtcgGroup = { [key: string]: DtcgGroup | DtcgToken | string };

const LAYERS: Layer[] = ["primitive", "semantic", "component"];
const KINDS: Kind[] = ["color", "spacing", "sizing", "typography", "radius", "border", "shadow"];

const isToken = (v: unknown): v is DtcgToken => typeof v === "object" && v !== null && "$value" in v;

/** The DTCG `$type` for a token. */
export function dtcgType(t: Pick<Token, "kind" | "name" | "values">): string {
  const composite = isComposite(t.values.light);
  switch (t.kind) {
    case "color":
      return "color";
    case "shadow":
      return "shadow";
    case "border":
      return composite ? "border" : "dimension";
    case "typography":
      if (composite) return "typography";
      if (t.name.startsWith("font-family")) return "fontFamily";
      if (t.name.startsWith("font-weight")) return "fontWeight";
      if (t.name.startsWith("line-height")) return "number";
      return "dimension";
    default:
      return "dimension";
  }
}

// ---------- Parse ----------

function parseSimple(v: DtcgSimple): SimpleValue {
  if (typeof v === "string") {
    const m = /^\{([^{}]+)\}$/.exec(v.trim());
    if (m) {
      const path = m[1].split(".");
      return { ref: path[path.length - 1] };
    }
  }
  return v;
}

function parseValue(v: DtcgValue): TokenValue {
  if (typeof v === "object" && v !== null) {
    return Object.fromEntries(Object.entries(v).map(([k, p]) => [k, parseSimple(p)]));
  }
  return parseSimple(v);
}

export function parseDtcg(json: unknown): TokenSet {
  const root = json as DtcgGroup;
  const tokens: Token[] = [];
  for (const layer of LAYERS) {
    const layerGroup = root[layer];
    if (!layerGroup || typeof layerGroup !== "object") continue;
    for (const [groupKey, group] of Object.entries(layerGroup as DtcgGroup)) {
      if (groupKey.startsWith("$") || typeof group !== "object") continue;
      for (const [name, raw] of Object.entries(group as DtcgGroup)) {
        if (name.startsWith("$") || !isToken(raw)) continue;
        const ext = raw.$extensions?.[EXTENSION_KEY] ?? {};
        const kind: Kind = ext.kind ?? (KINDS.includes(groupKey as Kind) ? (groupKey as Kind) : "color");
        const token: Token = {
          name,
          layer,
          kind,
          values: { light: parseValue(raw.$value) },
          status: ext.status ?? "active",
        };
        if (layer === "component") token.component = groupKey;
        if (ext.modes?.dark !== undefined) token.values.dark = parseValue(ext.modes.dark);
        if (raw.$description) token.description = raw.$description;
        tokens.push(token);
      }
    }
  }
  return { tokens };
}

// ---------- Serialise ----------

const groupOf = (t: Token) => (t.layer === "component" ? t.component ?? "unassigned" : t.kind);

export function serialiseDtcg(set: TokenSet, description?: string): Record<string, unknown> {
  const pathOf = new Map(set.tokens.map((t) => [t.name, `${t.layer}.${groupOf(t)}.${t.name}`]));

  const simple = (v: SimpleValue): DtcgSimple => {
    if (isReference(v)) return `{${pathOf.get(v.ref) ?? v.ref}}`;
    return v;
  };
  const value = (v: TokenValue): DtcgValue => {
    if (isComposite(v)) return Object.fromEntries(Object.entries(v).map(([k, p]) => [k, simple(p)]));
    return simple(v as SimpleValue);
  };

  const out: Record<string, unknown> = {};
  if (description) out.$description = description;
  for (const layer of LAYERS) {
    const layerTokens = set.tokens.filter((t) => t.layer === layer);
    if (!layerTokens.length) continue;
    const layerGroup: Record<string, Record<string, DtcgToken>> = {};
    for (const t of layerTokens) {
      const g = groupOf(t);
      layerGroup[g] ??= {};
      const entry: DtcgToken = { $type: dtcgType(t), $value: value(t.values.light) };
      if (t.description) entry.$description = t.description;
      const ext: NonNullable<DtcgToken["$extensions"]>[typeof EXTENSION_KEY] = { kind: t.kind, status: t.status };
      if (t.values.dark !== undefined) ext.modes = { dark: value(t.values.dark) };
      entry.$extensions = { [EXTENSION_KEY]: ext };
      layerGroup[g][t.name] = entry;
    }
    out[layer] = layerGroup;
  }
  return out;
}
