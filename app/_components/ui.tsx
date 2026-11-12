"use client";

import { AlertTriangle, CircleCheck, CircleX, Info, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Issue, Status } from "@/src/lib/tokens";

const HEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
export const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

/** A colour chip. Empty when the value is not a colour. */
export function Swatch({ value, size = "md", className }: { value: unknown; size?: "sm" | "md" | "lg"; className?: string }) {
  const dims = size === "sm" ? "size-3.5" : size === "lg" ? "size-8" : "size-5";
  if (!isHex(value)) return null;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 rounded-[5px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)]", dims, className)}
      style={{ background: value }}
    />
  );
}

/** A reference shown as a pill, the way aliases appear in Tokens Studio and Figma. */
export function AliasPill({ name, broken, className }: { name: string; broken?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded-md border bg-muted/60 px-1.5 py-0.5 font-mono text-[12px] leading-none",
        broken && "border-destructive/40 text-destructive",
        className,
      )}
    >
      <Link2 className="size-3 shrink-0 opacity-60" aria-hidden="true" />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function resolvedText(v: unknown): string {
  if (v === null || v === undefined) return "unresolved";
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, p]) => `${k} ${String(p)}`)
      .join(" · ");
  }
  return String(v);
}

const STATUS_STYLE: Record<Status, string> = {
  active: "bg-success",
  draft: "bg-warning",
  deprecated: "bg-muted-foreground/50",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] capitalize", status === "deprecated" ? "text-muted-foreground" : "text-foreground")}>
      <span className={cn("size-1.5 rounded-full", STATUS_STYLE[status])} aria-hidden="true" />
      {status}
    </span>
  );
}

const ISSUE_ICON = { error: CircleX, warning: AlertTriangle, info: Info } as const;
const ISSUE_TONE = {
  error: "text-destructive",
  warning: "text-warning",
  info: "text-muted-foreground",
} as const;

export function IssueList({ issues, okText, className }: { issues: Issue[]; okText?: string; className?: string }) {
  const order = { error: 0, warning: 1, info: 2 };
  if (!issues.length) {
    return okText ? (
      <div className={cn("flex items-center gap-2 text-sm text-success", className)}>
        <CircleCheck className="size-4" /> {okText}
      </div>
    ) : null;
  }
  return (
    <ul className={cn("flex flex-col gap-1.5", className)} aria-live="polite">
      {[...issues]
        .sort((a, b) => order[a.severity] - order[b.severity])
        .map((i, n) => {
          const Icon = ISSUE_ICON[i.severity];
          return (
            <li key={n} className="flex gap-2 text-[13px] leading-snug">
              <Icon className={cn("mt-0.5 size-4 shrink-0", ISSUE_TONE[i.severity])} aria-label={i.severity === "info" ? "note" : i.severity} />
              <span>{i.message}</span>
            </li>
          );
        })}
    </ul>
  );
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function relativeDate(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return iso;
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
