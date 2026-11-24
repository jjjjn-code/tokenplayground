/**
 * Token Library Figma plugin: the Scan component tab (F12), simplified on
 * 24 Nov 2026 to 3 screens in a wider window:
 *
 * 1. Check: which set is light and which is dark (with Swap), the
 *    component name, and each variant's state.
 * 2. Token map: parts against states, each box with its light and dark
 *    colours before and after. Click a box for its layers and details.
 * 3. Finish: create the variables, apply them to the layers, send to
 *    Token Library, each with its own button.
 *
 * The Figma side (code.ts) reads and writes the file; this window shows
 * the screens and sends the new tokens to Token Library.
 */
import type { ScanSummary } from "../../src/lib/figma/scan";
import type { MapCell, ScanView, Swatch, TokenMap } from "../../src/lib/figma/scan-view";
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

interface CheckInfo {
  light: { id: string; name: string; variants: { id: string; name: string }[] };
  dark: { id: string; name: string; variants: { id: string; name: string }[] } | null;
  guessed: boolean;
  name: string;
  suggestedName: string;
  hasStateProperty: boolean;
  states: { id: string; name: string; state: string }[];
}

type Step = "check" | "map" | "finish";
type Choices = Record<string, { light?: string; dark?: string }>;

interface Finish {
  published: { created: number; updated: number } | null;
  bound: { layers: number; darkLayers: number; statesNamed: number } | null;
  title: string;
  component: string;
  fileName: string;
  tokens: { name: string; values: Record<string, { ref: string }> }[];
  css: string;
  json: Record<string, unknown>;
  sending: "waiting" | "working" | "done" | "failed";
  sendError?: string;
}

