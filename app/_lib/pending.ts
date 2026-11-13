import { lastChange, type Discrepancy, type HistoryEntry } from "@/src/lib/tokens";

/**
 * A code change already answered: declined, or accepted under a new name.
 * It stays in the code until someone merges the follow-up pull request, so
 * it waits instead of asking the designer again. Returns the history entry.
 */
export function answeredBy(d: Discrepancy, history: HistoryEntry[]): HistoryEntry | null {
  const renamed = d.kind === "extra" ? [...history].reverse().find((e) => e.action === "accepted" && e.from === d.codeName && e.prUrl) : undefined;
  if (renamed) return renamed;
  const last = lastChange(history, d.token ?? d.suggestedName ?? d.codeName);
  return last?.prUrl && (last.action === "declined" || (last.action === "accepted" && last.from)) ? last : null;
}
