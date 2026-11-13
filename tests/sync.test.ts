import { beforeEach, describe, expect, it } from "vitest";
import log from "@/data/dummy/history.json";
import { ConflictError, MemoryHost } from "@/src/lib/git/host";
import { loadData, planPush, pushToCode, saveData, seedFiles, type SyncConfig } from "@/src/lib/git/sync";
import { BLOCK_START, type HistoryEntry } from "@/src/lib/tokens";
import { colour, dummy } from "./helpers";

const cfg: SyncConfig = { dataRepo: "jane/ual-tokens-data", dataBranch: "main", codeRepo: "jane/ual-tokens-sandbox", codeBranch: "main" };

let host: MemoryHost;
beforeEach(() => {
  host = new MemoryHost();
  const seed = seedFiles(dummy(), log as HistoryEntry[], "2026-11-12T09:00:00Z");
  host.seed(cfg.dataRepo, "main", seed.data);
  host.seed(cfg.codeRepo, "main", seed.code);
});

describe("load and save", () => {
  it("loads the seeded data", async () => {
    const d = await loadData(host, cfg);
    expect(d.set.tokens).toHaveLength(68);
    expect(d.history).toHaveLength(3);
    expect(d.lastPush?.title).toBe("Initial set-up");
  });

  it("saves as 1 commit and blocks a save based on an old version", async () => {
    const d = await loadData(host, cfg);
    d.set.tokens.find((t) => t.name === "red-700")!.values.light = "#B00000";
    const head = await saveData(host, cfg, { expectedHead: d.head, set: d.set, history: d.history, message: "Darker red" });
    expect((await loadData(host, cfg)).head).toBe(head);
    await expect(saveData(host, cfg, { expectedHead: d.head, set: d.set, history: d.history, message: "Again" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to save a set with rule errors", async () => {
    const d = await loadData(host, cfg);
    d.set.tokens.push(colour("Bad-Name", "primitive", "#000000"));
    await expect(saveData(host, cfg, { expectedHead: d.head, set: d.set, history: d.history, message: "x" })).rejects.toThrow(/tokens? ha(s|ve) errors/);
  });
});

describe("push", () => {
  const edit = async () => {
    const d = await loadData(host, cfg);
    d.set.tokens.find((t) => t.name === "red-700")!.values.light = "#B00000";
    d.set.tokens.push(colour("button-surface-primary-selected", "component", { ref: "orange-700-aa" }, { component: "button", values: { light: { ref: "orange-700-aa" }, dark: { ref: "orange-400" } } }));
    await saveData(host, cfg, { expectedHead: d.head, set: d.set, history: d.history, message: "Edits" });
  };

  it("has nothing to push straight after set-up", async () => {
    expect((await planPush(host, cfg)).changes).toEqual([]);
    await expect(pushToCode(host, cfg, { title: "x", summary: "", author: "jane" })).rejects.toThrow(/no changes to send/);
  });

  it("plans only the files that change, touching only the managed block", async () => {
    await edit();
    const plan = await planPush(host, cfg);
    expect(plan.changes.map((c) => c.name)).toEqual(["red-700", "button-surface-primary-selected"]);
    expect(plan.files.map((f) => f.path)).toEqual(["styles/colors.css", "components/button/button.css"]);
    const button = plan.files[1];
    expect(button.after).toContain("--button-surface-primary-selected: var(--color-orange-700-aa);");
    expect(button.after).toContain("Component styles below are written by developers");
    expect(button.after.split(BLOCK_START)).toHaveLength(2);
  });

  it("opens a pull request with the changelog and records the push", async () => {
    await edit();
    const res = await pushToCode(host, cfg, { title: "Button selected state", summary: "Adds selected.", author: "jane", now: new Date("2026-11-12T12:00:00Z") });
    expect(res.branch).toBe("tokens/2026-11-12-button-selected-state");
    const code = host.repos.get(cfg.codeRepo)!;
    expect(code.pulls[0]).toMatchObject({ head: res.branch, base: "main", title: "Token update: Button selected state" });
    expect(code.pulls[0].body).toContain("| Changed | red-700 | #A80000 | **#B00000** | styles/colors.css |");
    expect(await host.readFile(cfg.codeRepo, res.branch, "styles/colors.css")).toContain("--color-red-700: #B00000;");
    expect(await host.readFile(cfg.codeRepo, "main", "styles/colors.css")).toContain("--color-red-700: #A80000;");

    const d = await loadData(host, cfg);
    expect(d.lastPush).toMatchObject({ prUrl: res.prUrl, branch: res.branch, by: "jane" });
    const pushed = d.history.filter((e) => e.action === "pushed");
    expect(pushed.map((e) => e.token)).toEqual(["red-700", "button-surface-primary-selected"]);
    expect(pushed[0].prUrl).toBe(res.prUrl);
    expect((await planPush(host, cfg)).changes).toEqual([]);
  });

  it("numbers the branch when the name is taken", async () => {
    await edit();
    const now = new Date("2026-11-12T12:00:00Z");
    await host.createBranch(cfg.codeRepo, "tokens/2026-11-12-fix", (await host.head(cfg.codeRepo, "main"))!);
    const res = await pushToCode(host, cfg, { title: "Fix", summary: "", author: "jane", now });
    expect(res.branch).toBe("tokens/2026-11-12-fix-2");
  });
});

describe("exact versions", () => {
  it("reads the version it is given, not only the latest", async () => {
    const first = await loadData(host, cfg);
    first.set.tokens.find((t) => t.name === "red-700")!.values.light = "#B00000";
    await saveData(host, cfg, { expectedHead: first.head, set: first.set, history: first.history, message: "x" });
    const old = await loadData(host, cfg, first.head);
    expect(old.set.tokens.find((t) => t.name === "red-700")!.values.light).toBe("#A80000");
  });

  it("returns the new version, history and last push after a push", async () => {
    const d = await loadData(host, cfg);
    d.set.tokens.find((t) => t.name === "red-700")!.values.light = "#B00000";
    const head = await saveData(host, cfg, { expectedHead: d.head, set: d.set, history: d.history, message: "x" });
    const res = await pushToCode(host, cfg, { title: "Red", summary: "", author: "jane", dataHead: head });
    expect(res.dataHead).toBe(await host.head(cfg.dataRepo, "main"));
    expect(res.history.at(-1)).toMatchObject({ action: "pushed", token: "red-700", prUrl: res.prUrl });
    expect(res.lastPush.prUrl).toBe(res.prUrl);
  });
});

describe("pull", async () => {
  const { simulateDeveloperDrift } = await import("@/src/lib/git/drift");
  const { planPull, applyPull } = await import("@/src/lib/git/sync");

  const drift = async () => {
    const head = (await host.head(cfg.codeRepo, "main"))!;
    const files: Record<string, string> = {};
    for (const p of ["styles/colors.css", "components/button/button.css"]) files[p] = (await host.readFile(cfg.codeRepo, head, p))!;
    const edited = simulateDeveloperDrift(files);
    await host.commit(cfg.codeRepo, "main", head, Object.entries(edited).map(([path, content]) => ({ path, content })), "Developer changes");
  };

  it("finds nothing straight after set-up", async () => {
    expect((await planPull(host, cfg)).discrepancies).toEqual([]);
  });

  it("applies decisions as 1 commit and opens a restore pull request for declines", async () => {
    await drift();
    const plan = await planPull(host, cfg);
    expect(plan.discrepancies).toHaveLength(9);
    const hover = plan.discrepancies.find((d) => d.suggestedName === "hover")!;
    const res = await applyPull(host, cfg, {
      codeHead: plan.codeHead,
      dataHead: plan.dataHead,
      author: "jane",
      now: new Date("2026-11-13T15:00:00Z"),
      decisions: [
        { id: "red-700", decision: "decline", reason: "Brand red is #A80000." },
        { id: "line-default", decision: "decline", reason: "Wrong prefix." },
        { id: "button-surface-primary-hover", decision: "accept", reason: "Agreed with developers." },
        { id: hover.id, decision: "accept", reason: "Useful hover colour.", name: "surface-hover" },
      ],
    });
    expect(res.problems).toEqual([]);
    expect(res).toMatchObject({ accepted: 2, declined: 2 });
    expect(res.restorePr?.branch).toBe("tokens/2026-11-13-restore-declined");

    const pr = host.repos.get(cfg.codeRepo)!.pulls.at(-1)!;
    expect(pr.title).toBe("Token restore: declined changes");
    expect(pr.body).toContain("Brand red is #A80000.");
    const restored = (await host.readFile(cfg.codeRepo, res.restorePr!.branch, "styles/colors.css"))!;
    expect(restored).toContain("--color-red-700: #A80000;");
    expect(restored).toContain("--color-line-default: var(--color-neutral-700);");
    expect(restored).toContain("--color-surface-hover: var(--color-orange-700);");

    const d = await loadData(host, cfg);
    expect(d.set.tokens.find((t) => t.name === "surface-hover")).toBeDefined();
    expect(d.set.tokens.find((t) => t.name === "button-surface-primary-hover")!.values.light).toBe("#D33704");
    const actions = d.history.slice(-4).map((e) => `${e.action}:${e.token}`);
    expect(actions).toEqual(["declined:red-700", "declined:line-default", "accepted:button-surface-primary-hover", "accepted:surface-hover"]);
    expect(d.history.at(-1)).toMatchObject({ from: "--color-hover", prUrl: res.restorePr!.url });
    expect(pr.body).toContain("| Accepted with a new name | surface-hover | --color-hover | --color-surface-hover |");
    expect(d.history.at(-4)!.prUrl).toBe(res.restorePr!.url);
    // Accepted values are now the agreed baseline, so a push does not list them again.
    const { planPush } = await import("@/src/lib/git/sync");
    const names = (await planPush(host, cfg)).changes.map((c) => c.name);
    expect(names).not.toContain("button-surface-primary-hover");
    expect(names).not.toContain("surface-hover");
  });

  it("writes nothing when a decision has a problem", async () => {
    await drift();
    const plan = await planPull(host, cfg);
    const before = await host.head(cfg.dataRepo, "main");
    const res = await applyPull(host, cfg, { codeHead: plan.codeHead, author: "jane", decisions: [{ id: "line-default", decision: "accept", reason: "x" }] });
    expect(res.problems).toHaveLength(1);
    expect(await host.head(cfg.dataRepo, "main")).toBe(before);
  });
});
