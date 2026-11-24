/**
 * Token Library Figma plugin: the Scan component tab (F12). 8 steps:
 * Select, Scan, Changes, Accept names, Save and publish, Apply to layers,
 * Send and Done (split on 24 Nov 2026, so each can be checked). The Figma side
 * (code.ts) reads and writes the file; this window shows the steps and
 * sends the new tokens to Token Library.
 */
import type { ScanSummary } from "../../src/lib/figma/scan";
import type { ChangeView, LayerView, ScanView, Swatch, TokenView } from "../../src/lib/figma/scan-view";
import type { Issue } from "../../src/lib/tokens/types";

export interface ScanSettings {
  url: string;
  key: string;
}

/** A scan that is in Figma but not yet in Token Library. Kept until Token Library receives it. */
export interface Pending {
  fileName: string;
  component: string;
  title: string;
  json: Record<string, unknown>;
  count: number;
}

interface Selection {
  id: string;
  name: string;
  variants: number;
  layers: number;
  /** The dark copy, when one is selected too. */
  dark: { id: string; name: string } | null;
}

type Step = "select" | "scan" | "changes" | "names" | "publish" | "apply" | "send" | "done";
type Choices = Record<string, { light?: string; dark?: string }>;
type Tick = "waiting" | "working" | "done" | "failed";

interface DoneState {
  title: string;
  component: string;
  fileName: string;
  created: number;
  updated: number;
  layers: number;
  darkLayers: number;
  tokens: { name: string; values: Record<string, { ref: string }> }[];
  css: string;
  json: Record<string, unknown>;
  variables: Tick;
  binding: Tick;
  sending: Tick;
  sendError?: string;
}

const STEPS: { key: Step; label: string }[] = [
  { key: "select", label: "Select" },
  { key: "scan", label: "Scan" },
  { key: "changes", label: "Changes" },
  { key: "names", label: "Names" },
  { key: "publish", label: "Publish" },
  { key: "apply", label: "Apply" },
  { key: "send", label: "Send" },
  { key: "done", label: "Done" },
];

const el = (tag: string, cls = "", text = "") => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

