/**
 * Fluid tokens: a value that grows smoothly from its min value on small
 * screens to its max value on large screens. The CSS uses `clamp()`, worked
 * out the same way as the Utopia calculator (utopia.fyi).
 */
import { FLUID_VIEWPORT } from "./rules";

/**
 * A size in pixels. Figma stores sizes as plain numbers (pixels); code may
 * use `px` or `rem`. Returns null for anything else.
 */
export function toPx(v: unknown, rootFontSize = FLUID_VIEWPORT.rootFontSize): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = /^\s*(-?\d*\.?\d+)\s*(px|rem)?\s*$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "rem" ? n * rootFontSize : n;
}

/** Round to 4 decimal places and drop trailing zeros, as Utopia does. */
const round = (n: number) => String(Number(n.toFixed(4)));

/**
 * The `clamp()` for a min and max size in pixels. Example: 19 and 29 between
 * 400 and 1600 pixel screens gives `clamp(1.1875rem, 0.9792rem + 0.8333vw, 1.8125rem)`.
 */
export function fluidClamp(minPx: number, maxPx: number, viewport = FLUID_VIEWPORT): string {
  const rem = (px: number) => px / viewport.rootFontSize;
  if (minPx === maxPx) return `${round(rem(minPx))}rem`;
  const slope = (maxPx - minPx) / (viewport.max - viewport.min);
  const intercept = minPx - slope * viewport.min;
  const lower = Math.min(minPx, maxPx);
  const upper = Math.max(minPx, maxPx);
  const vw = round(slope * 100);
  const middle = `${round(rem(intercept))}rem ${vw.startsWith("-") ? "-" : "+"} ${vw.replace(/^-/, "")}vw`;
  return `clamp(${round(rem(lower))}rem, ${middle}, ${round(rem(upper))}rem)`;
}
