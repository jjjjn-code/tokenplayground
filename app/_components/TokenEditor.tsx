"use client";

import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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
import { KIND_ORDER, KIND_TITLE } from "../_lib/sets";
import { IssueList } from "./ui";
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
  const unchanged = editing && JSON.stringify(draft) === JSON.stringify(token);

  const refCandidates = (anyKind: boolean) =>
    set.tokens.filter(
      (t) =>
        LAYER_RANK[t.layer] < LAYER_RANK[layer] &&
        (anyKind || t.kind === kind) &&
        t.name !== finalName &&
        (t.status !== "deprecated" || t.name === token?.name),
    );

  const renderValue = (mode: Mode, value: TokenValue, onChange: (v: TokenValue) => void) => {
    const label = mode === "light" ? (darkAllowed ? "Light" : "Value") : "Dark";
    if (isComposite(value)) {
      const c = value as CompositeValue;
      return (
        <fieldset className="rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">{label}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.keys(c).map((p) => (
              <div key={p} className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{PART_LABEL[p] ?? p}</Label>
                <ValuePicker
                  label={`${label} ${PART_LABEL[p] ?? p}`}
                  value={c[p] as SimpleValue | ""}
                  onChange={(v) => onChange({ ...c, [p]: v as SimpleValue })}
                  candidates={refCandidates(true)}
                  index={index}
                  mode={mode}
                  allowRaw
                  allowRef
                />
              </div>
            ))}
          </div>
        </fieldset>
      );
    }
    return (
      <div className="grid gap-1.5">
        <Label>{label}</Label>
        <ValuePicker
          label={label}
          value={value as SimpleValue | ""}
          onChange={(v) => onChange(v as TokenValue)}
          candidates={refCandidates(false)}
          index={index}
          mode={mode}
          allowRaw={layer !== "component"}
          allowRef={layer !== "primitive"}
        />
      </div>
    );
  };

  const save = () => {
    if (!ok || !finalName || unchanged) return;
    saveTokens([draft], editing ? [token!.name] : [], reason);
    onDone(draft);
  };

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {!editing ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ed-layer">Layer</Label>
            <Select value={layer} onValueChange={(v) => changeShape(v as Layer, kind)}>
              <SelectTrigger id="ed-layer" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="primitive">Primitive</SelectItem>
                <SelectItem value="semantic">Semantic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ed-kind">Type</Label>
            <Select value={kind} onValueChange={(v) => changeShape(layer, v as Kind)}>
              <SelectTrigger id="ed-kind" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KIND_ORDER.map((k) => <SelectItem key={k} value={k}>{KIND_TITLE[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <p className="font-mono text-xs text-muted-foreground">{cssVariableName(token!)}</p>
      )}

      {!editing ? (
        guidedSemantic ? (
          <div className="grid gap-1.5">
            <Label htmlFor="ed-var">Name</Label>
            <div className="flex items-center gap-2">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-32 font-mono" aria-label="Category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEMANTIC_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="font-mono">{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">-</span>
              <Input id="ed-var" list="variants" value={variant} placeholder="variant, for example brand" className="font-mono"
                onChange={(e) => setVariant(e.target.value.toLowerCase().replace(/\s+/g, "-"))} autoComplete="off" />
              <datalist id="variants">
                {SEMANTIC_VARIANTS.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
            <p className="text-xs text-muted-foreground">Pattern: [category]-[variant]. Always write -default.</p>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="ed-name">Name</Label>
            <Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} className="font-mono" autoComplete="off"
              placeholder={kind === "color" ? "orange-700" : `${NON_COLOUR_PREFIXES[kind as Exclude<Kind, "color">][0]}-name`} />
            <p className="text-xs text-muted-foreground">
              {kind === "color"
                ? "Pattern: [colour]-[step], for example orange-700. Leave out the --color- prefix."
                : `Provisional rule: start with ${NON_COLOUR_PREFIXES[kind as Exclude<Kind, "color">].map((p) => `${p}-`).join(" or ")}.`}
            </p>
          </div>
        )
      ) : null}

      <div className="grid gap-4">
        {renderValue("light", light, setLight)}
        {darkAllowed ? (
          dark !== undefined ? (
            <>
              {renderValue("dark", dark, setDark)}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setDark(structuredClone(light))}>
                  <Copy className="size-3.5" /> Copy light into dark
                </Button>
                {!colourNeedsDark ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDark(undefined)}>Use the light value in dark mode</Button>
                ) : null}
              </div>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setDark(structuredClone(light))}>
              Add a different dark value
            </Button>
          )
        ) : null}
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        {editing ? (
          <div className="grid gap-1.5">
            <Label htmlFor="ed-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Token["status"])}>
              <SelectTrigger id="ed-status" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                {token!.status === "deprecated" ? <SelectItem value="deprecated">Deprecated</SelectItem> : null}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className={editing ? "grid gap-1.5" : "grid gap-1.5 sm:col-span-2"}>
          <Label htmlFor="ed-desc">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="ed-desc" value={description} onChange={(e) => setDescription(e.target.value)} autoComplete="off" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="ed-reason">Reason for this change <span className="font-normal text-muted-foreground">(optional, saved in the history)</span></Label>
          <Input id="ed-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
        </div>
      </div>

      {finalName ? (
        <div className="rounded-lg border bg-muted/40 p-3">
          <IssueList issues={issues} okText="No problems found." />
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onDone()}>Cancel</Button>
        <Button type="submit" disabled={!ok || !finalName || unchanged}>{editing ? "Save changes" : "Create token"}</Button>
      </div>
    </form>
  );
}
