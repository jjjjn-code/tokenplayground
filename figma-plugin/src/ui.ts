export {};
/**
 * Token Library Figma plugin: the window. It talks to Token Library over
 * the network and to the Figma side (code.ts) through messages.
 */
interface Settings {
  url: string;
  key: string;
  includeDrafts: boolean;
  names: { primitives: string; semantic: string; components: string };
}
interface PlanView {
  add: { token: string; name: string; collection: string }[];
  change: { token: string; name: string; differences: string[] }[];
  remove: { token: string; name: string }[];
  unchanged: number;
  skipped: { token: string; reason: string }[];
}

const DEFAULTS: Settings = {
  url: "https://tokenplayground-drab.vercel.app",
  key: "",
  includeDrafts: false,
  names: { primitives: "Primitives", semantic: "Semantic", components: "Components" },
};

let settings: Settings = DEFAULTS;
let fileName = "this file";
let plan: PlanView | null = null;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const post = (msg: unknown) => parent.postMessage({ pluginMessage: msg }, "*");
const el = (tag: string, cls = "", text = "") => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

function setStatus(text: string, tone: "" | "error" | "ok" = "") {
  const s = $("status");
  s.textContent = text;
  s.className = `status ${tone}`;
}

function readForm(): Settings {
  return {
    url: $<HTMLInputElement>("url").value.trim().replace(/\/+$/, "") || DEFAULTS.url,
    key: $<HTMLInputElement>("key").value.trim(),
    includeDrafts: $<HTMLInputElement>("drafts").checked,
    names: {
      primitives: $<HTMLInputElement>("n-primitives").value.trim() || DEFAULTS.names.primitives,
      semantic: $<HTMLInputElement>("n-semantic").value.trim() || DEFAULTS.names.semantic,
      components: $<HTMLInputElement>("n-components").value.trim() || DEFAULTS.names.components,
    },
  };
}

function fillForm() {
  $<HTMLInputElement>("url").value = settings.url;
  $<HTMLInputElement>("key").value = settings.key;
  $<HTMLInputElement>("drafts").checked = settings.includeDrafts;
  $<HTMLInputElement>("n-primitives").value = settings.names.primitives;
  $<HTMLInputElement>("n-semantic").value = settings.names.semantic;
  $<HTMLInputElement>("n-components").value = settings.names.components;
  ($("settings") as HTMLDetailsElement).open = !settings.key;
}

function saveSettings() {
  settings = readForm();
  post({ type: "save-settings", settings });
}

async function check() {
  saveSettings();
  plan = null;
  render();
  if (!settings.key) {
    setStatus("Add your sync key. In Token Library, open Sync to Figma and push Make a sync key.", "error");
    ($("settings") as HTMLDetailsElement).open = true;
    return;
  }
  setStatus("Reading tokens from Token Library…");
  try {
    const res = await fetch(`${settings.url}/api/figma/tokens`, { headers: { Authorization: `Bearer ${settings.key}` } });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message ?? `Token Library sent an error (${res.status}).`);
    if (body.newKey) {
      settings = { ...settings, key: body.newKey };
      post({ type: "save-settings", settings });
    }
    setStatus("Comparing with the variables in this file…");
    post({ type: "plan", tokens: body.tokens, includeDrafts: settings.includeDrafts, names: settings.names });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    setStatus(m.includes("Failed to fetch") ? "Token Library cannot be reached. Make sure that the address is correct." : m, "error");
  }
}

function section(title: string, count: number, items: HTMLElement[], open = true) {
  const d = el("details", "group") as HTMLDetailsElement;
  d.open = open && count > 0 && count <= 40;
  d.appendChild(el("summary", "", `${title} (${count})`));
  const list = el("ul");
  items.forEach((i) => list.appendChild(i));
  d.appendChild(list);
  return d;
}

function render() {
  const out = $("result");
  out.replaceChildren();
  const btn = $<HTMLButtonElement>("sync");
  if (!plan) {
    btn.hidden = true;
    return;
  }
  const total = plan.add.length + plan.change.length + plan.remove.length;
  const item = (main: string, sub?: string) => {
    const li = el("li");
    li.appendChild(el("span", "mono", main));
    if (sub) li.appendChild(el("span", "sub", sub));
    return li;
  };
  out.appendChild(section("Add", plan.add.length, plan.add.map((a) => item(a.name, a.collection))));
  out.appendChild(section("Change", plan.change.length, plan.change.map((c) => item(c.name, c.differences.join(" · ")))));
  out.appendChild(section("Remove", plan.remove.length, plan.remove.map((r) => item(r.name, "Made by an earlier sync. The token is no longer in Token Library."))));
  out.appendChild(section("Not synced", plan.skipped.length, plan.skipped.map((s) => item(s.token, s.reason)), false));
  out.appendChild(el("p", "sub", `${plan.unchanged} ${plan.unchanged === 1 ? "variable is" : "variables are"} up to date.`));
  btn.hidden = total === 0;
  btn.textContent = `Sync ${total} ${total === 1 ? "change" : "changes"}`;
  setStatus(total ? "Examine the changes, then push Sync." : "Everything in this file is up to date.", total ? "" : "ok");
}

async function report(result: { added: string[]; changed: string[]; removed: string[] }) {
  try {
    const res = await fetch(`${settings.url}/api/figma/report`, {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, ...result }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message);
    return true;
  } catch {
    return false;
  }
}

window.onmessage = async (event: MessageEvent) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;
  if (msg.type === "settings") {
    settings = { ...DEFAULTS, ...msg.settings, names: { ...DEFAULTS.names, ...(msg.settings?.names ?? {}) } };
    fileName = msg.fileName;
    $("file").textContent = fileName;
    fillForm();
  }
  if (msg.type === "plan") {
    plan = msg.plan;
    render();
  }
  if (msg.type === "applied") {
    const r = msg.result;
    plan = null;
    render();
    setStatus("Recording the sync in Token Library…");
    const logged = await report(r);
    setStatus(
      `Sync done: ${r.added.length} added, ${r.changed.length} changed, ${r.removed.length} removed.` +
        (logged ? " Each token's history shows the sync." : " The sync is not in Token Library history. Check the sync key."),
      logged ? "ok" : "error",
    );
  }
  if (msg.type === "error") setStatus(msg.message, "error");
};

$("check").onclick = () => void check();
$("sync").onclick = () => {
  setStatus("Syncing variables…");
  post({ type: "apply" });
};
$("save").onclick = () => {
  saveSettings();
  setStatus("Settings saved.", "ok");
};
post({ type: "init" });
