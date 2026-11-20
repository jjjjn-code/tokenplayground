"use client";

import { Fragment, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  checkBeforeSave,
  columnSetOf,
  cssVariableName,
  indexTokens,
  isComposite,
  LAYER_RANK,
  modesOf,
  namePrefixes,
  normaliseValues,
  normaliseTokenInput,
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

// Semantic type tokens are fluid (1 size for min and 1 for max), so only borders and shadows start with several parts.
const isCompositeShape = (layer: Layer, kind: Kind) => layer === "semantic" && (kind === "border" || kind === "shadow");

function emptyValue(layer: Layer, kind: Kind): TokenValue {
  if (isCompositeShape(layer, kind)) return Object.fromEntries(PARTS[kind]!.map((p) => [p, ""]));
  return "";
}

/** Kinds whose tokens are sizes and may refer to each other. */
const SIZE_KINDS: Kind[] = ["spacing", "sizing", "typography"];

/**
 * Empty values for a new token: every column of its column set. Borders and
 * shadows start with the light value only; dark is added when it differs.
 */
function emptyValues(layer: Layer, kind: Kind): Record<Mode, TokenValue> {
  const modes = modesOf({ layer, kind });
  const optionalDark = columnSetOf({ layer, kind }) === "theme" && kind !== "color";
  return Object.fromEntries((optionalDark ? modes.slice(0, 1) : modes).map((m) => [m.key, emptyValue(layer, kind)]));
}

/**
 * Create a primitive or semantic token, or edit any token (F2, F3).
 * Every change is checked by the rules engine; errors block saving.
 */
export function TokenEditor({
  token,
  onDone,
  initialLayer,
  initialKind,
}: {
  token?: Token;
  onDone: (saved?: Token) => void;
  /** For a new token: start in this layer and type, for example from "Create token" in a group. */
  initialLayer?: Layer;
  initialKind?: Kind;
}) {
  const { set, saveTokens } = useStore();
  const editing = !!token;
  const index = useMemo(() => indexTokens(set), [set]);

  const startLayer: Layer = token?.layer ?? (initialLayer === "primitive" ? "primitive" : "semantic");
  const startKind: Kind = token?.kind ?? initialKind ?? "color";
  const [layer, setLayer] = useState<Layer>(startLayer);
  const [kind, setKind] = useState<Kind>(startKind);
  const [name, setName] = useState(token?.name ?? "");
  const [values, setValues] = useState<Record<Mode, TokenValue>>(
    token ? normaliseValues(token).values : emptyValues(startLayer, startKind),
  );
  const setMode = (m: Mode) => (v: TokenValue) => setValues((x) => ({ ...x, [m]: v }));
  const [status, setStatus] = useState<Token["status"]>(token?.status ?? "active");
  const [description, setDescription] = useState(token?.description ?? "");
  const [reason, setReason] = useState("");
  // Messages wait until the person finishes: after leaving the name field
  // (name messages only) or pushing Create or Save (all messages).
  const [reveal, setReveal] = useState<"none" | "name" | "all">("none");
  const typedName = () => setReveal("none");
  const leftName = (e: React.FocusEvent) => {
    // Moving to Create or Cancel is not "finished typing": showing a message
    // then would move the button away from the pointer.
    const to = e.relatedTarget as HTMLElement | null;
    if (to?.closest("[data-form-action]")) return;
    setReveal((r) => (r === "none" ? "name" : r));
  };
  const [category, setCategory] = useState<string>("surface");
  const [variant, setVariant] = useState("");

  const modes = modesOf({ layer, kind });
  // Borders and shadows may use the light value in dark mode; everything else fills every column.
  const darkOptional = columnSetOf({ layer, kind }) === "theme" && kind !== "color";

  const changeShape = (l: Layer, k: Kind) => {
    setLayer(l);
    setKind(k);
    setValues(emptyValues(l, k));
  };

  const guidedSemantic = !editing && layer === "semantic" && kind === "color";
  const finalName = guidedSemantic ? (variant ? `${category}-${variant}` : "") : name.trim();

  const draft: Token = {
    name: finalName,
    layer,
    kind,
    values,
    status,
    ...(token?.component ? { component: token.component } : {}),
    ...(description.trim() ? { description: description.trim() } : {}),
  };

  const { ok, issues } = checkBeforeSave(set, [draft], editing ? [token!.name] : []);
  const unchanged = editing && JSON.stringify(draft) === JSON.stringify(token);

  const refCandidates = (anyKind: boolean) =>
    set.tokens.filter(
      (t) =>
        // Primitives may point to other primitives, for example a base size.
        (layer === "primitive" ? t.layer === "primitive" : LAYER_RANK[t.layer] < LAYER_RANK[layer]) &&
        (anyKind || t.kind === kind || (SIZE_KINDS.includes(t.kind) && SIZE_KINDS.includes(kind))) &&
        t.name !== finalName &&
        (t.status !== "deprecated" || t.name === token?.name),
    );

  const renderValue = (mode: Mode, value: TokenValue, onChange: (v: TokenValue) => void) => {
    const label = modes.find((m) => m.key === mode)?.label ?? mode;
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
          allowRef
        />
      </div>
    );
  };

  const save = () => {
    if (!ok || !finalName || unchanged) {
      setReveal("all");
      return;
    }
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
                onChange={(e) => { setVariant(normaliseTokenInput(e.target.value)); typedName(); }} onBlur={leftName} autoComplete="off" />
              <datalist id="variants">
                {SEMANTIC_VARIANTS.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
            <p className="text-xs text-muted-foreground">Pattern: [category]-[variant]. Always write -default.</p>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="ed-name">Name</Label>
            <Input id="ed-name" value={name} onChange={(e) => { setName(normaliseTokenInput(e.target.value)); typedName(); }} onBlur={leftName} className="font-mono" autoComplete="off"
              placeholder={kind === "color" ? "orange-700" : `${namePrefixes(layer, kind)[0]}-name`} />
            <p className="text-xs text-muted-foreground">
              {kind === "color"
                ? "Pattern: [colour]-[step], for example orange-700. Leave out the --color- prefix."
                : `Provisional rule: start with ${namePrefixes(layer, kind).map((p) => `${p}-`).join(" or ")}.`}
            </p>
          </div>
        )
      ) : null}

      <div className="grid gap-4">
        {modes.map((m, i) => {
          const v = values[m.key];
          if (v === undefined) {
            // Only an optional dark value can be empty here.
            return (
              <Button key={m.key} type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setMode(m.key)(structuredClone(values[modes[0].key]))}>
                Add a different {m.label.toLowerCase()} value
              </Button>
            );
          }
          const first = modes[0];
          return (
            <Fragment key={m.key}>
              {renderValue(m.key, v, setMode(m.key))}
              {i > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setMode(m.key)(structuredClone(values[first.key]))}>
                    <Copy className="size-3.5" /> Copy {first.label.toLowerCase()} into {m.label.toLowerCase()}
                  </Button>
                  {darkOptional ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setValues((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== m.key)))}>
                      Use the {first.label.toLowerCase()} value in {m.label.toLowerCase()} mode
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Fragment>
          );
        })}
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

      {finalName && reveal !== "none" ? (
        <div className="rounded-lg border bg-muted/40 p-3">
          <IssueList
            issues={reveal === "all" ? issues : issues.filter((i) => i.code.startsWith("name"))}
            okText={reveal === "all" ? "No problems found." : "The name is correct."}
          />
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onDone()} data-form-action>Cancel</Button>
        <Button type="submit" disabled={!finalName || unchanged} data-form-action>{editing ? "Save changes" : "Create token"}</Button>
      </div>
    </form>
  );
}