const button = (text: string, onClick: () => void, primary = false, disabled = false) => {
  const b = el("button", primary ? "primary" : "", text) as HTMLButtonElement;
  b.type = "button";
  b.disabled = disabled;
  b.onclick = onClick;
  return b;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A colour square. Transparent colours show a checked pattern behind them. */
function swatch(s: Swatch | null | undefined, title?: string): HTMLElement {
  const box = el("span", "swatch");
  if (!s) {
    box.classList.add("empty");
    box.title = title ?? "Not chosen";
    box.textContent = "?";
    return box;
  }
  const fill = el("span", "fill");
  fill.style.background = s.hex;
  box.appendChild(fill);
  box.title = title ?? `${s.label} ${s.hex}`;
  return box;
}

/** A pair of swatches for light and dark, with the labels. */
function pair(light: Swatch | null | undefined, dark: Swatch | null | undefined): HTMLElement {
  const wrap = el("span", "pair");
  for (const [mode, s] of [
    ["Light", light],
    ["Dark", dark],
  ] as const) {
    const part = el("span", "mode");
    part.appendChild(swatch(s, s ? `${mode}: ${s.label} ${s.hex}` : `${mode}: not chosen`));
    part.appendChild(el("span", "mode-label", `${mode[0]} ${s ? s.label : "?"}`));
    wrap.appendChild(part);
  }
  return wrap;
}

const KIND_LABEL: Record<string, string> = {
  semantic: "Semantic",
  primitive: "Primitive",
  component: "Component token",
  raw: "Raw value",
  missing: "Cannot read",
};

function issueList(issues: Issue[]): HTMLElement {
  const ul = el("ul", "issues");
  const order = { error: 0, warning: 1, info: 2 };
  for (const i of [...issues].sort((a, b) => order[a.severity] - order[b.severity])) {
    const li = el("li", `issue ${i.severity}`);
    li.appendChild(el("span", "badge", i.severity === "error" ? "Must fix" : i.severity === "warning" ? "Check" : "Note"));
    const text = el("span");
    if (i.token && !i.message.includes(i.token)) {
      text.appendChild(el("span", "who", i.token));
      text.appendChild(document.createTextNode(": "));
    }
    text.appendChild(document.createTextNode(i.message));
    li.appendChild(text);
    ul.appendChild(li);
  }
  return ul;
}

export function createScanUi(opts: { root: HTMLElement; post: (msg: unknown) => void; settings: () => ScanSettings; openSettings: () => void; onNewKey: (key: string) => void }) {
  const { root, post } = opts;
  let step: Step = "select";
  let selection: Selection | null = null;
  let selectionMessage = "Select a component set on the canvas.";
  let view: ScanView | null = null;
  let choices: Choices = {};
  let checked: { ok: boolean; issues: Issue[]; summary: ScanSummary } | null = null;
  let done: DoneState | null = null;
  let published: { created: number; updated: number } | null = null;
  let pending: Pending | null = null;
  let busy = "";
  let error = "";

  const hexOf = (name: string | null | undefined): Swatch | null => {
    if (!name || !view) return null;
    const p = view.primitives.find((x) => x.label === name);
    return p ? p : null;
  };
  const valueOf = (t: TokenView, mode: "light" | "dark") => choices[t.name]?.[mode] ?? t[mode];

  const go = (s: Step) => {
    step = s;
    error = "";
    render();
    root.scrollTop = 0;
  };

  function stepper(): HTMLElement {
    const ol = el("ol", "stepper");
    const at = STEPS.findIndex((s) => s.key === step);
    STEPS.forEach((s, i) => {
      const li = el("li", i === at ? "current" : i < at ? "past" : "", `${i + 1} ${s.label}`);
      if (i === at) li.setAttribute("aria-current", "step");
      ol.appendChild(li);
    });
    return ol;
  }

  function actions(...buttons: HTMLElement[]) {
    const row = el("div", "row actions");
    buttons.forEach((b) => row.appendChild(b));
    return row;
  }

  function status(text: string, tone: "" | "error" | "ok" = "") {
    const p = el("p", `status ${tone}`, text);
    p.setAttribute("role", "status");
    return p;
  }

  // 1. Select
  function renderSelect(out: HTMLElement) {
    if (pending) {
      const box = el("div", "callout error");
      box.appendChild(el("strong", "", `The ${pending.title} tokens are in Figma, but not in Token Library.`));
      box.appendChild(el("p", "", `${plural(pending.count, "token")} from "${pending.fileName}" did not get to Token Library. Send them again, or download them as JSON.`));
      box.appendChild(actions(button("Send again", () => void sendPending(), true), button("Download JSON", () => download(pending!.json, `${pending!.component}-tokens.json`))));
      out.appendChild(box);
    }
    out.appendChild(
      el("p", "hint", 'Select a finished component set with a State variant property, for example State=Hover, and shift-click its dark copy. The dark copy is a duplicate with only the colours changed, with "dark" in its name. The scan reads the layers called surface, line, content and icon in every variant.'),
    );
    if (!selection) {
      out.appendChild(status(selectionMessage));
      return;
    }
    const card = el("div", "card");
    card.appendChild(el("strong", "", selection.name));
    card.appendChild(el("span", "sub", `${plural(selection.variants, "variant")} · ${plural(selection.layers, "coloured layer")}`));
    card.appendChild(el("span", "sub", selection.dark ? `Dark copy: ${selection.dark.name}` : "No dark copy selected. You will choose dark values by hand for parts that use a primitive."));
    out.appendChild(card);
    out.appendChild(actions(button(busy ? "Scanning…" : "Scan", () => run(), true, !!busy)));
  }

  function run() {
    busy = "scan";
    error = "";
    choices = {};
    checked = null;
    published = null;
    render();
    post({ type: "scan-run" });
  }

  // 2. Scan
  function layerRow(l: LayerView) {
    const li = el("li", "layer");
    const head = el("div", "row between");
    head.appendChild(el("span", "mono", `${l.layer} · ${l.paint}`));
    head.appendChild(el("span", `badge kind-${l.kind}`, KIND_LABEL[l.kind] ?? l.kind));
    li.appendChild(head);
    const body = el("div", "row between");
    body.appendChild(el("span", "mono", l.label));
    body.appendChild(pair(l.light, l.dark));
    li.appendChild(body);
    if (l.darkLabel) li.appendChild(el("span", "sub mono", `Dark copy: ${l.darkLabel}`));
    if (l.noMatch) li.appendChild(el("span", "flag", "No matching layer in the dark copy"));
    if (l.sameInBoth) li.appendChild(el("span", "flag", "Shows the same in both themes"));
    return li;
  }

  function byVariant<T>(items: T[], variantOf: (t: T) => string) {
    const groups = new Map<string, T[]>();
    for (const i of items) groups.set(variantOf(i), [...(groups.get(variantOf(i)) ?? []), i]);
    return groups;
  }

  function renderScan(out: HTMLElement) {
    if (!view) return;
    const v = view;
    out.appendChild(el("h2", "", v.title));
    out.appendChild(el("span", "sub", `${plural(v.variants, "variant")} · ${plural(v.layers.length, "named layer")}${v.unknown.length ? ` · ${v.unknown.length} not recognised` : ""}${v.darkName ? ` · dark from ${v.darkName}` : ""}`));
    if (v.status === "fine") out.appendChild(status(`${v.title} uses Base semantic tokens in every part. It does not need its own tokens.`, "ok"));
    if (v.status === "own-tokens") out.appendChild(status(`${v.title} already uses its own tokens in every part. Nothing to change.`, "ok"));
    if (v.status === "blocked") out.appendChild(status(`The scan cannot continue. Fix the problems below in Figma, then scan again.`, "error"));
    if (v.status === "draft") {
      const n = v.layers.filter((l) => l.kind === "primitive" || l.kind === "raw").length;
      out.appendChild(
        status(`${plural(n, "part uses", "parts use")} a primitive or a raw value. A component uses Base semantic tokens or a full set of its own tokens, so ${v.title} gets ${plural(v.tokens.length, "component token")}.`),
      );
    }
    if (v.issues.length) out.appendChild(issueList(v.issues));
    for (const [variant, ls] of byVariant([...v.layers, ...v.unknown], (l) => l.variant)) {
      const d = el("details", "group") as HTMLDetailsElement;
      d.open = true;
      d.appendChild(el("summary", "", variant));
      const ul = el("ul");
      ls.forEach((l) => ul.appendChild(layerRow(l)));
      d.appendChild(ul);
      out.appendChild(d);
    }
    const next = v.status === "draft" ? [button("See the changes", () => go("changes"), true)] : [];
    out.appendChild(actions(button("Back", () => go("select")), button("Scan again", () => run()), ...next));
  }

  // 3. Changes
  function changeRow(c: ChangeView) {
    const t = view!.tokens.find((x) => x.name === c.token);
    const li = el("li", "layer");
    const head = el("div", "row between");
    head.appendChild(el("span", "mono", `${c.before.layer} · ${c.before.paint}`));
    if (c.reused) head.appendChild(el("span", "badge", "Uses the default token"));
    li.appendChild(head);
    const before = el("div", "row between");
    before.appendChild(el("span", "mono muted", `Now: ${c.before.label}`));
    before.appendChild(pair(c.before.light, c.before.dark));
    li.appendChild(before);
    const after = el("div", "row between");
    after.appendChild(el("span", "mono", `New: ${c.token}`));
    after.appendChild(pair(hexOf(t ? valueOf(t, "light") : null), hexOf(t ? valueOf(t, "dark") : null)));
    li.appendChild(after);
    return li;
  }

  function renderChanges(out: HTMLElement) {
    if (!view) return;
    out.appendChild(el("h2", "", "Changes to the layers"));
    out.appendChild(el("p", "hint", "Each layer, before and after. A ? means that you choose the value in Accept names."));
    for (const [variant, cs] of byVariant(view.changes, (c) => c.before.variant)) {
      const d = el("details", "group") as HTMLDetailsElement;
      d.open = true;
      d.appendChild(el("summary", "", variant));
      const ul = el("ul");
      cs.forEach((c) => ul.appendChild(changeRow(c)));
      d.appendChild(ul);
      out.appendChild(d);
    }
    out.appendChild(actions(button("Back", () => go("scan")), button("See the names", () => { go("names"); check(); }, true)));
  }

  // 4. Review
  function picker(t: TokenView, mode: "light" | "dark") {
    const label = el("label", "picker");
    const value = valueOf(t, mode);
    label.appendChild(swatch(hexOf(value)));
    const sel = document.createElement("select");
    sel.setAttribute("aria-label", `${mode === "light" ? "Light" : "Dark"} value for ${t.name}`);
    if (!value) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = `Choose ${mode}`;
      sel.appendChild(o);
    }
    for (const p of view!.primitives) {
      const o = document.createElement("option");
      o.value = p.label;
      o.textContent = p.label;
      if (p.label === value) o.selected = true;
      sel.appendChild(o);
    }
    sel.onchange = () => {
      choices = { ...choices, [t.name]: { ...choices[t.name], [mode]: sel.value || undefined } };
      check();
      render();
    };
    label.appendChild(el("span", "mode-label", mode === "light" ? "Light" : "Dark"));
    label.appendChild(sel);
    return label;
  }

  function renderNames(out: HTMLElement) {
    if (!view) return;
    out.appendChild(el("h2", "", "Accept names"));
    const flagged = view.tokens.filter((t) => (t.needsDark && !valueOf(t, "dark")) || (t.needsLight && !valueOf(t, "light")));
    const why = view.darkName ? "These parts have no matching layer in the dark copy, or a colour that no primitive has." : "These parts use a primitive and no dark copy was selected, so the plugin cannot know their dark value.";
    out.appendChild(
      el("p", "hint", flagged.length ? `Choose the missing values for ${plural(flagged.length, "token")}. ${why}` : "Check each name and value. Nothing is created in Figma until you accept the names."),
    );
    const groups = new Map<string, TokenView[]>();
    for (const t of view.tokens) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
    for (const [group, ts] of groups) {
      const d = el("details", "group") as HTMLDetailsElement;
      d.open = true;
      d.appendChild(el("summary", "", `Interactive / ${view.title} / ${group}`));
      const ul = el("ul");
      for (const t of ts) {
        const li = el("li", "layer" + ((t.needsDark && !valueOf(t, "dark")) || (t.needsLight && !valueOf(t, "light")) ? " needs" : ""));
        const head = el("div", "row between");
        head.appendChild(el("span", "mono strong", t.figmaName));
        head.appendChild(el("span", `badge ${t.published ? "kind-semantic" : ""}`, t.published ? "Published" : "Hidden from publishing"));
        li.appendChild(head);
        li.appendChild(el("span", "mono muted", t.name));
        li.appendChild(el("span", "sub", t.source));
        const row = el("div", "row");
        row.appendChild(picker(t, "light"));
        row.appendChild(picker(t, "dark"));
        li.appendChild(row);
        ul.appendChild(li);
      }
      d.appendChild(ul);
      out.appendChild(d);
    }
    if (checked) {
      out.appendChild(el("h3", "", "Checks"));
      out.appendChild(checked.issues.length ? issueList(checked.issues) : status("No problems found.", "ok"));
    }
    out.appendChild(actions(button("Back", () => go("changes")), button("Accept names", () => go("publish"), true, !checked?.ok)));
  }

  function check() {
    checked = null;
    post({ type: "scan-check", choices });
  }

  // 5. Save and publish
  function renderPublish(out: HTMLElement) {
    if (!view || !checked) return;
    const s = checked.summary;
    out.appendChild(el("h2", "", "Save and publish"));
    out.appendChild(el("p", "lead", s.sentence));
    const ul = el("ul", "plain");
    const items = [
      s.create ? `Create ${plural(s.create, "variable")} in Colour tokens, group Interactive / ${view.title}.` : "",
      s.update ? `Update ${plural(s.update, "variable")} that are already in this file.` : "",
      `Hide ${s.hidden} from publishing. Only the -default tokens are published.`,
      "No layer changes yet. You apply the variables to the layers in the next step.",
    ].filter(Boolean);
    items.forEach((i) => ul.appendChild(el("li", "", i)));
    out.appendChild(ul);
    out.appendChild(actions(button("Back", () => go("names")), button(busy ? "Saving…" : "Save and publish", () => publish(), true, !!busy)));
  }

  function publish() {
    busy = "publish";
    render();
    post({ type: "scan-publish", choices });
  }

  // 6. Apply to layers
  function renderApply(out: HTMLElement) {
    if (!view || !checked) return;
    out.appendChild(el("h2", "", "Apply to layers"));
    if (published) out.appendChild(status(`${published.created ? `Created ${plural(published.created, "variable")}` : ""}${published.created && published.updated ? ", " : ""}${published.updated ? `updated ${plural(published.updated, "variable")}` : ""}.`, "ok"));
    out.appendChild(el("p", "lead", checked.summary.applySentence));
    out.appendChild(el("p", "hint", "Check where each token goes. You can undo this step in Figma."));
    for (const [variant, cs] of byVariant(view.changes, (c) => c.before.variant)) {
      const d = el("details", "group") as HTMLDetailsElement;
      d.open = false;
      d.appendChild(el("summary", "", `${variant} · ${plural(cs.length, "layer")}`));
      const ul = el("ul");
      cs.forEach((c) => ul.appendChild(changeRow(c)));
      d.appendChild(ul);
      out.appendChild(d);
    }
    out.appendChild(actions(button(busy ? "Applying…" : "Apply to layers", () => bind(), true, !!busy)));
  }

  function bind() {
    busy = "bind";
    render();
    post({ type: "scan-bind" });
  }

  // 7. Send to Token Library
  function renderSend(out: HTMLElement) {
    if (!done) return;
    const d = done;
    out.appendChild(el("h2", "", "Send to Token Library"));
    out.appendChild(
      el("p", "hint", `${d.title} now uses its new tokens in Figma. Send them to Token Library, where a designer checks them before Send to code. Until then, the plugin remembers that they are not sent.`),
    );
    out.appendChild(tokenTable(d));
    out.appendChild(el("h3", "", "CSS that Send to code will write"));
    out.appendChild(el("pre", "css", d.css));
    if (d.sending === "failed") {
      const box = el("div", "callout error");
      box.appendChild(el("p", "", `${d.sendError ?? "Token Library did not receive the tokens."} The changes in Figma stay. Send again, or download the tokens as JSON.`));
      box.appendChild(actions(button("Download JSON", () => download(d.json, `${d.component}-tokens.json`))));
      out.appendChild(box);
    }
    out.appendChild(actions(button(d.sending === "working" ? "Sending…" : d.sending === "failed" ? "Send again" : "Send to Token Library", () => void send(), true, d.sending === "working")));
  }

  // 6. Done
  function tick(state: Tick, text: string, extra?: HTMLElement) {
    const li = el("li", `tick ${state}`);
    li.appendChild(el("span", "mark", state === "done" ? "✓" : state === "failed" ? "!" : state === "working" ? "…" : "·"));
    const body = el("div");
    body.appendChild(el("span", "", text));
    if (extra) body.appendChild(extra);
    li.appendChild(body);
    return li;
  }

  function tokenTable(d: DoneState): HTMLElement {
    const table = el("table", "tokens");
    const head = el("tr");
    ["Token", "Light", "Dark"].forEach((h) => head.appendChild(el("th", "", h)));
    table.appendChild(head);
    for (const t of d.tokens) {
      const tr = el("tr");
      tr.appendChild(el("td", "mono", t.name));
      for (const m of ["light", "dark"]) {
        const td = el("td");
        const name = t.values[m]?.ref;
        const cell = el("span", "cell");
        cell.appendChild(swatch(hexOf(name)));
        cell.appendChild(el("span", "mono", name ?? ""));
        td.appendChild(cell);
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    return table;
  }

  // 8. Done
  function renderDone(out: HTMLElement) {
    if (!done) return;
    const d = done;
    out.appendChild(el("h2", "", `${d.title}: done`));
    const ul = el("ul", "ticks");
    ul.appendChild(tick("done", `${d.created ? `Created ${plural(d.created, "variable")}` : ""}${d.created && d.updated ? ", " : ""}${d.updated ? `updated ${plural(d.updated, "variable")}` : ""} in Colour tokens / Interactive / ${d.title}`));
    ul.appendChild(tick("done", `Bound ${plural(d.layers, "layer")} to the new variables${d.darkLayers ? `, and ${plural(d.darkLayers, "layer")} in the dark copy` : ""}`));
    ul.appendChild(tick("done", `Sent ${plural(d.tokens.length, "token")} to Token Library. A designer checks them there before Send to code.`));
    out.appendChild(ul);
    if (d.darkLayers) out.appendChild(el("p", "hint", "The dark copy now uses the same tokens in dark mode. You can delete it if you do not need it."));
    out.appendChild(status("Next: publish the library from the Assets panel, so other files get the new variables.", "ok"));
    out.appendChild(actions(button("Scan another component", () => { view = null; done = null; published = null; go("select"); post({ type: "scan-selection" }); }, true)));
  }

  // Sending to Token Library
  async function postTokens(p: Pending): Promise<string | null> {
    const s = opts.settings();
    if (!s.key) {
      opts.openSettings();
      return "Add your sync key in Settings.";
    }
    try {
      const res = await fetch(`${s.url}/api/figma/scan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: p.fileName, component: p.component, title: p.title, tokens: p.json }),
      });
      const body = await res.json().catch(() => ({}));
      if (body.newKey) opts.onNewKey(body.newKey);
      if (!res.ok) return body.message ?? `Token Library sent an error (${res.status}).`;
      return null;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return m.includes("Failed to fetch") ? "Token Library cannot be reached. Make sure that the address in Settings is correct." : m;
    }
  }

  function savePending(p: Pending | null) {
    pending = p;
    post({ type: "scan-save-pending", pending: p });
  }

  async function send() {
    if (!done) return;
    const p: Pending = { fileName: done.fileName, component: done.component, title: done.title, json: done.json, count: done.tokens.length };
    savePending(p);
    done.sending = "working";
    done.sendError = undefined;
    render();
    const err = await postTokens(p);
    if (!done) return;
    if (err) {
      done.sending = "failed";
      done.sendError = err;
      render();
    } else {
      done.sending = "done";
      savePending(null);
      go("done");
    }
  }

  async function sendPending() {
    if (!pending) return;
    busy = "send";
    render();
    const err = await postTokens(pending);
    busy = "";
    if (err) error = err;
    else savePending(null);
    render();
  }

  function download(json: unknown, name: string) {
    const blob = new Blob([JSON.stringify(json, null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function render() {
    root.replaceChildren();
    root.appendChild(stepper());
    const out = el("div", "steps");
    if (step === "select") renderSelect(out);
    if (step === "scan") renderScan(out);
    if (step === "changes") renderChanges(out);
    if (step === "names") renderNames(out);
    if (step === "publish") renderPublish(out);
    if (step === "apply") renderApply(out);
    if (step === "send") renderSend(out);
    if (step === "done") renderDone(out);
    if (error) out.appendChild(status(error, "error"));
    root.appendChild(out);
  }

  /** Handle a message from the Figma side. Returns true when it was a scan message. */
  function onMessage(msg: any): boolean {
    switch (msg.type) {
      case "scan-selection": {
        const next: Selection | null = msg.selection;
        selectionMessage = msg.message ?? selectionMessage;
        if (step === "select") {
          selection = next;
          render();
        } else if (["scan", "changes", "names"].includes(step) && next && next.id !== selection?.id) {
          // Once variables are saved, the steps carry on with the scanned component, whatever is selected.
          // A different component set starts again. Clicking inside the same set, or on the empty canvas, keeps the scan.
          selection = next;
          view = null;
          go("select");
        }
        return true;
      }
      case "scan-result":
        busy = "";
        view = msg.view;
        go("scan");
        return true;
      case "scan-checked":
        checked = { ok: msg.ok, issues: msg.issues, summary: msg.summary };
        if (step === "names") render();
        return true;
      case "scan-progress":
        return true;
      case "scan-published":
        busy = "";
        published = { created: msg.result.created.length, updated: msg.result.updated.length };
        go("apply");
        return true;
      case "scan-bound": {
        busy = "";
        done = {
          title: msg.title,
          component: msg.component,
          fileName: msg.fileName,
          created: published?.created ?? 0,
          updated: published?.updated ?? 0,
          layers: msg.result.layers,
          darkLayers: msg.result.darkLayers,
          tokens: msg.preview.tokens,
          css: msg.preview.css,
          json: msg.preview.json,
          variables: "done",
          binding: "done",
          sending: "waiting",
        };
        // The tokens are in Figma but not yet in Token Library: remember them until they are sent.
        savePending({ fileName: done.fileName, component: done.component, title: done.title, json: done.json, count: done.tokens.length });
        go("send");
        return true;
      }
      case "scan-error":
        busy = "";
        error = msg.message;
        render();
        return true;
      default:
        return false;
    }
  }

  return {
    onMessage,
    render,
    setPending(p: Pending | null) {
      pending = p;
      render();
    },
  };
}
