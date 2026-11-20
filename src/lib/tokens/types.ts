/**
 * Core data model for the token tool.
 *
 * The tool works with a flat list of tokens in memory. On disk the same
 * tokens are stored as W3C design tokens (DTCG) JSON; see `dtcg.ts`.
 */

/** The 3 layers. Each layer has exactly one home in code. */
export type Layer = "primitive" | "semantic" | "component";

/**
 * Token types covered by v1. Keys use American spelling ("color") so they
 * match CSS and the DTCG format; the interface says "colour".
 */
export type Kind =
  | "color"
  | "spacing"
  | "sizing"
  | "typography"
  | "radius"
  | "border"
  | "shadow"
  | "motion";

/**
 * A mode (a column in the table, a mode in Figma), for example `value`,
 * `light`, `dark`, `min`, `max`, `default` or `reduced-motion`. Which modes a
 * token has comes from its column set; see `COLUMN_SETS` in `rules.ts`.
 */
export type Mode = string;

/** Token lifecycle. Push and sync states are tracked in history, not here. */
export type Status = "draft" | "active" | "deprecated";

/** A pointer to another token, stored by tool name (for example `orange-700`). */
export interface Reference {
  ref: string;
}

/** A single value: a raw literal (`#FF5000`, `16px`, `700`) or a reference. */
export type SimpleValue = string | number | Reference;

/** Composite values for typography, border and shadow. Each part may be a reference. */
export type CompositeValue = Record<string, SimpleValue>;

export type TokenValue = SimpleValue | CompositeValue;

export interface Token {
  /** Name in the tool, without any CSS prefix. */
  name: string;
  layer: Layer;
  kind: Kind;
  /** Component slug. Only set for component-specific tokens. */
  component?: string;
  /**
   * Values by mode, keyed by the modes of the token's column set. The first
   * mode is the default value and is always present. Read values with
   * `valueInMode`, which falls back to the default.
   */
  values: Record<Mode, TokenValue>;
  status: Status;
  description?: string;
  /**
   * The variable's name in Figma, with slashes for groups, for example
   * `spacing/max/3xs`. Kept from an import so a sync updates the same
   * variable. When empty, the plugin works out a name.
   */
  figma?: string;
}

/** A whole token set, as loaded from the token data repo (or the dummy set). */
export interface TokenSet {
  tokens: Token[];
}

export type Severity = "error" | "warning" | "info";

/**
 * A problem found by the rules engine.
 * Errors block saving. Warnings and info are shown but do not block.
 */
export interface Issue {
  severity: Severity;
  /** Stable machine code, for example `name.pattern`, used by tests and the UI. */
  code: string;
  /** Plain-English message for the person using the tool. */
  message: string;
  /** The token the issue is about, when there is one. */
  token?: string;
  /** The component the issue is about, when there is one. */
  component?: string;
}

/** Actions recorded on a token's timeline (F7). */
export type HistoryAction =
  | "created"
  | "edited"
  | "deprecated"
  | "pushed"
  | "pulled"
  | "accepted"
  | "declined"
  | "restored"
  | "synced"
  | "renamed";

export interface HistoryEntry {
  id: string;
  token: string;
  action: HistoryAction;
  /** ISO 8601 date and time. */
  at: string;
  /** GitHub username of the person who made the change. */
  by: string;
  /** Why, in the person's own words. Required for accepted and declined. */
  reason?: string;
  before?: Pick<Token, "values" | "status">;
  after?: Pick<Token, "values" | "status">;
  /** Pull request link, for pushed and declined entries. */
  prUrl?: string;
  /** For "renamed": the previous name. */
  from?: string;
}

export const isReference = (v: unknown): v is Reference =>
  typeof v === "object" && v !== null && "ref" in v && typeof (v as Reference).ref === "string";

export const isComposite = (v: TokenValue): v is CompositeValue =>
  typeof v === "object" && v !== null && !isReference(v);
