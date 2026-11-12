import { describe, expect, it } from "vitest";
import raw from "@/data/dummy/tokens.json";
import { EXTENSION_KEY, parseDtcg, serialiseDtcg } from "@/src/lib/tokens";
import { dummy } from "./helpers";

describe("DTCG files", () => {
  it("reads layers, kinds, components and modes", () => {
    const set = dummy();
    const hover = set.tokens.find((t) => t.name === "button-surface-primary-hover")!;
    expect(hover).toMatchObject({
      layer: "component",
      component: "button",
      kind: "color",
      values: { light: { ref: "orange-700-aa" }, dark: { ref: "orange-400" } },
    });
    expect(set.tokens.find((t) => t.name === "text-body")!.values.light).toMatchObject({ fontSize: { ref: "font-size-16" } });
  });

  it("writes references as DTCG aliases, never as raw values", () => {
    const out = serialiseDtcg(dummy()) as any;
    expect(out.semantic.color["surface-default"].$value).toBe("{primitive.color.neutral-100}");
    expect(out.semantic.color["surface-default"].$extensions[EXTENSION_KEY].modes.dark).toBe("{primitive.color.neutral-700}");
    expect(out.component.button["button-line-secondary-default"].$value).toBe("{semantic.color.line-default}");
  });

  it("round-trips the dummy file exactly", () => {
    expect(serialiseDtcg(parseDtcg(raw), (raw as any).$description)).toEqual(raw);
  });
});
