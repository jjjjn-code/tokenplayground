"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  checkBeforeSave,
  COMPONENT_CATEGORIES,
  DEFAULT_FIGMA_GROUP,
  figmaPath,
  FORBIDDEN_STATES,
  generateComponentTokens,
  indexTokens,
  normaliseComponentName,
  slug,
  SUGGESTED_ROLES,
  SUGGESTED_STATES,
  type Issue,
  type Token,
} from "@/src/lib/tokens";
import { useStore } from "../_lib/store";
import { IssueList } from "./ui";
import { ValuePicker } from "./ValuePicker";

interface Chip {
  v: string;
  on: boolean;
  locked?: boolean;
  custom?: boolean;
}

type Step = "matrix" | "tokens" | "review";

/**
 * Component token creation (F2), carried over from the token namer:
 * name, chips, matrix, light and dark mapping, review, save.
 */
export function ComponentCreator() {
  const { set, saveTokens } = useStore();
  const router = useRouter();
  const index = useMemo(() => indexTokens(set), [set]);

  const [rawName, setRawName] = useState("");
  const [group, setGroup] = useState(DEFAULT_FIGMA_GROUP);
  const [cats, setCats] = useState<Chip[]>(COMPONENT_CATEGORIES.map((v) => ({ v, on: v !== "icon" })));
  const [roles, setRoles] = useState<Chip[]>(SUGGESTED_ROLES.map((v) => ({ v, on: false })));
  const [states, setStates] = useState<Chip[]>(
    SUGGESTED_STATES.map((v) => ({ v, on: ["default", "hover", "pressed", "disabled"].includes(v), locked: v === "default" })),
  );
  const [roleAdd, setRoleAdd] = useState("");
  const [stateAdd, setStateAdd] = useState("");
  const [stateMsg, setStateMsg] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [mapping, setMapping] = useState<Record<string, { light?: string; dark?: string }>>({});
  const [step, setStep] = useState<Step>("matrix");
  const [reason, setReason] = useState("");

  const { slug: component, changed } = normaliseComponentName(rawName);
  const on = (a: Chip[]) => a.filter((c) => c.on).map((c) => c.v);
  const C = on(cats);
  const R = on(roles);
  const S = on(states);

  const list = generateComponentTokens({ component: component || "component", categories: C, roles: R, states: S, excluded });

  const candidates: Token[] = list.map((t) => ({
    name: t.name,
    layer: "component",
    kind: "color",
    component: component || "component",
    values: {
      light: mapping[t.name]?.light ? { ref: mapping[t.name]!.light! } : "",
      dark: mapping[t.name]?.dark ? { ref: mapping[t.name]!.dark! } : "",
    },
    status: "draft",
  }));

  // Colour tokens a component token may point to: primitives and semantic tokens.
  const colourTargets = set.tokens.filter((t) => t.kind === "color" && t.layer !== "component" && t.status !== "deprecated");

  const existing = set.tokens.filter((t) => t.component === component);
  const { ok, issues } = checkBeforeSave(set, candidates);
  const extra: Issue[] = [];
  if (!component) extra.push({ severity: "error", code: "component.name", message: "Add a component name. Previews use the placeholder \"component\"." });
  if (component && changed) extra.push({ severity: "info", code: "component.normalised", message: `Name normalised to "${component}". Confirm this is what developers expect in code.` });
  if (existing.length) extra.push({ severity: "info", code: "component.exists", message: `${component} already has ${existing.length} tokens. New tokens are added to them; names that already exist are blocked.` });
  if (!list.length) extra.push({ severity: "error", code: "component.empty", message: "No tokens to create. Pick at least 1 category and tick at least 1 cell." });

  const unmapped = candidates.filter((t) => t.values.light === "" || t.values.dark === "").length;
  // Collapse the per-token "missing a value" errors into 1 line.
  const shown = issues.filter((i) => i.code !== "value.empty");
  if (unmapped) extra.push({ severity: "error", code: "value.empty", message: `${unmapped} of ${list.length} tokens are missing a token in light, dark or both.` });

  const published = list.filter((t) => t.state === "default").length;
  const summary: Issue = {
    severity: "info",
    code: "summary",
    message: `${list.length} tokens will be created (${C.map((c) => `${c} ${list.filter((t) => t.category === c).length}`).join(", ") || "none"}). ${published} published in Figma, ${list.length - published} hidden.`,
  };
  const allIssues = [...extra, ...shown, summary];
  const canSave = ok && !!component && list.length > 0;

  const toggle = (setter: React.Dispatch<React.SetStateAction<Chip[]>>, i: number) =>
    setter((a) => a.map((c, n) => (n === i && !c.locked ? { ...c, on: !c.on } : c)));

  const addChip = (setter: React.Dispatch<React.SetStateAction<Chip[]>>, value: string, clear: () => void, isState: boolean) => {
    const v = slug(value);
    if (!v) return;
    if (isState && (FORBIDDEN_STATES as readonly string[]).includes(v)) {
      setStateMsg("There are no focus tokens. Focus uses the system default.");
      clear();
      return;
    }
    setStateMsg("");
    setter((a) => (a.some((c) => c.v === v) ? a.map((c) => (c.v === v ? { ...c, on: true } : c)) : [...a, { v, on: true, custom: true }]));
    clear();
  };

  const rows = R.length ? C.flatMap((c) => R.map((r) => ({ c, r: r as string | undefined }))) : C.map((c) => ({ c, r: undefined as string | undefined }));

  const setMap = (name: string, mode: "light" | "dark", v: string) => setMapping((m) => ({ ...m, [name]: { ...m[name], [mode]: v || undefined } }));

  const save = () => {
    if (!canSave) return;
    saveTokens(candidates, [], reason);
    router.push(`/?component=${component}`);
  };

  // Called as a function (not a component) so chips keep focus between renders.
  const chipRow = (items: Chip[], setter: React.Dispatch<React.SetStateAction<Chip[]>>, label: string) => (
    <div className="chips" role="group" aria-label={label}>
      {items.map((c, i) => (
        <button
          key={c.v}
          type="button"
          className={c.custom ? "chip custom" : "chip"}
          aria-pressed={c.on}
          disabled={c.locked}
          onClick={() => toggle(setter, i)}
          title={c.locked ? "Always included" : undefined}
        >
          {c.v}
          {c.locked ? " *" : ""}
        </button>
      ))}
    </div>
  );

  return (
    <div className="creator">
      <div className="panel left">
        <fieldset>
          <label className="lbl" htmlFor="cname">Component name</label>
          <p className="hint">1 word if possible. Spaces and capitals are stripped, so &quot;Icon button&quot; becomes iconbutton.</p>
          <input type="text" id="cname" value={rawName} onChange={(e) => setRawName(e.target.value)} placeholder="button" autoComplete="off" />
          {changed && component ? <p className="hint note">Will be saved as <span className="tname">{component}</span>.</p> : null}
        </fieldset>

        <fieldset>
          <span className="lbl">Category</span>
          <p className="hint">Which part of the component is painted.</p>
          {chipRow(cats, setCats, "Categories")}
        </fieldset>

        <fieldset>
          <span className="lbl">Role</span>
          <p className="hint">Leave all unselected if the component has only 1 variant. The role segment is then omitted.</p>
          {chipRow(roles, setRoles, "Roles")}
          <div className="row">
            <input type="text" aria-label="Custom role" value={roleAdd} onChange={(e) => setRoleAdd(e.target.value)} placeholder="custom role" autoComplete="off"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChip(setRoles, roleAdd, () => setRoleAdd(""), false); } }} />
            <button type="button" className="ghost" onClick={() => addChip(setRoles, roleAdd, () => setRoleAdd(""), false)}>Add</button>
          </div>
        </fieldset>

        <fieldset>
          <span className="lbl">State</span>
          <p className="hint">Default is always included and cannot be removed. There are no focus states.</p>
          {chipRow(states, setStates, "States")}
          <div className="row">
            <input type="text" aria-label="Custom state" value={stateAdd} onChange={(e) => setStateAdd(e.target.value)} placeholder="custom state" autoComplete="off"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChip(setStates, stateAdd, () => setStateAdd(""), true); } }} />
            <button type="button" className="ghost" onClick={() => addChip(setStates, stateAdd, () => setStateAdd(""), true)}>Add</button>
          </div>
          {stateMsg ? <p className="hint err" role="alert">{stateMsg}</p> : null}
        </fieldset>

        <fieldset>
          <label className="lbl" htmlFor="group">Figma group</label>
          <p className="hint">Top-level group the variables sit under.</p>
          <input type="text" id="group" value={group} onChange={(e) => setGroup(e.target.value)} autoComplete="off" />
        </fieldset>
      </div>

      <div className="panel">
        <div className="tabs" role="tablist">
          {(["matrix", "tokens", "review"] as const).map((s) => (
            <button key={s} type="button" role="tab" className="tab" aria-selected={step === s} onClick={() => setStep(s)}>
              {s === "matrix" ? "1. Matrix" : s === "tokens" ? `2. Map tokens${unmapped ? ` (${unmapped} to do)` : ""}` : "3. Review and save"}
            </button>
          ))}
          <span className="tab-count"><span className="count">{list.length}</span> tokens</span>
        </div>

        {step === "matrix" ? (
          <section>
            <p className="hint">Every combination is on by default. Untick the ones this component does not have.</p>
            <div className="bar">
              <button type="button" className="ghost" onClick={() => setExcluded(new Set())}>Tick all</button>
              <button type="button" className="ghost" onClick={() => setExcluded(new Set(list.map((t) => t.key)))}>Untick all</button>
            </div>
            {!C.length || !S.length ? (
              <p className="empty">Select at least 1 category and 1 state.</p>
            ) : (
              <div className="table-scroll">
                <table className="matrix">
                  <thead>
                    <tr><th></th>{S.map((s) => <th key={s} scope="col">{s}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map(({ c, r }) => (
                      <tr key={`${c}-${r}`}>
                        <th scope="row" className="axis">{[c, r].filter(Boolean).join(" · ")}</th>
                        {S.map((s) => {
                          const key = [c, r, s].filter(Boolean).join("|");
                          const isOn = !excluded.has(key);
                          return (
                            <td key={s} className="cellwrap">
                              <button
                                type="button"
                                className={isOn ? "cell on" : "cell off"}
                                aria-pressed={isOn}
                                aria-label={`${[c, r, s].filter(Boolean).join(" ")}`}
                                onClick={() => setExcluded((ex) => { const n = new Set(ex); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                              >
                                {isOn ? "✓" : "–"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="bar end"><button type="button" className="primary" onClick={() => setStep("tokens")}>Next: map tokens</button></div>
          </section>
        ) : null}

        {step === "tokens" ? (
          <section>
            <p className="hint">Point each token to a primitive or semantic token for both modes. Default states are published in Figma; all other states are hidden.</p>
            <div className="bar">
              <button type="button" className="ghost" onClick={() => setMapping((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.light ? { ...v, dark: v.light } : v])))}>
                Copy light mapping into dark
              </button>
            </div>
            {!list.length ? <p className="empty">Nothing generated yet. Add a component name and pick categories.</p> : null}
            {list.map((t, i) => {
              const cand = candidates[i];
              return (
                <div key={t.name} className="tokenrow">
                  <div>
                    <span className="tname">{t.name}</span>
                    <span className="tpath">{figmaPath(cand, group.trim() || DEFAULT_FIGMA_GROUP)}</span>
                    <span className={t.state === "default" ? "pubtag pub" : "pubtag"}>{t.state === "default" ? "published" : "hidden"}</span>
                  </div>
                  <ValuePicker label="Light" value={cand.values.light as "" | { ref: string }} onChange={(v) => setMap(t.name, "light", typeof v === "object" ? v.ref : "")}
                    candidates={colourTargets} index={index} mode="light" allowRaw={false} allowRef />
                  <ValuePicker label="Dark" value={cand.values.dark as "" | { ref: string }} onChange={(v) => setMap(t.name, "dark", typeof v === "object" ? v.ref : "")}
                    candidates={colourTargets} index={index} mode="dark" allowRaw={false} allowRef />
                </div>
              );
            })}
            <div className="bar end"><button type="button" className="primary" onClick={() => setStep("review")}>Next: review</button></div>
          </section>
        ) : null}

        {step === "review" ? (
          <section>
            <IssueList issues={allIssues} />
            <label className="lbl" htmlFor="cr-reason">Reason (optional, saved in the history)</label>
            <input id="cr-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" placeholder="For example: new hover states for the primary button" />
            <div className="bar end">
              <button type="button" className="primary" onClick={save} disabled={!canSave}>
                Create {list.length} tokens
              </button>
            </div>
            {!canSave ? <p className="hint">Fix the errors above to save.</p> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
