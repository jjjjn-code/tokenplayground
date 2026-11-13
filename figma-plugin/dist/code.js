"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/lib/tokens/rules.ts
  var DEFAULT_FIGMA_GROUP = "Interactive";

  // src/lib/tokens/naming.ts
  function parseComponentTokenName(name) {
    const segs = name.split("-");
    if (segs.length < 3 || segs.length > 4) return null;
    const [component, category, ...rest] = segs;
    if (rest.length === 1) return { component, category, state: rest[0] };
    return { component, category, role: rest[0], state: rest[1] };
  }
  function cssVariableName(token) {
    if (token.kind === "color" && token.layer !== "component") return `--color-${token.name}`;
    return `--${token.name}`;
  }
  function isPublishedInFigma(token) {
    var _a;
    if (token.layer !== "component") return true;
    return ((_a = parseComponentTokenName(token.name)) == null ? void 0 : _a.state) === "default";
  }
  var title = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  function figmaPath(token, group = DEFAULT_FIGMA_GROUP) {
    if (token.layer !== "component") return null;
    const p = parseComponentTokenName(token.name);
    if (!p) return null;
    const variable = [p.category, p.role, p.state].filter(Boolean).join("-");
    return [group, title(p.component), title(p.category), variable].join("/");
  }

  // src/lib/tokens/types.ts
  var isReference = (v) => typeof v === "object" && v !== null && "ref" in v && typeof v.ref === "string";
  var isComposite = (v) => typeof v === "object" && v !== null && !isReference(v);

  // src/lib/figma/plan.ts
  var COLLECTION_MODES = {
    primitives: ["Value"],
    semantic: ["Light", "Dark"],
    components: ["Light", "Dark"]
  };
  var KIND_TITLE = {
    color: "Colour",
    spacing: "Spacing",
    sizing: "Sizing",
    typography: "Typography",
    radius: "Radius",
    border: "Border",
    shadow: "Shadow"
  };
  var title2 = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  function hexToRgba(hex) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = (i) => Math.round(parseInt(h.slice(i, i + 2), 16) / 255 * 1e4) / 1e4;
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
  }
  function variableName(t, group = DEFAULT_FIGMA_GROUP) {
    var _a;
    if (t.layer === "component") return (_a = figmaPath(t, group)) != null ? _a : `${group}/${t.name}`;
    if (t.layer === "semantic" && t.kind === "color") return `${title2(t.name.split("-")[0])}/${t.name}`;
    return `${KIND_TITLE[t.kind]}/${t.name}`;
  }
  function typeFor(t) {
    if (t.kind === "color") return "COLOR";
    const v = t.values.light;
    if (isComposite(v)) return null;
    if (t.name.startsWith("font-family")) return "STRING";
    return "FLOAT";
  }
  function valueFor(v, type) {
    if (isReference(v)) return { kind: "alias", token: v.ref };
    if (type === "COLOR") {
      const c = typeof v === "string" ? hexToRgba(v) : null;
      return c ? __spreadValues({ kind: "color" }, c) : null;
    }
    if (type === "STRING") return { kind: "string", value: String(v) };
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? { kind: "float", value: n } : null;
  }
  function buildSpecs(set, opts = {}) {
    var _a, _b;
    const specs = [];
    const skipped = [];
    const byName = new Map(set.tokens.map((t) => [t.name, t]));
    const syncable = (name) => {
      const t = byName.get(name);
      return !!t && (opts.includeDrafts || t.status !== "draft");
    };
    for (const t of set.tokens) {
      if (t.status === "draft" && !opts.includeDrafts) {
        skipped.push({ token: t.name, reason: "Draft. Change its status to active, or select Include drafts." });
        continue;
      }
      const type = typeFor(t);
      if (!type) {
        skipped.push({ token: t.name, reason: `Figma variables cannot hold a ${t.kind} token with several parts. Use a Figma style for it.` });
        continue;
      }
      const light = valueFor(t.values.light, type);
      const darkRaw = t.layer === "primitive" ? void 0 : (_a = t.values.dark) != null ? _a : t.values.light;
      const dark = darkRaw === void 0 ? void 0 : valueFor(darkRaw, type);
      if (!light || darkRaw !== void 0 && !dark) {
        skipped.push({ token: t.name, reason: "The value cannot become a Figma variable value." });
        continue;
      }
      const missingAlias = [light, dark].find((v) => (v == null ? void 0 : v.kind) === "alias" && !syncable(v.token));
      if (missingAlias && missingAlias.kind === "alias") {
        skipped.push({ token: t.name, reason: `It refers to ${missingAlias.token}, which is not synced.` });
        continue;
      }
      const p = t.layer === "component" ? parseComponentTokenName(t.name) : null;
      specs.push(__spreadProps(__spreadValues({
        token: t.name,
        collection: t.layer === "primitive" ? "primitives" : t.layer === "semantic" ? "semantic" : "components",
        name: variableName(t, opts.group),
        type,
        light
      }, dark ? { dark } : {}), {
        hiddenFromPublishing: !isPublishedInFigma(t) || t.status === "deprecated",
        description: [t.status === "deprecated" ? "Deprecated." : "", (_b = t.description) != null ? _b : "", p && p.state !== "default" ? `State: ${p.state}.` : ""].filter(Boolean).join(" "),
        codeSyntax: `var(${cssVariableName(t)})`
      }));
    }
    let changed = true;
    while (changed) {
      changed = false;
      const names = new Set(specs.map((s) => s.token));
      for (let i = specs.length - 1; i >= 0; i -= 1) {
        const s = specs[i];
        const bad = [s.light, s.dark].find((v) => (v == null ? void 0 : v.kind) === "alias" && !names.has(v.token));
        if (bad && bad.kind === "alias") {
          skipped.push({ token: s.token, reason: `It refers to ${bad.token}, which is not synced.` });
          specs.splice(i, 1);
          changed = true;
        }
      }
    }
    return { specs, skipped };
  }
  var sameValue = (a, b) => {
    if (!a || !b) return a === b;
    if (a.kind !== b.kind) return false;
    if (a.kind === "color" && b.kind === "color") {
      const close = (x, y) => Math.abs(x - y) < 2e-3;
      return close(a.r, b.r) && close(a.g, b.g) && close(a.b, b.b) && close(a.a, b.a);
    }
    return JSON.stringify(a) === JSON.stringify(b);
  };
  function describeValue(v) {
    if (!v) return "none";
    if (v.kind === "alias") return v.token;
    if (v.kind === "color") {
      const h = (n) => Math.round(n * 255).toString(16).padStart(2, "0").toUpperCase();
      return `#${h(v.r)}${h(v.g)}${h(v.b)}${v.a < 1 ? h(v.a) : ""}`;
    }
    return String(v.value);
  }
  function planSync(specs, existing, skipped = []) {
    var _a, _b, _c;
    const byToken = new Map(existing.filter((e) => e.token).map((e) => [e.token, e]));
    const byName = new Map(existing.filter((e) => e.collection).map((e) => [`${e.collection}|${e.name}`, e]));
    const used = /* @__PURE__ */ new Set();
    const add = [];
    const change = [];
    let unchanged = 0;
    for (const s of specs) {
      const e = (_a = byToken.get(s.token)) != null ? _a : byName.get(`${s.collection}|${s.name}`);
      if (!e || e.collection !== s.collection) {
        add.push(s);
        continue;
      }
      used.add(e.id);
      const d = [];
      if (e.name !== s.name) d.push(`Name: ${e.name} \u2192 ${s.name}`);
      if (e.type !== s.type) d.push(`Type: ${e.type} \u2192 ${s.type}`);
      const lightLabel = s.collection === "primitives" ? "Value" : "Light";
      if (!sameValue(e.light, s.light)) d.push(`${lightLabel}: ${describeValue(e.light)} \u2192 ${describeValue(s.light)}`);
      if (s.dark && !sameValue(e.dark, s.dark)) d.push(`Dark: ${describeValue(e.dark)} \u2192 ${describeValue(s.dark)}`);
      if (e.hiddenFromPublishing !== s.hiddenFromPublishing) d.push(s.hiddenFromPublishing ? "Hidden from publishing" : "Published");
      if (((_b = e.description) != null ? _b : "") !== s.description) d.push("Description");
      if (((_c = e.codeSyntax) != null ? _c : "") !== s.codeSyntax) d.push("Code syntax");
      if (!e.token) d.push("Linked to Token Library");
      if (d.length) change.push({ spec: s, existing: e, differences: d });
      else unchanged += 1;
    }
    const remove = existing.filter((e) => e.token && !used.has(e.id) && !specs.some((s) => s.token === e.token));
    return { add, change, remove, unchanged, skipped };
  }
  function modeValues(s) {
    var _a;
    return s.collection === "primitives" ? { Value: s.light } : { Light: s.light, Dark: (_a = s.dark) != null ? _a : s.light };
  }

  // src/lib/figma/apply.ts
  var DEFAULT_COLLECTION_NAMES = {
    primitives: "Primitives",
    semantic: "Semantic",
    components: "Components"
  };
  var KEY = "tokenLibrary";
  function collectionKeyOf(c, names) {
    const stored = c.getPluginData(KEY);
    if (stored && stored in names) return stored;
    const found = Object.keys(names).find((k) => names[k] === c.name);
    return found != null ? found : null;
  }
  function toFigmaValue(raw, byId) {
    var _a;
    if (raw === void 0) return void 0;
    if (typeof raw === "object" && "type" in raw && raw.type === "VARIABLE_ALIAS") {
      const target = byId.get(raw.id);
      return { kind: "alias", token: target ? target.getPluginData("token") || target.name : raw.id };
    }
    if (typeof raw === "object" && "r" in raw) return { kind: "color", r: raw.r, g: raw.g, b: raw.b, a: (_a = raw.a) != null ? _a : 1 };
    if (typeof raw === "number") return { kind: "float", value: raw };
    return { kind: "string", value: String(raw) };
  }
  async function readExisting(api2, names = DEFAULT_COLLECTION_NAMES) {
    const collections = await api2.getLocalVariableCollectionsAsync();
    const variables = await api2.getLocalVariablesAsync();
    const byId = new Map(variables.map((v) => [v.id, v]));
    const colById = new Map(collections.map((c) => [c.id, c]));
    return variables.map((v) => {
      var _a, _b, _c, _d, _e;
      const c = colById.get(v.variableCollectionId);
      const key = c ? collectionKeyOf(c, names) : null;
      const mode = (n) => {
        var _a2;
        return (_a2 = c == null ? void 0 : c.modes.find((m) => m.name === n)) == null ? void 0 : _a2.modeId;
      };
      const first = (_a = c == null ? void 0 : c.modes[0]) == null ? void 0 : _a.modeId;
      const lightId = key === "primitives" ? (_b = mode("Value")) != null ? _b : first : (_c = mode("Light")) != null ? _c : first;
      const darkId = key && key !== "primitives" ? mode("Dark") : void 0;
      return {
        id: v.id,
        token: v.getPluginData("token") || void 0,
        collection: key,
        name: v.name,
        type: v.resolvedType,
        light: lightId ? toFigmaValue(v.valuesByMode[lightId], byId) : void 0,
        dark: darkId ? toFigmaValue(v.valuesByMode[darkId], byId) : void 0,
        hiddenFromPublishing: v.hiddenFromPublishing,
        description: (_d = v.description) != null ? _d : "",
        codeSyntax: (_e = v.codeSyntax) == null ? void 0 : _e.WEB
      };
    });
  }
  async function ensureCollections(api2, names, needed) {
    const all = await api2.getLocalVariableCollectionsAsync();
    const out = /* @__PURE__ */ new Map();
    for (const key of needed) {
      let c = all.find((x) => collectionKeyOf(x, names) === key);
      if (!c) c = api2.createVariableCollection(names[key]);
      c.setPluginData(KEY, key);
      const wanted = COLLECTION_MODES[key];
      if (!c.modes.some((m) => m.name === wanted[0])) c.renameMode(c.modes[0].modeId, wanted[0]);
      for (const w of wanted.slice(1)) if (!c.modes.some((m) => m.name === w)) c.addMode(w);
      out.set(key, c);
    }
    return out;
  }
  function toRaw(v, tokenVars, api2) {
    if (v.kind === "alias") {
      const target = tokenVars.get(v.token);
      if (!target) throw new Error(`The variable for ${v.token} is missing.`);
      return api2.createVariableAlias(target);
    }
    if (v.kind === "color") return { r: v.r, g: v.g, b: v.b, a: v.a };
    return v.value;
  }
  async function applyPlan(api2, plan, names = DEFAULT_COLLECTION_NAMES) {
    var _a;
    const work = [...plan.add, ...plan.change.map((c) => c.spec)];
    const collections = await ensureCollections(api2, names, new Set(work.map((s) => s.collection)));
    const all = await api2.getLocalVariablesAsync();
    const byId = new Map(all.map((v) => [v.id, v]));
    const varFor = /* @__PURE__ */ new Map();
    for (const c of plan.change) {
      let v = byId.get(c.existing.id);
      if (v.resolvedType !== c.spec.type) {
        v.remove();
        v = api2.createVariable(c.spec.name, collections.get(c.spec.collection), c.spec.type);
      } else if (v.name !== c.spec.name) v.name = c.spec.name;
      v.setPluginData("token", c.spec.token);
      varFor.set(c.spec.token, v);
    }
    for (const s of plan.add) {
      const v = api2.createVariable(s.name, collections.get(s.collection), s.type);
      v.setPluginData("token", s.token);
      varFor.set(s.token, v);
    }
    const tokenVars = /* @__PURE__ */ new Map();
    for (const v of await api2.getLocalVariablesAsync()) {
      const t = v.getPluginData("token");
      if (t) tokenVars.set(t, v);
    }
    for (const [t, v] of varFor) tokenVars.set(t, v);
    for (const s of work) {
      const v = varFor.get(s.token);
      const c = collections.get(s.collection);
      for (const [modeName, value] of Object.entries(modeValues(s))) {
        const modeId = c.modes.find((m) => m.name === modeName).modeId;
        v.setValueForMode(modeId, toRaw(value, tokenVars, api2));
      }
      v.hiddenFromPublishing = s.hiddenFromPublishing;
      v.description = s.description;
      v.setVariableCodeSyntax("WEB", s.codeSyntax);
    }
    for (const e of plan.remove) (_a = byId.get(e.id)) == null ? void 0 : _a.remove();
    return { added: plan.add.map((s) => s.token), changed: plan.change.map((c) => c.spec.token), removed: plan.remove.map((e) => {
      var _a2;
      return (_a2 = e.token) != null ? _a2 : e.name;
    }) };
  }

  // src/lib/tokens/dtcg.ts
  var EXTENSION_KEY = "uk.ac.ual.tokens";
  var LAYERS = ["primitive", "semantic", "component"];
  var KINDS = ["color", "spacing", "sizing", "typography", "radius", "border", "shadow"];
  var isToken = (v) => typeof v === "object" && v !== null && "$value" in v;
  function parseSimple(v) {
    if (typeof v === "string") {
      const m = /^\{([^{}]+)\}$/.exec(v.trim());
      if (m) {
        const path = m[1].split(".");
        return { ref: path[path.length - 1] };
      }
    }
    return v;
  }
  function parseValue(v) {
    if (typeof v === "object" && v !== null) {
      return Object.fromEntries(Object.entries(v).map(([k, p]) => [k, parseSimple(p)]));
    }
    return parseSimple(v);
  }
  function parseDtcg(json) {
    var _a, _b, _c, _d, _e;
    const root = json;
    const tokens = [];
    for (const layer of LAYERS) {
      const layerGroup = root[layer];
      if (!layerGroup || typeof layerGroup !== "object") continue;
      for (const [groupKey, group] of Object.entries(layerGroup)) {
        if (groupKey.startsWith("$") || typeof group !== "object") continue;
        for (const [name, raw] of Object.entries(group)) {
          if (name.startsWith("$") || !isToken(raw)) continue;
          const ext = (_b = (_a = raw.$extensions) == null ? void 0 : _a[EXTENSION_KEY]) != null ? _b : {};
          const kind = (_c = ext.kind) != null ? _c : KINDS.includes(groupKey) ? groupKey : "color";
          const token = {
            name,
            layer,
            kind,
            values: { light: parseValue(raw.$value) },
            status: (_d = ext.status) != null ? _d : "active"
          };
          if (layer === "component") token.component = groupKey;
          if (((_e = ext.modes) == null ? void 0 : _e.dark) !== void 0) token.values.dark = parseValue(ext.modes.dark);
          if (raw.$description) token.description = raw.$description;
          tokens.push(token);
        }
      }
    }
    return { tokens };
  }

  // figma-plugin/src/code.ts
  var SETTINGS = "token-library-settings";
  var api = () => figma.variables;
  var lastPlan = null;
  var lastNames = DEFAULT_COLLECTION_NAMES;
  figma.showUI(__html__, { width: 480, height: 640, themeColors: true, title: "Token Library" });
  figma.ui.onmessage = async (msg) => {
    var _a, _b;
    try {
      if (msg.type === "init") {
        const settings = (_a = await figma.clientStorage.getAsync(SETTINGS)) != null ? _a : {};
        figma.ui.postMessage({ type: "settings", settings, fileName: figma.root.name });
      }
      if (msg.type === "save-settings") {
        await figma.clientStorage.setAsync(SETTINGS, msg.settings);
      }
      if (msg.type === "plan") {
        lastNames = __spreadValues(__spreadValues({}, DEFAULT_COLLECTION_NAMES), (_b = msg.names) != null ? _b : {});
        const set = parseDtcg(msg.tokens);
        const { specs, skipped } = buildSpecs(set, { includeDrafts: !!msg.includeDrafts });
        lastPlan = planSync(specs, await readExisting(api(), lastNames), skipped);
        figma.ui.postMessage({
          type: "plan",
          plan: {
            add: lastPlan.add.map((s) => ({ token: s.token, name: s.name, collection: s.collection })),
            change: lastPlan.change.map((c) => ({ token: c.spec.token, name: c.spec.name, differences: c.differences })),
            remove: lastPlan.remove.map((e) => {
              var _a2;
              return { token: (_a2 = e.token) != null ? _a2 : e.name, name: e.name };
            }),
            unchanged: lastPlan.unchanged,
            skipped: lastPlan.skipped
          }
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
})();
