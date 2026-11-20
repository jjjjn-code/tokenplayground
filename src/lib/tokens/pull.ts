/**
 * Pull and discrepancy review (F6): read token CSS from the code repo,
 * compare it with the tool, and turn each accept or decline into changes.
 */
import { FLUID_MODE, REDUCED_MOTION_QUERY, tokenDeclarations, type CssContext } from "./css";
import { cssVariableName, parseComponentTokenName } from "./naming";
import { columnSetOf, defaultMode, indexTokens, modeLabel, modesOf } from "./references";
import { componentCssPath, PARENT_CSS_PATH, cssFileFor } from "./repo";
import { isComposite, isReference, type HistoryEntry, type Mode, type SimpleValue, type Token, type TokenSet, type TokenValue } from "./types";

/** One custom property found in a CSS file. */
export interface CssDecl {
  file: string;
  /** Where it was found: the default rule (`@theme`, `:root` or the component class), `.dark`, or the reduced motion media query. */
  context: CssContext;
  /** Component class for component files, otherwise undefined. */
  scope?: string;
  name: string;
  value: string;
}

const clean = (v: string) => v.replace(/\/\*.*?\*\//g, "").replace(/\s+/g, " ").trim();
/** Values compare without case or spacing differences. */
const same = (a: string, b: string) => clean(a).toLowerCase() === clean(b).toLowerCase();

/**
 * Read every custom property in a token CSS file. `@theme` and `:root` are
 * the default, `.dark` is dark; `.button` and `.dark .button` are a
 * component's default and dark. `:root` inside a reduced motion media query
 * is reduced motion.
 */
export function parseTokenCss(file: string, text: string): CssDecl[] {
  const out: CssDecl[] = [];
  let body = text.replace(/\/\*[\s\S]*?\*\//g, (m) => (m.includes("deprecated") ? "" : " "));
  // Reduced motion: pull the media query out first, so its inner rule is not read as the default.
  const query = REDUCED_MOTION_QUERY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s*");
  body = body.replace(new RegExp(`${query}\\s*\\{\\s*(?::root|html)\\s*\\{([^{}]*)\\}\\s*\\}`, "g"), (_m, inner: string) => {
    for (const d of inner.matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/g)) {
      out.push({ file, context: "reduced-motion", name: d[1], value: clean(d[2]) });
    }
    return " ";
  });
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of body.matchAll(rule)) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    let context: CssContext = "base";
    let scope: string | undefined;
    if (selector === ".dark" || selector === ":root.dark" || selector === "html.dark") context = "dark";
    else if (/^\.dark \.[a-z0-9-]+$/.test(selector)) {
      context = "dark";
      scope = selector.split(" ")[1].slice(1);
    } else if (/^\.[a-z0-9-]+$/.test(selector)) scope = selector.slice(1);
    else if (selector !== "@theme" && selector !== ":root" && selector !== "@theme inline") continue;
    for (const d of m[2].matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/g)) {
      out.push({ file, context, scope, name: d[1], value: clean(d[2]) });
    }
  }
  return out;
}

/** The token mode a CSS context stands for: dark, reduced motion, or the token's default (`fluid` for a fluid token). */
function modeFor(t: Token, context: CssContext): Mode {
  if (context !== "base") return context;
  return columnSetOf(t) === "fluid" ? FLUID_MODE : defaultMode(t);
}

/** What the tool expects in a file: the same shape as {@link parseTokenCss}. */
export function expectedCss(set: TokenSet, file: string): CssDecl[] {
  const index = indexTokens(set);
  const out: CssDecl[] = [];
  const component = file === PARENT_CSS_PATH ? undefined : file.split("/")[1];
  for (const t of set.tokens) {
    if (cssFileFor(t) !== file) continue;
    for (const o of tokenDeclarations(t, index)) {
      for (const line of o.lines) {
        const m = /^(--[A-Za-z0-9-]+):\s*(.*?);/.exec(line);
        if (m) out.push({ file, context: o.context, scope: component, name: m[1], value: clean(m[2]) });
      }
    }
  }
  return out;
}

export type DiscrepancyKind =
  | "changed" // a different value in the code
  | "flattened" // a reference replaced by a raw value
  | "missing" // in the tool, not in the code
  | "extra" // in the code, not in the tool
  | "renamed"; // in the code under a different code name

export interface ModeDifference {
  /** The token's mode (`light`, `value`, `reduced-motion`, `fluid` and so on). For code-only tokens, the CSS context. */
  mode: Mode;
  /** What the tool would write, or null when the tool has nothing. */
  tool: string | null;
  /** What the code has, or null when the code has nothing. */
  code: string | null;
}

