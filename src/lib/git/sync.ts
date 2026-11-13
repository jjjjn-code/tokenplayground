/**
 * Save to the token data repo, and push to the code repo (F5).
 *
 * Token data repo layout:
 *   tokens.json     the master token set (DTCG)
 *   history.json    the decision log
 *   last-push.json  what the code repo was last given, used to work out the next change set
 */
import {
  changelogMarkdown,
  componentCss,
  diffSets,
  filesTouched,
  parentCss,
  parseDtcg,
  replaceManagedBlock,
  serialiseDtcg,
  validateTokenSet,
  BLOCK_END,
  BLOCK_START,
  PARENT_CSS_PATH,
  branchName,
  type Change,
  type HistoryEntry,
  type TokenSet,
} from "../tokens";
import { ConflictError, HostError, type GitHost } from "./host";

export const DATA_FILES = { tokens: "tokens.json", history: "history.json", lastPush: "last-push.json" } as const;

export interface SyncConfig {
  dataRepo: string;
  dataBranch: string;
  codeRepo: string;
  codeBranch: string;
}

export interface LastPush {
  at: string;
  by: string;
  prUrl: string | null;
  branch: string | null;
  title: string;
  tokens: Record<string, unknown>;
}

export interface DataState {
  head: string;
  set: TokenSet;
  history: HistoryEntry[];
  lastPush: LastPush | null;
}

const toJson = (v: unknown) => JSON.stringify(v, null, 2) + "\n";

/**
 * Load the saved tokens. Pass `atHead` (a commit the caller just saved or
 * loaded) to read exactly that version: GitHub can briefly report an older
 * branch head straight after a write.
 */
export async function loadData(host: GitHost, cfg: SyncConfig, atHead?: string): Promise<DataState> {
  const head = atHead || (await host.head(cfg.dataRepo, cfg.dataBranch));
  if (!head) throw new HostError(`${cfg.dataRepo} is empty. Do the set-up steps in docs/SETUP.md.`, 404);
  const [tokens, history, lastPush] = await Promise.all([
    host.readFile(cfg.dataRepo, head, DATA_FILES.tokens),
    host.readFile(cfg.dataRepo, head, DATA_FILES.history),
    host.readFile(cfg.dataRepo, head, DATA_FILES.lastPush),
  ]);
  if (tokens === null) throw new HostError(`${cfg.dataRepo} does not have ${DATA_FILES.tokens}. Do the set-up steps in docs/SETUP.md.`, 404);
  return {
    head,
    set: parseDtcg(JSON.parse(tokens)),
    history: history ? (JSON.parse(history) as HistoryEntry[]) : [],
    lastPush: lastPush ? (JSON.parse(lastPush) as LastPush) : null,
  };
}

/**
 * Save the working copy as 1 commit. `expectedHead` is the commit the
 * person loaded; if someone saved since, ConflictError is thrown and
 * nothing is written.
 */
export async function saveData(
  host: GitHost,
  cfg: SyncConfig,
  input: { expectedHead: string; set: TokenSet; history: HistoryEntry[]; message: string },
): Promise<string> {
  const errors = validateTokenSet(input.set).filter((i) => i.severity === "error");
  if (errors.length) {
    const tokens = new Set(errors.map((e) => e.token ?? e.component)).size;
    throw new HostError(`${tokens} ${tokens === 1 ? "token has" : "tokens have"} errors. Correct the errors, then save again.`, 422);
  }
  return host.commit(
    cfg.dataRepo,
    cfg.dataBranch,
    input.expectedHead,
    [
      { path: DATA_FILES.tokens, content: toJson(serialiseDtcg(input.set, "UAL design tokens. Managed by the token tool.")) },
      { path: DATA_FILES.history, content: toJson(input.history) },
    ],
    input.message,
  );
}

export interface PlannedFile {
  path: string;
  before: string | null;
  after: string;
}

export interface PushPlan {
  dataHead: string;
  /** The saved tokens this plan pushes. */
  set: TokenSet;
  codeHead: string;
  changes: Change[];
  files: PlannedFile[];
  lastPush: LastPush | null;
}

const emptyBlock = `${BLOCK_START}\n${BLOCK_END}`;

/** Work out what a push would change, without writing anything. */
export async function planPush(host: GitHost, cfg: SyncConfig, atHead?: string): Promise<PushPlan> {
  const data = await loadData(host, cfg, atHead);
  const codeHead = await host.head(cfg.codeRepo, cfg.codeBranch);
  if (!codeHead) throw new HostError(`${cfg.codeRepo} is empty. Do the set-up steps in docs/SETUP.md.`, 404);
  const baseline = data.lastPush ? parseDtcg(data.lastPush.tokens) : { tokens: [] };
  const changes = diffSets(baseline, data.set);
  const files: PlannedFile[] = [];
  for (const path of filesTouched(changes)) {
    const before = await host.readFile(cfg.codeRepo, codeHead, path);
    let block: string;
    if (path === PARENT_CSS_PATH) block = parentCss(data.set);
    else {
      const component = path.split("/")[1];
      block = data.set.tokens.some((t) => t.component === component) ? componentCss(data.set, component) : emptyBlock;
    }
    files.push({ path, before, after: replaceManagedBlock(before ?? "", block) });
  }
  return { dataHead: data.head, set: data.set, codeHead, changes, files, lastPush: data.lastPush };
}

