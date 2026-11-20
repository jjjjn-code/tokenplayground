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
    expect(set.tokens.find((t) => t.name === "step-0")).toMatchObject({
      values: { min: { ref: "font-size-min-step-0" }, max: { ref: "font-size-max-step-0" } },
      figma: "Font size/Step 0",
    });
    expect(set.tokens.find((t) => t.name === "duration-fast")!.values).toEqual({ default: "150ms", "reduced-motion": "0ms" });
    expect(set.tokens.find((t) => t.name === "spacing-min-s")!.values).toEqual({ value: 16 });
  });

  it("writes references as DTCG aliases, never as raw values", () => {
    const out = serialiseDtcg(dummy()) as any;
    expect(out.semantic.color["surface-default"].$value).toBe("{primitive.color.neutral-100}");
    expect(out.semantic.color["surface-default"].$extensions[EXTENSION_KEY].modes.dark).toBe("{primitive.color.neutral-700}");
    expect(out.component.button["button-line-secondary-default"].$value).toBe("{semantic.color.line-default}");
  });

  it("keeps the default value in $value and other columns under modes", () => {
    const out = serialiseDtcg(dummy()) as any;
    expect(out.semantic.spacing["space-s"].$value).toBe("{primitive.spacing.spacing-min-s}");
    expect(out.semantic.spacing["space-s"].$extensions[EXTENSION_KEY].modes).toEqual({ max: "{primitive.spacing.spacing-max-s}" });
    expect(out.primitive.motion["duration-fast"].$extensions[EXTENSION_KEY].modes).toEqual({ "reduced-motion": "0ms" });
  });

  it("reads files saved before column sets: light becomes the default", () => {
    const old = {
      primitive: { spacing: { "spacing-4": { $type: "dimension", $value: "16px" } } },
      semantic: { spacing: { "space-s": { $type: "dimension", $value: "{primitive.spacing.spacing-4}" } } },
    };
    const set = parseDtcg(old);
    expect(set.tokens[0].values).toEqual({ value: "16px" });
    expect(set.tokens[1].values).toEqual({ min: { ref: "spacing-4" } });
  });

  it("round-trips the dummy file exactly", () => {
    expect(serialiseDtcg(parseDtcg(raw), (raw as any).$description)).toEqual(raw);
  });
});