export interface Discrepancy {
  /** Stable id for decisions: the token name, or the code name for extra tokens. */
  id: string;
  kind: DiscrepancyKind;
  file: string;
  /** The tool token, when there is one. */
  token?: string;
  /** The code name in the code. */
  codeName: string;
  differences: ModeDifference[];
  /** For "extra": a suggested tool name. */
  suggestedName?: string;
  /** For "renamed": the code name the tool expects. */
  expectedCodeName?: string;
  /** When accepting is not possible, why. */
  acceptBlockedReason?: string;
}

/** Turn a CSS value back into a token value: var(--x) becomes a reference when x is a known token. */
export function cssToValue(value: string, byCodeName: Map<string, Token>): SimpleValue {
  const v = clean(value);
  const m = /^var\(\s*(--[A-Za-z0-9-]+)\s*\)$/.exec(v);
  if (m) {
    const t = byCodeName.get(m[1]);
    return t ? { ref: t.name } : v;
  }
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v.toUpperCase();
  const n = Number(v);
  return v !== "" && !Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(v) ? n : v;
}

/** The tool name a code name stands for, when it follows our prefix rules. */
function toolNameFor(codeName: string, file: string): string {
  const bare = codeName.replace(/^--/, "");
  return file === PARENT_CSS_PATH && bare.startsWith("color-") ? bare.slice("color-".length) : bare;
}

/**
 * Every difference between the tool and the code. `files` holds the code's
 * text for each file the tool manages (null when the file is missing).
 */
export function findDiscrepancies(set: TokenSet, files: Record<string, string | null>): Discrepancy[] {
  const byName = new Map(set.tokens.map((t) => [t.name, t]));
  const out: Discrepancy[] = [];

  for (const [file, text] of Object.entries(files)) {
    const expected = expectedCss(set, file);
    const actual = text === null ? [] : parseTokenCss(file, text);
    const key = (d: CssDecl) => `${d.context}|${d.name}`;
    const exp = new Map(expected.map((d) => [key(d), d]));
    const act = new Map(actual.map((d) => [key(d), d]));

    // Which token each expected code name belongs to.
    const owner = new Map<string, Token>();
    const index = indexTokens(set);
    for (const t of set.tokens) {
      if (cssFileFor(t) !== file) continue;
      for (const o of tokenDeclarations(t, index)) {
        for (const line of o.lines) {
          const m = /^(--[A-Za-z0-9-]+):/.exec(line);
          if (m) owner.set(m[1], t);
        }
      }
    }

    // Tool tokens: changed, flattened or missing.
    const perToken = new Map<string, ModeDifference[]>();
    for (const [k, e] of exp) {
      const a = act.get(k);
      if (a && same(a.value, e.value)) continue;
      const t = owner.get(e.name)!;
      const list = perToken.get(t.name) ?? [];
      list.push({ mode: modeFor(t, e.context), tool: e.value, code: a ? a.value : null });
      perToken.set(t.name, list);
    }

    // Code names the tool does not have.
    const extraNames = new Map<string, CssDecl[]>();
    for (const [k, a] of act) {
      if (exp.has(k)) continue;
      if (owner.has(a.name)) {
        // A known token in a mode the tool does not write (for example a dark value for a primitive).
        const t = owner.get(a.name)!;
        const list = perToken.get(t.name) ?? [];
        list.push({ mode: modeFor(t, a.context), tool: null, code: a.value });
        perToken.set(t.name, list);
        continue;
      }
      extraNames.set(a.name, [...(extraNames.get(a.name) ?? []), a]);
    }

    for (const [name, diffs] of perToken) {
      const t = byName.get(name)!;
      // Only active tokens are reviewed. Drafts and deprecated tokens are left out.
      if (t.status !== "active") continue;
      const allMissing = diffs.every((d) => d.code === null);
      const expectedName = cssVariableName(t);
      // Renamed in code: the tool's name is missing, and a code name with the same bare name is extra.
      const renamedFrom = allMissing
        ? [...extraNames.keys()].find((n) => n.replace(/^--/, "") === toolNameFor(expectedName, file) || toolNameFor(n, file) === t.name)
        : undefined;
      if (renamedFrom) {
        const code = extraNames.get(renamedFrom)!;
        extraNames.delete(renamedFrom);
        out.push({
          id: name,
          kind: "renamed",
          file,
          token: name,
          codeName: renamedFrom,
          expectedCodeName: expectedName,
          differences: diffs.map((d) => ({ ...d, code: code.find((c) => modeFor(t, c.context) === d.mode)?.value ?? null })),
          acceptBlockedReason: `The code name must be ${expectedName}. Decline to put the correct name back in the code.`,
        });
        continue;
      }
      const flattened = diffs.some((d) => d.tool?.startsWith("var(") && d.code !== null && !d.code.startsWith("var("));
      const composite = Object.values(t.values).some((v) => isComposite(v));
      const fluid = columnSetOf(t) === "fluid";
      const blocked = allMissing
        ? undefined
        : fluid
          ? "The code value is worked out from the min and max tokens. Change the min or max token in the tool, then check again."
          : composite
            ? "This token has more than 1 part. Change the token by hand, then check again."
            : undefined;
      out.push({
        id: name,
        kind: allMissing ? "missing" : flattened ? "flattened" : "changed",
        file,
        token: name,
        codeName: expectedName,
        differences: diffs,
        ...(blocked ? { acceptBlockedReason: blocked } : {}),
      });
    }

    for (const [codeName, decls] of extraNames) {
      const suggested = toolNameFor(codeName, file);
      out.push({
        id: `code:${file}:${codeName}`,
        kind: "extra",
        file,
        codeName,
        suggestedName: suggested,
        differences: decls.map((d) => ({ mode: d.context, tool: null, code: d.value })),
      });
    }
  }
  const order: Record<DiscrepancyKind, number> = { changed: 0, flattened: 1, renamed: 2, missing: 3, extra: 4 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || a.id.localeCompare(b.id));
}

