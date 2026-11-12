import raw from "@/data/dummy/tokens.json";
import { parseDtcg, type Token, type TokenSet } from "@/src/lib/tokens";

export const dummy = (): TokenSet => parseDtcg(structuredClone(raw));

/** A colour token with sensible defaults, for building test cases. */
export const colour = (name: string, layer: Token["layer"], light: Token["values"]["light"], extra: Partial<Token> = {}): Token => ({
  name,
  layer,
  kind: "color",
  values: { light, ...(layer === "primitive" ? {} : { dark: light }) },
  status: "active",
  ...extra,
});

export const codes = (issues: { code: string }[]) => issues.map((i) => i.code);
