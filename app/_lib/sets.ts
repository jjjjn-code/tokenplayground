/**
 * Token sets shown in the sidebar, like folders in Tokens Studio.
 * A set is written in the URL as `?set=primitive/color`, `?set=semantic`,
 * `?set=component/button` and so on.
 */
import type { Kind, Layer, Token } from "@/src/lib/tokens";

export interface SetFilter {
  layer?: Layer;
  kind?: Kind;
  component?: string;
}

export function parseSet(value: string | null): SetFilter {
  if (!value || value === "all") return {};
  const [layer, rest] = value.split("/") as [Layer, string | undefined];
  if (layer === "component") return { layer, component: rest };
  return { layer, kind: rest as Kind | undefined };
}

export const setKey = (f: SetFilter): string =>
  !f.layer ? "all" : [f.layer, f.layer === "component" ? f.component : f.kind].filter(Boolean).join("/");

export const inSet = (t: Token, f: SetFilter): boolean =>
  (!f.layer || t.layer === f.layer) && (!f.kind || t.kind === f.kind) && (!f.component || t.component === f.component);

export const LAYER_TITLE: Record<Layer, string> = {
  primitive: "Primitives",
  semantic: "Semantic",
  component: "Components",
};

export const KIND_TITLE: Record<Kind, string> = {
  color: "Colour",
  spacing: "Spacing",
  sizing: "Sizing",
  typography: "Typography",
  radius: "Radius",
  border: "Border",
  shadow: "Shadow",
};

export const KIND_ORDER: Kind[] = ["color", "spacing", "sizing", "typography", "radius", "border", "shadow"];

export function setTitle(f: SetFilter): string[] {
  if (!f.layer) return ["All tokens"];
  const parts = [LAYER_TITLE[f.layer]];
  if (f.kind) parts.push(KIND_TITLE[f.kind]);
  if (f.component) parts.push(f.component);
  return parts;
}