/** The files a pull reads: the parent file and 1 file per component in the tool. */
export function pullFiles(set: TokenSet): string[] {
  const components = [...new Set(set.tokens.map((t) => t.component).filter(Boolean) as string[])].sort();
  return [PARENT_CSS_PATH, ...components.map(componentCssPath)];
}

export interface Decision {
  id: string;
  decision: "accept" | "decline";
  reason: string;
  /** For accepting an extra token: the tool name to give it. */
  name?: string;
}

export interface AppliedPull {
  set: TokenSet;
  history: Omit<HistoryEntry, "id" | "at" | "by">[];
  /** Tokens whose code value is now the agreed value: name to token (null when removed). */
  baseline: Record<string, Token | null>;
  declined: { discrepancy: Discrepancy; reason: string }[];
  /** Tokens only in code, accepted under a different name: the code must change too. */
  renamedOnAccept: { discrepancy: Discrepancy; name: string; reason: string }[];
  /** Problems that stop a decision being applied. */
  problems: { id: string; message: string }[];
}

/**
 * Apply accept and decline decisions to the token set. Accepting makes the
 * tool match the code; declining keeps the tool value (a restore pull
 * request puts it back in the code).
 */
export function applyDecisions(set: TokenSet, discrepancies: Discrepancy[], decisions: Decision[]): AppliedPull {
  let tokens = [...set.tokens];
  const history: AppliedPull["history"] = [];
  const baseline: AppliedPull["baseline"] = {};
  const declined: AppliedPull["declined"] = [];
  const renamedOnAccept: AppliedPull["renamedOnAccept"] = [];
  const problems: AppliedPull["problems"] = [];
  const byId = new Map(discrepancies.map((d) => [d.id, d]));
  const codeNames = () => new Map(tokens.map((t) => [cssVariableName(t), t]));

  for (const dec of decisions) {
    const d = byId.get(dec.id);
    if (!d) {
      problems.push({ id: dec.id, message: "This difference is not in the code now. Check again." });
      continue;
    }
    if (!dec.reason.trim()) {
      problems.push({ id: dec.id, message: "Type a reason for the decision." });
      continue;
    }
    if (dec.decision === "decline") {
      declined.push({ discrepancy: d, reason: dec.reason.trim() });
      history.push({ token: d.token ?? dec.name ?? d.suggestedName ?? d.codeName, action: "declined", reason: dec.reason.trim() });
      continue;
    }
    if (d.acceptBlockedReason) {
      problems.push({ id: d.id, message: d.acceptBlockedReason });
      continue;
    }
    const map = codeNames();
    const codeValue = (mode: Mode): TokenValue | undefined => {
      const diff = d.differences.find((x) => x.mode === mode);
      return diff && diff.code !== null ? cssToValue(diff.code, map) : undefined;
    };

    if (d.kind === "missing") {
      const users = tokens.filter((t) => Object.values(t.values).some((v) => v !== undefined && JSON.stringify(v).includes(`"ref":"${d.token}"`)));
      if (users.length) {
        problems.push({ id: d.id, message: `${users.length} ${users.length === 1 ? "token refers" : "tokens refer"} to ${d.token}. Change ${users.length === 1 ? "it" : "them"} first, then accept.` });
        continue;
      }
      const before = tokens.find((t) => t.name === d.token)!;
      tokens = tokens.filter((t) => t.name !== d.token);
      baseline[d.token!] = null;
      history.push({ token: d.token!, action: "accepted", reason: dec.reason.trim(), before: { values: before.values, status: before.status } });
      continue;
    }

    if (d.kind === "extra") {
      const name = (dec.name ?? d.suggestedName ?? "").trim();
      const component = d.file === PARENT_CSS_PATH ? undefined : d.file.split("/")[1];
      // Tokens only in code are read as colour tokens; other types are added by hand.
      const base = codeValue("base") ?? codeValue("dark")!;
      const dark = codeValue("dark");
      const layer = component ? "component" : isReference(base) ? "semantic" : "primitive";
      const t: Token = {
        name,
        layer,
        kind: "color",
        ...(component ? { component } : {}),
        values: layer === "primitive" ? { value: base } : { light: base, dark: dark ?? base },
        status: "active",
      };
      if (component && !parseComponentTokenName(name)) {
        problems.push({ id: d.id, message: `Type a name in the format ${component}-[category]-[role]-[state].` });
        continue;
      }
      tokens.push(t);
      const renamed = cssVariableName(t) !== d.codeName;
      // The follow-up pull request gives it the new name in code, so it is part of the agreed baseline.
      if (renamed) renamedOnAccept.push({ discrepancy: d, name, reason: dec.reason.trim() });
      baseline[name] = t;
      history.push({ token: name, action: "accepted", reason: dec.reason.trim(), after: { values: t.values, status: t.status }, ...(renamed ? { from: d.codeName } : {}) });
      continue;
    }

    // changed or flattened: take the code's values.
    const before = tokens.find((t) => t.name === d.token)!;
    const values = { ...before.values };
    const own = modesOf(before).map((m) => m.key);
    for (const diff of d.differences) {
      const v = codeValue(diff.mode);
      if (v === undefined) continue;
      // A value in a mode the token does not have (for example dark on a primitive) is not taken.
      if (!own.includes(diff.mode)) continue;
      values[diff.mode] = v;
    }
    const after: Token = { ...before, values };
    tokens = tokens.map((t) => (t.name === before.name ? after : t));
    baseline[after.name] = after;
    history.push({
      token: after.name,
      action: "accepted",
      reason: dec.reason.trim(),
      before: { values: before.values, status: before.status },
      after: { values: after.values, status: after.status },
    });
  }
  return { set: { tokens }, history, baseline, declined, renamedOnAccept, problems };
}

