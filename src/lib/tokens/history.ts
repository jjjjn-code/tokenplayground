/**
 * Version history and decision log (F7). Phase 1 defines the shape and the
 * basic queries; recording entries from real actions arrives with push and
 * pull in phases 3 and 4.
 */
import type { HistoryAction, HistoryEntry, Issue } from "./types";

/** Actions that must carry a reason. */
export const REASON_REQUIRED: HistoryAction[] = ["accepted", "declined", "restored", "deprecated"];

/** A token's timeline, oldest first. */
export function historyFor(log: HistoryEntry[], token: string): HistoryEntry[] {
  return log.filter((e) => e.token === token).sort((a, b) => a.at.localeCompare(b.at));
}

/** The most recent entry for a token, for the "last change" column (F1). */
export function lastChange(log: HistoryEntry[], token: string): HistoryEntry | undefined {
  const t = historyFor(log, token);
  return t[t.length - 1];
}

/** Check a log entry is complete before it is written. */
export function checkHistoryEntry(e: HistoryEntry): Issue[] {
  const out: Issue[] = [];
  if (!e.by) out.push({ severity: "error", code: "history.author", message: "Every change needs an author.", token: e.token });
  if (Number.isNaN(Date.parse(e.at))) {
    out.push({ severity: "error", code: "history.date", message: `"${e.at}" is not a valid date.`, token: e.token });
  }
  if (REASON_REQUIRED.includes(e.action) && !e.reason?.trim()) {
    out.push({ severity: "error", code: "history.reason", message: `A ${e.action} change needs a reason.`, token: e.token });
  }
  if ((e.action === "pushed" || e.action === "declined") && !e.prUrl) {
    out.push({ severity: "warning", code: "history.pr", message: `A ${e.action} change should link its pull request.`, token: e.token });
  }
  return out;
}
