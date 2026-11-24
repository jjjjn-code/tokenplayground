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
  var COMPONENT_CATEGORIES = ["surface", "content", "line", "icon"];
  var SEMANTIC_CATEGORIES = ["surface", "content", "line"];
  var SEMANTIC_VARIANTS = [
    "default",
    "elevated",
    "inverse",
    "primary",
    "secondary",
    "disabled",
    "on-inverse",
    "success",
    "danger",
    "success-on-inverse",
    "danger-on-inverse"
  ];
  var SUGGESTED_ROLES = ["primary", "secondary", "tertiary"];
  var SUGGESTED_STATES = [
    "default",
    "hover",
    "pressed",
    "disabled",
    "selected",
    "loading",
    "on",
    "off"
  ];
  var FORBIDDEN_STATES = ["focus", "focused", "focusvisible"];
  var DEFAULT_FIGMA_GROUP = "Interactive";
  var LAYERS_BY_KIND = {
    color: ["primitive", "semantic", "component"],
    spacing: ["primitive", "semantic"],
    sizing: ["primitive", "semantic"],
    typography: ["primitive", "semantic"],
    radius: ["primitive", "semantic"],
    border: ["primitive", "semantic"],
    shadow: ["primitive", "semantic"],
    motion: ["primitive", "semantic"]
  };
  var COLUMN_SETS = {
    value: { title: "Value", modes: [{ key: "value", label: "Value" }] },
    motion: {
      title: "Default and reduced motion",
      modes: [
        { key: "default", label: "Default" },
        { key: "reduced-motion", label: "Reduced motion" }
      ]
    },
    theme: {
      title: "Light and dark",
      modes: [
        { key: "light", label: "Light" },
        { key: "dark", label: "Dark" }
      ]
    },
    fluid: {
      title: "Min and max",
      modes: [
        { key: "min", label: "Min" },
        { key: "max", label: "Max" }
      ]
    }
  };
  function columnSetFor(layer, kind) {
    if (layer === "primitive") return "value";
    switch (kind) {
      case "color":
      case "border":
      case "shadow":
        return "theme";
      case "spacing":
      case "sizing":
      case "typography":
        return "fluid";
      case "motion":
        return "motion";
      default:
        return "value";
    }
  }
  var FLUID_VIEWPORT = { min: 400, max: 1600, rootFontSize: 16 };
  var NON_COLOUR_PREFIXES = {
    primitive: {
      spacing: ["spacing", "grid"],
      sizing: ["size"],
      typography: ["font-family", "font-size", "font-weight", "line-height"],
      radius: ["radius"],
      border: ["border"],
      shadow: ["shadow"],
      motion: ["duration", "ease"]
    },
    semantic: {
      spacing: ["space", "grid"],
      sizing: ["size"],
      typography: ["step", "paragraph-spacing", "text"],
      radius: ["radius"],
      border: ["border"],
      shadow: ["shadow"],
      motion: ["duration", "ease"]
    }
  };
  var LAYER_RANK = { primitive: 0, semantic: 1, component: 2 };

  // src/lib/tokens/naming.ts
  var slug = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  function normaliseComponentName(input) {
    const s = slug(input.trim());
    return { slug: s, changed: input.trim() !== s };
  }
  function buildComponentTokenName(p) {
    return [p.component, p.category, p.role, p.state].filter(Boolean).join("-");
  }
  function parseComponentTokenName(name) {
    const segs = name.split("-");
    if (segs.length < 3 || segs.length > 4) return null;
    const [component, category, ...rest] = segs;
    if (rest.length === 1) return { component, category, state: rest[0] };
    return { component, category, role: rest[0], state: rest[1] };
  }
  var SEGMENT = /^[a-z0-9]+$/;
  var HYPHENATED = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  function issue(severity, code, message, token) {
    return { severity, code, message, token };
  }
  var CATEGORY_SYNONYMS = {
    background: "surface",
    bg: "surface",
    fill: "surface",
    backdrop: "surface",
    text: "content",
    foreground: "content",
    fg: "content",
    font: "content",
    label: "content",
    border: "line",
    stroke: "line",
    outline: "line",
    divider: "line",
    separator: "line",
    rule: "line",
    icons: "icon",
    glyph: "icon"
  };
  function categoryMessage(category, allowed) {
    const suggestion = CATEGORY_SYNONYMS[category];
    if (suggestion && allowed.includes(suggestion)) {
      return `"${category}" is not a category in our system. Do you mean "${suggestion}"?`;
    }
    const list2 = allowed.length === 3 ? `${allowed[0]}, ${allowed[1]} or ${allowed[2]}` : `${allowed.slice(0, -1).join(", ")} or ${allowed[allowed.length - 1]}`;
    return `"${category}" is not a category. Use ${list2}.`;
  }
  function checkName(token) {
    const n = token.name;
    const out = [];
    if (!n) return [issue("error", "name.empty", "The name is empty. Type a name for the token.")];
    const prefix = n.startsWith("--color-") ? "--color-" : n.startsWith("--") ? "--" : n.startsWith("color-") ? "color-" : null;
    if (prefix) {
      const clean = n.slice(prefix.length);
      out.push(issue("error", "name.prefix", `Do not type the prefix "${prefix}". Type "${clean}". The prefix is added in the code.`, n));
      return out;
    }
    if (!HYPHENATED.test(n)) {
      const bad = [...new Set(n.replace(/[a-z0-9-]/g, "").split(""))].join("");
      out.push(
        issue(
          "error",
          "name.characters",
          bad ? `Use only letters, numbers and hyphens. Remove "${bad}".` : "Use 1 hyphen between parts. Do not start or end the name with a hyphen.",
          n
        )
      );
      return out;
    }
    if (token.kind !== "color") return [...out, ...checkNonColourName(token)];
    switch (token.layer) {
      case "primitive":
        out.push(...checkPrimitiveColourName(n));
        break;
      case "semantic":
        out.push(...checkSemanticColourName(n));
        break;
      case "component":
        out.push(...checkComponentName(token));
        break;
    }
    return out;
  }
  function checkPrimitiveColourName(n) {
    const first = n.split("-")[0];
    if (COMPONENT_CATEGORIES.includes(first)) {
      return [issue("error", "name.primitive.category", "This is a semantic name. For a primitive, use the format [colour]-[step]. Example: orange-700.", n)];
    }
    if (!/^[a-z]+(-\d+)?(-[a-z0-9]+)?$/.test(n)) {
      return [issue("error", "name.primitive.pattern", "Use the format [colour]-[step]. Example: orange-700.", n)];
    }
    return [];
  }
  function checkSemanticColourName(n) {
    const [category, ...rest] = n.split("-");
    const variant = rest.join("-");
    if (category === "icon") {
      return [issue("error", "name.semantic.category", 'Do not use "icon" for a semantic token. Start the name with surface, content or line.', n)];
    }
    if (!SEMANTIC_CATEGORIES.includes(category)) {
      return [issue("error", "name.semantic.category", categoryMessage(category, SEMANTIC_CATEGORIES), n)];
    }
    if (!variant) {
      return [issue("error", "name.semantic.variant", `Add a variant to the name. Example: ${category}-default.`, n)];
    }
    if (!SEMANTIC_VARIANTS.includes(variant)) {
      return [issue("info", "name.semantic.new-variant", `"${variant}" is a new variant. Make sure that the design system needs it.`, n)];
    }
    return [];
  }
  function checkComponentName(token) {
    var _a;
    const n = token.name;
    const out = [];
    const segs = n.split("-");
    const component = (_a = token.component) != null ? _a : segs[0];
    if (segs.length < 3) {
      const missing = segs.length === 1 ? "The category and the state are missing." : "The state is missing. Add a state to the end of the name.";
      const example = segs.length === 2 ? `${segs[0]}-${segs[1]}-default` : `${component}-surface-default`;
      return [issue("error", "name.component.segments", `${missing} Example: ${example}.`, n)];
    }
    if (segs.length > 4) {
      const extra = segs.slice(4);
      return [
        issue(
          "error",
          "name.component.segments",
          `Token names use the format [component]-[category]-[role]-[state]. This name has ${extra.length} extra ${extra.length === 1 ? "part" : "parts"}: "${extra.join("-")}". Ask the design system team if you need help.`,
          n
        )
      ];
    }
    const p = parseComponentTokenName(n);
    if (!token.component) {
      out.push(issue("error", "name.component.missing", "Select a component for this token.", n));
    } else if (p.component !== token.component) {
      out.push(issue("error", "name.component.mismatch", `Start the name with "${token.component}-".`, n));
    }
    if (!COMPONENT_CATEGORIES.includes(p.category)) {
      out.push(issue("error", "name.component.category", categoryMessage(p.category, COMPONENT_CATEGORIES), n));
    }
    for (const s of [p.component, p.role, p.state]) {
      if (s !== void 0 && !SEGMENT.test(s)) {
        out.push(issue("error", "name.component.segment", `Use 1 word for each part. Change "${s}".`, n));
      }
    }
    if (FORBIDDEN_STATES.includes(p.state)) {
      out.push(issue("error", "name.component.focus", "Do not make focus tokens. The system default shows focus.", n));
    }
    return out;
  }
  function checkNonColourName(token) {
    const n = token.name;
    const layer = token.layer === "primitive" ? "primitive" : "semantic";
    const prefixes = NON_COLOUR_PREFIXES[layer][token.kind];
    const ok = prefixes.some((p) => n === p || n.startsWith(`${p}-`));
    if (!ok) {
      return [
        issue("error", "name.kind.prefix", `Start the name with "${prefixes[0]}-". Example: ${prefixes[0]}-small. This rule is temporary.`, n)
      ];
    }
    return [];
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

  // src/lib/tokens/references.ts
  var indexTokens = (set) => new Map(set.tokens.map((t) => [t.name, t]));
  var columnSetOf = (t) => columnSetFor(t.layer, t.kind);
  var modesOf = (t) => [...COLUMN_SETS[columnSetOf(t)].modes];
  var defaultMode = (t) => COLUMN_SETS[columnSetOf(t)].modes[0].key;
  function valueInMode(t, mode) {
    var _a, _b;
    if (t.values[mode] !== void 0) return t.values[mode];
    const d = t.values[defaultMode(t)];
    if (d !== void 0) return d;
    return (_b = (_a = t.values.light) != null ? _a : Object.values(t.values)[0]) != null ? _b : "";
  }
  var defaultValue = (t) => valueInMode(t, defaultMode(t));
  function referencesIn(v) {
    if (v === void 0) return [];
    if (isReference(v)) return [v.ref];
    if (isComposite(v)) return Object.values(v).flatMap((p) => isReference(p) ? [p.ref] : []);
    return [];
  }
  function referencesOf(t) {
    return [...new Set(Object.values(t.values).flatMap((v) => referencesIn(v)))];
  }
  function resolveToken(index, name, mode) {
    const t = index.get(name);
    if (!t) return { value: null, chain: [], error: { kind: "missing", ref: name } };
    return resolveValue(index, valueInMode(t, mode), mode, [name]);
  }
  function resolveValue(index, v, mode, chain) {
    if (isReference(v)) return resolveSimple(index, v, mode, chain);
    if (isComposite(v)) {
      const out = {};
      for (const [k, part] of Object.entries(v)) {
        const r = resolveSimple(index, part, mode, chain);
        if (r.error) return { value: null, chain, error: r.error };
        out[k] = r.value;
      }
      return { value: out, chain };
    }
    return { value: v, chain };
  }
  function resolveSimple(index, v, mode, chain) {
    if (!isReference(v)) return { value: v, chain };
    if (chain.includes(v.ref)) return { value: null, chain, error: { kind: "cycle", chain: [...chain, v.ref] } };
    const target = index.get(v.ref);
    if (!target) return { value: null, chain, error: { kind: "missing", ref: v.ref } };
    return resolveValue(index, valueInMode(target, mode), mode, [...chain, v.ref]);
  }
  function formatValue(v) {
    if (v === void 0) return "none";
    if (isReference(v)) return `{${v.ref}}`;
    if (isComposite(v)) {
      return Object.entries(v).map(([k, p]) => `${k}: ${formatValue(p)}`).join(", ");
    }
    return String(v);
  }

  // src/lib/figma/plan.ts
  var COLLECTIONS = {
    "colour-primitives": { name: "Colour primitives", columns: "value" },
    "type-primitives": { name: "Type primitives", columns: "value" },
    "space-primitives": { name: "Space primitives", columns: "value" },
    "other-primitives": { name: "Other primitives", columns: "value" },
    // The Motion collection in Figma has 2 modes; primitives write to its first mode only.
    motion: { name: "Motion", columns: "value" },
    "motion-tokens": { name: "Motion tokens", columns: "motion" },
    "colour-tokens": { name: "Colour tokens", columns: "theme" },
    "fluid-tokens": { name: "Fluid tokens", columns: "fluid" },
    "other-tokens": { name: "Other tokens", columns: "value" }
  };
  var collectionModes = (key) => COLUMN_SETS[COLLECTIONS[key].columns].modes;
  var modeKeyOf = (name) => name.trim().toLowerCase().replace(/\s+/g, "-");
  function collectionFor(t) {
    if (t.layer === "primitive") {
      switch (t.kind) {
        case "color":
          return "colour-primitives";
        case "typography":
          return "type-primitives";
        case "spacing":
        case "sizing":
          return "space-primitives";
        case "motion":
          return "motion";
        default:
          return "other-primitives";
      }
    }
    const set = columnSetOf(t);
    if (set === "motion") return "motion-tokens";
    if (set === "theme") return "colour-tokens";
    if (set === "fluid") return "fluid-tokens";
    return "other-tokens";
  }
  var KIND_TITLE = {
    color: "Colour",
    spacing: "Spacing",
    sizing: "Sizing",
    typography: "Typography",
    radius: "Radius",
    border: "Border",
    shadow: "Shadow",
    motion: "Motion"
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
    if (t.figma) return t.figma;
    if (t.layer === "component") return (_a = figmaPath(t, group)) != null ? _a : `${group}/${t.name}`;
    if (t.kind === "color") return t.layer === "primitive" ? t.name : `Base/${title2(t.name.split("-")[0])}/${t.name}`;
    return `${KIND_TITLE[t.kind]}/${t.name}`;
  }
  function typeFor(t) {
    if (t.kind === "color") return "COLOR";
    if (Object.values(t.values).some((v) => isComposite(v))) return null;
    if (t.name.startsWith("font-family") || t.name.startsWith("ease")) return "STRING";
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
    var _a;
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
      const collection = collectionFor(t);
      const values = {};
      let bad = false;
      for (const m of modesOf(t)) {
        const v = valueFor(valueInMode(t, m.key), type);
        if (!v) bad = true;
        else values[m.key] = v;
      }
      if (bad) {
        skipped.push({ token: t.name, reason: "The value cannot become a Figma variable value." });
        continue;
      }
      const missingAlias = Object.values(values).find((v) => v.kind === "alias" && !syncable(v.token));
      if (missingAlias && missingAlias.kind === "alias") {
        skipped.push({ token: t.name, reason: `It refers to ${missingAlias.token}, which is not synced.` });
        continue;
      }
      const p = t.layer === "component" ? parseComponentTokenName(t.name) : null;
      specs.push({
        token: t.name,
        collection,
        name: variableName(t, opts.group),
        type,
        values,
        hiddenFromPublishing: !isPublishedInFigma(t) || t.status === "deprecated",
        description: [t.status === "deprecated" ? "Deprecated." : "", (_a = t.description) != null ? _a : "", p && p.state !== "default" ? `State: ${p.state}.` : ""].filter(Boolean).join(" "),
        codeSyntax: `var(${cssVariableName(t)})`
      });
    }
    let changed = true;
    while (changed) {
      changed = false;
      const names = new Set(specs.map((s) => s.token));
      for (let i = specs.length - 1; i >= 0; i -= 1) {
        const s = specs[i];
        const bad = Object.values(s.values).find((v) => v.kind === "alias" && !names.has(v.token));
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
  function planSync(specs, existing, alreadySkipped = []) {
    var _a, _b, _c;
    const skipped = [...alreadySkipped];
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
      if (e.type !== s.type) {
        skipped.push({ token: s.token, reason: `In Figma, ${e.name} is a ${e.type} variable; the tool would make a ${s.type} variable. Change it by hand in Figma.` });
        continue;
      }
      const d = [];
      if (e.name !== s.name) d.push(`Name: ${e.name} \u2192 ${s.name}`);
      for (const m of collectionModes(s.collection)) {
        if (!sameValue(e.values[m.key], s.values[m.key])) d.push(`${m.label}: ${describeValue(e.values[m.key])} \u2192 ${describeValue(s.values[m.key])}`);
      }
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

  // src/lib/figma/apply.ts
  var DEFAULT_COLLECTION_NAMES = Object.fromEntries(
    Object.entries(COLLECTIONS).map(([k, c]) => [k, c.name])
  );
  function findMode(c, key, mode) {
    if (collectionModes(key).length === 1) return c.modes[0];
    return c.modes.find((m) => modeKeyOf(m.name) === mode);
  }
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
      var _a, _b, _c;
      const c = colById.get(v.variableCollectionId);
      const key = c ? collectionKeyOf(c, names) : null;
      const values = {};
      if (c && key) {
        for (const m of collectionModes(key)) {
          const id = (_a = findMode(c, key, m.key)) == null ? void 0 : _a.modeId;
          values[m.key] = id ? toFigmaValue(v.valuesByMode[id], byId) : void 0;
        }
      }
      return {
        id: v.id,
        token: v.getPluginData("token") || void 0,
        collection: key,
        name: v.name,
        type: v.resolvedType,
        values,
        hiddenFromPublishing: v.hiddenFromPublishing,
        description: (_b = v.description) != null ? _b : "",
        codeSyntax: (_c = v.codeSyntax) == null ? void 0 : _c.WEB
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
      const wanted = collectionModes(key);
      if (c.modes.length === 1 && modeKeyOf(c.modes[0].name) === "mode-1") {
        c.renameMode(c.modes[0].modeId, wanted[0].label);
      }
      for (const w of wanted) if (!findMode(c, key, w.key)) c.addMode(w.label);
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
      const v = byId.get(c.existing.id);
      if (v.name !== c.spec.name) v.name = c.spec.name;
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
      for (const [mode, value] of Object.entries(s.values)) {
        const modeId = findMode(c, s.collection, mode).modeId;
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

  // src/lib/tokens/fluid.ts
  function toPx(v, rootFontSize = FLUID_VIEWPORT.rootFontSize) {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    const m = /^\s*(-?\d*\.?\d+)\s*(px|rem)?\s*$/.exec(v);
    if (!m) return null;
    const n = Number(m[1]);
    return m[2] === "rem" ? n * rootFontSize : n;
  }
  var round = (n) => String(Number(n.toFixed(4)));
  function fluidClamp(minPx, maxPx, viewport = FLUID_VIEWPORT) {
    const rem = (px) => px / viewport.rootFontSize;
    if (minPx === maxPx) return `${round(rem(minPx))}rem`;
    const slope = (maxPx - minPx) / (viewport.max - viewport.min);
    const intercept = minPx - slope * viewport.min;
    const lower = Math.min(minPx, maxPx);
    const upper = Math.max(minPx, maxPx);
    const vw = round(slope * 100);
    const middle = `${round(rem(intercept))}rem ${vw.startsWith("-") ? "-" : "+"} ${vw.replace(/^-/, "")}vw`;
    return `clamp(${round(rem(lower))}rem, ${middle}, ${round(rem(upper))}rem)`;
  }

  // src/lib/tokens/validate.ts
  var HEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
  var kindWord = (k) => k === "color" ? "colour" : k;
  var SIZE_KINDS = ["spacing", "sizing", "typography"];
  function validateTokenSet(set) {
    const index = indexTokens(set);
    const out = [];
    out.push(...checkDuplicates(set));
    for (const t of set.tokens) out.push(...checkToken(t, index));
    out.push(...checkComponents(set));
    return out;
  }
  function checkDuplicates(set) {
    const seen = /* @__PURE__ */ new Set();
    const dupes = /* @__PURE__ */ new Set();
    for (const t of set.tokens) (seen.has(t.name) ? dupes : seen).add(t.name);
    return [...dupes].map((n) => ({
      severity: "error",
      code: "name.duplicate",
      message: "This name is already used. Type a different name.",
      token: n
    }));
  }
  function checkToken(t, index) {
    var _a;
    const out = [...checkName(t)];
    const err = (code, message) => out.push({ severity: "error", code, message, token: t.name });
    const warn = (code, message) => out.push({ severity: "warning", code, message, token: t.name });
    const info = (code, message) => out.push({ severity: "info", code, message, token: t.name });
    if (!LAYERS_BY_KIND[t.kind].includes(t.layer)) {
      err(
        "layer.kind",
        "Only colour tokens can be component tokens. Make this a primitive or a semantic token."
      );
    }
    if (t.layer !== "component" && t.component) {
      err("layer.component", `A ${t.layer} token cannot be part of a component. Remove the component.`);
    }
    const set = columnSetOf(t);
    const modes = modesOf(t);
    const label = (key) => {
      var _a2, _b;
      return (_b = (_a2 = modes.find((m) => m.key === key)) == null ? void 0 : _a2.label.toLowerCase()) != null ? _b : key;
    };
    const extra = Object.keys(t.values).filter((k) => !modes.some((m) => m.key === k));
    if (extra.length) {
      if (set === "value") err("mode.primitive", `Remove the ${extra.join(" and ")} value. A primitive has 1 value for all modes.`);
      else err("mode.extra", `Remove the ${extra.join(" and ")} value. This token has ${modes.map((m) => m.label.toLowerCase()).join(" and ")} values.`);
    }
    const optional = set === "theme" && t.kind !== "color";
    const missing = optional ? [] : modes.filter((m) => t.values[m.key] === void 0);
    if (missing.length) {
      err("mode.missing", `The ${missing.map((m) => m.label.toLowerCase()).join(" and ")} value is empty. Select a ${missing[0].label.toLowerCase()} value.`);
    }
    if (set === "theme" && t.kind === "color" && t.values.dark !== void 0) {
      const l = resolveToken(index, t.name, "light");
      const d = resolveToken(index, t.name, "dark");
      if (!l.error && !d.error && l.value !== "" && l.value === d.value) {
        info("mode.same", `This token is ${String(l.value)} in light and dark. This is correct for brand colours. For other tokens, make sure that this is correct.`);
      }
    }
    const isEmpty = (v) => v === "" || v !== void 0 && isComposite(v) && Object.values(v).some((p) => p === "");
    const emptyModes = modes.filter((m) => isEmpty(t.values[m.key])).map((m) => m.key);
    if (emptyModes.length) {
      const present = modes.filter((m) => t.values[m.key] !== void 0);
      if (present.length <= 1) err("value.empty", "The value is empty. Select a token or type a value.");
      else if (emptyModes.length === present.length) {
        err("value.empty", `The ${present.map((m) => m.label.toLowerCase()).join(" and ")} values are empty. ${present.map((m) => `Select a ${m.label.toLowerCase()} value`).join(" and ")}.`.replace(/ and Select/, " and select"));
      } else err("value.empty", `The ${label(emptyModes[0])} value is empty. Select a ${label(emptyModes[0])} value.`);
    }
    for (const v of Object.values(t.values)) {
      if (v === void 0 || isEmpty(v)) continue;
      if (t.layer !== "primitive" && hasRawSimpleValue(v)) {
        warn("ref.raw", "This token has a raw value. Semantic and component tokens must refer to a token. Select a token.");
      }
      if (t.kind === "color" && typeof v === "string" && !HEX.test(v)) {
        err("value.colour", `"${v}" is not a colour. Type a hex value. Example: #FF5000.`);
      }
      if (set === "fluid" && isComposite(v)) {
        err("value.fluid", "A fluid token has 1 size for min and 1 size for max. Select a size token.");
      }
    }
    if (set === "fluid" && !emptyModes.length && !missing.length) {
      for (const m of modes) {
        const r = resolveToken(index, t.name, m.key);
        if (!r.error && toPx(r.value) === null) {
          err("value.fluid", `The ${m.label.toLowerCase()} value is ${String(r.value)}, which is not a size. Select a size token. Example: ${t.kind === "typography" ? "font-size-min-step-0" : "spacing-min-s"}.`);
          break;
        }
      }
    }
    for (const ref of referencesOf(t)) {
      const target = index.get(ref);
      if (!target) {
        err("ref.missing", `The token "${ref}" does not exist. Select a different token.`);
        continue;
      }
      const sameLayerOk = t.layer === "primitive" && target.layer === "primitive";
      if (!sameLayerOk && LAYER_RANK[target.layer] >= LAYER_RANK[t.layer]) {
        err("ref.layer", `A ${t.layer} token cannot refer to a ${target.layer} token. Select a token from a lower layer: ${t.layer === "component" ? "primitive or semantic" : "primitive"}.`);
      }
      const simple = Object.values(t.values).some((v) => isReference(v) && v.ref === ref);
      if (simple && target.kind !== t.kind && !(SIZE_KINDS.includes(t.kind) && SIZE_KINDS.includes(target.kind))) {
        err("ref.kind", `A ${kindWord(t.kind)} token cannot refer to a ${kindWord(target.kind)} token. Select a ${kindWord(t.kind)} token.`);
      }
      if (t.layer === "component" && target.layer === "semantic" && t.kind === "color") {
        const cat = t.name.split("-")[1];
        const targetCat = target.name.split("-")[0];
        if (cat && targetCat !== cat && !(cat === "icon" && targetCat === "content")) {
          warn("ref.category", `This ${cat} token refers to a ${targetCat} token. Make sure that this is correct.`);
        }
      }
      if (target.status === "deprecated" && t.status !== "deprecated") {
        warn("ref.deprecated", `"${ref}" is deprecated. Select a different token.`);
      }
    }
    for (const { key: mode } of modes) {
      const r = resolveToken(index, t.name, mode);
      if (((_a = r.error) == null ? void 0 : _a.kind) === "cycle") {
        err("ref.cycle", `The references make a loop: ${r.error.chain.join(" > ")}. Change 1 of the references.`);
        break;
      }
    }
    return out;
  }
  function hasRawSimpleValue(v) {
    return !isReference(v) && !isComposite(v);
  }
  function checkComponents(set) {
    var _a, _b;
    const out = [];
    const byComponent = /* @__PURE__ */ new Map();
    for (const t of set.tokens) {
      if (t.layer !== "component" || !t.component) continue;
      byComponent.set(t.component, [...(_a = byComponent.get(t.component)) != null ? _a : [], t]);
    }
    for (const [component, tokens] of byComponent) {
      const parts = tokens.map((t) => parseComponentTokenName(t.name)).filter((p) => p !== null);
      const groups = /* @__PURE__ */ new Map();
      for (const p of parts) {
        const g = [p.category, p.role].filter(Boolean).join("-");
        groups.set(g, ((_b = groups.get(g)) != null ? _b : /* @__PURE__ */ new Set()).add(p.state));
      }
      for (const [g, states] of groups) {
        if (!states.has("default")) {
          out.push({
            severity: "error",
            code: "component.default",
            message: `${component}-${g} does not have a default token. Add ${component}-${g}-default.`,
            component
          });
        }
      }
      const withRole = parts.filter((p) => p.role).length;
      if (withRole && withRole !== parts.length) {
        out.push({
          severity: "warning",
          code: "component.roles",
          message: `Some ${component} tokens have a role and some do not. Use a role in all ${component} tokens or in no ${component} tokens.`,
          component
        });
      }
      if (parts.length && !withRole) {
        out.push({
          severity: "info",
          code: "component.no-role",
          message: `${component} does not use roles. If you add a second variant later, you must change the names of all ${component} tokens.`,
          component
        });
      }
    }
    return out;
  }
  function checkBeforeSave(set, candidates, replacing = []) {
    const kept = set.tokens.filter((t) => !replacing.includes(t.name));
    const merged = { tokens: [...kept, ...candidates] };
    const names = new Set(candidates.map((t) => t.name));
    const components = new Set(candidates.map((t) => t.component).filter(Boolean));
    const issues = validateTokenSet(merged).filter(
      (i) => i.token && names.has(i.token) || i.component && components.has(i.component)
    );
    return { ok: !issues.some((i) => i.severity === "error"), issues };
  }

  // src/lib/figma/scan.ts
  var localFirst = (vars) => [...vars.filter((v) => !v.remote), ...vars.filter((v) => v.remote)];
  var partKey = (p) => `${p.layerName}|${p.paint}`;
  var CATEGORIES = COMPONENT_CATEGORIES;
  var CATEGORY_ORDER = ["surface", "line", "content", "icon"];
  var TRANSPARENT_ALPHA = 1e-3;
  var issue2 = (severity, code, message, token) => ({ severity, code, message, token });
  function rgbaToHex(c) {
    const h = (n) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, "0").toUpperCase();
    return `#${h(c.r)}${h(c.g)}${h(c.b)}${c.a < 1 ? h(c.a) : ""}`;
  }
  var sameColour = (a, b) => {
    const close = (x, y) => Math.abs(x - y) < 2e-3;
    if (a.a < TRANSPARENT_ALPHA && b.a < TRANSPARENT_ALPHA) return true;
    return close(a.r, b.r) && close(a.g, b.g) && close(a.b, b.b) && close(a.a, b.a);
  };
  var isTransparent = (c) => c.a < TRANSPARENT_ALPHA;
  function categoryOfLayer(name) {
    const n = name.trim().toLowerCase();
    return CATEGORIES.includes(n) ? n : null;
  }
  function stateRank(s) {
    const i = SUGGESTED_STATES.indexOf(s);
    return i === -1 ? SUGGESTED_STATES.length : i;
  }
  var title3 = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  function resolveVariable(byId, id, mode, seen = []) {
    var _a, _b;
    const v = byId.get(id);
    if (!v || seen.includes(id)) return null;
    const keys = Object.keys(v.values);
    const value = (_b = v.values[mode]) != null ? _b : keys.length === 1 ? v.values[keys[0]] : (_a = v.values.light) != null ? _a : v.values[keys[0]];
    if (!value) return null;
    if ("color" in value) return { primitive: v.layer === "primitive" ? v.token : null, color: value.color };
    const next = resolveVariable(byId, value.alias, mode, [...seen, id]);
    if (!next) return null;
    return v.layer === "primitive" ? { primitive: v.token, color: next.color } : next;
  }
  function matchPrimitive(vars, byId, color) {
    const prims = localFirst(vars).filter((v) => v.layer === "primitive");
    if (isTransparent(color)) {
      const t = prims.find((v) => v.token === "transparent");
      if (t) return t.token;
    }
    for (const p of prims) {
      const r = resolveVariable(byId, p.id, "value");
      if (r && sameColour(r.color, color)) return p.token;
    }
    return null;
  }
  function sourceOf(binding, component, vars, byId) {
    if (binding.kind === "raw") {
      return { kind: "raw", value: { primitive: matchPrimitive(vars, byId, binding.color), color: binding.color } };
    }
    const v = byId.get(binding.id);
    const light = resolveVariable(byId, binding.id, "light");
    const dark = resolveVariable(byId, binding.id, "dark");
    if (!v || !light || !dark) return { kind: "missing", id: binding.id };
    if (v.layer === "primitive") return { kind: "primitive", token: v.token, value: light };
    if (v.layer === "component") return { kind: "component", token: v.token, own: v.token.startsWith(`${component}-`), light, dark };
    return { kind: "semantic", token: v.token, light, dark };
  }
  function colourIn(source, mode) {
    switch (source.kind) {
      case "semantic":
      case "component":
        return source[mode].color;
      case "primitive":
      case "raw":
        return source.value.color;
      default:
        return null;
    }
  }
  function sourceLabel(source) {
    switch (source.kind) {
      case "semantic":
      case "component":
      case "primitive":
        return source.token;
      case "raw":
        return rgbaToHex(source.value.color);
      default:
        return "a variable the plugin cannot read";
    }
  }
  function lookOf(source) {
    const key = (r) => r.primitive;
    switch (source.kind) {
      case "semantic":
        return { light: key(source.light), dark: key(source.dark), needsDark: false, needsLight: false, source: `From ${source.token}` };
      case "component":
        return { light: key(source.light), dark: key(source.dark), needsDark: false, needsLight: false, source: source.own ? `Kept from ${source.token}` : `From ${source.token}, a token of a different component` };
      case "primitive": {
        const t = isTransparent(source.value.color);
        return { light: source.token, dark: t ? source.token : null, needsDark: !t, needsLight: false, source: t ? `${source.token} in both themes` : source.token };
      }
      case "raw": {
        const p = source.value.primitive;
        const t = isTransparent(source.value.color);
        const hex = rgbaToHex(source.value.color);
        return {
          light: p,
          dark: t && p ? p : null,
          needsDark: !(t && p),
          needsLight: !p,
          source: p ? `Raw value ${hex}, the same as ${p}` : `Raw value ${hex}, no primitive has this colour`
        };
      }
      default:
        return null;
    }
  }
  function darkKey(source) {
    switch (source.kind) {
      case "semantic":
      case "component":
        return { primitive: source.dark.primitive, hex: rgbaToHex(source.dark.color) };
      case "primitive":
        return { primitive: source.token, hex: rgbaToHex(source.value.color) };
      case "raw":
        return { primitive: source.value.primitive, hex: rgbaToHex(source.value.color) };
      default:
        return null;
    }
  }
  var sameBinding = (a, b) => !!b && (a.kind === "semantic" || a.kind === "component") && a.kind === b.kind && "token" in b && a.token === b.token;
  function lookWithDark(layer) {
    const look = lookOf(layer.source);
    if (!look || !layer.darkSource || sameBinding(layer.source, layer.darkSource)) return look;
    const d = darkKey(layer.darkSource);
    if (!d) return __spreadProps(__spreadValues({}, look), { dark: null, needsDark: true });
    if (!look.needsDark && look.dark && look.dark === d.primitive) return look;
    const label = layer.darkSource.kind === "raw" ? `raw value ${d.hex}` : sourceLabel(layer.darkSource);
    return __spreadProps(__spreadValues({}, look), {
      dark: d.primitive,
      needsDark: !d.primitive,
      source: `${look.source}; dark from the dark copy (${label}${d.primitive || layer.darkSource.kind !== "raw" ? "" : ", no primitive has this colour"})`
    });
  }
  function signature(layer) {
    var _a, _b, _c, _d;
    const source = layer.source;
    if (layer.darkSource && !sameBinding(source, layer.darkSource)) {
      const light = signature(__spreadProps(__spreadValues({}, layer), { darkSource: void 0 })).split("|")[0];
      const d = darkKey(layer.darkSource);
      return `${light}|${d ? (_a = d.primitive) != null ? _a : d.hex : "missing"}`;
    }
    switch (source.kind) {
      case "semantic":
      case "component":
        return `${(_b = source.light.primitive) != null ? _b : rgbaToHex(source.light.color)}|${(_c = source.dark.primitive) != null ? _c : rgbaToHex(source.dark.color)}`;
      case "primitive":
        return isTransparent(source.value.color) ? "transparent|transparent" : `${source.token}|${source.token}`;
      case "raw": {
        if (isTransparent(source.value.color)) return "transparent|transparent";
        const k = (_d = source.value.primitive) != null ? _d : rgbaToHex(source.value.color);
        return `${k}|${k}`;
      }
      default:
        return "missing";
    }
  }
  function scanComponent(input, group = DEFAULT_FIGMA_GROUP, chosenParts = {}) {
    var _a, _b, _c;
    const component = normaliseComponentName(input.componentName).slug;
    const byId = new Map(input.variables.map((v) => [v.id, v]));
    const issues = [...input.issues];
    const forbidden = new Set(FORBIDDEN_STATES);
    for (const v of input.variants.filter((x) => forbidden.has(x.state))) {
      issues.push(issue2("warning", "scan.focus", `The variant ${v.name} is not read. There are no focus tokens, because focus uses the system default.`));
    }
    const knownStates = new Set(SUGGESTED_STATES);
    const knownRoles = new Set(SUGGESTED_ROLES);
    for (const state of new Set(input.variants.map((v) => v.state))) {
      if (state && !knownStates.has(state) && !forbidden.has(state)) {
        issues.push(issue2("warning", "scan.new-state", `State=${title3(state)} is not a state in the naming rules. It becomes a new state, for example ${component || "control"}-surface-${state}. Make sure that this is correct, or rename the option in Figma.`));
      }
    }
    for (const role of new Set(input.variants.map((v) => v.role).filter((r) => !!r))) {
      if (!knownRoles.has(role)) {
        issues.push(issue2("warning", "scan.new-role", `The role ${role} is not a role in the naming rules. It is used as a new role. Make sure that this is correct, or rename the option in Figma.`));
      }
    }
    const all = input.paints.filter((paint) => !forbidden.has(paint.state)).map((paint) => {
      var _a2, _b2, _c2, _d;
      const source = sourceOf(paint.binding, component, input.variables, byId);
      const darkSource = paint.dark ? sourceOf(paint.dark.binding, component, input.variables, byId) : void 0;
      const noMatch = paint.dark === null;
      const fixed = !darkSource && (source.kind === "primitive" || source.kind === "raw") && !isTransparent(source.value.color);
      const category = (_d = (_c2 = (_b2 = (_a2 = chosenParts[partKey(paint)]) != null ? _a2 : paint.category) != null ? _b2 : categoryOfLayer(paint.layerName)) != null ? _c2 : paint.autoCategory) != null ? _d : null;
      return { paint, category, source, darkSource, noMatch, sameInBoth: fixed };
    });
    const layers = all.filter((l) => l.category);
    const unknown = all.filter((l) => !l.category);
    const result = (status, tokens2 = [], changes2 = []) => ({
      status,
      component,
      title: input.componentName,
      variants: input.variants.length,
      darkName: input.darkName,
      layers,
      unknown,
      tokens: tokens2,
      changes: changes2,
      issues
    });
    if (!component) issues.push(issue2("error", "scan.name", "The component set has no name. Give it a name in Figma, for example Control."));
    for (const l of unknown) {
      issues.push(
        issue2(
          "warning",
          "scan.unknown",
          `The layer "${l.paint.layerName}" in ${l.paint.variant} has a colour, but its name is not surface, line, content or icon. The scan does not change it. Rename it to 1 of these names to include it.`
        )
      );
    }
    for (const l of layers.filter((x) => x.noMatch)) {
      issues.push(
        issue2(
          "warning",
          "scan.no-match",
          `The ${l.paint.layerName} ${l.paint.paint === "fills" ? "fill" : "stroke"} in ${l.paint.variant} has no matching layer in ${(_a = input.darkName) != null ? _a : "the dark copy"}. Make the dark copy a duplicate with the same layers, or choose the dark value in Accept names.`
        )
      );
    }
    for (const l of all.filter((x) => {
      var _a2;
      return x.source.kind === "missing" || ((_a2 = x.darkSource) == null ? void 0 : _a2.kind) === "missing";
    })) {
      issues.push(issue2("error", "scan.missing", `The ${l.paint.layerName} layer in ${l.paint.variant} uses a variable that the plugin cannot read. Bind it to a variable in this file.`));
    }
    if (!layers.length && !issues.some((i) => i.severity === "error")) {
      issues.push(issue2("error", "scan.empty", "No layer is called surface, line, content or icon. Rename the coloured layers, then scan again."));
    }
    if (issues.some((i) => i.severity === "error")) return result("blocked");
    const darkAgrees = (l) => !l.darkSource || sameBinding(l.source, l.darkSource);
    if (layers.every((l) => l.source.kind === "semantic" && darkAgrees(l))) return result("fine");
    if (layers.every((l) => l.source.kind === "component" && l.source.own && darkAgrees(l))) return result("own-tokens");
    const groupKey = (category, role) => [category, role].filter(Boolean).join("|");
    const parts = /* @__PURE__ */ new Map();
    for (const l of layers) {
      const g = groupKey(l.category, l.paint.role);
      const byState = (_b = parts.get(g)) != null ? _b : /* @__PURE__ */ new Map();
      byState.set(l.paint.state, [...(_c = byState.get(l.paint.state)) != null ? _c : [], l]);
      parts.set(g, byState);
    }
    const tokens = [];
    const changes = [];
    const ordered = [...parts.entries()].sort(([a], [b]) => {
      const [ca, ra = ""] = a.split("|");
      const [cb, rb = ""] = b.split("|");
      return ra.localeCompare(rb) || CATEGORY_ORDER.indexOf(ca) - CATEGORY_ORDER.indexOf(cb);
    });
    for (const [g, byState] of ordered) {
      const [category, role] = g.split("|");
      const label = [category, role].filter(Boolean).join(" ");
      let conflict = false;
      for (const ls of byState.values()) {
        if (new Set(ls.map((l) => signature(l))).size > 1) {
          conflict = true;
          issues.push(
            issue2(
              "error",
              "scan.conflict",
              `In ${ls[0].paint.variant}, the ${category} layers have different colours (${ls.map((l) => sourceLabel(l.source)).join(", ")}). Layers with the same name in 1 state share 1 token. Give them the same colour.`
            )
          );
        }
      }
      if (conflict) continue;
      const def = byState.get("default");
      if (!def) {
        const name = buildComponentTokenName({ component, category, role, state: "default" });
        issues.push(issue2("error", "scan.default", `The default variant has no ${label} layer, so ${name} has no value. Add a ${category} layer to the default variant.`, name));
        continue;
      }
      const states = [...byState.keys()].sort((a, b) => stateRank(a) - stateRank(b) || a.localeCompare(b));
      const defSig = signature(def[0]);
      for (const state of states) {
        const ls = byState.get(state);
        const reuse = state !== "default" && signature(ls[0]) === defSig;
        const name = buildComponentTokenName({ component, category, role, state: reuse ? "default" : state });
        if (!reuse) {
          const look = lookWithDark(ls[0]);
          const fromDarkCopy = !!ls[0].darkSource && !sameBinding(ls[0].source, ls[0].darkSource);
          const draft = { name, layer: "component", kind: "color", component, values: {}, status: "active" };
          const path = figmaPath(draft, group);
          tokens.push({
            name,
            figmaName: path.split("/").pop(),
            figmaPath: path,
            component,
            category,
            role,
            state,
            published: state === "default",
            source: look.source,
            light: look.light,
            dark: look.dark,
            needsDark: look.needsDark,
            needsLight: look.needsLight,
            fromDarkCopy
          });
        }
        for (const l of ls) changes.push({ layer: l, token: name, reused: reuse });
      }
    }
    if (issues.some((i) => i.severity === "error")) return result("blocked", tokens, changes);
    return result("draft", tokens, changes);
  }
  function withChoices(tokens, choices = {}) {
    return tokens.map((t) => {
      var _a, _b, _c, _d;
      return __spreadProps(__spreadValues({}, t), { light: (_b = (_a = choices[t.name]) == null ? void 0 : _a.light) != null ? _b : t.light, dark: (_d = (_c = choices[t.name]) == null ? void 0 : _c.dark) != null ? _d : t.dark });
    });
  }
  function draftsToTokens(tokens) {
    return tokens.map((d) => {
      const values = {};
      if (d.light) values.light = { ref: d.light };
      if (d.dark) values.dark = { ref: d.dark };
      return { name: d.name, layer: "component", kind: "color", component: d.component, values, status: "active" };
    });
  }
  function variablesToTokenSet(vars) {
    var _a;
    const byId = new Map(vars.map((v) => [v.id, v]));
    const tokens = [];
    const seen = /* @__PURE__ */ new Set();
    for (const v of localFirst(vars)) {
      if (!v.layer || seen.has(v.token)) continue;
      seen.add(v.token);
      const modes = v.layer === "primitive" ? ["value"] : ["light", "dark"];
      const values = {};
      for (const m of modes) {
        const keys = Object.keys(v.values);
        const raw = (_a = v.values[m]) != null ? _a : keys.length === 1 ? v.values[keys[0]] : void 0;
        if (!raw) continue;
        if ("color" in raw) values[m] = rgbaToHex(raw.color);
        else {
          const target = byId.get(raw.alias);
          if (target) values[m] = { ref: target.token };
        }
      }
      tokens.push({ name: v.token, layer: v.layer, kind: "color", component: v.layer === "component" ? v.token.split("-")[0] : void 0, values, status: "active" });
    }
    return { tokens };
  }
  function checkDrafts(result, vars, choices = {}) {
    const context = variablesToTokenSet(vars);
    const drafts = withChoices(result.tokens, choices);
    const own = context.tokens.filter((t) => t.layer === "component" && t.component === result.component).map((t) => t.name);
    const { issues } = checkBeforeSave(context, draftsToTokens(drafts), own);
    const out = issues.filter((i) => i.code !== "mode.same");
    for (const d of drafts) {
      const p = d.light && vars.find((v) => v.token === d.light);
      const q = d.dark && vars.find((v) => v.token === d.dark);
      if (d.light && !p || d.dark && !q) out.push(issue2("error", "scan.primitive", `${d.name} uses a primitive that is not in this file. Select a different primitive.`, d.name));
      if (p && p.layer !== "primitive" || q && q.layer !== "primitive") {
        out.push(issue2("error", "scan.not-primitive", `${d.name} must point to a primitive. Select a primitive, for example neutral-200.`, d.name));
      }
      if ((d.needsDark || d.fromDarkCopy) && d.light && d.light === d.dark && d.light !== "transparent") {
        const where = d.fromDarkCopy && !d.needsDark ? " The dark copy has the same colour as the light component." : "";
        out.push(issue2("warning", "scan.same-primitive", `${d.name} uses ${d.light} in light and dark.${where} This is correct for some tokens, for example a brand colour. Make sure that this is correct.`, d.name));
      }
    }
    return { ok: !out.some((i) => i.severity === "error"), issues: out };
  }
  var plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  var list = (parts) => parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  function summarise(result, vars, collectionName = "Colour tokens", group = DEFAULT_FIGMA_GROUP) {
    var _a;
    const existing = new Set(vars.filter((v) => v.collection === "colour-tokens").map((v) => v.name));
    const update = result.tokens.filter((t) => existing.has(t.figmaPath)).length;
    const create = result.tokens.length - update;
    const hidden = result.tokens.filter((t) => !t.published).length;
    const changed = result.changes;
    const layers = changed.length;
    const darkLayers = changed.filter((c) => c.layer.paint.dark).length;
    const variants = new Set(changed.map((c) => c.layer.paint.variantId)).size;
    const where = `${collectionName} / ${group} / ${title3(result.component)}`;
    const parts = [
      create ? `creates ${plural(create, "variable")} in ${where}` : "",
      update ? `updates ${plural(update, "variable")} in ${where}` : "",
      hidden ? `hides ${hidden} from publishing` : ""
    ].filter(Boolean);
    const sentence = `This ${list(parts)}.`;
    const dark = darkLayers ? ` It also binds ${plural(darkLayers, "layer")} in ${(_a = result.darkName) != null ? _a : "the dark copy"} and sets it to dark mode, so it looks the same as before.` : "";
    const applySentence = `This binds ${plural(layers, "layer")} across ${plural(variants, "variant")} to the new variables.${dark}`;
    return { create, update, hidden, layers, variants, darkLayers, tokens: result.tokens.length, sentence, applySentence };
  }

  // src/lib/figma/scan-figma.ts
  var KEY2 = "tokenLibrary";
  var issue3 = (severity, code, message) => ({ severity, code, message });
  function collectionKey(c, names) {
    var _a, _b;
    const stored = (_a = c.getPluginData) == null ? void 0 : _a.call(c, KEY2);
    if (stored && stored in names) return stored;
    return (_b = Object.keys(names).find((k) => names[k] === c.name)) != null ? _b : null;
  }
  function namesOf(opts) {
    var _a;
    const base = Object.fromEntries(Object.entries(COLLECTIONS).map(([k, c]) => [k, c.name]));
    return __spreadValues(__spreadValues({}, base), (_a = opts.names) != null ? _a : {});
  }
  function layerOf(v, key, c, group) {
    if (key === "colour-primitives") return "primitive";
    if (key === "colour-tokens") return v.name.startsWith(`${group}/`) ? "component" : "semantic";
    if (!c) return null;
    return c.modes.length === 1 ? "primitive" : "semantic";
  }
  function tokenNameOf(v, layer) {
    var _a;
    const stored = (_a = v.getPluginData) == null ? void 0 : _a.call(v, "token");
    if (stored) return stored;
    const last = v.name.split("/").pop().trim();
    if (layer !== "component") return last;
    const parts = v.name.split("/");
    return parts.length >= 3 ? `${slug(parts[1])}-${last}` : last;
  }
  function toRgba(raw) {
    var _a;
    if (typeof raw === "object" && raw && "r" in raw) return { r: raw.r, g: raw.g, b: raw.b, a: (_a = raw.a) != null ? _a : 1 };
    return null;
  }
  async function readVariables(api2, boundIds, opts) {
    var _a, _b, _c;
    const names = namesOf(opts);
    const group = (_a = opts.group) != null ? _a : DEFAULT_FIGMA_GROUP;
    const collections = new Map((await api2.getLocalVariableCollectionsAsync()).map((c) => [c.id, c]));
    const vars = new Map((await api2.getLocalVariablesAsync()).map((v) => [v.id, v]));
    const queue = boundIds.filter((id) => !vars.has(id));
    while (queue.length) {
      const id = queue.shift();
      if (vars.has(id)) continue;
      const v = await api2.getVariableByIdAsync(id);
      if (!v) continue;
      vars.set(id, v);
      for (const raw of Object.values(v.valuesByMode)) {
        if (typeof raw === "object" && raw && "type" in raw && raw.type === "VARIABLE_ALIAS" && !vars.has(raw.id)) queue.push(raw.id);
      }
    }
    for (const v of vars.values()) {
      if (!collections.has(v.variableCollectionId)) collections.set(v.variableCollectionId, await api2.getVariableCollectionByIdAsync(v.variableCollectionId));
    }
    const out = [];
    for (const v of vars.values()) {
      if (v.resolvedType !== "COLOR") continue;
      const c = (_b = collections.get(v.variableCollectionId)) != null ? _b : null;
      const key = c ? collectionKey(c, names) : null;
      const layer = layerOf(v, key, c, group);
      const values = {};
      for (const m of (_c = c == null ? void 0 : c.modes) != null ? _c : []) {
        const raw = v.valuesByMode[m.modeId];
        if (raw === void 0) continue;
        const mode = c.modes.length === 1 ? "value" : modeKeyOf(m.name);
        if (typeof raw === "object" && raw && "type" in raw && raw.type === "VARIABLE_ALIAS") values[mode] = { alias: raw.id };
        else {
          const color = toRgba(raw);
          if (color) values[mode] = { color };
        }
      }
      out.push({ id: v.id, token: tokenNameOf(v, layer), name: v.name, collection: key, layer, values, remote: !!v.remote });
    }
    return out;
  }
  var isSymbol = (x) => typeof x === "symbol";
  var SHAPES = /* @__PURE__ */ new Set(["VECTOR", "BOOLEAN_OPERATION", "STAR", "POLYGON", "LINE"]);
  function autoCategory(n, field) {
    if (field === "strokes" && n.type !== "TEXT" && !SHAPES.has(n.type)) return "line";
    if (n.type === "TEXT" || SHAPES.has(n.type)) return "content";
    return "surface";
  }
  var STOP_WORDS = /\b(light|dark|copy|mode|theme)\b/gi;
  function suggestComponentName(name) {
    const cleaned = name.replace(STOP_WORDS, " ").replace(/[\s/_-]+/g, " ").trim();
    return cleaned || name.trim();
  }
  function guessStates(set) {
    var _a;
    const kids = set.children.filter((c) => c.type === "COMPONENT");
    const known = ["Default", "Hover", "Pressed", "Disabled", "Selected", "Loading", "On", "Off"];
    const out = {};
    const used = /* @__PURE__ */ new Set();
    for (const k of kids) {
      const value = Object.values((_a = k.variantProperties) != null ? _a : {}).map((v) => known.find((s) => s.toLowerCase() === slug(v)));
      const hit = value.find((v) => v && !used.has(v));
      if (hit) {
        out[k.id] = hit;
        used.add(hit);
      }
    }
    for (const k of kids) {
      if (out[k.id]) continue;
      const next = known.find((s) => !used.has(s));
      if (next) {
        out[k.id] = next;
        used.add(next);
      }
    }
    return out;
  }
  function writeStates(set, dark, states) {
    const kids = set.children.filter((c) => c.type === "COMPONENT");
    let n = 0;
    kids.forEach((k, i) => {
      const s = states[k.id];
      if (!s) return;
      const label = s.charAt(0).toUpperCase() + s.slice(1);
      const d = dark && dark.type === "COMPONENT_SET" ? darkVariantFor(dark, k, i, kids.length) : null;
      k.name = `State=${label}`;
      if (d) d.name = `State=${label}`;
      n += 1;
    });
    return n;
  }
  function whichIsDark(nodes, darkModeIds = [], opts = {}) {
    var _a, _b, _c, _d;
    const decide = (flags) => flags[0] !== flags[1] ? flags[0] ? 0 : 1 : void 0;
    const modes = (n) => {
      var _a2;
      return Object.values((_a2 = n.explicitVariableModes) != null ? _a2 : {});
    };
    return (_d = (_c = (_b = (_a = decide(nodes.map((n) => modes(n).some((m) => darkModeIds.includes(m))))) != null ? _a : decide(nodes.map((n) => !modes(n).some((m) => {
      var _a2;
      return ((_a2 = opts.lightModeIds) != null ? _a2 : []).includes(m);
    })))) != null ? _b : decide(nodes.map((n) => /\bdark\b/i.test(n.name)))) != null ? _c : opts.hasSet ? decide(opts.hasSet.map((x) => !x)) : void 0) != null ? _d : null;
  }
  var darkVariantsOf = (dark) => {
    var _a;
    return ((_a = dark.children) != null ? _a : []).filter((c) => c.type !== "TEXT");
  };
  function darkVariantFor(dark, light, index, lightCount) {
    var _a;
    const kids = darkVariantsOf(dark);
    const byName = kids.filter((k) => k.name === light.name);
    if (byName.length === 1) return byName[0];
    return kids.length === lightCount ? (_a = kids[index]) != null ? _a : null : null;
  }
  function darkChild(d, n, index, count) {
    var _a;
    if (!d) return null;
    const kids = (_a = d.children) != null ? _a : [];
    if (kids.length !== count) return null;
    const k = kids[index];
    return k && k.type === n.type ? k : null;
  }
  async function readComponentSet(api2, set, opts = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    const darkRoot = (_a = opts.dark) != null ? _a : null;
    const named = (_b = opts.states) != null ? _b : {};
    const issues = [];
    const defs = Object.entries((_c = set.componentPropertyDefinitions) != null ? _c : {}).filter(([, d]) => d.type === "VARIANT");
    const stateProp = (_d = defs.find(([n]) => n.trim().toLowerCase() === "state")) == null ? void 0 : _d[0];
    const lightKids = set.children.filter((c) => c.type === "COMPONENT");
    const namedInPlugin = !stateProp && lightKids.length > 0 && lightKids.every((c) => named[c.id]);
    if (!stateProp && !namedInPlugin) {
      issues.push(issue3("error", "scan.state", `${set.name} has no State property. Add a variant property called State, with values such as Default, Hover, Pressed and Disabled.`));
    }
    const roleProps = namedInPlugin ? [] : defs.filter(([n, d]) => {
      var _a2, _b2;
      return n !== stateProp && ((_b2 = (_a2 = d.variantOptions) == null ? void 0 : _a2.length) != null ? _b2 : 0) > 1;
    }).map(([n]) => n);
    if (roleProps.length > 1) {
      issues.push(issue3("error", "scan.roles", `${set.name} has ${roleProps.length} variant properties apart from State (${roleProps.join(", ")}). The scan can read 1 property as the role. Keep 1 property apart from State.`));
    }
    const roleProp = roleProps.length === 1 ? roleProps[0] : void 0;
    const variants = [];
    const paints = [];
    const lightVariants = set.children.filter((c) => c.type === "COMPONENT");
    if (darkRoot) {
      const darkCount = darkVariantsOf(darkRoot).length;
      if (darkCount !== lightVariants.length) {
        issues.push(issue3("warning", "scan.dark-variants", `${set.name} has ${lightVariants.length} variants and ${darkRoot.name} has ${darkCount}. Make the dark copy a duplicate of the component set, with only the colours changed.`));
      }
    }
    for (const [vi, node] of lightVariants.entries()) {
      const props = (_e = node.variantProperties) != null ? _e : {};
      const state = namedInPlugin ? slug(named[node.id]) : stateProp ? slug((_f = props[stateProp]) != null ? _f : "") : "";
      const role = roleProp ? slug((_g = props[roleProp]) != null ? _g : "") || void 0 : void 0;
      if ((stateProp || namedInPlugin) && !state) issues.push(issue3("error", "scan.state-value", `The variant ${node.name} has no State value. Give it a State value.`));
      variants.push({ id: node.id, name: node.name, state, role });
      const darkVariant = darkRoot ? darkVariantFor(darkRoot, node, vi, lightVariants.length) : null;
      const read = (n, d, layerName, category) => {
        const auto = (field) => autoCategory(n, field);
        if (n.isMask) return;
        for (const field of ["fills", "strokes"]) {
          const list2 = n[field];
          if (!list2) continue;
          const darkList = d == null ? void 0 : d[field];
          const darkPaints = darkList && !isSymbol(darkList) ? darkList : null;
          if (isSymbol(list2)) {
            issues.push(issue3("warning", "scan.mixed", `The text layer "${n.name}" in ${node.name} has more than 1 colour. The scan does not read it. Give the text 1 colour.`));
            continue;
          }
          list2.forEach((p, index) => {
            var _a2, _b2, _c2;
            if (p.visible === false || p.type !== "SOLID") return;
            const bound = (_b2 = (_a2 = p.boundVariables) == null ? void 0 : _a2.color) == null ? void 0 : _b2.id;
            const dp = darkPaints && darkPaints.length === list2.length ? darkPaints[index] : void 0;
            const darkPair = !darkRoot ? void 0 : dp && dp.visible !== false && dp.type === "SOLID" && d ? { nodeId: d.id, binding: bindingOf(dp) } : null;
            paints.push({
              variantId: node.id,
              variant: node.name,
              state,
              role,
              nodeId: n.id,
              layerName,
              paint: field,
              index,
              binding: bound ? { kind: "variable", id: bound } : { kind: "raw", color: __spreadProps(__spreadValues({}, p.color), { a: (_c2 = p.opacity) != null ? _c2 : 1 }) },
              dark: darkPair,
              category: category(field),
              autoCategory: auto(field)
            });
          });
        }
      };
      const walk = (n, d, inInstance) => {
        var _a2;
        if (n.visible === false) return;
        read(n, d, inInstance ? `${n.name} in ${inInstance}` : n.name, () => inInstance ? "content" : void 0);
        const inside = inInstance != null ? inInstance : n.type === "INSTANCE" ? n.name : null;
        const kids = (_a2 = n.children) != null ? _a2 : [];
        kids.forEach((c, i) => walk(c, darkChild(d, c, i, kids.length), inside));
      };
      read(node, darkVariant, "variant frame", (field) => field === "fills" ? "surface" : "line");
      const top = (_h = node.children) != null ? _h : [];
      top.forEach((c, i) => walk(c, darkChild(darkVariant, c, i, top.length), null));
    }
    if ((stateProp || namedInPlugin) && !variants.some((v) => v.state === "default")) {
      issues.push(issue3("error", "scan.no-default", `${set.name} has no variant with State=Default. Add a default variant.`));
    }
    const seen = /* @__PURE__ */ new Map();
    for (const v of variants) if (v.state) seen.set(`${(_i = v.role) != null ? _i : ""}|${v.state}`, ((_k = seen.get(`${(_j = v.role) != null ? _j : ""}|${v.state}`)) != null ? _k : 0) + 1);
    for (const [k, count] of seen) {
      if (count > 1) issues.push(issue3("error", "scan.same-state", `${count} variants have the state ${k.split("|")[1]}${k.split("|")[0] ? ` for the role ${k.split("|")[0]}` : ""}. Give each variant its own state.`));
    }
    const names = namesOf(opts);
    const local = await api2.getLocalVariableCollectionsAsync();
    if (!local.some((c) => collectionKey(c, names) === "colour-tokens")) {
      issues.push(
        issue3(
          "error",
          "scan.library",
          `${names["colour-tokens"]} is not a collection of this file. It comes from a library, and a plugin cannot add variables to a library from a different file. Run the scan in the file that has ${names["colour-tokens"]}, for example the UAL UI Kit or a copy of it.`
        )
      );
    }
    const boundIds = paints.flatMap((p) => {
      var _a2;
      return [p.binding, (_a2 = p.dark) == null ? void 0 : _a2.binding].flatMap((b) => (b == null ? void 0 : b.kind) === "variable" ? [b.id] : []);
    });
    const variables = await readVariables(api2, boundIds, opts);
    return { componentName: set.name, variants, paints, variables, issues, darkName: darkRoot == null ? void 0 : darkRoot.name };
  }
  function bindingOf(p) {
    var _a, _b, _c;
    const bound = (_b = (_a = p.boundVariables) == null ? void 0 : _a.color) == null ? void 0 : _b.id;
    return bound ? { kind: "variable", id: bound } : { kind: "raw", color: __spreadProps(__spreadValues({}, p.color), { a: (_c = p.opacity) != null ? _c : 1 }) };
  }
  function findNode(root, id) {
    var _a;
    if (root.id === id) return root;
    for (const c of (_a = root.children) != null ? _a : []) {
      const f = findNode(c, id);
      if (f) return f;
    }
    return null;
  }
  async function colourTokens(api2, opts) {
    const names = namesOf(opts);
    const collection = (await api2.getLocalVariableCollectionsAsync()).find((c) => collectionKey(c, names) === "colour-tokens");
    if (!collection) throw new Error(`This file has no ${names["colour-tokens"]} collection. Add it, or run Sync from tool first.`);
    const light = collection.modes.find((m) => modeKeyOf(m.name) === "light");
    const dark = collection.modes.find((m) => modeKeyOf(m.name) === "dark");
    if (!light || !dark) throw new Error(`The ${collection.name} collection must have a light and a dark mode.`);
    return { collection, light, dark };
  }
  async function publishScan(api2, drafts, vars, opts = {}) {
    var _a;
    const { collection, light, dark } = await colourTokens(api2, opts);
    const missing = drafts.filter((d) => !d.light || !d.dark);
    if (missing.length) throw new Error(`Choose light and dark values for ${missing.map((d) => d.name).join(", ")}.`);
    const primitive = async (token) => {
      const sv = localFirst(vars).find((v2) => v2.token === token && v2.layer === "primitive");
      const v = sv ? await api2.getVariableByIdAsync(sv.id) : null;
      if (!v) throw new Error(`The primitive ${token} is not in this file.`);
      return v;
    };
    const local = (await api2.getLocalVariablesAsync()).filter((v) => v.variableCollectionId === collection.id);
    const created = [];
    const updated = [];
    for (const [i, d] of drafts.entries()) {
      let v = local.find((x) => x.name === d.figmaPath || x.getPluginData("token") === d.name);
      if (v) updated.push(d.name);
      else {
        v = api2.createVariable(d.figmaPath, collection, "COLOR");
        created.push(d.name);
      }
      if (v.name !== d.figmaPath) v.name = d.figmaPath;
      v.setPluginData("token", d.name);
      v.setValueForMode(light.modeId, api2.createVariableAlias(await primitive(d.light)));
      v.setValueForMode(dark.modeId, api2.createVariableAlias(await primitive(d.dark)));
      v.hiddenFromPublishing = !d.published;
      v.description = d.state === "default" ? "" : `State: ${d.state}.`;
      v.setVariableCodeSyntax("WEB", `var(${cssVariableName({ name: d.name, kind: "color", layer: "component" })})`);
      (_a = opts.onStep) == null ? void 0 : _a.call(opts, "variables", i + 1, drafts.length);
    }
    return { created, updated };
  }
  async function bindScan(api2, set, result, opts = {}) {
    var _a, _b, _c;
    const { collection, dark: darkMode } = await colourTokens(api2, opts);
    const local = (await api2.getLocalVariablesAsync()).filter((v) => v.variableCollectionId === collection.id);
    const tokens = new Set(result.changes.map((c) => c.token));
    const byToken = /* @__PURE__ */ new Map();
    for (const t of tokens) {
      const draft = result.tokens.find((d) => d.name === t);
      const v = local.find((x) => x.getPluginData("token") === t || draft && x.name === draft.figmaPath);
      if (!v) throw new Error(`The variable for ${t} is not in this file. Use Save and publish first.`);
      byToken.set(t, v);
    }
    const byNode = /* @__PURE__ */ new Map();
    const add = (root, nodeId, field, index, variable, dark, what) => {
      var _a2, _b2, _c2;
      const key = `${nodeId}|${field}`;
      const node = (_b2 = (_a2 = byNode.get(key)) == null ? void 0 : _a2.node) != null ? _b2 : findNode(root, nodeId);
      if (!node) throw new Error(`The layer ${what} is gone. Scan again.`);
      const entry = (_c2 = byNode.get(key)) != null ? _c2 : { node, field, items: [], dark };
      entry.items.push({ index, variable });
      byNode.set(key, entry);
    };
    for (const c of result.changes) {
      const variable = byToken.get(c.token);
      const p = c.layer.paint;
      add(set, p.nodeId, p.paint, p.index, variable, false, `${p.layerName} in ${p.variant}`);
      if (p.dark && opts.dark) add(opts.dark, p.dark.nodeId, p.paint, p.index, variable, true, `${p.layerName} in the dark copy of ${p.variant}`);
    }
    let layers = 0;
    let darkLayers = 0;
    const total = [...byNode.values()].reduce((n, e) => n + e.items.length, 0);
    for (const { node, field, items, dark } of byNode.values()) {
      const list2 = node[field];
      if (!list2 || isSymbol(list2)) continue;
      const next = [...list2];
      for (const { index, variable } of items) {
        next[index] = api2.setBoundVariableForPaint(next[index], "color", variable);
        if (dark) darkLayers += 1;
        else layers += 1;
      }
      node[field] = next;
      (_a = opts.onStep) == null ? void 0 : _a.call(opts, "layers", layers + darkLayers, total);
    }
    (_c = (_b = opts.dark) == null ? void 0 : _b.setExplicitVariableModeForCollection) == null ? void 0 : _c.call(_b, collection, darkMode.modeId);
    return { layers, darkLayers };
  }

  // src/lib/tokens/repo.ts
  var BLOCK_START = "/* tokens:start (managed by the token tool) */";
  var BLOCK_END = "/* tokens:end */";

  // src/lib/tokens/css.ts
  var FLUID_MODE = "fluid";
  var contextOf = (mode) => mode === "dark" ? "dark" : mode === "reduced-motion" ? "reduced-motion" : "base";
  var INDENT = "  ";
  function needsPx(t) {
    if (t.kind === "spacing" || t.kind === "sizing" || t.kind === "radius") return true;
    if (t.kind === "typography") return t.name.startsWith("font-size") || t.name.startsWith("paragraph-spacing");
    if (t.kind === "border") return t.name.startsWith("border-width");
    return false;
  }
  function simpleToCss(v, index, t) {
    if (isReference(v)) {
      const target = index.get(v.ref);
      return target ? `var(${cssVariableName(target)})` : `/* missing token: ${v.ref} */`;
    }
    if (typeof v === "number" && t && needsPx(t) && v !== 0) return `${v}px`;
    return String(v);
  }
  function declarations(t, v, index) {
    var _a;
    const name = cssVariableName(t);
    const note = t.status === "deprecated" ? " /* deprecated */" : "";
    if (!isComposite(v)) return [`${name}: ${simpleToCss(v, index, t)};${note}`];
    const c = v;
    const part = (k) => c[k] === void 0 ? void 0 : simpleToCss(c[k], index);
    const join = (keys) => keys.map(part).filter(Boolean).join(" ");
    switch (t.kind) {
      case "border":
        return [`${name}: ${join(["width", "style", "color"])};${note}`];
      case "shadow":
        return [`${name}: ${join(["offsetX", "offsetY", "blur", "spread", "color"])};${note}`];
      case "typography": {
        const lines = [`${name}: ${(_a = part("fontSize")) != null ? _a : "inherit"};${note}`];
        if (c.lineHeight !== void 0) lines.push(`${name}--line-height: ${part("lineHeight")};`);
        if (c.fontWeight !== void 0) lines.push(`${name}--font-weight: ${part("fontWeight")};`);
        if (c.fontFamily !== void 0) lines.push(`${name}--font-family: ${part("fontFamily")};`);
        return lines;
      }
      default:
        return Object.keys(c).map((k) => `${name}-${k}: ${part(k)};`);
    }
  }
  function fluidDeclarations(t, index) {
    const name = cssVariableName(t);
    const note = t.status === "deprecated" ? " /* deprecated */" : "";
    const [min, max] = ["min", "max"].map((m) => toPx(resolveToken(index, t.name, m).value));
    const from = ["min", "max"].map((m) => `${m}: ${formatValue(valueInMode(t, m)).replace(/[{}]/g, "")}`).join(", ");
    if (min === null || max === null) return [`${name}: /* missing size (${from}) */;${note}`];
    return [`${name}: ${fluidClamp(min, max)};${note || ` /* ${from} */`}`];
  }
  function tokenDeclarations(t, index) {
    if (columnSetOf(t) === "fluid") return [{ context: "base", mode: FLUID_MODE, lines: fluidDeclarations(t, index) }];
    const first = modesOf(t)[0].key;
    return modesOf(t).filter((m, i) => i === 0 || t.values[m.key] !== void 0).filter((m) => m.key !== "reduced-motion" || JSON.stringify(t.values[m.key]) !== JSON.stringify(t.values[first])).map((m) => ({ context: contextOf(m.key), mode: m.key, lines: declarations(t, valueInMode(t, m.key), index) }));
  }
  var rule = (selector, lines) => `${selector} {
${lines.map((l) => INDENT + l).join("\n")}
}`;
  function linesByContext(tokens, index) {
    const out = { base: [], dark: [], "reduced-motion": [] };
    for (const t of tokens) for (const o of tokenDeclarations(t, index)) out[o.context].push(...o.lines);
    return out;
  }
  var wrap = (body) => `${BLOCK_START}
${body}
${BLOCK_END}`;
  function componentCss(set, component) {
    const index = indexTokens(set);
    const tokens = set.tokens.filter((t) => t.layer === "component" && t.component === component);
    const lines = linesByContext(tokens, index);
    const parts = [rule(`.${component}`, lines.base)];
    if (lines.dark.length) parts.push(rule(`.dark .${component}`, lines.dark));
    return wrap(parts.join("\n"));
  }

  // src/lib/tokens/dtcg.ts
  var EXTENSION_KEY = "uk.ac.ual.tokens";
  var LAYERS = ["primitive", "semantic", "component"];
  var KINDS = ["color", "spacing", "sizing", "typography", "radius", "border", "shadow", "motion"];
  var isToken = (v) => typeof v === "object" && v !== null && "$value" in v;
  function dtcgType(t) {
    const composite = isComposite(defaultValue(t));
    switch (t.kind) {
      case "color":
        return "color";
      case "shadow":
        return "shadow";
      case "border":
        return composite ? "border" : "dimension";
      case "motion":
        return t.name.startsWith("ease") ? "cubicBezier" : "duration";
      case "typography":
        if (composite) return "typography";
        if (t.name.startsWith("font-family")) return "fontFamily";
        if (t.name.startsWith("font-weight")) return "fontWeight";
        if (t.name.startsWith("line-height")) return "number";
        return "dimension";
      default:
        return "dimension";
    }
  }
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
            values: { [defaultMode({ layer, kind })]: parseValue(raw.$value) },
            status: (_d = ext.status) != null ? _d : "active"
          };
          if (layer === "component") token.component = groupKey;
          for (const m of modesOf(token).slice(1)) {
            const v = (_e = ext.modes) == null ? void 0 : _e[m.key];
            if (v !== void 0) token.values[m.key] = parseValue(v);
          }
          if (raw.$description) token.description = raw.$description;
          if (ext.figma) token.figma = ext.figma;
          tokens.push(token);
        }
      }
    }
    return { tokens };
  }
  var groupOf = (t) => {
    var _a;
    return t.layer === "component" ? (_a = t.component) != null ? _a : "unassigned" : t.kind;
  };
  function serialiseDtcg(set, description) {
    var _a;
    const pathOf = new Map(set.tokens.map((t) => [t.name, `${t.layer}.${groupOf(t)}.${t.name}`]));
    const simple = (v) => {
      var _a2;
      if (isReference(v)) return `{${(_a2 = pathOf.get(v.ref)) != null ? _a2 : v.ref}}`;
      return v;
    };
    const value = (v) => {
      if (isComposite(v)) return Object.fromEntries(Object.entries(v).map(([k, p]) => [k, simple(p)]));
      return simple(v);
    };
    const out = {};
    if (description) out.$description = description;
    for (const layer of LAYERS) {
      const layerTokens = set.tokens.filter((t) => t.layer === layer);
      if (!layerTokens.length) continue;
      const layerGroup = {};
      for (const t of layerTokens) {
        const g = groupOf(t);
        (_a = layerGroup[g]) != null ? _a : layerGroup[g] = {};
        const entry = { $type: dtcgType(t), $value: value(defaultValue(t)) };
        if (t.description) entry.$description = t.description;
        const ext = { kind: t.kind, status: t.status };
        const others = modesOf(t).slice(1).filter((m) => t.values[m.key] !== void 0);
        if (others.length) ext.modes = Object.fromEntries(others.map((m) => [m.key, value(t.values[m.key])]));
        if (t.figma) ext.figma = t.figma;
        entry.$extensions = { [EXTENSION_KEY]: ext };
        layerGroup[g][t.name] = entry;
      }
      out[layer] = layerGroup;
    }
    return out;
  }

  // src/lib/figma/scan-view.ts
  var title4 = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  function swatchOf(source, mode) {
    var _a;
    const c = colourIn(source, mode);
    if (!c) return null;
    const hex = rgbaToHex(c);
    let label = hex;
    if (source.kind === "semantic" || source.kind === "component") label = (_a = source[mode].primitive) != null ? _a : hex;
    if (source.kind === "primitive") label = source.token;
    if (source.kind === "raw") label = source.value.primitive ? `${hex} (${source.value.primitive})` : hex;
    return { hex, label };
  }
  function layerView(l) {
    const darkFromCopy = l.darkSource ? swatchOf(l.darkSource, "dark") : null;
    const darkLabel = l.darkSource && sourceLabel(l.darkSource) !== sourceLabel(l.source) ? sourceLabel(l.darkSource) : void 0;
    return {
      variant: l.paint.variant,
      state: l.paint.state,
      layer: l.paint.layerName,
      category: l.category,
      paint: l.paint.paint === "fills" ? "Fill" : "Stroke",
      kind: l.source.kind,
      label: sourceLabel(l.source),
      light: swatchOf(l.source, "light"),
      dark: darkFromCopy != null ? darkFromCopy : swatchOf(l.source, "dark"),
      darkLabel,
      noMatch: l.noMatch,
      sameInBoth: l.sameInBoth
    };
  }
  function primitiveSwatches(vars) {
    const index = variablesToTokenSet(vars);
    const byName = new Map(index.tokens.map((t) => [t.name, t]));
    const hexOf = (name, seen2 = []) => {
      const t = byName.get(name);
      const v = t == null ? void 0 : t.values.value;
      if (typeof v === "string") return v;
      if (v && typeof v === "object" && "ref" in v && typeof v.ref === "string" && !seen2.includes(v.ref)) return hexOf(v.ref, [...seen2, name]);
      return null;
    };
    const seen = /* @__PURE__ */ new Set();
    return localFirst(vars).filter((v) => v.layer === "primitive" && !seen.has(v.token) && seen.add(v.token)).map((v) => {
      var _a;
      return { label: v.token, hex: (_a = hexOf(v.token)) != null ? _a : "" };
    }).filter((s) => s.hex).sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));
  }
  function scanView(result, vars) {
    return {
      status: result.status,
      title: result.title,
      component: result.component,
      variants: result.variants,
      darkName: result.darkName,
      layers: result.layers.map(layerView),
      unknown: result.unknown.map(layerView),
      changes: result.changes.map((c) => ({ before: layerView(c.layer), token: c.token, reused: c.reused })),
      tokens: result.tokens.map((t) => ({
        name: t.name,
        figmaName: t.figmaName,
        figmaPath: t.figmaPath,
        group: title4(t.category),
        published: t.published,
        source: t.source,
        light: t.light,
        dark: t.dark,
        needsDark: t.needsDark,
        needsLight: t.needsLight,
        fromDarkCopy: t.fromDarkCopy
      })),
      issues: result.issues,
      primitives: primitiveSwatches(vars)
    };
  }
  function donePreview(result, vars, choices = {}) {
    const tokens = draftsToTokens(withChoices(result.tokens, choices)).map((t) => __spreadProps(__spreadValues({}, t), {
      description: `Made by the component scan in Figma.`
    }));
    const context = variablesToTokenSet(vars);
    const primitives = context.tokens.filter((t) => t.layer === "primitive");
    const css = componentCss({ tokens: [...primitives, ...tokens] }, result.component);
    return { tokens, json: serialiseDtcg({ tokens }, `Component tokens for ${result.title}, made by the component scan in Figma.`), css };
  }
  var STATE_ORDER = ["default", "hover", "pressed", "disabled", "selected", "loading", "on", "off"];
  var rankOf = (s) => STATE_ORDER.indexOf(s) === -1 ? STATE_ORDER.length : STATE_ORDER.indexOf(s);
  var CAT_ORDER = ["surface", "line", "content", "icon"];
  function tokenMap(result, vars, choices = {}) {
    var _a, _b, _c, _d;
    const prims = primitiveSwatches(vars);
    const sw = (name) => {
      var _a2;
      return name ? (_a2 = prims.find((p) => p.label === name)) != null ? _a2 : null : null;
    };
    const tokens = new Map(withChoices(result.tokens, choices).map((t) => [t.name, t]));
    const states = [...new Set(result.changes.map((c) => c.layer.paint.state))].sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b));
    const rows = /* @__PURE__ */ new Map();
    for (const c of result.changes) {
      const p = c.layer.paint;
      const category = c.layer.category;
      const key = [category, p.role].filter(Boolean).join("|");
      const row = (_a = rows.get(key)) != null ? _a : { key, category, role: p.role, label: [title4(category), p.role ? `(${p.role})` : ""].filter(Boolean).join(" "), cells: states.map(() => null) };
      const i = states.indexOf(p.state);
      const t = tokens.get(c.token);
      const before = layerView(c.layer);
      const cell = (_c = row.cells[i]) != null ? _c : {
        state: p.state,
        token: c.token,
        reused: c.reused,
        published: !!(t == null ? void 0 : t.published),
        light: sw(t == null ? void 0 : t.light),
        dark: sw(t == null ? void 0 : t.dark),
        beforeLight: { label: before.label, swatch: before.light },
        beforeDark: { label: (_b = before.darkLabel) != null ? _b : before.label, swatch: before.dark },
        needsLight: !!t && t.needsLight && !t.light,
        needsDark: !!t && t.needsDark && !t.dark,
        layers: []
      };
      cell.layers.push({ nodeId: p.nodeId, darkNodeId: (_d = p.dark) == null ? void 0 : _d.nodeId, name: p.layerName, paint: p.paint === "fills" ? "Fill" : "Stroke", key: `${p.layerName}|${p.paint}`, category });
      row.cells[i] = cell;
      rows.set(key, row);
    }
    const ordered = [...rows.values()].sort((a, b) => {
      var _a2, _b2;
      return ((_a2 = a.role) != null ? _a2 : "").localeCompare((_b2 = b.role) != null ? _b2 : "") || CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category);
    });
    return { states, rows: ordered };
  }

  // figma-plugin/src/code.ts
  var SETTINGS = "token-library-settings";
  var PENDING = "token-library-scan-pending";
  var api = () => figma.variables;
  var lastPlan = null;
  var lastNames = DEFAULT_COLLECTION_NAMES;
  figma.showUI(__html__, { width: 480, height: 680, themeColors: true, title: "Token Library" });
  var scanApi = () => figma.variables;
  var SWAPS = "token-library-dark-copies";
  var scan = null;
  var options = { pair: "", parts: {} };
  var locked = false;
  function setOf(node) {
    let n = node;
    while (n && n.type !== "COMPONENT_SET") n = n.parent;
    return n != null ? n : null;
  }
  async function modeIds() {
    const cs = await figma.variables.getLocalVariableCollectionsAsync();
    const of = (re) => cs.flatMap((c) => c.modes.filter((m) => re.test(m.name)).map((m) => m.modeId));
    return { dark: of(/dark/i), light: of(/light/i) };
  }
  function setFor(node) {
    const around = setOf(node);
    if (around) return around;
    if (typeof node.findAllWithCriteria === "function") {
      const inside = node.findAllWithCriteria({ types: ["COMPONENT_SET"] });
      if (inside.length === 1) return inside[0];
    }
    return null;
  }
  var lastPair = null;
  async function picked() {
    var _a, _b, _c;
    const sel = figma.currentPage.selection;
    if (!sel.length) return { set: null, dark: null, message: "Select your light and dark component sets on the canvas." };
    const tops = [];
    for (const n of sel) {
      const top = (_a = setOf(n)) != null ? _a : n;
      if (!tops.includes(top)) tops.push(top);
    }
    if (tops.length > 2) return { set: null, dark: null, message: "Select only 2 things: the light component set and the dark one." };
    if (tops.length === 1) {
      lastPair = null;
      const set2 = setFor(tops[0]);
      return set2 ? { set: set2, dark: null } : { set: null, dark: null, message: "This is not a component set. Select your light and dark component sets." };
    }
    const swaps = (_b = await figma.clientStorage.getAsync(SWAPS)) != null ? _b : {};
    const pairKey = [tops[0].id, tops[1].id].sort().join("|");
    let i;
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
    return { set, dark: (_c = setFor(tops[i])) != null ? _c : tops[i], guessed };
  }
  async function pictures(nodes) {
    const out = [];
    for (const n of nodes) {
      let bytes = null;
      try {
        bytes = await n.exportAsync({ format: "PNG", constraint: { type: "HEIGHT", value: 96 } });
      } catch (e) {
        bytes = null;
      }
      out.push({ id: n.id, bytes });
    }
    return out;
  }
  var variantsOf = (n) => {
    var _a;
    return ((_a = n == null ? void 0 : n.children) != null ? _a : []).filter((c) => n.type === "COMPONENT_SET" ? c.type === "COMPONENT" : c.type !== "TEXT");
  };
  async function rescan(withPictures = true) {
    var _a, _b, _c, _d;
    let set;
    let dark;
    let guessed = false;
    if (locked && scan) {
      set = await figma.getNodeByIdAsync(scan.set.id);
      dark = scan.dark ? await figma.getNodeByIdAsync(scan.dark.id) : null;
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
    const pair = `${set.id}|${(_a = dark == null ? void 0 : dark.id) != null ? _a : ""}`;
    if (options.pair !== pair) options = { pair, parts: {} };
    const defs = Object.entries((_b = set.componentPropertyDefinitions) != null ? _b : {}).filter(([, d]) => d.type === "VARIANT");
    const hasState = defs.some(([n]) => n.trim().toLowerCase() === "state");
    const states = hasState ? void 0 : __spreadValues(__spreadValues({}, guessStates(set)), (_c = options.states) != null ? _c : {});
    const input = await readComponentSet(scanApi(), set, { names: lastNames, dark, states });
    const name = (_d = options.name) != null ? _d : suggestComponentName(set.name);
    input.componentName = name;
    const result = scanComponent(input, void 0, options.parts);
    const choices = scan && scan.set.id === set.id ? scan.choices : {};
    scan = { set, dark, input, result, choices, namedStates: !hasState };
    const lightVariants = variantsOf(set);
    const check = {
      light: { id: set.id, name: set.name, variants: lightVariants.map((v) => ({ id: v.id, name: v.name })) },
      dark: dark ? { id: dark.id, name: dark.name, variants: variantsOf(dark).map((v) => ({ id: v.id, name: v.name })) } : null,
      guessed,
      name,
      suggestedName: suggestComponentName(set.name),
      hasStateProperty: hasState,
      states: lightVariants.map((v) => {
        var _a2, _b2;
        return { id: v.id, name: v.name, state: (_b2 = (_a2 = input.variants.find((x) => x.id === v.id)) == null ? void 0 : _a2.state) != null ? _b2 : "" };
      })
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
      locked
    });
  }
  figma.on("selectionchange", () => {
    if (locked) return;
    void rescan().catch((e) => figma.ui.postMessage({ type: "scan-error", message: e instanceof Error ? e.message : String(e) }));
  });
  figma.ui.onmessage = async (msg) => {
    var _a, _b, _c, _d, _e, _f;
    try {
      if (msg.type === "init") {
        const settings = (_a = await figma.clientStorage.getAsync(SETTINGS)) != null ? _a : {};
        const pending = (_b = await figma.clientStorage.getAsync(PENDING)) != null ? _b : null;
        figma.ui.postMessage({ type: "settings", settings, fileName: figma.root.name, pending });
      }
      if (msg.type === "save-settings") {
        await figma.clientStorage.setAsync(SETTINGS, msg.settings);
      }
      if (msg.type === "plan") {
        lastNames = DEFAULT_COLLECTION_NAMES;
        const set = parseDtcg(msg.tokens);
        const { specs, skipped } = buildSpecs(set, { includeDrafts: !!msg.includeDrafts });
        lastPlan = planSync(specs, await readExisting(api(), lastNames), skipped);
        figma.ui.postMessage({
          type: "plan",
          plan: {
            add: lastPlan.add.map((s) => ({ token: s.token, name: s.name, collection: lastNames[s.collection] })),
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
      if (msg.type === "resize") figma.ui.resize(msg.width, msg.height);
      if (msg.type === "scan-selection") await rescan();
      if (msg.type === "scan-lock") {
        locked = !!msg.locked;
        if (!locked) await rescan();
      }
      if (msg.type === "scan-options") {
        options = __spreadValues(__spreadValues(__spreadValues(__spreadValues({}, options), msg.name !== void 0 ? { name: msg.name || void 0 } : {}), msg.states ? { states: msg.states } : {}), msg.parts ? { parts: __spreadValues(__spreadValues({}, options.parts), msg.parts) } : {});
        await rescan(false);
      }
      if (msg.type === "scan-swap") {
        if (!lastPair) throw new Error("Select both the light and the dark component sets first.");
        const swaps = (_c = await figma.clientStorage.getAsync(SWAPS)) != null ? _c : {};
        swaps[lastPair.key] = lastPair.tops.find((id) => id !== lastPair.darkTop);
        await figma.clientStorage.setAsync(SWAPS, swaps);
        options = { pair: "", parts: {} };
        await rescan();
      }
      if (msg.type === "scan-choices") {
        if (!scan) throw new Error("Select your component sets again.");
        scan.choices = (_d = msg.choices) != null ? _d : {};
        await rescan(false);
      }
      if (msg.type === "scan-show") {
        const nodes = [];
        for (const id of (_e = msg.nodeIds) != null ? _e : []) {
          const n = await figma.getNodeByIdAsync(id);
          if (n) nodes.push(n);
        }
        if (nodes.length) {
          figma.currentPage.selection = nodes;
          figma.viewport.scrollAndZoomIntoView(nodes);
        }
      }
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
      if (msg.type === "scan-bind") {
        if (!scan) throw new Error("Select your component sets again.");
        const result = await bindScan(scanApi(), scan.set, scan.result, { names: lastNames, dark: scan.dark });
        const named = scan.namedStates ? writeStates(scan.set, scan.dark, Object.fromEntries(scan.input.variants.map((v) => [v.id, v.state]))) : 0;
        figma.commitUndo();
        const preview = donePreview(scan.result, scan.input.variables, scan.choices);
        figma.ui.postMessage({ type: "scan-bound", result: __spreadProps(__spreadValues({}, result), { statesNamed: named }), preview, component: scan.result.component, title: scan.result.title, fileName: figma.root.name });
        figma.notify(`Token Library: ${result.layers + result.darkLayers} colours swapped for tokens in ${scan.result.title}.`);
      }
      if (msg.type === "scan-save-pending") await figma.clientStorage.setAsync(PENDING, (_f = msg.pending) != null ? _f : null);
      if (msg.type === "close") figma.closePlugin();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      figma.ui.postMessage({ type: typeof (msg == null ? void 0 : msg.type) === "string" && msg.type.startsWith("scan-") ? "scan-error" : "error", message });
    }
  };
})();
