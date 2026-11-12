/**
 * Write the starting files for the token data repo and the sandbox code repo.
 *
 *   npm run seed -- <token data repo folder> <sandbox repo folder>
 *
 * Uses the dummy token set. Existing files with the same names are overwritten.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import rawTokens from "../data/dummy/tokens.json";
import rawHistory from "../data/dummy/history.json";
import { seedFiles } from "../src/lib/git/sync";
import { parseDtcg, type HistoryEntry } from "../src/lib/tokens";

const [dataDir, codeDir] = process.argv.slice(2);
if (!dataDir || !codeDir) {
  console.error("Usage: npm run seed -- <token data repo folder> <sandbox repo folder>");
  process.exit(1);
}
const { data, code } = seedFiles(parseDtcg(structuredClone(rawTokens)), structuredClone(rawHistory) as HistoryEntry[]);
for (const [dir, files] of [[dataDir, data], [codeDir, code]] as const) {
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    console.log(`wrote ${full}`);
  }
}
