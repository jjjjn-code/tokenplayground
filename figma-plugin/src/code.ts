/**
 * Token Library Figma plugin: the part that runs inside Figma. It reads and
 * writes variables; the window (ui.ts) talks to Token Library.
 */
import { applyPlan, DEFAULT_COLLECTION_NAMES, readExisting, type CollectionNames, type VariablesApi } from "../../src/lib/figma/apply";
import { buildSpecs, planSync, type SyncPlan } from "../../src/lib/figma/plan";
import { checkDrafts, scanComponent, summarise, withChoices, type Choices, type ScanInput, type ScanResult } from "../../src/lib/figma/scan";
import { bindScan, guessStates, publishScan, readComponentSet, suggestComponentName, whichIsDark, writeStates, type ComponentSetLike, type NodeLike, type ScanVariablesApi } from "../../src/lib/figma/scan-figma";
import { donePreview, scanView, tokenMap } from "../../src/lib/figma/scan-view";
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

// Component scan (F12), simplified on 24 Nov 2026 to 3 screens: Check, Token map and Finish.
const scanApi = () => figma.variables as unknown as ScanVariablesApi;
/** Which selected copy is dark, when the designer pressed Swap: dark node id by the pair's ids. */
const SWAPS = "token-library-dark-copies";

interface ScanOptionsState {
  /** The pair these options belong to. */
  pair: string;
  name?: string;
  /** States named in the plugin, by variant id. */
  states?: Record<string, string>;
  /** Part chosen in the plugin, by layer and paint. */
  parts: Record<string, string>;
}

let scan: { set: ComponentSetLike; dark: NodeLike | null; input: ScanInput; result: ScanResult; choices: Choices; namedStates: boolean } | null = null;
let options: ScanOptionsState = { pair: "", parts: {} };
/** True after Check: the plugin keeps working on the scanned sets, whatever is selected. */
let locked = false;

/** The component set a layer belongs to: itself, or the set around a selected variant or layer. */
function setOf(node: any): any {
  let n = node;
  while (n && n.type !== "COMPONENT_SET") n = n.parent;
  return n ?? null;
}

/** Dark and light mode ids of every local collection, to read the Appearance set in Figma. */
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
  /** The plugin could not tell which is dark and took a guess. */
  guessed?: boolean;
  message?: string;
}

/** The 2 selected layers and which one is dark, for Swap. */
let lastPair: { key: string; tops: [string, string]; darkTop: string } | null = null;

/** The selection: the light component set and its dark copy (or 1 set on its own). */
async function picked(): Promise<Picked> {
  const sel = figma.currentPage.selection;
  if (!sel.length) return { set: null, dark: null, message: "Select your light and dark component sets on the canvas." };
  const tops: any[] = [];
  for (const n of sel) {
    const top = setOf(n) ?? n;
    if (!tops.includes(top)) tops.push(top);
  }
  if (tops.length > 2) return { set: null, dark: null, message: "Select only 2 things: the light component set and the dark one." };
  if (tops.length === 1) {
    lastPair = null;
    const set = setFor(tops[0]);
    return set ? { set, dark: null } : { set: null, dark: null, message: "This is not a component set. Select your light and dark component sets." };
  }
  const swaps: Record<string, string> = (await figma.clientStorage.getAsync(SWAPS)) ?? {};
  const pairKey = [tops[0].id, tops[1].id].sort().join("|");
  let i: 0 | 1 | null;
  let guessed = false;
  if (swaps[pairKey]) i = tops[0].id === swaps[pairKey] ? 0 : 1;
  else {
    const ids = await modeIds();
    const sets = [setFor(tops[0]), setFor(tops[1])];
    i = whichIsDark([tops[0], tops[1]], ids.dark, { lightModeIds: ids.light, hasSet: [!!sets[0], !!sets[1]] });
    if (i === null) {
      i = 1;
      guessed = true;
    }
  }
  lastPair = { key: pairKey, tops: [tops[0].id, tops[1].id], darkTop: tops[i].id };
  const set = setFor(tops[1 - i]);
  if (!set) return { set: null, dark: null, message: `${tops[1 - i].name} is not a component set. The light one must be a component set with your variants.` };
  return { set, dark: setFor(tops[i]) ?? tops[i], guessed };
}