const KIND_LABEL: Record<DiscrepancyKind, string> = {
  changed: "Changed in code",
  flattened: "Reference replaced by a raw value",
  missing: "Missing in code",
  extra: "Only in code",
  renamed: "Wrong code name",
};

export const discrepancyLabel = (k: DiscrepancyKind) => KIND_LABEL[k];

/** The description of the pull request that puts declined values back, and gives accepted tokens their new names. */
export function restoreChangelog(declined: AppliedPull["declined"], author: string, renamedOnAccept: AppliedPull["renamedOnAccept"] = []): string {
  const cell = (s: string | null) => (s === null ? "none" : s.replace(/\|/g, "\\|"));
  const rows = declined.map(({ discrepancy: d, reason }) => {
    const code = d.differences.map((x) => `${modeLabel(x.mode)}: ${cell(x.code)}`).join("<br>");
    const tool = d.differences.map((x) => `${modeLabel(x.mode)}: ${cell(x.tool)}`).join("<br>");
    return `| ${KIND_LABEL[d.kind]} | ${d.token ?? d.codeName} | ${code} | ${tool} | ${reason.replace(/\|/g, "\\|")} | ${d.file} |`;
  });
  for (const { discrepancy: d, name, reason } of renamedOnAccept) {
    rows.push(`| Accepted with a new name | ${name} | ${d.codeName} | ${d.file === PARENT_CSS_PATH ? `--color-${name}` : `--${name}`} | ${reason.replace(/\|/g, "\\|")} | ${d.file} |`);
  }
  return [
    declined.length ? "## Token restore: declined changes" : "## Token update: names agreed in review",
    "",
    "A designer reviewed changes in the code. This pull request puts the agreed values and names in the code.",
    "",
    "| Difference | Token | In the code | Restored to | Reason | File |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    `Declined by ${author} in Token Library. Only the managed blocks between \`tokens:start\` and \`tokens:end\` were changed.`,
  ].join("\n");
}
