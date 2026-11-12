"use client";

import { useMemo, useState } from "react";
import {
  checkBeforeSave,
  cssVariableName,
  indexTokens,
  isComposite,
  LAYER_RANK,
  NON_COLOUR_PREFIXES,
  SEMANTIC_CATEGORIES,
  SEMANTIC_VARIANTS,
  type CompositeValue,
  type Kind,
  type Layer,
  type Mode,
  type SimpleValue,
  type Token,
  type TokenValue,
} from "@/src/lib/tokens";
import { useStore } from "../_lib/store";
import { IssueList, KIND_LABEL, LAYER_LABEL } from "./ui";
import { ValuePicker } from "./ValuePicker";

const PARTS: Partial<Record<Kind, string[]>> = {
  typography: ["fontFamily", "fontSize", "fontWeight", "lineHeight"],
  border: ["width", "style", "color"],
  shadow: ["offsetX", "offsetY", "blur", "spread", "color"],
};

const PART_LABEL: Record<string, string> = {
  fontFamily: "Font family",
  fontSize: "Font size",
  fontWeight: "Font weight",
  lineHeight: "Line height",
  width: "Width",
  style: "Style",
  color: "Colour",
  offsetX: "Offset X",
  offsetY: "Offset Y",
  blur: "Blur",
  spread: "Spread",
};

const RAW_HINT: Record<Kind, string> = {
  color: "#FF5000",
  spacing: "16px",
  sizing: "24px",
  typography: "16px",
  radius: "2px",
  border: "1px",
  shadow: "0px 2px 8px 0px #000000",
};

/** Typography, border and shadow tokens are composite in the semantic layer. */
const isCompositeShape = (layer: Layer, kind: Kind) => layer === "semantic" && !!PARTS[kind];

function emptyValue(layer: Layer, kind: Kind): TokenValue {
  if (isCompositeShape(layer, kind)) return Object.fromEntries(PARTS[kind]!.map((p) => [p, ""]));
  return "";
}

/**
 * Create a primitive or semantic token, or edit any token (F2, F3).
 * Every change is checked by the rules engine; errors block saving.
 */
