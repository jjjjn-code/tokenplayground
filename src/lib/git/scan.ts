/**
 * Component scan (F12), the Token Library side: add the tokens that the
 * Figma plugin made to the saved token set, as 1 commit. Sending the same
 * scan again (a retry) changes nothing, so the plugin can always retry.
 */
import { parseDtcg } from "../tokens/dtcg";
import { checkBeforeSave } from "../tokens/validate";
import type { HistoryEntry, Issue, Token, TokenSet } from "../tokens/types";
import { ConflictError, HostError, type GitHost } from "./host";
import { loadData, saveData, type SyncConfig } from "./sync";

export interface ScanMerge {
  set: TokenSet;
  entries: HistoryEntry[];
  /** New tokens. */
  added: string[];
  /** Already in Token Library with the same values: a retry. */
  same: string[];
  /** Already in Token Library with different values. Nothing is saved while there are any. */
  conflicts: string[];
  /** Errors from the token checks. Nothing is saved while there are any. */
  errors: Issue[];
}

const sameValues = (a: Token, b: Token) => JSON.stringify(a.values) === JSON.stringify(b.values);

/** Merge scanned tokens into a set. Pure: it does not save. */
export function mergeScannedTokens(set: TokenSet, incoming: Token[], o: { component: string; fileName: string; by: string; at: string }): ScanMerge {
  const errors: Issue[] = [];
  const byName = new Map(set.tokens.map((t) => [t.name, t]));
  const added: Token[] = [];
  const same: string[] = [];
  const conflicts: string[] = [];
  for (const t of incoming) {
    if (t.layer !== "component" || t.kind !== "color" || t.component !== o.component || !t.name.startsWith(`${o.component}-`)) {
      errors.push({ severity: "error", code: "scan.foreign", message: `${t.name} is not a ${o.component} colour token. Scan the component again.`, token: t.name });
      continue;
    }
    const existing = byName.get(t.name);
    if (!existing) added.push({ ...t, status: "active" });
    else if (sameValues(existing, t)) same.push(t.name);
    else conflicts.push(t.name);
  }
  if (added.length) {
    const { issues } = checkBeforeSave(set, added);
    errors.push(...issues.filter((i) => i.severity === "error"));
  }
  const entries: HistoryEntry[] = added.map((t, i) => ({
    id: `s-${Date.parse(o.at).toString(36)}-${i}`,
    token: t.name,
    action: "created",
    at: o.at,
    by: o.by,
    reason: `Made by the component scan in Figma file "${o.fileName}".`,
    after: { values: t.values, status: t.status },
  }));
  return { set: { tokens: [...set.tokens, ...added] }, entries, added: added.map((t) => t.name), same, conflicts, errors };
}

export interface ScanBody {
  fileName?: string;
  component?: string;
  title?: string;
  /** The new tokens as W3C design tokens JSON. */
  tokens?: unknown;
}

export interface ReceiveResult {
  added: string[];
  same: string[];
  head: string | null;
}

/** Save scanned tokens to the token data repo. Throws HostError with a message the plugin shows. */
export async function receiveScan(host: GitHost, cfg: SyncConfig, by: string, body: ScanBody, at = new Date().toISOString()): Promise<ReceiveResult> {
  const component = typeof body.component === "string" ? body.component : "";
  if (!component || !body.tokens || typeof body.tokens !== "object") throw new HostError("The request is not complete. Scan the component again.", 400);
  let incoming: Token[];
  try {
    incoming = parseDtcg(body.tokens).tokens;
  } catch {
    throw new HostError("Token Library cannot read the tokens. Scan the component again.", 400);
  }
  if (!incoming.length) throw new HostError("The request has no tokens. Scan the component again.", 400);
  if (incoming.length > 500) throw new HostError("The request has too many tokens.", 413);
  const fileName = (typeof body.fileName === "string" ? body.fileName : "a Figma file").slice(0, 200);
  const title = (typeof body.title === "string" ? body.title : component).slice(0, 100);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const d = await loadData(host, cfg);
    const m = mergeScannedTokens(d.set, incoming, { component, fileName, by, at });
    if (m.conflicts.length) {
      throw new HostError(
        `Token Library already has ${m.conflicts.join(", ")} with different values. Change ${m.conflicts.length === 1 ? "it" : "them"} in Token Library, or change the variables in Figma to match.`,
        409,
      );
    }
    if (m.errors.length) {
      const first = m.errors[0];
      throw new HostError(`Token Library did not save the tokens. ${first.token ? `${first.token}: ` : ""}${first.message}`, 422);
    }
    if (!m.added.length) return { added: [], same: m.same, head: d.head };
    try {
      const head = await saveData(host, cfg, {
        expectedHead: d.head,
        set: m.set,
        history: [...d.history, ...m.entries],
        message: `Component scan: ${m.added.length} ${title} ${m.added.length === 1 ? "token" : "tokens"}\n\nMade by ${by} with the component scan in Figma file "${fileName}".`,
      });
      return { added: m.added, same: m.same, head };
    } catch (e) {
      // Someone saved at the same time: load again and retry.
      if (!(e instanceof ConflictError) || attempt === 2) throw e;
    }
  }
  throw new HostError("Token Library is busy. Send again.", 503);
}
