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
    await expect(saveData(host, cfg, { expectedHead: d.head, set: d.set, history: d.history, message: "x" })).rejects.toThrow(/rule errors/);
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
    await expect(pushToCode(host, cfg, { title: "x", summary: "", author: "jane" })).rejects.toThrow(/Nothing to push/);
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
    expect(code.pulls[0].body).toContain("| Changed | red-700 | #A80000 | #B00000 | styles/colors.css |");
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
