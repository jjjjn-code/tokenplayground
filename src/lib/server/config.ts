import "server-only";
import rawTokens from "@/data/dummy/tokens.json";
import rawHistory from "@/data/dummy/history.json";
import { MemoryHost } from "../git/host";
import { seedFiles, type SyncConfig } from "../git/sync";
import { simulateDeveloperDrift } from "../git/drift";
import { parseDtcg, type HistoryEntry } from "../tokens";

/**
 * How the tool runs:
 * - "github": signed in with the GitHub App, reading and writing real repos.
 * - "demo": a fake GitHub inside the server, for trying push without set-up.
 * - "local": no server storage; edits stay in the browser (phase 2 behaviour).
 */
export type Mode = "local" | "demo" | "github";

export function mode(): Mode {
  const e = process.env;
  if (e.GITHUB_APP_CLIENT_ID && e.GITHUB_APP_CLIENT_SECRET && e.SESSION_SECRET && e.TOKENS_DATA_REPO && e.TOKENS_CODE_REPO) return "github";
  if (e.TOKENS_DEMO === "1") return "demo";
  return "local";
}

export function syncConfig(): SyncConfig {
  const e = process.env;
  return {
    dataRepo: e.TOKENS_DATA_REPO || "demo/ual-tokens-data",
    dataBranch: e.TOKENS_DATA_BRANCH || "main",
    codeRepo: e.TOKENS_CODE_REPO || "demo/ual-tokens-sandbox",
    codeBranch: e.TOKENS_CODE_BRANCH || "main",
    releaseBranch: e.TOKENS_RELEASE_BRANCH || e.TOKENS_CODE_BRANCH || "main",
  };
}

const g = globalThis as unknown as { __tokenToolDemoHost?: MemoryHost };

/** The fake GitHub for demo mode, seeded with the dummy set. Resets when the server restarts. */
export function demoHost(): MemoryHost {
  if (!g.__tokenToolDemoHost) {
    const host = new MemoryHost("https://github.com");
    const cfg = syncConfig();
    const seed = seedFiles(parseDtcg(structuredClone(rawTokens)), structuredClone(rawHistory) as HistoryEntry[]);
    host.seed(cfg.dataRepo, cfg.dataBranch, seed.data);
    const codeHead = host.seed(cfg.codeRepo, cfg.codeBranch, seed.code);
    // A developer has since changed the release branch, so pull has something to review.
    const drifted = simulateDeveloperDrift(seed.code);
    void host.commit(
      cfg.codeRepo,
      cfg.codeBranch,
      codeHead,
      Object.entries(drifted).filter(([p, c]) => seed.code[p] !== c).map(([path, content]) => ({ path, content })),
      "Developer changes (simulated drift cases)",
    );
    g.__tokenToolDemoHost = host;
  }
  return g.__tokenToolDemoHost;
}
