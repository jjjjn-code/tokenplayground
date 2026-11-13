/**
 * Change sets for push (F5): what changed between 2 versions of the token
 * set, the pull request changelog, and merging edits after a conflict.
 */
import { cssFileFor } from "./repo";
import { formatValue } from "./references";
import type { Token, TokenSet, TokenValue } from "./types";

export type ChangeType = "added" | "changed" | "removed";

export interface Change {
  type: ChangeType;
  name: string;
  before?: Token;
  after?: Token;
  /** File the token lives in (after the change, or before for a removal). */
  file: string;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Only what reaches the CSS counts as a change: values, status and file. */
const cssShape = (t: Token) => ({ values: t.values, status: t.status, layer: t.layer, kind: t.kind, component: t.component });

/** Every token added, changed or removed between `before` and `after`, in the order of `after`. */
export function diffSets(before: TokenSet, after: TokenSet): Change[] {
  const old = new Map(before.tokens.map((t) => [t.name, t]));
  const now = new Map(after.tokens.map((t) => [t.name, t]));
  const out: Change[] = [];
  for (const t of after.tokens) {
    const b = old.get(t.name);
    if (!b) out.push({ type: "added", name: t.name, after: t, file: cssFileFor(t) });
    else if (!same(cssShape(b), cssShape(t))) out.push({ type: "changed", name: t.name, before: b, after: t, file: cssFileFor(t) });
  }
  for (const t of before.tokens) {
    if (!now.has(t.name)) out.push({ type: "removed", name: t.name, before: t, file: cssFileFor(t) });
  }
  return out;
}

/** Files a change set touches, parent first. */
export function filesTouched(changes: Change[]): string[] {
  const files = [...new Set(changes.map((c) => c.file))];
  return files.sort((a, b) => (a.startsWith("components/") ? 1 : 0) - (b.startsWith("components/") ? 1 : 0) || a.localeCompare(b));
}

/**
 * A value for the changelog: references as bare names, each mode labelled.
 * Pass `other` (the version on the other side of the change) to bold the
 * modes that changed.
 */
function cellValue(t: Token | undefined, other?: Token): string {
  if (!t) return "none";
  const v = (x: TokenValue | undefined) => formatValue(x).replace(/[{}]/g, "");
  const mark = (now: TokenValue | undefined, then: TokenValue | undefined) =>
    other && JSON.stringify(now) !== JSON.stringify(then) ? `**${v(now)}**` : v(now);
  let value: string;
  if (t.layer === "primitive" || t.values.dark === undefined) {
    value = mark(t.values.light, other?.values.light);
  } else {
    const otherDark = other ? other.values.dark ?? other.values.light : undefined;
    value = `Light: ${mark(t.values.light, other?.values.light)}<br>Dark: ${mark(t.values.dark, otherDark)}`;
  }
  return t.status === "deprecated" ? `${value} (deprecated)` : value;
}

const escapeCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const LABEL: Record<ChangeType, string> = { added: "Added", changed: "Changed", removed: "Removed" };

export interface ChangelogInput {
  title: string;
  summary: string;
  author: string;
  changes: Change[];
}

/** The pull request description, in the format agreed in the PRD. */
export function changelogMarkdown({ title, summary, author, changes }: ChangelogInput): string {
  const rows = changes.map(
    (c) =>
      `| ${LABEL[c.type]} | ${escapeCell(c.name)} | ${escapeCell(cellValue(c.before))} | ${escapeCell(cellValue(c.after, c.before))} | ${c.file} |`,
  );
  const counts = (["added", "changed", "removed"] as const)
    .map((t) => [t, changes.filter((c) => c.type === t).length] as const)
    .filter(([, n]) => n)
    .map(([t, n]) => `${n} ${t}`)
    .join(", ");
  return [
    `## Token update: ${title}`,
    "",
    `Summary (written by the author): ${summary.trim() || "none given."}`,
    "",
    "| Change | Token | Before | After | File |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    `${changes.length} ${changes.length === 1 ? "token" : "tokens"}: ${counts || "no changes"}. Changed values are in bold.`,
    "",
    `Pushed by ${author} from the token tool. Only the managed blocks between \`tokens:start\` and \`tokens:end\` were changed.`,
  ].join("\n");
}

/** A branch name for a push, for example `tokens/2026-11-12-button-hover-states`. */
export function branchName(title: string, date: Date): string {
  const day = date.toISOString().slice(0, 10);
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `tokens/${day}-${words || "update"}`;
}

export interface MergeResult {
  merged: TokenSet;
  /** Tokens both you and someone else changed. Your version is kept. */
  conflicts: string[];
}

/**
 * Reapply your unsaved edits on top of a newer saved version. `base` is
 * what you loaded, `mine` is your working copy, `theirs` is the newer save.
 * Tokens you did not touch take their version; tokens you touched keep yours.
 */
export function mergeEdits(base: TokenSet, mine: TokenSet, theirs: TokenSet): MergeResult {
  const b = new Map(base.tokens.map((t) => [t.name, t]));
  const m = new Map(mine.tokens.map((t) => [t.name, t]));
  const th = new Map(theirs.tokens.map((t) => [t.name, t]));
  const touched = new Set<string>();
  for (const name of new Set([...b.keys(), ...m.keys()])) {
    if (!same(b.get(name), m.get(name))) touched.add(name);
  }
  const conflicts: string[] = [];
  const out: Token[] = [];
  for (const t of theirs.tokens) {
    if (!touched.has(t.name)) out.push(t);
    else {
      if (!same(b.get(t.name), t)) conflicts.push(t.name);
      const mineT = m.get(t.name);
      if (mineT) out.push(mineT); // removed by you: leave it out
    }
  }
  for (const t of mine.tokens) {
    if (touched.has(t.name) && !th.has(t.name)) {
      // New in yours, or removed in theirs while you edited it.
      if (b.has(t.name)) conflicts.push(t.name);
      out.push(t);
    }
  }
  return { merged: { tokens: out }, conflicts };
}

export interface DiffLine {
  type: " " | "+" | "-";
  text: string;
}

/** A line-by-line diff (longest common subsequence), for showing file changes before a push. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");
  const m = a.length;
  const n = b.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: " ", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: "-", text: a[i] });
      i += 1;
    } else {
      out.push({ type: "+", text: b[j] });
      j += 1;
    }
  }
  while (i < m) out.push({ type: "-", text: a[i++] });
  while (j < n) out.push({ type: "+", text: b[j++] });
  return out;
}

/** Keep changed lines and `context` lines around them; gaps become null. */
export function diffHunks(lines: DiffLine[], context = 2): (DiffLine | null)[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.type === " ") return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k += 1) keep[k] = true;
  });
  const out: (DiffLine | null)[] = [];
  lines.forEach((l, i) => {
    if (keep[i]) out.push(l);
    else if (out.length && out[out.length - 1] !== null) out.push(null);
  });
  if (out[out.length - 1] === null) out.pop();
  return out;
}