export interface PushResult {
  /** The data repo version after the push was recorded. */
  dataHead: string;
  history: HistoryEntry[];
  lastPush: LastPush;
  prUrl: string;
  prNumber: number;
  branch: string;
  changes: Change[];
}

/**
 * Push saved tokens to the code repo: a new branch with the CSS, a pull
 * request with the changelog, then the push is recorded in the data repo.
 */
export async function pushToCode(
  host: GitHost,
  cfg: SyncConfig,
  input: { title: string; summary: string; author: string; now?: Date; dataHead?: string },
): Promise<PushResult> {
  const now = input.now ?? new Date();
  const title = input.title.trim();
  if (!title) throw new HostError("Type a title for the pull request.", 422);
  const plan = await planPush(host, cfg, input.dataHead);
  if (!plan.changes.length) throw new HostError("There are no changes to push. The saved tokens are the same as the last push.", 422);

  // A fresh branch, numbered if the name is taken.
  let branch = branchName(title, now);
  for (let i = 2; ; i += 1) {
    try {
      await host.createBranch(cfg.codeRepo, branch, plan.codeHead);
      break;
    } catch (e) {
      if (!(e instanceof ConflictError) || i > 20) throw e;
      branch = `${branchName(title, now)}-${i}`;
    }
  }
  await host.commit(
    cfg.codeRepo,
    branch,
    plan.codeHead,
    plan.files.map((f) => ({ path: f.path, content: f.after })),
    `Token update: ${title}`,
  );
  const body = changelogMarkdown({ title, summary: input.summary, author: input.author, changes: plan.changes });
  const pr = await host.openPullRequest(cfg.codeRepo, { head: branch, base: cfg.codeBranch, title: `Token update: ${title}`, body });

  // Record the push. The baseline is exactly what was pushed, so anything
  // someone else saved meanwhile still shows as unpushed next time.
  // Retry once if someone saved in between.
  const at = now.toISOString();
  const lastPush: LastPush = { at, by: input.author, prUrl: pr.url, branch, title, tokens: serialiseDtcg(plan.set) };
  let recorded: { head: string; history: HistoryEntry[] } | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const data = attempt === 0 ? await loadData(host, cfg, plan.dataHead) : await loadData(host, cfg);
    const entries: HistoryEntry[] = plan.changes.map((c, i) => ({
      id: `p-${now.getTime().toString(36)}-${i}`,
      token: c.name,
      action: "pushed",
      at,
      by: input.author,
      reason: title,
      prUrl: pr.url,
      ...(c.before ? { before: { values: c.before.values, status: c.before.status } } : {}),
      ...(c.after ? { after: { values: c.after.values, status: c.after.status } } : {}),
    }));
    const history = [...data.history, ...entries];
    try {
      const head = await host.commit(
        cfg.dataRepo,
        cfg.dataBranch,
        data.head,
        [
          { path: DATA_FILES.lastPush, content: toJson(lastPush) },
          { path: DATA_FILES.history, content: toJson(history) },
        ],
        `Record push: ${title} (${pr.url})`,
      );
      recorded = { head, history };
      break;
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt === 1) throw e;
    }
  }
  return { dataHead: recorded!.head, history: recorded!.history, lastPush, prUrl: pr.url, prNumber: pr.number, branch, changes: plan.changes };
}

/** Starting files for the 2 repos, generated from a token set. */
export function seedFiles(set: TokenSet, history: HistoryEntry[], at = new Date().toISOString()) {
  const lastPush: LastPush = { at, by: "set-up", prUrl: null, branch: null, title: "Initial set-up", tokens: serialiseDtcg(set) };
  const data: Record<string, string> = {
    [DATA_FILES.tokens]: toJson(serialiseDtcg(set, "UAL design tokens. Managed by the token tool.")),
    [DATA_FILES.history]: toJson(history),
    [DATA_FILES.lastPush]: toJson(lastPush),
    "README.md":
      "# UAL token data\n\nThe master copy of the UAL design tokens, in the W3C design tokens format. Written by the token tool; please do not edit by hand.\n\n- `tokens.json`: every token\n- `history.json`: the decision log\n- `last-push.json`: what the code repo was last given\n",
  };
  const components = [...new Set(set.tokens.map((t) => t.component).filter(Boolean) as string[])];
  const code: Record<string, string> = {
    [PARENT_CSS_PATH]: `${parentCss(set)}\n`,
    "README.md":
      "# UAL token sandbox\n\nA copy of the code repo's CSS structure, for testing push and pull from the token tool. The tool only changes what sits between `tokens:start` and `tokens:end`.\n",
  };
  for (const c of components) {
    code[`components/${c}/${c}.css`] =
      `${componentCss(set, c)}\n\n/* Component styles below are written by developers and never touched by the tool. */\n.${c} {\n  display: inline-flex;\n  align-items: center;\n  background: var(--${c}-surface${c === "button" ? "-primary" : ""}-default);\n  color: var(--${c}-content${c === "button" ? "-primary" : ""}-default);\n}\n`;
  }
  return { data, code };
}
