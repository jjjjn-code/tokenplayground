"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronUp, Copy, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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

const CATEGORY_HINT: Record<string, string> = {
  surface: "Backgrounds and fills",
  content: "Text",
  line: "Borders and dividers",
  icon: "Icons",
};

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex items-start gap-3">
        <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">{n}</span>
        <div>
          <h2 className="text-sm font-medium leading-5">{title}</h2>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
      <div className="pl-8">{children}</div>
    </section>
  );
}

/**
 * Component token creation (F2), carried over from the token namer, as 2
 * live panes: choices on the left, the generated tokens on the right.
 */
export function ComponentCreator() {
  const { set, saveTokens } = useStore();
  const router = useRouter();
  const index = useMemo(() => indexTokens(set), [set]);

  const [rawName, setRawName] = useState("");
  const [group, setGroup] = useState(DEFAULT_FIGMA_GROUP);
  const [cats, setCats] = useState<Chip[]>(COMPONENT_CATEGORIES.map((v) => ({ v, on: v === "surface" || v === "content" })));
  const [roles, setRoles] = useState<Chip[]>(SUGGESTED_ROLES.map((v) => ({ v, on: false })));
  const [states, setStates] = useState<Chip[]>(
    SUGGESTED_STATES.map((v) => ({ v, on: ["default", "hover", "pressed", "disabled"].includes(v), locked: v === "default" })),
  );
  const [roleAdd, setRoleAdd] = useState("");
  const [stateAdd, setStateAdd] = useState("");
  const [stateMsg, setStateMsg] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [mapping, setMapping] = useState<Record<string, { light?: string; dark?: string }>>({});
  const [reason, setReason] = useState("");
  const [showIssues, setShowIssues] = useState(false);

  const { slug: component, changed } = normaliseComponentName(rawName);
  const on = (a: Chip[]) => a.filter((c) => c.on).map((c) => c.v);
  const C = on(cats);
  const R = on(roles);
  const S = on(states);
  const comp = component || "component";

  const list = generateComponentTokens({ component: comp, categories: C, roles: R, states: S, excluded });
  const candidates: Token[] = list.map((t) => ({
    name: t.name,
    layer: "component",
    kind: "color",
    component: comp,
    values: {
      light: mapping[t.name]?.light ? { ref: mapping[t.name]!.light! } : "",
      dark: mapping[t.name]?.dark ? { ref: mapping[t.name]!.dark! } : "",
    },
    status: "draft",
  }));
  const colourTargets = set.tokens.filter((t) => t.kind === "color" && t.layer !== "component" && t.status !== "deprecated");

  const existing = set.tokens.filter((t) => t.component === component);
  const { ok, issues } = checkBeforeSave(set, candidates);
  const unmapped = candidates.filter((t) => t.values.light === "" || t.values.dark === "").length;
  const extra: Issue[] = [];
  if (!component) extra.push({ severity: "error", code: "component.name", message: "Add a component name." });
  if (component && changed) extra.push({ severity: "info", code: "component.normalised", message: `Name normalised to "${component}". Confirm this is what developers expect in code.` });
  if (existing.length) extra.push({ severity: "info", code: "component.exists", message: `${component} already has ${existing.length} tokens. New tokens are added to them; names that already exist are blocked.` });
  if (!list.length) extra.push({ severity: "error", code: "component.empty", message: "No tokens to create. Pick at least 1 category and tick at least 1 cell." });
  if (unmapped) extra.push({ severity: "error", code: "value.empty", message: `${unmapped} of ${list.length} tokens still need a light and dark value.` });
  const allIssues = [...extra, ...issues.filter((i) => i.code !== "value.empty")];
  const errors = allIssues.filter((i) => i.severity === "error").length;
  const warnings = allIssues.filter((i) => i.severity === "warning").length;
  const canSave = ok && !!component && list.length > 0;
  const published = list.filter((t) => t.state === "default").length;

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

  // Called as a function (not a component) so chips keep focus between renders.
  const chipRow = (items: Chip[], setter: React.Dispatch<React.SetStateAction<Chip[]>>, label: string, hints?: Record<string, string>) => (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {items.map((c, i) => (
        <button
          key={c.v}
          type="button"
          aria-pressed={c.on}
          disabled={c.locked}
          title={c.locked ? "Always included" : hints?.[c.v]}
          onClick={() => toggle(setter, i)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[12.5px] transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
            c.on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
            c.custom && !c.on && "border-dashed",
            c.locked && "cursor-default opacity-90",
          )}
        >
          {c.on ? <Check className="size-3" /> : null}
          {c.v}
        </button>
      ))}
    </div>
  );

  const rows = R.length ? C.flatMap((c) => R.map((r) => ({ c, r: r as string | undefined }))) : C.map((c) => ({ c, r: undefined as string | undefined }));
  const setMap = (name: string, mode: "light" | "dark", v: string) => setMapping((m) => ({ ...m, [name]: { ...m[name], [mode]: v || undefined } }));

  const save = () => {
    if (!canSave) return;
    saveTokens(candidates, [], reason);
    toast.success(`Created ${list.length} ${component} tokens`, { description: "Saved as drafts." });
    router.push(`/?set=component/${component}`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b px-4 py-2 pl-16 md:pl-4">
        <div>
          <h1 className="text-sm font-medium">New component tokens</h1>
          <p className="text-xs text-muted-foreground">Names follow [component]-[category]-[role]-[state].</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" asChild>
          <Link href="/?new=token">New primitive or semantic token instead</Link>
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[360px_minmax(0,1fr)] lg:overflow-hidden">
        {/* Choices */}
        <div className="flex flex-col gap-7 border-b p-5 lg:overflow-y-auto lg:border-r lg:border-b-0">
          <Section n={1} title="Component">
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cname">Name</Label>
                <Input id="cname" value={rawName} onChange={(e) => setRawName(e.target.value)} placeholder="Button" autoComplete="off" />
                <p className="text-xs text-muted-foreground">
                  {changed && component ? (
                    <>Saved as <span className="font-mono text-foreground">{component}</span>. Spaces and capitals are removed.</>
                  ) : (
                    "1 word if possible. Spaces and capitals are removed."
                  )}
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="group">Figma group</Label>
                <Input id="group" value={group} onChange={(e) => setGroup(e.target.value)} autoComplete="off" />
              </div>
            </div>
          </Section>

          <Section n={2} title="Categories" hint="Which parts of the component are painted.">
            {chipRow(cats, setCats, "Categories", CATEGORY_HINT)}
          </Section>

          <Section n={3} title="Roles" hint="Leave all off if the component has only 1 variant. The role is then left out of the name.">
            {chipRow(roles, setRoles, "Roles")}
            <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); addChip(setRoles, roleAdd, () => setRoleAdd(""), false); }}>
              <Input aria-label="Custom role" value={roleAdd} onChange={(e) => setRoleAdd(e.target.value)} placeholder="Add a role" className="h-8 font-mono text-[12.5px]" autoComplete="off" />
              <Button type="submit" variant="outline" size="icon" className="size-8 shrink-0" aria-label="Add role"><Plus className="size-4" /></Button>
            </form>
          </Section>

          <Section n={4} title="States" hint="Default is always included. There are no focus states.">
            {chipRow(states, setStates, "States")}
            <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); addChip(setStates, stateAdd, () => setStateAdd(""), true); }}>
              <Input aria-label="Custom state" value={stateAdd} onChange={(e) => setStateAdd(e.target.value)} placeholder="Add a state" className="h-8 font-mono text-[12.5px]" autoComplete="off" />
              <Button type="submit" variant="outline" size="icon" className="size-8 shrink-0" aria-label="Add state"><Plus className="size-4" /></Button>
            </form>
            {stateMsg ? <p className="mt-2 text-xs text-destructive" role="alert">{stateMsg}</p> : null}
          </Section>

          <Section n={5} title="Combinations" hint="Untick the ones this component does not have.">
            {!C.length || !S.length ? (
              <p className="text-xs text-muted-foreground">Pick at least 1 category and 1 state.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="p-1.5" />
                      {S.map((s) => <th key={s} scope="col" className="p-1.5 text-center font-mono font-normal text-muted-foreground">{s}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ c, r }) => (
                      <tr key={`${c}-${r}`} className="border-t">
                        <th scope="row" className="p-1.5 pl-2 text-left font-mono font-normal whitespace-nowrap">{[c, r].filter(Boolean).join(" · ")}</th>
                        {S.map((s) => {
                          const key = [c, r, s].filter(Boolean).join("|");
                          const isOn = !excluded.has(key);
                          return (
                            <td key={s} className="p-1 text-center">
                              <button
                                type="button"
                                aria-pressed={isOn}
                                aria-label={[c, r, s].filter(Boolean).join(" ")}
                                onClick={() => setExcluded((ex) => { const n = new Set(ex); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                                className={cn(
                                  "inline-flex size-6 items-center justify-center rounded-md border transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                                  isOn ? "border-primary bg-primary text-primary-foreground" : "bg-background text-transparent hover:bg-accent",
                                )}
                              >
                                <Check className="size-3.5" />
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
          </Section>
        </div>

        {/* Live preview and mapping */}
        <div className="flex min-h-0 flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
            <div>
              <div className="text-sm font-medium">{list.length} tokens</div>
              <div className="text-xs text-muted-foreground">{published} published in Figma, {list.length - published} hidden</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setMapping((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.light ? { ...v, dark: v.light } : v])))}
            >
              <Copy className="size-3.5" /> Copy light into dark
            </Button>
          </div>

          <div className="min-h-[240px] flex-1 overflow-auto">
            {!list.length ? (
              <div className="flex flex-col items-center gap-2 py-20 text-sm text-muted-foreground">
                <Sparkles className="size-5" /> Tokens appear here as you make choices.
              </div>
            ) : (
              <table className="sheet-table min-w-[720px]">
                <colgroup>
                  <col />
                  <col style={{ width: 215 }} />
                  <col style={{ width: 215 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Light</th>
                    <th>Dark</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((t, i) => {
                    const cand = candidates[i];
                    return (
                      <tr key={t.name}>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-mono text-[12.5px]">{t.name}</span>
                            <span className={cn("shrink-0 rounded border px-1 text-[10px]", t.state === "default" ? "border-success/40 text-success" : "text-muted-foreground")}>
                              {t.state === "default" ? "published" : "hidden"}
                            </span>
                          </div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground">{figmaPath(cand, group.trim() || DEFAULT_FIGMA_GROUP)}</div>
                        </td>
                        <td className="px-2">
                          <ValuePicker label={`${t.name} light`} value={cand.values.light as "" | { ref: string }} onChange={(v) => setMap(t.name, "light", typeof v === "object" ? v.ref : "")}
                            candidates={colourTargets} index={index} mode="light" allowRaw={false} allowRef />
                        </td>
                        <td className="px-2">
                          <ValuePicker label={`${t.name} dark`} value={cand.values.dark as "" | { ref: string }} onChange={(v) => setMap(t.name, "dark", typeof v === "object" ? v.ref : "")}
                            candidates={colourTargets} index={index} mode="dark" allowRaw={false} allowRef />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Review footer */}
          <Collapsible open={showIssues} onOpenChange={setShowIssues} className="border-t bg-background">
            <CollapsibleContent>
              <div className="max-h-56 overflow-y-auto border-b bg-muted/30 px-5 py-3">
                <IssueList issues={allIssues} okText="No problems found." />
              </div>
            </CollapsibleContent>
            <div className="flex flex-wrap items-center gap-3 px-5 py-3">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <span className={cn("size-2 rounded-full", errors ? "bg-destructive" : warnings ? "bg-warning" : "bg-success")} aria-hidden="true" />
                  {errors ? `${errors} to fix` : "Ready"}
                  {warnings ? `, ${warnings} ${warnings === 1 ? "warning" : "warnings"}` : ""}
                  <ChevronUp className={cn("size-3.5 transition-transform", !showIssues && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
              <Input aria-label="Reason, saved in the history" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional), for example new hover states" className="h-8 min-w-48 flex-1 text-[13px]" autoComplete="off" />
              <Button onClick={save} disabled={!canSave}>Create {list.length} tokens</Button>
            </div>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}
