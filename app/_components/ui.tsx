"use client";

import { useEffect, useRef } from "react";
import {
  formatValue,
  isComposite,
  resolveToken,
  type Issue,
  type Mode,
  type Token,
  type TokenIndex,
} from "@/src/lib/tokens";

const HEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

export function Swatch({ value }: { value: unknown }) {
  if (typeof value !== "string" || !HEX.test(value)) return null;
  return <span className="sw" style={{ background: value }} aria-hidden="true" />;
}

/** Raw value as text, for any resolved value. */
export function resolvedText(v: unknown): string {
  if (v === null || v === undefined) return "unresolved";
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, p]) => `${k}: ${String(p)}`)
      .join(", ");
  }
  return String(v);
}

/** A token's value in 1 mode: the reference (if any) and what it resolves to. */
export function ValueCell({ token, mode, index }: { token: Token; mode: Mode; index: TokenIndex }) {
  const v = mode === "dark" ? token.values.dark : token.values.light;
  if (v === undefined) return <span className="muted">same as light</span>;
  const r = resolveToken(index, token.name, mode);
  if (isComposite(v)) {
    // 1 line per part, so long composite values do not stretch the table.
    const resolved = (r.value ?? {}) as Record<string, unknown>;
    return (
      <span className="composite-cell">
        {Object.entries(v).map(([k, p]) => (
          <span key={k} className="value">
            <span className="part">{k}</span>
            <Swatch value={resolved[k]} />
            <span className="ref">{formatValue(p)}</span>
          </span>
        ))}
      </span>
    );
  }
  const own = formatValue(v);
  const resolved = resolvedText(r.value);
  const isRef = own.startsWith("{");
  return (
    <span className="value">
      <Swatch value={r.value} />
      {isRef ? (
        <>
          <span className="ref">{own}</span>
          <span className={r.error ? "resolved err" : "resolved"}>{r.error ? "broken reference" : resolved}</span>
        </>
      ) : (
        <span>{own}</span>
      )}
    </span>
  );
}

export function IssueList({ issues, empty }: { issues: Issue[]; empty?: string }) {
  if (!issues.length) return empty ? <div className="issue clear">{empty}</div> : null;
  const order = { error: 0, warning: 1, info: 2 };
  return (
    <ul className="issues" aria-live="polite">
      {[...issues]
        .sort((a, b) => order[a.severity] - order[b.severity])
        .map((i, n) => (
          <li key={n} className={`issue ${i.severity}`}>
            <span className="sev">{i.severity === "info" ? "note" : i.severity}</span> {i.message}
          </li>
        ))}
    </ul>
  );
}

/** A modal dialog using the native <dialog> element, which handles focus and Escape. */
export function Dialog({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className={wide ? "dialog wide" : "dialog"} onClose={onClose} aria-labelledby="dialog-title">
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}

export const LAYER_LABEL = { primitive: "Primitive", semantic: "Semantic", component: "Component" } as const;
export const KIND_LABEL = {
  color: "Colour",
  spacing: "Spacing",
  sizing: "Sizing",
  typography: "Typography",
  radius: "Radius",
  border: "Border",
  shadow: "Shadow",
} as const;

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