export function TokenEditor({ token, onDone }: { token?: Token; onDone: (saved?: Token) => void }) {
  const { set, saveTokens } = useStore();
  const editing = !!token;
  const index = useMemo(() => indexTokens(set), [set]);

  const [layer, setLayer] = useState<Layer>(token?.layer ?? "semantic");
  const [kind, setKind] = useState<Kind>(token?.kind ?? "color");
  const [name, setName] = useState(token?.name ?? "");
  const [light, setLight] = useState<TokenValue>(token?.values.light ?? emptyValue("semantic", "color"));
  const [dark, setDark] = useState<TokenValue | undefined>(token ? token.values.dark : "");
  const [status, setStatus] = useState<Token["status"]>(token?.status ?? "draft");
  const [description, setDescription] = useState(token?.description ?? "");
  const [reason, setReason] = useState("");

  // Guided name parts for semantic colours.
  const [category, setCategory] = useState<string>("surface");
  const [variant, setVariant] = useState("");

  const colourNeedsDark = kind === "color" && layer !== "primitive";
  const darkAllowed = layer !== "primitive";

  const changeShape = (l: Layer, k: Kind) => {
    setLayer(l);
    setKind(k);
    setLight(emptyValue(l, k));
    setDark(l === "primitive" ? undefined : k === "color" ? emptyValue(l, k) : undefined);
  };

  const guidedSemantic = !editing && layer === "semantic" && kind === "color";
  const finalName = guidedSemantic ? (variant ? `${category}-${variant}` : "") : name.trim();

  const draft: Token = {
    name: finalName,
    layer,
    kind,
    values: { light, ...(dark !== undefined ? { dark } : {}) },
    status,
    ...(token?.component ? { component: token.component } : {}),
    ...(description.trim() ? { description: description.trim() } : {}),
  };

  const { ok, issues } = checkBeforeSave(set, [draft], editing ? [token!.name] : []);
  const unchanged = editing && JSON.stringify(draft) === JSON.stringify({ ...token, description: token!.description });

  /** Tokens this token may point to: lower layers only, same type for simple values. */
  const refCandidates = (anyKind: boolean) =>
    set.tokens.filter(
      (t) =>
        LAYER_RANK[t.layer] < LAYER_RANK[layer] &&
        (anyKind || t.kind === kind) &&
        t.name !== finalName &&
        (t.status !== "deprecated" || t.name === token?.name),
    );

  const renderValue = (mode: Mode, value: TokenValue, onChange: (v: TokenValue) => void) => {
    const label = mode === "light" ? (darkAllowed ? "Light value" : "Value") : "Dark value";
    if (isComposite(value)) {
      const c = value as CompositeValue;
      return (
        <fieldset className="composite">
          <legend className="lbl">{label}</legend>
          {Object.keys(c).map((p) => (
            <ValuePicker
              key={p}
              label={PART_LABEL[p] ?? p}
              value={c[p] as SimpleValue | ""}
              onChange={(v) => onChange({ ...c, [p]: v as SimpleValue })}
              candidates={refCandidates(true)}
              index={index}
              mode={mode}
              allowRaw
              allowRef
            />
          ))}
        </fieldset>
      );
    }
    return (
      <ValuePicker
        label={label}
        value={value as SimpleValue | ""}
        onChange={(v) => onChange(v as TokenValue)}
        candidates={refCandidates(false)}
        index={index}
        mode={mode}
        allowRaw={layer !== "component"}
        allowRef={layer !== "primitive"}
        rawPlaceholder={RAW_HINT[kind]}
      />
    );
  };

  const save = () => {
    if (!ok) return;
    saveTokens([draft], editing ? [token!.name] : [], reason);
    onDone(draft);
  };

  return (
    <form
      className="editor"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {!editing ? (
        <div className="grid2">
          <div>
            <label className="lbl" htmlFor="ed-layer">Layer</label>
            <select id="ed-layer" value={layer} onChange={(e) => changeShape(e.target.value as Layer, kind)}>
              <option value="primitive">{LAYER_LABEL.primitive}</option>
              <option value="semantic">{LAYER_LABEL.semantic}</option>
            </select>
            <p className="hint">Component tokens are created with the component flow.</p>
          </div>
          <div>
            <label className="lbl" htmlFor="ed-kind">Type</label>
            <select id="ed-kind" value={kind} onChange={(e) => changeShape(layer, e.target.value as Kind)}>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <p className="meta">
          <span className="tname">{token!.name}</span> · {LAYER_LABEL[token!.layer]} · {KIND_LABEL[token!.kind]} · <code>{cssVariableName(token!)}</code>
        </p>
      )}

      {!editing ? (
        guidedSemantic ? (
          <div className="grid2">
            <div>
              <label className="lbl" htmlFor="ed-cat">Category</label>
              <select id="ed-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                {SEMANTIC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="ed-var">Variant</label>
              <input id="ed-var" type="text" list="variants" value={variant} placeholder="default" onChange={(e) => setVariant(e.target.value.toLowerCase().replace(/\s+/g, "-"))} autoComplete="off" />
              <datalist id="variants">
                {SEMANTIC_VARIANTS.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
            <p className="hint full">Name: <span className="tname">{finalName || "category-variant"}</span></p>
          </div>
        ) : (
          <div>
            <label className="lbl" htmlFor="ed-name">Name</label>
            <input id="ed-name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off"
              placeholder={kind === "color" ? "orange-700" : `${NON_COLOUR_PREFIXES[kind as Exclude<Kind, "color">][0]}-name`} />
            <p className="hint">
              {kind === "color"
                ? "Pattern: [colour]-[step], for example orange-700. Leave out the --color- prefix."
                : `Provisional rule: start with ${NON_COLOUR_PREFIXES[kind as Exclude<Kind, "color">].map((p) => `${p}-`).join(" or ")}.`}
            </p>
          </div>
        )
      ) : null}

      {renderValue("light", light, setLight)}

      {darkAllowed ? (
        dark !== undefined ? (
          <>
            {renderValue("dark", dark, setDark)}
            <div className="bar">
              <button type="button" className="ghost" onClick={() => setDark(structuredClone(light))}>Copy light into dark</button>
              {!colourNeedsDark ? <button type="button" className="ghost" onClick={() => setDark(undefined)}>Use the light value in dark mode</button> : null}
            </div>
          </>
        ) : (
          <button type="button" className="ghost" onClick={() => setDark(structuredClone(light))}>Add a different dark value</button>
        )
      ) : null}

      {editing ? (
        <div>
          <label className="lbl" htmlFor="ed-status">Status</label>
          <select id="ed-status" value={status} onChange={(e) => setStatus(e.target.value as Token["status"])}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            {token!.status === "deprecated" ? <option value="deprecated">Deprecated</option> : null}
          </select>
        </div>
      ) : null}

      <div>
        <label className="lbl" htmlFor="ed-desc">Description (optional)</label>
        <input id="ed-desc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} autoComplete="off" />
      </div>
      <div>
        <label className="lbl" htmlFor="ed-reason">Reason for this change (optional, saved in the history)</label>
        <input id="ed-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
      </div>

      <IssueList issues={finalName ? issues : []} empty={finalName && ok ? "No problems found." : undefined} />

      <div className="bar end">
        <button type="button" className="ghost" onClick={() => onDone()}>Cancel</button>
        <button type="submit" className="primary" disabled={!ok || !finalName || unchanged}>
          {editing ? "Save changes" : "Create token"}
        </button>
      </div>
    </form>
  );
}