/** Small pictures of each variant, for the Check screen. */
async function pictures(nodes: any[]): Promise<{ id: string; bytes: Uint8Array | null }[]> {
  const out = [];
  for (const n of nodes) {
    let bytes: Uint8Array | null = null;
    try {
      bytes = await n.exportAsync({ format: "PNG", constraint: { type: "HEIGHT", value: 96 } });
    } catch {
      bytes = null;
    }
    out.push({ id: n.id, bytes });
  }
  return out;
}

const variantsOf = (n: any): any[] => (n?.children ?? []).filter((c: any) => (n.type === "COMPONENT_SET" ? c.type === "COMPONENT" : c.type !== "TEXT"));

/** Read the selection (or the locked sets), scan, and send everything the 3 screens show. */
async function rescan(withPictures = true) {
  let set: ComponentSetLike | null;
  let dark: NodeLike | null;
  let guessed = false;
  if (locked && scan) {
    set = (await figma.getNodeByIdAsync(scan.set.id)) as ComponentSetLike | null;
    dark = scan.dark ? ((await figma.getNodeByIdAsync(scan.dark.id)) as NodeLike | null) : null;
    if (!set) throw new Error("The component set is gone. Go back to Check and select it again.");
  } else {
    const p = await picked();
    if (!p.set) {
      scan = null;
      figma.ui.postMessage({ type: "scan-view", check: null, message: p.message });
      return;
    }
    set = p.set;
    dark = p.dark;
    guessed = !!p.guessed;
  }
  const pair = `${set.id}|${dark?.id ?? ""}`;
  if (options.pair !== pair) options = { pair, parts: {} };

  const defs = Object.entries(set.componentPropertyDefinitions ?? {}).filter(([, d]: any) => d.type === "VARIANT");
  const hasState = defs.some(([n]) => n.trim().toLowerCase() === "state");
  const states = hasState ? undefined : { ...guessStates(set), ...(options.states ?? {}) };
  const input = await readComponentSet(scanApi(), set, { names: lastNames, dark, states });
  const name = options.name ?? suggestComponentName(set.name);
  input.componentName = name;
  const result = scanComponent(input, undefined, options.parts);
  const choices = scan && scan.set.id === set.id ? scan.choices : {};
  scan = { set, dark, input, result, choices, namedStates: !hasState };

  const lightVariants = variantsOf(set);
  const check = {
    light: { id: set.id, name: set.name, variants: lightVariants.map((v: any) => ({ id: v.id, name: v.name })) },
    dark: dark ? { id: dark.id, name: dark.name, variants: variantsOf(dark).map((v: any) => ({ id: v.id, name: v.name })) } : null,
    guessed,
    name,
    suggestedName: suggestComponentName(set.name),
    hasStateProperty: hasState,
    states: lightVariants.map((v: any) => ({ id: v.id, name: v.name, state: input.variants.find((x) => x.id === v.id)?.state ?? "" })),
  };
  const pics = withPictures ? { light: await pictures(lightVariants), dark: dark ? await pictures(variantsOf(dark)) : [] } : null;
  const checked = checkDrafts(result, input.variables, choices);
  figma.ui.postMessage({
    type: "scan-view",
    check,
    pictures: pics,
    view: scanView(result, input.variables),
    map: tokenMap(result, input.variables, choices),
    summary: summarise(result, input.variables, lastNames["colour-tokens"]),
    checked: { ok: checked.ok, issues: checked.issues },
    locked,
  });
}

figma.on("selectionchange", () => {
  if (locked) return;
  void rescan().catch((e) => figma.ui.postMessage({ type: "scan-error", message: e instanceof Error ? e.message : String(e) }));
});