const STATES = ["Default", "Hover", "Pressed", "Disabled", "Selected", "Loading", "On", "Off"];
const PARTS = [
  { value: "surface", label: "Surface (backgrounds)" },
  { value: "line", label: "Line (borders)" },
  { value: "content", label: "Content (text and icons)" },
  { value: "icon", label: "Icon (separate from text)" },
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
const title = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** A colour square. Transparent colours show a checked pattern behind them. */
function swatch(s: Swatch | null | undefined, label?: string): HTMLElement {
  const box = el("span", "swatch");
  if (!s) {
    box.classList.add("empty");
    box.textContent = "?";
    box.title = label ?? "Not chosen";
    return box;
  }
  const fill = el("span", "fill");
  fill.style.background = s.hex;
  box.appendChild(fill);
  box.title = label ?? `${s.label} ${s.hex}`;
  return box;
}

/** A token name that may wrap after each hyphen, so long names fit in the map. */
function tokenName(name: string): HTMLElement {
  const span = el("span", "tok");
  name.split("-").forEach((part, i, all) => {
    span.appendChild(document.createTextNode(part + (i < all.length - 1 ? "-" : "")));
    if (i < all.length - 1) span.appendChild(document.createElement("wbr"));
  });
  return span;
}

/** A swatch with its name, for 1 theme. */
function colour(s: Swatch | null | undefined, text?: string): HTMLElement {
  const wrap = el("span", "colour");
  wrap.appendChild(swatch(s));
  wrap.appendChild(el("span", "", text ?? s?.label ?? "Choose"));
  return wrap;
}

function issueList(issues: Issue[]): HTMLElement {
  const ul = el("ul", "issues");
  const order = { error: 0, warning: 1, info: 2 };
  for (const i of [...issues].sort((a, b) => order[a.severity] - order[b.severity])) {
    const li = el("li", `issue ${i.severity}`);
    li.appendChild(el("span", "badge", i.severity === "error" ? "Must fix" : i.severity === "warning" ? "Check" : "Note"));
    li.appendChild(el("span", "", i.message));
    ul.appendChild(li);
  }
  return ul;
}

export function createScanUi(opts: { root: HTMLElement; post: (msg: unknown) => void; settings: () => ScanSettings; openSettings: () => void; onNewKey: (key: string) => void }) {
  const { root, post } = opts;
  let step: Step = "check";
  let check: CheckInfo | null = null;
  let message = "Select your light and dark component sets on the canvas.";
  let pictures = new Map<string, string>();
  let view: ScanView | null = null;
  let map: TokenMap | null = null;
  let summary: ScanSummary | null = null;
  let checked: { ok: boolean; issues: Issue[] } | null = null;
  let choices: Choices = {};
  let selected: { row: number; col: number } | null = null;
  let finish: Finish | null = null;
  let pending: Pending | null = null;
  let busy = "";
  let error = "";

  const go = (s: Step) => {
    step = s;
    error = "";
    post({ type: "scan-lock", locked: s !== "check" });
    render();
    root.scrollTop = 0;
  };

  function header(): HTMLElement {
    const bar = el("div", "scan-head");
    const steps = el("ol", "pills");
    const list: [Step, string][] = [["check", "1 Check"], ["map", "2 Token map"], ["finish", "3 Finish"]];
    const at = list.findIndex(([k]) => k === step);
    list.forEach(([, label], i) => {
      const li = el("li", i === at ? "on" : i < at ? "done" : "", i < at ? `✓ ${label.slice(2)}` : label);
      if (i === at) li.setAttribute("aria-current", "step");
      steps.appendChild(li);
    });
    bar.appendChild(steps);
    return bar;
  }

  function footer(left: HTMLElement[], right: HTMLElement[]): HTMLElement {
    const f = el("div", "scan-foot");
    const l = el("div", "row");
    left.forEach((b) => l.appendChild(b));
    const r = el("div", "row");
    right.forEach((b) => r.appendChild(b));
    f.appendChild(l);
    f.appendChild(r);
    return f;
  }

  function status(text: string, tone: "" | "error" | "ok" | "warn" = "") {
    const p = el("p", `status ${tone}`, text);
    p.setAttribute("role", "status");
    return p;
  }

  // 1. Check
  function side(kind: "light" | "dark", info: CheckInfo["light"] | null): HTMLElement {
    const box = el("div", `side ${kind}`);
    const head = el("div", "row between");
    head.appendChild(el("strong", "", kind === "light" ? "☀ Light" : "☾ Dark"));
    if (info) head.appendChild(el("span", "badge", info.name));
    box.appendChild(head);
    const stage = el("div", `stage ${kind}`);
    if (!info) {
      stage.appendChild(el("p", "hint", "No dark set selected. Shift-click the dark copy on the canvas to add it. Without it, you choose each dark colour by hand."));
    } else {
      info.variants.forEach((v, i) => {
        const col = el("div", "vcol");
        const src = pictures.get(v.id);
        if (src) {
          const img = document.createElement("img");
          img.src = src;
          img.alt = v.name;
          col.appendChild(img);
        } else col.appendChild(el("span", "noimg", "No picture"));
        const st = check?.states[i]?.state;
        col.appendChild(el("span", "vlabel", st ? title(st) : v.name));
        stage.appendChild(col);
      });
    }
    box.appendChild(stage);
    return box;
  }

  function renderCheck(out: HTMLElement) {
    if (pending) {
      const box = el("div", "callout error");
      box.appendChild(el("strong", "", `The ${pending.title} tokens are in Figma, but not in Token Library.`));
      box.appendChild(el("p", "", `${plural(pending.count, "token")} from "${pending.fileName}" did not get to Token Library.`));
      box.appendChild(el("div", "row")).append(button("Send again", () => void sendPending(), true), button("Download JSON", () => download(pending!.json, `${pending!.component}-tokens.json`)));
      out.appendChild(box);
    }
    if (!check) {
      const box = el("div", "empty-state");
      box.appendChild(el("strong", "", message));
      box.appendChild(el("p", "hint", "Select the light component set and its dark copy together (shift-click). The dark copy is a duplicate with only the colours changed. To tell them apart, the plugin reads the Appearance you set in Figma, then the names. You can swap them on the next screen."));
      out.appendChild(box);
      return;
    }
    const c = check;
    const pair = el("div", "pair-grid");
    pair.appendChild(side("light", c.light));
    pair.appendChild(button("⇄ Swap", () => post({ type: "scan-swap" }), false, !c.dark));
    pair.appendChild(side("dark", c.dark));
    out.appendChild(pair);
    if (c.guessed) out.appendChild(status("The plugin could not tell which one is dark. Check the pictures and press Swap if they are the wrong way round. Tip: set the dark one's Appearance to dark in Figma.", "warn"));

    const nameRow = el("div", "row name-row");
    const label = el("label", "field");
    label.appendChild(el("span", "hint", "Component name"));
    const input = document.createElement("input");
    input.type = "text";
    input.id = "scan-name";
    input.value = c.name;
    input.onchange = () => post({ type: "scan-options", name: input.value.trim() });
    label.appendChild(input);
    nameRow.appendChild(label);
    nameRow.appendChild(el("span", "hint", `Tokens will be called ${view?.component || "name"}-surface-default, ${view?.component || "name"}-content-hover and so on.`));
    out.appendChild(nameRow);

    const st = el("div", "field");
    if (c.hasStateProperty) {
      st.appendChild(el("span", "hint", "States, from the State property"));
      const chips = el("div", "chips");
      for (const s of c.states) chips.appendChild(el("span", "chip", s.state ? title(s.state) : "No state"));
      st.appendChild(chips);
    } else {
      st.appendChild(el("span", "hint", "Your set has no State property yet. Choose each variant's state. The plugin adds the State property for you when it applies the tokens."));
      const grid = el("div", "state-grid");
      for (const s of c.states) {
        const cell = el("label", "state-pick");
        const src = pictures.get(s.id);
        if (src) {
          const img = document.createElement("img");
          img.src = src;
          img.alt = s.name;
          cell.appendChild(img);
        }
        const sel = document.createElement("select");
        sel.setAttribute("aria-label", `State of ${s.name}`);
        for (const opt of STATES) {
          const o = document.createElement("option");
          o.value = opt;
          o.textContent = opt;
          if (opt.toLowerCase() === s.state) o.selected = true;
          sel.appendChild(o);
        }
        sel.onchange = () => {
          const states = Object.fromEntries(c.states.map((x) => [x.id, x.id === s.id ? sel.value : title(x.state)]));
          post({ type: "scan-options", states });
        };
        cell.appendChild(sel);
        grid.appendChild(cell);
      }
      st.appendChild(grid);
    }
    out.appendChild(st);

    if (view) {
      const v = view;
      if (v.status === "fine") out.appendChild(status(`${v.title} uses Base semantic tokens in every part, in light and dark. It does not need its own tokens.`, "ok"));
      if (v.status === "own-tokens") out.appendChild(status(`${v.title} already uses its own tokens everywhere. Nothing to change.`, "ok"));
      if (v.status === "draft") out.appendChild(status(`Some parts use primitives, so ${v.title} gets a full set of ${plural(v.tokens.length, "token")}. See them on the token map.`));
      const problems = v.issues.filter((i) => i.severity === "error" || ["scan.new-state", "scan.no-match", "scan.dark-variants", "scan.focus"].includes(i.code));
      if (problems.length) out.appendChild(issueList(problems));
    }
    out.appendChild(footer([], [button("See the token map", () => go("map"), true, view?.status !== "draft")]));
  }

  // 2. Token map
  function cellBox(cell: MapCell, r: number, i: number): HTMLElement {
    const b = el("button", `cell${cell.reused ? " reused" : ""}${selected?.row === r && selected?.col === i ? " sel" : ""}${cell.needsDark || cell.needsLight ? " needs" : ""}`) as HTMLButtonElement;
    b.type = "button";
    b.onclick = () => {
      selected = { row: r, col: i };
      render();
    };
    b.appendChild(tokenName(cell.token));
    const ld = el("span", "ld");
    ld.appendChild(colour(cell.light, cell.light ? `☀ ${cell.light.label}` : "☀ Choose"));
    ld.appendChild(colour(cell.dark, cell.dark ? `☾ ${cell.dark.label}` : "☾ Choose"));
    b.appendChild(ld);
    b.appendChild(el("span", "was", cell.reused ? "Same as Default" : `Before: ${cell.beforeLight.label === cell.beforeDark.label ? cell.beforeLight.label : `${cell.beforeLight.label} / ${cell.beforeDark.label}`}`));
    return b;
  }

  function picker(token: string, mode: "light" | "dark", current: Swatch | null): HTMLElement {
    const sel = document.createElement("select");
    sel.setAttribute("aria-label", `${mode === "light" ? "Light" : "Dark"} colour for ${token}`);
    if (!current) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "Choose";
      sel.appendChild(o);
    }
    for (const p of view?.primitives ?? []) {
      const o = document.createElement("option");
      o.value = p.label;
      o.textContent = p.label;
      if (p.label === current?.label) o.selected = true;
      sel.appendChild(o);
    }
    sel.onchange = () => {
      choices = { ...choices, [token]: { ...choices[token], [mode]: sel.value || undefined } };
      post({ type: "scan-choices", choices });
    };
    return sel;
  }

  function detail(cell: MapCell | null): HTMLElement {
    const box = el("aside", "detail");
    if (!cell) {
      box.appendChild(el("p", "hint", "Click a box to see its layers on the canvas and change its part."));
      return box;
    }
    box.appendChild(el("span", "k", "Token"));
    box.appendChild(el("strong", "mono", cell.token));
    box.appendChild(el("span", "hint", `${title(cell.state)}${cell.reused ? " uses the Default token, because it looks the same" : ""} · ${cell.published ? "published" : "hidden from publishing"}`));
    const t = el("div", "cmp");
    t.append(el("span"), el("span", "h", "☀ Light"), el("span", "h", "☾ Dark"));
    t.append(el("span", "h", "Before"), colour(cell.beforeLight.swatch, cell.beforeLight.label), colour(cell.beforeDark.swatch, cell.beforeDark.label));
    t.append(el("span", "h", "After"));
    t.append(cell.needsLight ? picker(cell.token, "light", cell.light) : colour(cell.light));
    t.append(cell.needsDark ? picker(cell.token, "dark", cell.dark) : colour(cell.dark));
    box.appendChild(t);
    if (cell.needsDark) box.appendChild(el("p", "hint warn", "No matching layer in the dark set, so choose the dark colour."));
    box.appendChild(el("span", "k", `Layers (${cell.layers.length})`));
    const seen = new Set<string>();
    for (const l of cell.layers) {
      if (seen.has(l.key)) continue;
      seen.add(l.key);
      const row = el("label", "layer-part");
      row.appendChild(el("span", "", `${l.name} · ${l.paint}`));
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", `Part for ${l.name}`);
      for (const p of PARTS) {
        const o = document.createElement("option");
        o.value = p.value;
        o.textContent = p.label;
        if (p.value === l.category) o.selected = true;
        sel.appendChild(o);
      }
      sel.onchange = () => {
        selected = null;
        post({ type: "scan-options", parts: { [l.key]: sel.value } });
      };
      row.appendChild(sel);
      box.appendChild(row);
    }
    const show = el("div", "row");
    show.appendChild(button("Show in light", () => post({ type: "scan-show", nodeIds: cell.layers.map((l) => l.nodeId) })));
    const darkIds = cell.layers.map((l) => l.darkNodeId).filter((x): x is string => !!x);
    if (darkIds.length) show.appendChild(button("Show in dark", () => post({ type: "scan-show", nodeIds: darkIds })));
    box.appendChild(show);
    return box;
  }

  function renderMap(out: HTMLElement) {
    if (!view || !map) return;
    const pub = view.tokens.filter((t) => t.published).length;
    out.appendChild(el("p", "hint", `${plural(view.tokens.length, "token")} for ${view.title}: ${pub} published, ${view.tokens.length - pub} hidden. Rows are parts, columns are states. Grey boxes look the same as Default, so they use the Default token.`));
    const split = el("div", "split");
    const wrap = el("div", "map-wrap");
    const table = el("table", "map");
    const head = el("tr");
    head.appendChild(el("th", "", "Part"));
    map.states.forEach((s) => head.appendChild(el("th", "", title(s))));
    table.appendChild(head);
    map.rows.forEach((row, r) => {
      const tr = el("tr");
      tr.appendChild(el("td", "part", row.label));
      row.cells.forEach((cell, i) => {
        const td = el("td");
        td.appendChild(cell ? cellBox(cell, r, i) : el("span", "nocell", "Not used"));
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    split.appendChild(wrap);
    const cell = selected ? map.rows[selected.row]?.cells[selected.col] ?? null : null;
    split.appendChild(detail(cell));
    out.appendChild(split);
    const issues = [...(checked?.issues ?? []), ...view.issues.filter((i) => i.severity === "warning" && !(checked?.issues ?? []).some((c) => c.message === i.message))];
    if (issues.length) out.appendChild(issueList(issues));
    out.appendChild(footer([button("Back", () => go("check"))], [button(`Accept ${plural(view.tokens.length, "token")}`, () => startFinish(), true, !checked?.ok)]));
  }

  function startFinish() {
    if (!view) return;
    finish = { published: null, bound: null, title: view.title, component: view.component, fileName: "", tokens: [], css: "", json: {}, sending: "waiting" };
    go("finish");
  }

  // 3. Finish
  function fstep(n: number, done: boolean, titleText: string, hint: string, action: HTMLElement | null): HTMLElement {
    const row = el("div", `fstep${done ? " done" : ""}`);
    row.appendChild(el("span", "n", done ? "✓" : String(n)));
    const t = el("div", "t");
    t.appendChild(el("strong", "", titleText));
    t.appendChild(el("span", "hint", hint));
    row.appendChild(t);
    row.appendChild(action ?? el("span", "badge ok", "Done"));
    return row;
  }

  function renderFinish(out: HTMLElement) {
    if (!finish || !summary) return;
    const f = finish;
    const s = summary;
    const where = `Colour tokens / Interactive / ${f.title}`;
    out.appendChild(
      fstep(
        1,
        !!f.published,
        f.published ? `Created ${plural(f.published.created, "variable")}${f.published.updated ? `, updated ${f.published.updated}` : ""}` : `Create ${plural(s.tokens, "variable")}`,
        `In ${where}. ${s.tokens - s.hidden} published, ${s.hidden} hidden. No layer changes yet.`,
        f.published ? null : button(busy === "publish" ? "Creating…" : "Create", () => { busy = "publish"; render(); post({ type: "scan-publish" }); }, true, !!busy),
      ),
    );
    const applyHint = `Swaps ${plural(s.layers, "colour")} in the light set${s.darkLayers ? ` and ${s.darkLayers} in the dark set` : ""} for the new tokens. Both still look the same.${check && !check.hasStateProperty ? " Also adds the State property to your variants." : ""} You can undo this in Figma.`;
    out.appendChild(
      fstep(
        2,
        !!f.bound,
        f.bound ? `Applied to ${plural(f.bound.layers + f.bound.darkLayers, "colour")}` : "Apply them to the layers",
        applyHint,
        f.bound ? null : button(busy === "bind" ? "Applying…" : "Apply", () => { busy = "bind"; render(); post({ type: "scan-bind" }); }, !!f.published, !f.published || !!busy),
      ),
    );
    const sendAction =
      f.sending === "done"
        ? null
        : button(f.sending === "working" ? "Sending…" : f.sending === "failed" ? "Send again" : "Send", () => void send(), !!f.bound, !f.bound || f.sending === "working");
    out.appendChild(fstep(3, f.sending === "done", f.sending === "done" ? `Sent ${plural(f.tokens.length, "token")} to Token Library` : "Send to Token Library", "A designer checks them there before they go to code.", sendAction));
    if (f.sending === "failed") {
      const box = el("div", "callout error");
      box.appendChild(el("p", "", `${f.sendError ?? "Token Library did not receive the tokens."} The changes in Figma stay. Send again, or download the tokens as JSON.`));
      box.appendChild(button("Download JSON", () => download(f.json, `${f.component}-tokens.json`)));
      out.appendChild(box);
    }
    if (f.css) {
      const d = el("details", "group") as HTMLDetailsElement;
      d.appendChild(el("summary", "", "CSS that Send to code will write"));
      d.appendChild(el("pre", "css", f.css));
      out.appendChild(d);
    }
    if (f.sending === "done") out.appendChild(status("All done. Next: publish the library from the Assets panel, so other files get the new variables.", "ok"));
    out.appendChild(footer(f.published ? [] : [button("Back", () => go("map"))], [button("Scan another component", () => { finish = null; selected = null; choices = {}; go("check"); })]));
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
    if (!finish) return;
    const p: Pending = { fileName: finish.fileName, component: finish.component, title: finish.title, json: finish.json, count: finish.tokens.length };
    finish.sending = "working";
    finish.sendError = undefined;
    render();
    const err = await postTokens(p);
    if (!finish) return;
    if (err) {
      finish.sending = "failed";
      finish.sendError = err;
    } else {
      finish.sending = "done";
      savePending(null);
    }
    render();
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
    root.appendChild(header());
    const out = el("div", "scan-body");
    if (step === "check") renderCheck(out);
    if (step === "map") renderMap(out);
    if (step === "finish") renderFinish(out);
    if (error) out.appendChild(status(error, "error"));
    root.appendChild(out);
  }

  function setPictures(p: { light: { id: string; bytes: Uint8Array | null }[]; dark: { id: string; bytes: Uint8Array | null }[] } | null) {
    if (!p) return;
    for (const url of pictures.values()) URL.revokeObjectURL(url);
    pictures = new Map();
    for (const x of [...p.light, ...p.dark]) {
      if (x.bytes) pictures.set(x.id, URL.createObjectURL(new Blob([x.bytes as BlobPart], { type: "image/png" })));
    }
  }

  /** Handle a message from the Figma side. Returns true when it was a scan message. */
  function onMessage(msg: any): boolean {
    switch (msg.type) {
      case "scan-view":
        busy = "";
        check = msg.check;
        if (!msg.check) {
          message = msg.message ?? message;
          view = null;
          map = null;
          if (step !== "finish") step = "check";
        } else {
          setPictures(msg.pictures ?? null);
          view = msg.view;
          map = msg.map;
          summary = msg.summary;
          checked = msg.checked;
        }
        if (step !== "finish") render();
        return true;
      case "scan-progress":
        return true;
      case "scan-published":
        busy = "";
        if (finish) finish.published = { created: msg.result.created.length, updated: msg.result.updated.length };
        render();
        return true;
      case "scan-bound":
        busy = "";
        if (finish) {
          finish.bound = msg.result;
          finish.fileName = msg.fileName;
          finish.tokens = msg.preview.tokens;
          finish.css = msg.preview.css;
          finish.json = msg.preview.json;
          // The tokens are in Figma but not yet in Token Library: remember them until they are sent.
          savePending({ fileName: finish.fileName, component: finish.component, title: finish.title, json: finish.json, count: finish.tokens.length });
        }
        render();
        return true;
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
