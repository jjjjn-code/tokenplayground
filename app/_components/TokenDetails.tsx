"use client";

import { useMemo } from "react";
import {
  allDependants,
  cssFileFor,
  cssVariableName,
  directDependants,
  figmaPath,
  formatValue,
  historyFor,
  indexTokens,
  isPublishedInFigma,
  resolveToken,
  type Mode,
  type Token,
} from "@/src/lib/tokens";
import { useStore } from "../_lib/store";
import { formatDate, KIND_LABEL, LAYER_LABEL, resolvedText, Swatch } from "./ui";

export type DetailsTab = "references" | "history";

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  edited: "Edited",
  deprecated: "Deprecated",
  pushed: "Pushed",
  pulled: "Pulled",
  accepted: "Accepted",
  declined: "Declined",
  restored: "Restored",
  synced: "Synced to Figma",
};

/** Side panel for 1 token: where it lives, its references (F3) and its history (F7). */
export function TokenDetails({
  token,
  tab,
  onTab,
  onSelect,
  onClose,
  onEdit,
}: {
  token: Token;
  tab: DetailsTab;
  onTab: (t: DetailsTab) => void;
  onSelect: (name: string) => void;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { set, history } = useStore();
  const index = useMemo(() => indexTokens(set), [set]);
  const direct = directDependants(set, token.name);
  const all = allDependants(set, token.name);
  const indirect = all.filter((n) => !direct.includes(n));
  const timeline = historyFor(history, token.name).reverse();
  const path = figmaPath(token);
  const modes: Mode[] = token.values.dark !== undefined ? ["light", "dark"] : ["light"];

  const Name = ({ n }: { n: string }) => (
    <button type="button" className="link tname" onClick={() => onSelect(n)}>{n}</button>
  );

  return (
    <aside className="details" aria-label={`Details for ${token.name}`}>
      <div className="details-head">
        <div>
          <h2 className="tname">{token.name}</h2>
          <p className="sub">
            {LAYER_LABEL[token.layer]} · {KIND_LABEL[token.kind]}
            {token.component ? ` · ${token.component}` : ""} · {token.status}
          </p>
        </div>
        <div className="bar">
          <button type="button" className="ghost" onClick={onEdit}>Edit</button>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close details">Close</button>
        </div>
      </div>

      {token.description ? <p>{token.description}</p> : null}

      <dl className="facts">
        <dt>In code</dt>
        <dd><code>{cssVariableName(token)}</code><br /><span className="sub">{cssFileFor(token)}</span></dd>
        <dt>Figma</dt>
        <dd>
          {path ? <code>{path}</code> : <span className="sub">Path to confirm</span>}
          <br />
          <span className="sub">{isPublishedInFigma(token) ? "Published" : "Hidden from publishing"}</span>
        </dd>
      </dl>

      <div className="tabs" role="tablist">
        {(["references", "history"] as const).map((t) => (
          <button key={t} type="button" role="tab" className="tab" aria-selected={tab === t} onClick={() => onTab(t)}>
            {t === "references" ? "References" : `History (${timeline.length})`}
          </button>
        ))}
      </div>

      {tab === "references" ? (
        <div role="tabpanel">
          <h3 className="lbl">Points to</h3>
          {modes.map((m) => {
            const v = m === "dark" ? token.values.dark! : token.values.light;
            const r = resolveToken(index, token.name, m);
            return (
              <div key={m} className="chain">
                <span className="mode">{m}</span>
                <span>
                  {r.chain.length > 1 ? (
                    r.chain.map((n, i) => (
                      <span key={n}>
                        {i > 0 ? <span className="arrow"> → </span> : null}
                        {i === 0 ? <span className="tname">{n}</span> : <Name n={n} />}
                      </span>
                    ))
                  ) : r.error || typeof v === "object" ? (
                    <span className="tname">{formatValue(v)}</span>
                  ) : (
                    <span className="sub">Raw value, no reference</span>
                  )}
                  {r.chain.length > 1 || r.error || typeof v === "object" ? <span className="arrow"> = </span> : <span> </span>}
                  <Swatch value={r.value} />
                  <span className={r.error ? "err" : ""}>{r.error ? "broken reference" : resolvedText(r.value)}</span>
                </span>
              </div>
            );
          })}

          <h3 className="lbl">Used by {all.length} {all.length === 1 ? "token" : "tokens"}</h3>
          {!all.length ? <p className="sub">No other token depends on this one.</p> : null}
          {direct.length ? (
            <>
              <p className="sub">Directly</p>
              <ul className="names">{direct.map((n) => <li key={n}><Name n={n} /></li>)}</ul>
            </>
          ) : null}
          {indirect.length ? (
            <>
              <p className="sub">Through other tokens</p>
              <ul className="names">{indirect.map((n) => <li key={n}><Name n={n} /></li>)}</ul>
            </>
          ) : null}
        </div>
      ) : (
        <div role="tabpanel">
          {!timeline.length ? <p className="sub">No recorded changes yet.</p> : null}
          <ol className="timeline">
            {timeline.map((e) => (
              <li key={e.id}>
                <div><b>{ACTION_LABEL[e.action] ?? e.action}</b> by {e.by}</div>
                <div className="sub">{formatDate(e.at)}</div>
                {e.reason ? <div>{e.reason}</div> : null}
                {e.before && e.after && JSON.stringify(e.before.values) !== JSON.stringify(e.after.values) ? (
                  <div className="sub">
                    {formatValue(e.before.values.light)}
                    {e.before.values.dark !== undefined ? ` / ${formatValue(e.before.values.dark)}` : ""} →{" "}
                    {formatValue(e.after.values.light)}
                    {e.after.values.dark !== undefined ? ` / ${formatValue(e.after.values.dark)}` : ""}
                  </div>
                ) : null}
                {e.before && e.after && e.before.status !== e.after.status ? (
                  <div className="sub">Status: {e.before.status} → {e.after.status}</div>
                ) : null}
                {e.prUrl ? <a href={e.prUrl}>Pull request</a> : null}
              </li>
            ))}
          </ol>
          <p className="sub">Restoring an earlier version arrives in phase 4.</p>
        </div>
      )}
    </aside>
  );
}
