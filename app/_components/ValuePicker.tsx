"use client";

import { useId, useState } from "react";
import {
  isReference,
  resolveToken,
  type Layer,
  type Mode,
  type SimpleValue,
  type Token,
  type TokenIndex,
} from "@/src/lib/tokens";
import { LAYER_LABEL, resolvedText, Swatch } from "./ui";

/**
 * Pick a value for 1 mode: either another token (F3) or a raw value.
 * Shows what the chosen token resolves to, so references stay references
 * while the person can still see the final value.
 */
export function ValuePicker({
  label,
  value,
  onChange,
  candidates,
  index,
  mode,
  allowRaw,
  allowRef,
  rawPlaceholder,
}: {
  label: string;
  value: SimpleValue | "";
  onChange: (v: SimpleValue | "") => void;
  candidates: Token[];
  index: TokenIndex;
  mode: Mode;
  allowRaw: boolean;
  allowRef: boolean;
  rawPlaceholder?: string;
}) {
  const id = useId();
  const [kind, setKind] = useState<"ref" | "raw">(isReference(value) || (value === "" && allowRef) ? "ref" : "raw");
  const current = kind === "ref" && !allowRef ? "raw" : kind === "raw" && !allowRaw ? "ref" : kind;

  const refName = isReference(value) ? value.ref : "";
  const resolved = refName ? resolveToken(index, refName, mode) : null;
  const layers: Layer[] = ["primitive", "semantic"];

  return (
    <div className="picker">
      <div className="picker-head">
        <label htmlFor={id} className="lbl">
          {label}
        </label>
        {allowRaw && allowRef ? (
          <div className="seg" role="group" aria-label={`${label}: value type`}>
            <button type="button" aria-pressed={current === "ref"} onClick={() => { setKind("ref"); onChange(""); }}>
              Token
            </button>
            <button type="button" aria-pressed={current === "raw"} onClick={() => { setKind("raw"); onChange(""); }}>
              Raw value
            </button>
          </div>
        ) : null}
      </div>
      {current === "ref" ? (
        <>
          <select id={id} value={refName} onChange={(e) => onChange(e.target.value ? { ref: e.target.value } : "")}>
            <option value="">Pick a token</option>
            {layers.map((l) => {
              const opts = candidates.filter((c) => c.layer === l);
              if (!opts.length) return null;
              return (
                <optgroup key={l} label={LAYER_LABEL[l]}>
                  {opts.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                      {c.status === "deprecated" ? " (deprecated)" : ""}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {resolved ? (
            <div className="resolved-line">
              <Swatch value={resolved.value} />
              {resolved.error ? <span className="err">Broken reference</span> : <span>Resolves to {resolvedText(resolved.value)}</span>}
            </div>
          ) : null}
        </>
      ) : (
        <div className="raw-row">
          <input
            id={id}
            type="text"
            value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
            placeholder={rawPlaceholder}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
          />
          <Swatch value={value} />
        </div>
      )}
    </div>
  );
}