figma.ui.onmessage = async (msg: any) => {
  try {
    if (msg.type === "init") {
      const settings = (await figma.clientStorage.getAsync(SETTINGS)) ?? {};
      const pending = (await figma.clientStorage.getAsync(PENDING)) ?? null;
      figma.ui.postMessage({ type: "settings", settings, fileName: figma.root.name, pending });
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
    if (msg.type === "resize") figma.ui.resize(msg.width, msg.height);
    if (msg.type === "scan-selection") await rescan();
    if (msg.type === "scan-lock") {
      locked = !!msg.locked;
      if (!locked) await rescan();
    }
    if (msg.type === "scan-options") {
      options = { ...options, ...(msg.name !== undefined ? { name: msg.name || undefined } : {}), ...(msg.states ? { states: msg.states } : {}), ...(msg.parts ? { parts: { ...options.parts, ...msg.parts } } : {}) };
      await rescan(false);
    }
    if (msg.type === "scan-swap") {
      if (!lastPair) throw new Error("Select both the light and the dark component sets first.");
      const swaps: Record<string, string> = (await figma.clientStorage.getAsync(SWAPS)) ?? {};
      // Remember the other layer as the dark one for this pair.
      swaps[lastPair.key] = lastPair.tops.find((id) => id !== lastPair!.darkTop)!;
      await figma.clientStorage.setAsync(SWAPS, swaps);
      options = { pair: "", parts: {} };
      await rescan();
    }
    if (msg.type === "scan-choices") {
      if (!scan) throw new Error("Select your component sets again.");
      scan.choices = (msg.choices ?? {}) as Choices;
      await rescan(false);
    }
    if (msg.type === "scan-show") {
      const nodes = [];
      for (const id of msg.nodeIds ?? []) {
        const n = await figma.getNodeByIdAsync(id);
        if (n) nodes.push(n);
      }
      if (nodes.length) {
        figma.currentPage.selection = nodes;
        figma.viewport.scrollAndZoomIntoView(nodes);
      }
    }
    // Finish, action 1: create the variables. No layer changes yet.
    if (msg.type === "scan-publish") {
      if (!scan) throw new Error("Select your component sets again.");
      const checked = checkDrafts(scan.result, scan.input.variables, scan.choices);
      if (!checked.ok) throw new Error("Some tokens still have problems. Go back to the token map.");
      const drafts = withChoices(scan.result.tokens, scan.choices);
      const result = await publishScan(scanApi(), drafts, scan.input.variables, { names: lastNames });
      figma.commitUndo();
      figma.ui.postMessage({ type: "scan-published", result });
      figma.notify(`Token Library: ${result.created.length + result.updated.length} variables saved for ${scan.result.title}.`);
    }
    // Finish, action 2: apply the variables to the layers in both sets, and write states named in the plugin.
    if (msg.type === "scan-bind") {
      if (!scan) throw new Error("Select your component sets again.");
      const result = await bindScan(scanApi(), scan.set, scan.result, { names: lastNames, dark: scan.dark });
      const named = scan.namedStates ? writeStates(scan.set, scan.dark, Object.fromEntries(scan.input.variants.map((v) => [v.id, v.state]))) : 0;
      figma.commitUndo();
      const preview = donePreview(scan.result, scan.input.variables, scan.choices);
      figma.ui.postMessage({ type: "scan-bound", result: { ...result, statesNamed: named }, preview, component: scan.result.component, title: scan.result.title, fileName: figma.root.name });
      figma.notify(`Token Library: ${result.layers + result.darkLayers} colours swapped for tokens in ${scan.result.title}.`);
    }
    if (msg.type === "scan-save-pending") await figma.clientStorage.setAsync(PENDING, msg.pending ?? null);
    if (msg.type === "close") figma.closePlugin();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    figma.ui.postMessage({ type: typeof msg?.type === "string" && msg.type.startsWith("scan-") ? "scan-error" : "error", message });
  }
};
