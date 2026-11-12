"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Blocks,
  ChevronRight,
  Component,
  FileCode2,
  Layers,
  GitPullRequestArrow,
  Menu,
  Palette,
  PlusCircle,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Layer } from "@/src/lib/tokens";
import { useStore } from "../_lib/store";
import { AccountPanel } from "./AccountPanel";
import { KIND_ORDER, KIND_TITLE, LAYER_TITLE } from "../_lib/sets";

const LAYER_ICON = { primitive: Palette, semantic: Layers, component: Component } as const;

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { set } = useStore();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname === "/" ? params.get("set") ?? "all" : null;

  const count = (pred: (t: (typeof set.tokens)[number]) => boolean) => set.tokens.filter(pred).length;
  const components = [...new Set(set.tokens.map((t) => t.component).filter(Boolean) as string[])].sort();

  const item = (href: string, key: string | null, label: React.ReactNode, n?: number, icon?: React.ReactNode, depth = 0) => {
    const active = key !== null ? current === key : pathname === href;
    return (
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          depth === 1 && "pl-8",
          active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
        )}
      >
        {icon}
        <span className="truncate">{label}</span>
        {n !== undefined ? <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">{n}</span> : null}
      </Link>
    );
  };

  const layerGroup = (layer: Layer) => {
    const Icon = LAYER_ICON[layer];
    const children =
      layer === "component"
        ? components.map((c) => ({ key: `component/${c}`, label: c, n: count((t) => t.component === c) }))
        : KIND_ORDER.map((k) => ({ key: `${layer}/${k}`, label: KIND_TITLE[k], n: count((t) => t.layer === layer && t.kind === k) })).filter((c) => c.n);
    return (
      <Collapsible key={layer} defaultOpen className="group/coll">
        <div className="flex items-center">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent"
              aria-label={`Show or hide ${LAYER_TITLE[layer]}`}
            >
              <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/coll:rotate-90" />
            </button>
          </CollapsibleTrigger>
          <div className="min-w-0 flex-1">
            {item(`/?set=${layer}`, layer, LAYER_TITLE[layer], count((t) => t.layer === layer), <Icon className="size-4 text-muted-foreground" />)}
          </div>
        </div>
        <CollapsibleContent className="flex flex-col gap-0.5 py-0.5">
          {children.map((c) => item(`/?set=${c.key}`, c.key, c.label, c.n, undefined, 1))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Blocks className="size-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Token tool</div>
          <div className="text-[11px] text-muted-foreground">UAL design system</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-2" aria-label="Main">
        {item("/?set=all", "all", "All tokens", set.tokens.length, <Table2 className="size-4 text-muted-foreground" />)}
        {item("/create", null, "Create tokens", undefined, <PlusCircle className="size-4 text-muted-foreground" />)}
        {item("/push", null, "Push to code", undefined, <GitPullRequestArrow className="size-4 text-muted-foreground" />)}
        {item("/export", null, "Export CSS", undefined, <FileCode2 className="size-4 text-muted-foreground" />)}
      </nav>

      <div className="mt-5 px-4 pb-1 text-[11px] font-medium text-muted-foreground">Token sets</div>
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4" aria-label="Token sets">
        {(["primitive", "semantic", "component"] as const).map(layerGroup)}
      </nav>

      <AccountPanel />
    </div>
  );
}

export function AppSidebar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <SidebarBody />
      </aside>
      <div className="fixed left-3 top-3 z-40 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Open menu">
              <Menu className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-sidebar p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
