"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  cssFileFor,
  cssVariableName,
  formatValue,
  indexTokens,
  isPublishedInFigma,
  lastChange,
  resolveToken,
  validateTokenSet,
  type Kind,
  type Layer,
  type Status,
  type Token,
} from "@/src/lib/tokens";
import { useStore } from "../_lib/store";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { TokenDetails, type DetailsTab } from "./TokenDetails";
import { TokenEditor } from "./TokenEditor";
import { Dialog, formatDate, KIND_LABEL, LAYER_LABEL, resolvedText, ValueCell } from "./ui";

/** Token overview (F1) with the context menu (F4). */
export function Overview() {
  const { set, history, deprecate, reactivate } = useStore();
  const params = useSearchParams();
  const index = useMemo(() => indexTokens(set), [set]);
  const issues = useMemo(() => validateTokenSet(set), [set]);

  const [q, setQ] = useState("");
  const [layer, setLayer] = useState<Layer | "">("");
  const [kind, setKind] = useState<Kind | "">("");
  const [component, setComponent] = useState(params.get("component") ?? "");
  const [status, setStatus] = useState<Status | "">("");

  const [selected, setSelected] = useState<string | null>(params.get("token"));
  const [tab, setTab] = useState<DetailsTab>("references");
  const [menu, setMenu] = useState<{ x: number; y: number; token: Token } | null>(null);
  const [editing, setEditing] = useState<Token | null>(null);
  const [statusChange, setStatusChange] = useState<Token | null>(null);
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const components = useMemo(
    () => [...new Set(set.tokens.map((t) => t.component).filter(Boolean) as string[])].sort(),
    [set],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return set.tokens.filter((t) => {
      if (layer && t.layer !== layer) return false;
      if (kind && t.kind !== kind) return false;
      if (component && t.component !== component) return false;
      if (status && t.status !== status) return false;
      if (!needle) return true;
      const hay = [
        t.name,
        cssVariableName(t),
        formatValue(t.values.light),
        formatValue(t.values.dark),
        resolvedText(resolveToken(index, t.name, "light").value),
        resolvedText(resolveToken(index, t.name, "dark").value),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [set, index, q, layer, kind, component, status]);

  const errorsFor = useCallback((name: string) => issues.filter((i) => i.token === name && i.severity !== "info"), [issues]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(`Copied ${text}`);
    } catch {
      setToast("Copy failed");
    }
  };

  const menuItems = (t: Token): MenuItem[] => [
    { label: "Copy name", onSelect: () => copy(t.name) },
    { label: "Copy code name", onSelect: () => copy(cssVariableName(t)) },
    { label: "View references", onSelect: () => { setSelected(t.name); setTab("references"); } },
    { label: "View history", onSelect: () => { setSelected(t.name); setTab("history"); } },
    { label: "Edit", onSelect: () => setEditing(t) },
    t.status === "deprecated"
      ? { label: "Make active again", onSelect: () => { setReason(""); setStatusChange(t); } }
      : { label: "Deprecate", onSelect: () => { setReason(""); setStatusChange(t); } },
  ];

  const selectedToken = selected ? set.tokens.find((t) => t.name === selected) ?? null : null;
  const anyFilter = q || layer || kind || component || status;
  const problems = issues.filter((i) => i.severity === "error").length;

  return (
    <div className={selectedToken ? "overview with-details" : "overview"}>
      <section className="table-area">
        <div className="filters" role="search">
          <div className="f-search">
            <label className="lbl" htmlFor="q">Search</label>
            <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or value, for example orange-700 or #FF5000" autoComplete="off" />
          </div>
          <div>
            <label className="lbl" htmlFor="f-layer">Layer</label>
            <select id="f-layer" value={layer} onChange={(e) => setLayer(e.target.value as Layer | "")}>
              <option value="">All</option>
              {(Object.keys(LAYER_LABEL) as Layer[]).map((l) => <option key={l} value={l}>{LAYER_LABEL[l]}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="f-kind">Type</label>
            <select id="f-kind" value={kind} onChange={(e) => setKind(e.target.value as Kind | "")}>
              <option value="">All</option>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="f-comp">Component</label>
            <select id="f-comp" value={component} onChange={(e) => setComponent(e.target.value)}>
              <option value="">All</option>
              {components.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="f-status">Status</label>
            <select id="f-status" value={status} onChange={(e) => setStatus(e.target.value as Status | "")}>
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="deprecated">Deprecated</option>
            </select>
          </div>
        </div>

        <div className="table-bar">
          <span>
            <span className="count">{rows.length}</span> of {set.tokens.length} tokens
            {anyFilter ? (
              <button type="button" className="link" onClick={() => { setQ(""); setLayer(""); setKind(""); setComponent(""); setStatus(""); }}>
                Clear filters
              </button>
            ) : null}
          </span>
          <span className={problems ? "err" : "sub"}>{problems ? `${problems} rule errors in the set` : "No rule errors"}</span>
          <Link className="button primary" href="/create">New tokens</Link>
        </div>

        <div className="table-scroll">
          <table className="tokens">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Layer and type</th>
                <th scope="col">Light</th>
                <th scope="col">Dark</th>
                <th scope="col">Status</th>
                <th scope="col">Last change</th>
                <th scope="col">In code</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const last = lastChange(history, t.name);
                const errs = errorsFor(t.name);
                return (
                  <tr
                    key={t.name}
                    className={[selected === t.name ? "sel" : "", t.status === "deprecated" ? "dep" : ""].join(" ")}
                    onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, token: t }); }}
                  >
                    <td>
                      <button type="button" className="link tname" onClick={() => setSelected(t.name)}>{t.name}</button>
                      {(t.layer === "component" && !isPublishedInFigma(t)) || errs.length ? (
                        <span className="tags">
                          {t.layer === "component" && !isPublishedInFigma(t) ? <span className="tag">hidden in Figma</span> : null}
                          {errs.length ? <span className={`tag ${errs.some((e) => e.severity === "error") ? "bad" : "warn"}`} title={errs.map((e) => e.message).join("\n")}>{errs.length} {errs.length === 1 ? "issue" : "issues"}</span> : null}
                        </span>
                      ) : null}
                    </td>
                    <td>{LAYER_LABEL[t.layer]} · {KIND_LABEL[t.kind].toLowerCase()}{t.component ? <span className="sub block">{t.component}</span> : null}</td>
                    <td><ValueCell token={t} mode="light" index={index} /></td>
                    <td>{t.layer === "primitive" ? <span className="muted">no modes</span> : <ValueCell token={t} mode="dark" index={index} />}</td>
                    <td><span className={`status ${t.status}`}>{t.status}</span></td>
                    <td>{last ? <><span>{last.action}</span><span className="sub block">{formatDate(last.at)}</span></> : <span className="muted">none</span>}</td>
                    <td><code>{cssVariableName(t)}</code><span className="sub block">{cssFileFor(t)}</span></td>
                    <td>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Actions for ${t.name}`}
                        aria-haspopup="menu"
                        onClick={(e) => {
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setMenu({ x: r.right - 200, y: r.bottom + 4, token: t });
                        }}
                      >
                        ⋯
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length ? <p className="empty">No tokens match these filters.</p> : null}
        </div>
      </section>

      {selectedToken ? (
        <TokenDetails
          token={selectedToken}
          tab={tab}
          onTab={setTab}
          onSelect={setSelected}
          onClose={() => setSelected(null)}
          onEdit={() => setEditing(selectedToken)}
        />
      ) : null}

      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.token)} label={`Actions for ${menu.token.name}`} onClose={() => setMenu(null)} /> : null}

      {editing ? (
        <Dialog title={`Edit ${editing.name}`} onClose={() => setEditing(null)} wide>
          <TokenEditor token={editing} onDone={(saved) => { setEditing(null); if (saved) setToast(`Saved ${saved.name}`); }} />
        </Dialog>
      ) : null}

      {statusChange ? (
        <Dialog title={statusChange.status === "deprecated" ? `Make ${statusChange.name} active again` : `Deprecate ${statusChange.name}`} onClose={() => setStatusChange(null)}>
          <form
            className="editor"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason.trim()) return;
              if (statusChange.status === "deprecated") reactivate(statusChange.name, reason.trim());
              else deprecate(statusChange.name, reason.trim());
              setStatusChange(null);
            }}
          >
            {statusChange.status !== "deprecated" ? (
              <p>
                Deprecated tokens stay in the code and in Figma, but the tool warns when anything points to them.
                {(() => {
                  const n = set.tokens.filter((t) => [t.values.light, t.values.dark].some((v) => v && typeof v === "object" && "ref" in v && v.ref === statusChange.name)).length;
                  return n ? ` ${n} ${n === 1 ? "token points" : "tokens point"} to it directly.` : "";
                })()}
              </p>
            ) : null}
            <label className="lbl" htmlFor="st-reason">Reason (required)</label>
            <input id="st-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" required />
            <div className="bar end">
              <button type="button" className="ghost" onClick={() => setStatusChange(null)}>Cancel</button>
              <button type="submit" className="primary" disabled={!reason.trim()}>
                {statusChange.status === "deprecated" ? "Make active" : "Deprecate"}
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}

      <div className="toast" role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
