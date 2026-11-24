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

/** The dummy set plus a semantic motion token with a reduced motion value, as the dummy set has none. */
export const withMotion = (): TokenSet => {
  const set = dummy();
  set.tokens.push(
    { name: "duration-none", layer: "primitive", kind: "motion", values: { value: "0ms" }, status: "active" },
    { name: "duration-quick", layer: "semantic", kind: "motion", values: { default: { ref: "duration-fast" }, "reduced-motion": { ref: "duration-none" } }, status: "active" },
  );
  return set;
};
