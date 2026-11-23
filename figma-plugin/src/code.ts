/**
 * Token Library Figma plugin: the part that runs inside Figma. It reads and
 * writes variables; the window (ui.ts) talks to Token Library.
 */
import { applyPlan, DEFAULT_COLLECTION_NAMES, readExisting, type CollectionNames, type VariablesApi } from "../../src/lib/figma/apply";
import { buildSpecs, planSync, type SyncPlan } from "../../src/lib/figma/plan";
import { checkDrafts, scanComponent, summarise, withChoices, type Choices, type ScanInput, type ScanResult } from "../../src/lib/figma/scan";
import { applyScan, readComponentSet, type ComponentSetLike, type NodeLike, type ScanVariablesApi } from "../../src/lib/figma/scan-figma";
import { donePreview, scanView } from "../../src/lib/figma/scan-view";
import { parseDtcg } from "../../src/lib/tokens/dtcg";

declare const figma: any;
declare const __html__: string;

const SETTINGS = "token-library-settings";
/** A scan that was made in Figma but not yet received by Token Library. */
const PENDING = "token-library-scan-pending";
const api = () => figma.variables as unknown as VariablesApi;
let lastPlan: SyncPlan | null = null;
let lastNames: CollectionNames = DEFAULT_COLLECTION_NAMES;

figma.showUI(__html__, { width: 480, height: 680, themeColors: true, title: "Token Library" });

// Component scan (F12): the last scan, kept so Review and Create work on the same reading.
const scanApi = () => figma.variables as unknown as ScanVariablesApi;
let scan: { set: ComponentSetLike; input: ScanInput; result: ScanResult } | null = null;

/** The selected component set. A selected variant, or a layer inside one, counts as its set. */
function selectedSet(): ComponentSetLike | null {
  const sel = figma.currentPage.selection;
  if (sel.length !== 1) return null;
  let n: any = sel[0];
  while (n && n.type !== "COMPONENT_SET") n = n.parent;
  return n ?? null;
}

function countColouredLayers(set: NodeLike): number {
  let count = 0;
  const walk = (n: NodeLike) => {
    if (n.visible === false) return;
    const solid = (l: unknown) => Array.isArray(l) && l.some((p) => p.visible !== false && p.type === "SOLID");
    if (n.type !== "COMPONENT" && (solid(n.fills) || solid(n.strokes))) count += 1;
    for (const c of n.children ?? []) walk(c);
  };
  walk(set);
  return count;
}

function postSelection() {
  const set = selectedSet();
  if (!set) {
    const sel = figma.currentPage.selection;
    figma.ui.postMessage({
      type: "scan-selection",
      selection: null,
      message: sel.length > 1 ? "Select only 1 component set." : sel.length === 1 ? "This is not a component set. Select a component set, for example Control." : "Select a component set on the canvas.",
    });
    return;
  }
  const variants = set.children.filter((c) => c.type === "COMPONENT").length;
  figma.ui.postMessage({ type: "scan-selection", selection: { id: set.id, name: set.name, variants, layers: countColouredLayers(set) } });
}

figma.on("selectionchange", () => {
  // Only a different component set makes the last scan out of date.
  const set = selectedSet();
  if (set && scan && set.id !== scan.set.id) scan = null;
  postSelection();
});

figma.ui.onmessage = async (msg: any) => {
  try {
    if (msg.type === "init") {
      const settings = (await figma.clientStorage.getAsync(SETTINGS)) ?? {};
      const pending = (await figma.clientStorage.getAsync(PENDING)) ?? null;
      figma.ui.postMessage({ type: "settings", settings, fileName: figma.root.name, pending });
      postSelection();
    }
    if (msg.type === "save-settings") {
      await figma.clientStorage.setAsync(SETTINGS, msg.settings);
    }
    if (msg.type === "plan") {
      // Collections are fixed to match the UAL UI Kit file (see COLLECTIONS in plan.ts).
      lastNames = DEFAULT_COLLECTION_NAMES;
      const set = parseDtcg(msg.tokens);
      const { specs, skipped } = buildSpecs(set, { includeDrafts: !!msg.includeDrafts });
      lastPlan = planSync(specs, await readExisting(api(), lastNames), skipped);
      figma.ui.postMessage({
        type: "plan",
        plan: {
          add: lastPlan.add.map((s) => ({ token: s.token, name: s.name, collection: lastNames[s.collection] })),
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
    if (msg.type === "scan-selection") postSelection();
    if (msg.type === "scan-run") {
      const set = selectedSet();
      if (!set) throw new Error("Select a component set on the canvas.");
      const input = await readComponentSet(scanApi(), set, { names: lastNames });
      const result = scanComponent(input);
      scan = { set, input, result };
      figma.ui.postMessage({ type: "scan-result", view: scanView(result, input.variables) });
    }
    if (msg.type === "scan-check") {
      if (!scan) throw new Error("Scan the component again.");
      const choices = (msg.choices ?? {}) as Choices;
      const checked = checkDrafts(scan.result, scan.input.variables, choices);
      const summary = summarise(scan.result, scan.input.variables, lastNames["colour-tokens"]);
      figma.ui.postMessage({ type: "scan-checked", ok: checked.ok, issues: checked.issues, summary });
    }
    if (msg.type === "scan-apply") {
      if (!scan) throw new Error("Scan the component again.");
      const choices = (msg.choices ?? {}) as Choices;
      const checked = checkDrafts(scan.result, scan.input.variables, choices);
      if (!checked.ok) throw new Error("Some tokens still have problems. Go back to Review.");
      const drafts = withChoices(scan.result.tokens, choices);
      const result = await applyScan(scanApi(), scan.set, scan.result, drafts, scan.input.variables, {
        names: lastNames,
        onStep: (step, done, total) => figma.ui.postMessage({ type: "scan-progress", step, done, total }),
      });
      // 1 undo step for the whole scan.
      figma.commitUndo();
      const preview = donePreview(scan.result, scan.input.variables, choices);
      figma.ui.postMessage({ type: "scan-applied", result, preview, component: scan.result.component, title: scan.result.title, fileName: figma.root.name });
      figma.notify(`Token Library: ${result.created.length + result.updated.length} variables for ${scan.result.title}, ${result.layers} layers bound.`);
      scan = null;
    }
    if (msg.type === "scan-save-pending") await figma.clientStorage.setAsync(PENDING, msg.pending ?? null);
    if (msg.type === "close") figma.closePlugin();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    figma.ui.postMessage({ type: typeof msg?.type === "string" && msg.type.startsWith("scan-") ? "scan-error" : "error", message });
  }
};
