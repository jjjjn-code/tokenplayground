/**
 * Token Library Figma plugin: the part that runs inside Figma. It reads and
 * writes variables; the window (ui.ts) talks to Token Library.
 */
import { applyPlan, DEFAULT_COLLECTION_NAMES, readExisting, type CollectionNames, type VariablesApi } from "../../src/lib/figma/apply";
import { buildSpecs, planSync, type SyncPlan } from "../../src/lib/figma/plan";
import { parseDtcg } from "../../src/lib/tokens/dtcg";

declare const figma: any;
declare const __html__: string;

const SETTINGS = "token-library-settings";
const api = () => figma.variables as unknown as VariablesApi;
let lastPlan: SyncPlan | null = null;
let lastNames: CollectionNames = DEFAULT_COLLECTION_NAMES;

figma.showUI(__html__, { width: 480, height: 640, themeColors: true, title: "Token Library" });

figma.ui.onmessage = async (msg: any) => {
  try {
    if (msg.type === "init") {
      const settings = (await figma.clientStorage.getAsync(SETTINGS)) ?? {};
      figma.ui.postMessage({ type: "settings", settings, fileName: figma.root.name });
    }
    if (msg.type === "save-settings") {
      await figma.clientStorage.setAsync(SETTINGS, msg.settings);
    }
    if (msg.type === "plan") {
      lastNames = { ...DEFAULT_COLLECTION_NAMES, ...(msg.names ?? {}) };
      const set = parseDtcg(msg.tokens);
      const { specs, skipped } = buildSpecs(set, { includeDrafts: !!msg.includeDrafts });
      lastPlan = planSync(specs, await readExisting(api(), lastNames), skipped);
      figma.ui.postMessage({
        type: "plan",
        plan: {
          add: lastPlan.add.map((s) => ({ token: s.token, name: s.name, collection: s.collection })),
          change: lastPlan.change.map((c) => ({ token: c.spec.token, name: c.spec.name, differences: c.differences })),
          remove: lastPlan.remove.map((e) => ({ token: e.token ?? e.name, name: e.name })),
          unchanged: lastPlan.unchanged,
          skipped: lastPlan.skipped,
        },
      });
    }
    if (msg.type === "apply") {
      if (!lastPlan) throw new Error("Check for changes first.");
      const result = await applyPlan(api(), lastPlan, lastNames);
      lastPlan = null;
      figma.ui.postMessage({ type: "applied", result, fileName: figma.root.name });
      figma.notify(`Token Library: ${result.added.length} added, ${result.changed.length} changed, ${result.removed.length} removed.`);
    }
    if (msg.type === "close") figma.closePlugin();
  } catch (e) {
    figma.ui.postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
