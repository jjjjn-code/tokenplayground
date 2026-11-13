"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { toast } from "sonner";
import { FlaskConical, Loader2, LogIn, LogOut, Moon, RotateCcw, Save, Sun, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useStore } from "../_lib/store";

/** Bottom of the sidebar: who you are, unsaved changes and the save button. */
export function AccountPanel() {
  const { mode, viewer, repos, author, setAuthor, localChanges, unsavedNames, reset, saveToRepo, saving, signOut } = useStore();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [conflicts, setConflicts] = useState<string[] | null>(null);
  useEffect(() => setMounted(true), []);

  const remote = mode === "demo" || mode === "github";
  const n = unsavedNames.length;

  const themeButton = (
    <Button
      variant="outline"
      size="icon"
      className="size-8 shrink-0"
      aria-label="Switch light or dark interface"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {mounted && resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );

  const save = async () => {
    const res = await saveToRepo(message.trim() || `Update ${n} ${n === 1 ? "token" : "tokens"}`);
    if (res.ok) {
      toast.success(`${n} ${n === 1 ? "change is" : "changes are"} saved.`, { description: repos ? `Saved to ${repos.data} as 1 commit.` : undefined });
      setOpen(false);
      setMessage("");
    } else if (res.conflicts) {
      setOpen(false);
      setConflicts(res.conflicts);
    } else {
      toast.error("Your changes are not saved.", { description: res.message });
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-sidebar-border p-3">
      {mode === "demo" ? (
        <div className="flex items-start gap-2 rounded-md bg-warning/10 px-2 py-1.5 text-[11px] leading-snug text-foreground">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-warning" />
          Demo mode: a fake GitHub inside the tool. It resets when the server restarts.
        </div>
      ) : null}

      {remote && viewer ? (
        <div className="grid gap-2">
          <div className={cn("text-xs", n ? "font-medium text-foreground" : "text-muted-foreground")}>
            {n ? `${n} unsaved ${n === 1 ? "change" : "changes"}` : "All changes saved"}
          </div>
          {n ? (
            <div className="flex gap-1.5">
              <Button size="sm" className="h-8 flex-1" onClick={() => setOpen(true)} disabled={saving}>
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                aria-label="Discard unsaved changes"
                onClick={() => {
                  if (window.confirm(`Delete ${n} unsaved ${n === 1 ? "change" : "changes"}? You cannot undo this.`)) reset();
                }}
              >
                <Undo2 className="size-3.5" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "local" ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={cn("text-muted-foreground", localChanges && "text-foreground")}>
            {localChanges ? `${localChanges} local ${localChanges === 1 ? "change" : "changes"}` : "No local changes"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              if (window.confirm("Delete all local changes and load the dummy token set again? You cannot undo this.")) reset();
            }}
          >
            <RotateCcw className="size-3.5" /> Reset
          </Button>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {remote && viewer ? (
          <>
            {viewer.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewer.avatar} alt="" className="size-7 shrink-0 rounded-full" />
            ) : (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">{viewer.login.slice(0, 1)}</span>
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-xs font-medium">{viewer.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">@{viewer.login}</div>
            </div>
            {mode === "github" ? (
              <Button variant="ghost" size="icon" className="size-8" aria-label="Sign out" onClick={() => void signOut()}>
                <LogOut className="size-4" />
              </Button>
            ) : null}
          </>
        ) : mode === "github" ? (
          <Button size="sm" className="h-8 flex-1" asChild>
            <a href="/api/auth/login"><LogIn className="size-3.5" /> Sign in with GitHub</a>
          </Button>
        ) : (
          <>
            <label htmlFor="author" className="shrink-0 text-xs text-muted-foreground">You are</label>
            <Input id="author" value={author} onChange={(e) => setAuthor(e.target.value)} className="h-8 text-xs" autoComplete="off" />
          </>
        )}
        {themeButton}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save {n} {n === 1 ? "change" : "changes"}</DialogTitle>
            <DialogDescription>
              Your changes are saved to {repos?.data ?? "the token data repo"} as 1 commit. Saving does not change the code. To change the code, use Push to code.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-[12px]">
            {unsavedNames.map((t) => <li key={t} className="truncate py-0.5">{t}</li>)}
          </ul>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="save-msg">What changed <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="save-msg" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={`Update ${n} ${n === 1 ? "token" : "tokens"}`} autoComplete="off" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : null} Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!conflicts} onOpenChange={(o) => !o && setConflicts(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>A different person saved changes</DialogTitle>
            <DialogDescription>
              A different person saved changes to {repos?.data ?? "the token data repo"}. Your changes are added to their version. You did not lose your changes.
            </DialogDescription>
          </DialogHeader>
          {conflicts?.length ? (
            <div className="grid gap-2 text-sm">
              <p>{conflicts.length === 1 ? "You and the other person changed this token. Your version is kept. Examine the token, then save again." : "You and the other person changed these tokens. Your versions are kept. Examine the tokens, then save again."}</p>
              <ul className="rounded-md border bg-muted/30 p-2 font-mono text-[12px]">
                {conflicts.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
          ) : (
            <p className="text-sm">The other person did not change your tokens. You can save again now.</p>
          )}
          <DialogFooter>
            <Button onClick={() => setConflicts(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
