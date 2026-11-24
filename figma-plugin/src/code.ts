/**
 * Token Library Figma plugin: the part that runs inside Figma. It reads and
 * writes variables; the window (ui.ts) talks to Token Library.
 */
import { applyPlan, DEFAULT_COLLECTION_NAMES, readExisting, type CollectionNames, type VariablesApi } from "../../src/lib/figma/apply";
import { buildSpecs, planSync, type SyncPlan } from "../../src/lib/figma/plan";
import { checkDrafts, scanComponent, summarise, withChoices, type Choices, type ScanInput, type ScanResult } from "../../src/lib/figma/scan";
import { bindScan, publishScan, readComponentSet, whichIsDark, type ComponentSetLike, type NodeLike, type ScanVariablesApi } from "../../src/lib/figma/scan-figma";
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

// Component scan (F12): the last scan, kept so every step works on the same reading.
const scanApi = () => figma.variables as unknown as ScanVariablesApi;
let scan: { set: ComponentSetLike; dark: NodeLike | null; input: ScanInput; result: ScanResult; choices?: Choices } | null = null;

/** The component set a layer belongs to: itself, or the set around a selected variant or layer. */
function setOf(node: any): any {
  let n = node;
  while (n && n.type !== "COMPONENT_SET") n = n.parent;
  return n ?? null;
}

/** Dark and light mode ids of every local collection, to tell which selected copy is the dark one. */
async function modeIds(): Promise<{ dark: string[]; light: string[] }> {
  const cs = await figma.variables.getLocalVariableCollectionsAsync();
  const of = (re: RegExp) => cs.flatMap((c: any) => c.modes.filter((m: any) => re.test(m.name)).map((m: any) => m.modeId));
  return { dark: of(/dark/i), light: of(/light/i) };
}

/** The component set a selected layer stands for: itself, the set around it, or the only set inside a frame. */
function setFor(node: any): any {
  const around = setOf(node);
  if (around) return around;
  if (typeof node.findAllWithCriteria === "function") {
    const inside = node.findAllWithCriteria({ types: ["COMPONENT_SET"] });
    if (inside.length === 1) return inside[0];
  }
  return null;
}

interface Picked {
  set: ComponentSetLike | null;
  dark: NodeLike | null;
  message?: string;
}

/**
 * The selection: 1 component set, or the component set and its dark copy
 * (24 Nov 2026). Either can be selected through the frame that holds it.
 */
async function picked(): Promise<Picked> {
  const sel = figma.currentPage.selection;
  if (!sel.length) return { set: null, dark: null, message: "Select the component set and its dark copy on the canvas." };
  const tops: any[] = [];
  for (const n of sel) {
    const top = setOf(n) ?? n;
    if (!tops.includes(top)) tops.push(top);
  }
  if (tops.length > 2) return { set: null, dark: null, message: "Select only the component set and its dark copy." };
  if (tops.length === 1) {
    const set = setFor(tops[0]);
    return set
      ? { set, dark: null }
      : { set: null, dark: null, message: "This is not a component set. Select a component set, for example Control, and its dark copy." };
  }
  const sets = [setFor(tops[0]), setFor(tops[1])];
  const ids = await modeIds();
  const i = whichIsDark([tops[0], tops[1]], ids.dark, { lightModeIds: ids.light, hasSet: [!!sets[0], !!sets[1]] });
  if (i === null) return { set: null, dark: null, message: 'The plugin cannot tell which copy is the dark one. Add "dark" to the dark copy\'s name, for example "Control dark".' };
  const set = sets[1 - i];
  if (!set) return { set: null, dark: null, message: `${tops[1 - i].name} has no component set. Select the component set and its dark copy.` };
  // The dark copy is a copy of the component set, or of the frames inside it.
  return { set, dark: setFor(tops[i]) ?? tops[i] };
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

async function postSelection() {
  const { set, dark, message } = await picked();
  if (!set) {
    figma.ui.postMessage({ type: "scan-selection", selection: null, message });
    return;
  }
  const variants = set.children.filter((c) => c.type === "COMPONENT").length;
  figma.ui.postMessage({
    type: "scan-selection",
    selection: { id: set.id, name: set.name, variants, layers: countColouredLayers(set), dark: dark ? { id: dark.id, name: dark.name } : null },
  });
}

figma.on("selectionchange", () => {
  void (async () => {
    // Only a different component set makes the last scan out of date.
    const { set } = await picked();
    if (set && scan && set.id !== scan.set.id) scan = null;
    await postSelection();
  })();
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
    if (msg.type === "scan-selection") await postSelection();
    if (msg.type === "scan-run") {
      const { set, dark, message } = await picked();
      if (!set) throw new Error(message ?? "Select a component set on the canvas.");
      const input = await readComponentSet(scanApi(), set, { names: lastNames, dark });
      const result = scanComponent(input);
      scan = { set, dark, input, result };
      figma.ui.postMessage({ type: "scan-result", view: scanView(result, input.variables) });
    }
    if (msg.type === "scan-check") {
      if (!scan) throw new Error("Scan the component again.");
      const choices = (msg.choices ?? {}) as Choices;
      const checked = checkDrafts(scan.result, scan.input.variables, choices);
      const summary = summarise(scan.result, scan.input.variables, lastNames["colour-tokens"]);
      figma.ui.postMessage({ type: "scan-checked", ok: checked.ok, issues: checked.issues, summary });
    }
    // Step 5, Save and publish: create the variables. No layer changes yet.
    if (msg.type === "scan-publish") {
      if (!scan) throw new Error("Scan the component again.");
      const choices = (msg.choices ?? {}) as Choices;
      const checked = checkDrafts(scan.result, scan.input.variables, choices);
      if (!checked.ok) throw new Error("Some tokens still have problems. Go back to Accept names.");
      const drafts = withChoices(scan.result.tokens, choices);
      const result = await publishScan(scanApi(), drafts, scan.input.variables, {
        names: lastNames,
        onStep: (step, done, total) => figma.ui.postMessage({ type: "scan-progress", step, done, total }),
      });
      figma.commitUndo();
      scan.choices = choices;
      figma.ui.postMessage({ type: "scan-published", result });
      figma.notify(`Token Library: ${result.created.length + result.updated.length} variables saved for ${scan.result.title}.`);
    }
    // Step 6, Apply to layers: bind the component set, and the dark copy, to the new variables.
    if (msg.type === "scan-bind") {
      if (!scan || !scan.choices) throw new Error("Use Save and publish first.");
      const result = await bindScan(scanApi(), scan.set, scan.result, {
        names: lastNames,
        dark: scan.dark,
        onStep: (step, done, total) => figma.ui.postMessage({ type: "scan-progress", step, done, total }),
      });
      figma.commitUndo();
      const preview = donePreview(scan.result, scan.input.variables, scan.choices);
      figma.ui.postMessage({ type: "scan-bound", result, preview, component: scan.result.component, title: scan.result.title, fileName: figma.root.name });
      figma.notify(`Token Library: ${result.layers + result.darkLayers} layers bound in ${scan.result.title}.`);
    }
    if (msg.type === "scan-save-pending") await figma.clientStorage.setAsync(PENDING, msg.pending ?? null);
    if (msg.type === "close") figma.closePlugin();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    figma.ui.postMessage({ type: typeof msg?.type === "string" && msg.type.startsWith("scan-") ? "scan-error" : "error", message });
  }
};
