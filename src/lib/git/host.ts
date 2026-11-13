/**
 * The small set of Git operations the tool needs. `GitHubHost` talks to
 * GitHub; `MemoryHost` keeps everything in memory for tests and demo mode.
 */

export interface FileChange {
  path: string;
  /** New content, or null to delete the file. */
  content: string | null;
}

export interface PullRequest {
  number: number;
  url: string;
}

export interface GitHost {
  /** Latest commit on a branch, or null when the branch (or repo) is empty. */
  head(repo: string, branch: string): Promise<string | null>;
  readFile(repo: string, ref: string, path: string): Promise<string | null>;
  /**
   * Commit files on top of `parent` and move `branch` to the new commit.
   * Throws ConflictError when the branch no longer points at `parent`.
   */
  commit(repo: string, branch: string, parent: string, files: FileChange[], message: string): Promise<string>;
  /** Create a branch at a commit. Throws ConflictError if it already exists. */
  createBranch(repo: string, branch: string, sha: string): Promise<void>;
  openPullRequest(repo: string, pr: { head: string; base: string; title: string; body: string }): Promise<PullRequest>;
}

/** Someone else moved the branch first. */
export class ConflictError extends Error {
  constructor(message = "Someone else changed this since you loaded it.") {
    super(message);
    this.name = "ConflictError";
  }
}

/** Something went wrong talking to the host, with a message a person can act on. */
export class HostError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "HostError";
  }
}

// ---------- In memory ----------

interface MemCommit {
  parent: string | null;
  files: Map<string, string>;
  message: string;
}

interface MemRepo {
  branches: Map<string, string>;
  commits: Map<string, MemCommit>;
  pulls: { number: number; head: string; base: string; title: string; body: string }[];
}

export class MemoryHost implements GitHost {
  repos = new Map<string, MemRepo>();
  private n = 0;

  constructor(private prBase = "https://github.example") {}

  private repo(name: string): MemRepo {
    let r = this.repos.get(name);
    if (!r) {
      r = { branches: new Map(), commits: new Map(), pulls: [] };
      this.repos.set(name, r);
    }
    return r;
  }

  /** Create a repo with 1 commit on `branch`. */
  seed(repo: string, branch: string, files: Record<string, string>, message = "Initial commit"): string {
    const r = this.repo(repo);
    const sha = this.sha();
    r.commits.set(sha, { parent: null, files: new Map(Object.entries(files)), message });
    r.branches.set(branch, sha);
    return sha;
  }

  private sha() {
    this.n += 1;
    return this.n.toString(16).padStart(40, "0");
  }

  async head(repo: string, branch: string) {
    return this.repos.get(repo)?.branches.get(branch) ?? null;
  }

  async readFile(repo: string, ref: string, path: string) {
    const r = this.repos.get(repo);
    if (!r) return null;
    const sha = r.branches.get(ref) ?? ref;
    return r.commits.get(sha)?.files.get(path) ?? null;
  }

  async commit(repo: string, branch: string, parent: string, files: FileChange[], message: string) {
    const r = this.repo(repo);
    if (r.branches.get(branch) !== parent) throw new ConflictError();
    const base = r.commits.get(parent);
    if (!base) throw new HostError(`Unknown commit ${parent}`);
    const next = new Map(base.files);
    for (const f of files) {
      if (f.content === null) next.delete(f.path);
      else next.set(f.path, f.content);
    }
    const sha = this.sha();
    r.commits.set(sha, { parent, files: next, message });
    r.branches.set(branch, sha);
    return sha;
  }

  async createBranch(repo: string, branch: string, sha: string) {
    const r = this.repo(repo);
    if (r.branches.has(branch)) throw new ConflictError(`Branch ${branch} already exists.`);
    r.branches.set(branch, sha);
  }

  async openPullRequest(repo: string, pr: { head: string; base: string; title: string; body: string }) {
    const r = this.repo(repo);
    const number = r.pulls.length + 1;
    r.pulls.push({ number, ...pr });
    return { number, url: `${this.prBase}/${repo}/pull/${number}` };
  }
}

// ---------- GitHub ----------

const API = "https://api.github.com";

export class GitHubHost implements GitHost {
  constructor(private token: string) {}

  private async call(method: string, path: string, body?: unknown, accept = "application/vnd.github+json"): Promise<Response> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: accept,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "token-tool",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    return res;
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.call(method, path, body);
    if (!res.ok) throw await this.error(res, path);
    return (await res.json()) as T;
  }

  private async error(res: Response, path: string): Promise<HostError> {
    let detail = "";
    try {
      detail = ((await res.json()) as { message?: string }).message ?? "";
    } catch {
      // ignore
    }
    if (res.status === 401) return new HostError("Your GitHub sign-in has expired. Sign in again.", 401);
    if (res.status === 403 || res.status === 404) {
      return new HostError(
        `GitHub refused access (${res.status}) to ${path.split("/").slice(2, 4).join("/")}. Check the GitHub App is installed on this repo with read and write access to contents and pull requests.${detail ? ` GitHub said: ${detail}` : ""}`,
        res.status,
      );
    }
    return new HostError(`GitHub error ${res.status}${detail ? `: ${detail}` : ""}`, res.status);
  }

  async head(repo: string, branch: string) {
    const res = await this.call("GET", `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    if (res.status === 404 || res.status === 409) return null; // missing branch or empty repo
    if (!res.ok) throw await this.error(res, `/repos/${repo}`);
    return ((await res.json()) as { object: { sha: string } }).object.sha;
  }

  async readFile(repo: string, ref: string, path: string) {
    const res = await this.call(
      "GET",
      `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
      undefined,
      "application/vnd.github.raw+json",
    );
    if (res.status === 404) return null;
    if (!res.ok) throw await this.error(res, `/repos/${repo}`);
    return await res.text();
  }

  async commit(repo: string, branch: string, parent: string, files: FileChange[], message: string) {
    // No separate "is the branch still at parent?" read first: GitHub can
    // return a slightly old answer just after a write. The ref update below
    // refuses anything that is not a fast-forward, which is the real guard.
    const base = await this.json<{ tree: { sha: string } }>("GET", `/repos/${repo}/git/commits/${parent}`);
    const tree = await this.json<{ sha: string }>("POST", `/repos/${repo}/git/trees`, {
      base_tree: base.tree.sha,
      tree: files.map((f) =>
        f.content === null
          ? { path: f.path, mode: "100644", type: "blob", sha: null }
          : { path: f.path, mode: "100644", type: "blob", content: f.content },
      ),
    });
    const commit = await this.json<{ sha: string }>("POST", `/repos/${repo}/git/commits`, {
      message,
      tree: tree.sha,
      parents: [parent],
    });
    const res = await this.call("PATCH", `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha, force: false });
    if (res.status === 422) throw new ConflictError();
    if (!res.ok) throw await this.error(res, `/repos/${repo}`);
    return commit.sha;
  }

  async createBranch(repo: string, branch: string, sha: string) {
    const res = await this.call("POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha });
    if (res.status === 422) throw new ConflictError(`Branch ${branch} already exists.`);
    if (!res.ok) throw await this.error(res, `/repos/${repo}`);
  }

  async openPullRequest(repo: string, pr: { head: string; base: string; title: string; body: string }) {
    const out = await this.json<{ number: number; html_url: string }>("POST", `/repos/${repo}/pulls`, pr);
    return { number: out.number, url: out.html_url };
  }
}
