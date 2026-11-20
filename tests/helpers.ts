import raw from "@/data/dummy/tokens.json";
import { parseDtcg, type Token, type TokenSet, type TokenValue } from "@/src/lib/tokens";

export const dummy = (): TokenSet => parseDtcg(structuredClone(raw));

/** A colour token with sensible defaults, for building test cases. */
export const colour = (name: string, layer: Token["layer"], light: TokenValue, extra: Partial<Token> = {}): Token => ({
  name,
  layer,
  kind: "color",
  values: layer === "primitive" ? { value: light } : { light, dark: light },
  status: "active",
  ...extra,
});

export const codes = (issues: { code: string }[]) => issues.map((i) => i.code);
