"use client";

/**
 * The tool's working copy of the token set.
 *
 * Local mode (no GitHub set up): changes are kept in this browser, as in phase 2.
 * GitHub and demo mode: tokens load from the token data repo. Edits are held
 * here as unsaved changes until the person saves, which writes 1 commit. If
 * someone else saved first, the person's edits are reapplied on top of the
 * newer version and any token both people changed is reported.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import rawTokens from "@/data/dummy/tokens.json";
import rawHistory from "@/data/dummy/history.json";
import {
  mergeEdits,
  renameToken,
  parseDtcg,
  serialiseDtcg,
  type HistoryAction,
  type HistoryEntry,
  type Token,
  type TokenSet,
} from "@/src/lib/tokens";

export type Mode = "loading" | "local" | "demo" | "github";

export interface Viewer {
  login: string;
  name: string;
  avatar: string;
}

export interface LastPush {
  at: string;
  by: string;
  prUrl: string | null;
  branch: string | null;
  title: string;
}

export interface SaveResult {
  ok: boolean;
  /** Tokens both you and someone else changed, after a conflict. */
  conflicts?: string[];
  message?: string;
}

interface Store {
  mode: Mode;
  viewer: Viewer | null;
  repos: { data: string; code: string; codeBranch: string } | null;
  /** A problem loading from GitHub, shown instead of the tokens. */
  loadError: string | null;
  /** True once the tokens to show are known (local set, or loaded from GitHub). */
  ready: boolean;
  /** The saved version loaded from GitHub. Changes after each save or reload. */
  savedHead: string | null;
  set: TokenSet;
  history: HistoryEntry[];
  lastPush: LastPush | null;
  author: string;
  setAuthor: (name: string) => void;
  /** Local mode: changes since the dummy set. GitHub mode: unsaved tokens. */
  localChanges: number;
  unsavedNames: string[];
  saveTokens: (tokens: Token[], replacing: string[], reason?: string) => void;
  deprecate: (name: string, reason: string) => void;
  /** Rename a token and repoint every reference to it. */
  rename: (from: string, to: string, reason?: string) => void;
  reactivate: (name: string, reason: string) => void;
  /** Change a token between draft and active, without a reason. */
  setStatus: (name: string, status: "draft" | "active") => void;
  reset: () => void;
  saveToRepo: (message: string) => Promise<SaveResult>;
  saving: boolean;
  /** Load the saved tokens again; pass `head` to read an exact version just written. */
  reload: (head?: string) => Promise<void>;
  /** Put a token back to the values it had in an earlier version (F7). */
  restoreVersion: (name: string, values: Token["values"], reason: string) => void;
  /** After a push: take the new saved version straight from the push result. */
  applyPush: (r: { dataHead: string; history: HistoryEntry[]; lastPush: LastPush }) => void;
  signOut: () => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

const LOCAL_KEY = "token-tool:working-copy:v1";
const AUTHOR_KEY = "token-tool:author";
const draftKey = (repo: string) => `token-tool:draft:${repo}`;

const initialSet = () => parseDtcg(structuredClone(rawTokens));
const initialHistory = () => structuredClone(rawHistory) as HistoryEntry[];
const newId = () => `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // Storage can be blocked; the tool still works for this visit.
  }
}

interface Draft {
  head: string;
  base: Record<string, unknown>;
  tokens: Record<string, unknown>;
  pending: HistoryEntry[];
}

interface Remote {
  head: string;
  saved: TokenSet;
  savedHistory: HistoryEntry[];
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [repos, setRepos] = useState<Store["repos"]>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [set, setSet] = useState<TokenSet>(initialSet);
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory);
  const [pending, setPending] = useState<HistoryEntry[]>([]);
  const [remote, setRemote] = useState<Remote | null>(null);
  const [lastPush, setLastPush] = useState<LastPush | null>(null);
  const [authorState, setAuthorState] = useState("designer");
  const [saving, setSaving] = useState(false);
  const loaded = useRef(false);

  const remoteMode = mode === "demo" || mode === "github";
  const author = remoteMode && viewer ? viewer.login : authorState;

  const fetchData = useCallback(async (head?: string) => {
    const res = await fetch(head ? `/api/data?head=${head}` : "/api/data", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message ?? "The tokens cannot load.");
    return body as { head: string; tokens: Record<string, unknown>; history: HistoryEntry[]; lastPush: (LastPush & { tokens: unknown }) | null };
  }, []);

  const applyRemote = useCallback(
    (data: Awaited<ReturnType<typeof fetchData>>, dataRepo: string) => {
      const saved = parseDtcg(data.tokens);
      setRemote({ head: data.head, saved, savedHistory: data.history });
      setLastPush(data.lastPush ? { at: data.lastPush.at, by: data.lastPush.by, prUrl: data.lastPush.prUrl, branch: data.lastPush.branch, title: data.lastPush.title } : null);
      // Reapply unsaved edits from an earlier visit.
      const draft = read<Draft>(draftKey(dataRepo));
      if (draft) {
        const base = parseDtcg(draft.base);
        const mine = parseDtcg(draft.tokens);
        const merged = draft.head === data.head ? mine : mergeEdits(base, mine, saved).merged;
        setSet(merged);
        setPending(draft.pending);
        setHistory([...data.history, ...draft.pending]);
      } else {
        setSet(saved);
        setPending([]);
        setHistory(data.history);
      }
    },
    [],
  );

  const load = useCallback(async () => {
    setLoadError(null);
    let session: { mode: Mode; viewer: Viewer | null; dataRepo: string | null; codeRepo: string | null; codeBranch: string };
    try {
      session = await (await fetch("/api/session", { cache: "no-store" })).json();
    } catch {
      session = { mode: "local", viewer: null, dataRepo: null, codeRepo: null, codeBranch: "main" };
    }
    setViewer(session.viewer);
    setRepos(session.dataRepo && session.codeRepo ? { data: session.dataRepo, code: session.codeRepo, codeBranch: session.codeBranch } : null);

    if (session.mode === "local") {
      const saved = read<{ tokens: Record<string, unknown>; history: HistoryEntry[] }>(LOCAL_KEY);
      if (saved) {
        setSet(parseDtcg(saved.tokens));
        setHistory(saved.history);
      }
      setMode("local");
      return;
    }
    setMode(session.mode);
    if (!session.viewer) return; // signed out: the sidebar offers sign-in
    try {
      applyRemote(await fetchData(), session.dataRepo!);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "The tokens cannot load.");
    }
  }, [applyRemote, fetchData]);

  useEffect(() => {
    try {
      const a = window.localStorage.getItem(AUTHOR_KEY);
      if (a) setAuthorState(a);
    } catch {
      // ignore
    }
    void load().then(() => {
      loaded.current = true;
    });
  }, [load]);

  // Persist: local mode keeps the whole working copy; GitHub mode keeps unsaved edits as a draft.
  useEffect(() => {
    if (!loaded.current) return;
    if (mode === "local") write(LOCAL_KEY, { tokens: serialiseDtcg(set), history });
    if (remoteMode && remote && repos) {
      const dirty = !same(set, remote.saved) || pending.length > 0;
      write(draftKey(repos.data), dirty ? ({ head: remote.head, base: serialiseDtcg(remote.saved), tokens: serialiseDtcg(set), pending } satisfies Draft) : null);
    }
  }, [set, history, pending, remote, mode, remoteMode, repos]);

  const setAuthor = useCallback((name: string) => {
    setAuthorState(name);
    write(AUTHOR_KEY, name);
  }, []);

  const log = useCallback(
    (entries: Omit<HistoryEntry, "id" | "at" | "by">[]) => {
      const at = new Date().toISOString();
      const full = entries.map((e) => ({ ...e, id: newId(), at, by: author || "unknown" }));
      setHistory((h) => [...h, ...full]);
      if (remoteMode) setPending((p) => [...p, ...full]);
    },
    [author, remoteMode],
  );

  const saveTokens = useCallback(
    (tokens: Token[], replacing: string[], reason?: string) => {
      const before = new Map(set.tokens.map((t) => [t.name, t]));
      setSet((s) => {
        const out = s.tokens.filter((t) => !replacing.includes(t.name));
        for (const t of tokens) {
          const i = s.tokens.findIndex((x) => x.name === t.name);
          if (i === -1) out.push(t);
          else out.splice(Math.min(i, out.length), 0, t);
        }
        return { tokens: out };
      });
      log(
        tokens.map((t) => {
          const prev = before.get(t.name);
          const action: HistoryAction = prev && replacing.includes(t.name) ? "edited" : "created";
          return {
            token: t.name,
            action,
            reason: reason?.trim() || undefined,
            before: prev ? { values: prev.values, status: prev.status } : undefined,
            after: { values: t.values, status: t.status },
          };
        }),
      );
    },
    [set, log],
  );

  const changeStatus = useCallback(
    (name: string, status: Token["status"], action: HistoryAction, reason: string) => {
      const prev = set.tokens.find((t) => t.name === name);
      if (!prev) return;
      setSet((s) => ({ tokens: s.tokens.map((t) => (t.name === name ? { ...t, status } : t)) }));
      log([{ token: name, action, reason, before: { values: prev.values, status: prev.status }, after: { values: prev.values, status } }]);
    },
    [set, log],
  );

  const deprecate = useCallback((name: string, reason: string) => changeStatus(name, "deprecated", "deprecated", reason), [changeStatus]);

  const rename = useCallback(
    (from: string, to: string, reason?: string) => {
      const res = renameToken(set, from, to);
      const before = new Map(set.tokens.map((t) => [t.name, t]));
      setSet(res.set);
      log([
        { token: to, action: "renamed", from, reason: reason?.trim() || `Renamed from ${from}` },
        ...res.repointed
          .filter((n) => n !== to)
          .map((n) => {
            const prev = before.get(n)!;
            const now = res.set.tokens.find((t) => t.name === n)!;
            return {
              token: n,
              action: "edited" as HistoryAction,
              reason: `Points to the renamed token ${to} (was ${from})`,
              before: { values: prev.values, status: prev.status },
              after: { values: now.values, status: now.status },
            };
          }),
      ]);
    },
    [set, log],
  );
  const reactivate = useCallback((name: string, reason: string) => changeStatus(name, "active", "edited", reason), [changeStatus]);
  const setStatus = useCallback(
    (name: string, status: "draft" | "active") => changeStatus(name, status, "edited", status === "draft" ? "Put back to draft" : "Made active"),
    [changeStatus],
  );

  /** Local mode: back to the dummy set. GitHub mode: throw away unsaved edits. */
  const reset = useCallback(() => {
    if (remoteMode && remote) {
      setSet(remote.saved);
      setHistory(remote.savedHistory);
      setPending([]);
      return;
    }
    setSet(initialSet());
    setHistory(initialHistory());
  }, [remoteMode, remote]);

  const saveToRepo = useCallback(
    async (message: string): Promise<SaveResult> => {
      if (!remote || !repos) return { ok: false, message: "GitHub is not connected." };
      setSaving(true);
      try {
        const res = await fetch("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedHead: remote.head, tokens: serialiseDtcg(set), history: [...remote.savedHistory, ...pending], message }),
        });
        const body = await res.json();
        if (res.status === 409) {
          // Someone else saved first: reapply these edits on their version.
          const theirs = await fetchData();
          const theirSet = parseDtcg(theirs.tokens);
          const { merged, conflicts } = mergeEdits(remote.saved, set, theirSet);
          setRemote({ head: theirs.head, saved: theirSet, savedHistory: theirs.history });
          setSet(merged);
          setHistory([...theirs.history, ...pending]);
          return { ok: false, conflicts, message: "A different person saved changes." };
        }
        if (!res.ok) return { ok: false, message: body.message ?? "Try again." };
        const savedHistory = body.history as HistoryEntry[];
        setRemote({ head: body.head, saved: set, savedHistory });
        setHistory(savedHistory);
        setPending([]);
        return { ok: true };
      } catch {
        return { ok: false, message: "There is a problem with the server connection. Your changes are kept on this page. Try again later." };
      } finally {
        setSaving(false);
      }
    },
    [remote, repos, set, pending, fetchData],
  );

  const reload = useCallback(async (head?: string) => {
    if (!repos) return;
    try {
      applyRemote(await fetchData(head), repos.data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "The tokens cannot load.");
    }
  }, [repos, applyRemote, fetchData]);

  const applyPush = useCallback((r: { dataHead: string; history: HistoryEntry[]; lastPush: LastPush }) => {
    setRemote((rem) => (rem ? { ...rem, head: r.dataHead, savedHistory: r.history } : rem));
    setHistory([...r.history, ...pending]);
    setLastPush({ at: r.lastPush.at, by: r.lastPush.by, prUrl: r.lastPush.prUrl, branch: r.lastPush.branch, title: r.lastPush.title });
  }, [pending]);

  const restoreVersion = useCallback(
    (name: string, values: Token["values"], reason: string) => {
      const prev = set.tokens.find((t) => t.name === name);
      if (!prev) return;
      setSet((s) => ({ tokens: s.tokens.map((t) => (t.name === name ? { ...t, values } : t)) }));
      log([{ token: name, action: "restored", reason, before: { values: prev.values, status: prev.status }, after: { values, status: prev.status } }]);
    },
    [set, log],
  );

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }, []);

  const unsavedNames = useMemo(() => {
    if (mode === "local") return [];
    if (!remote) return [];
    const saved = new Map(remote.saved.tokens.map((t) => [t.name, t]));
    const now = new Map(set.tokens.map((t) => [t.name, t]));
    const names = new Set<string>();
    for (const t of set.tokens) if (!same(saved.get(t.name), t)) names.add(t.name);
    for (const t of remote.saved.tokens) if (!now.has(t.name)) names.add(t.name);
    return [...names];
  }, [mode, remote, set]);

  const ready = mode === "local" || (remoteMode && !!remote);
  const localChanges = remoteMode ? unsavedNames.length : Math.max(0, history.length - rawHistory.length);

  const value = useMemo<Store>(
    () => ({
      mode,
      viewer,
      repos,
      loadError,
      ready,
      savedHead: remote?.head ?? null,
      set,
      history,
      lastPush,
      author,
      setAuthor,
      localChanges,
      unsavedNames,
      saveTokens,
      deprecate,
      rename,
      reactivate,
      setStatus,
      reset,
      saveToRepo,
      saving,
      reload,
      restoreVersion,
      applyPush,
      signOut,
    }),
    [mode, viewer, repos, loadError, ready, remote, set, history, lastPush, author, setAuthor, localChanges, unsavedNames, saveTokens, deprecate, rename, reactivate, setStatus, reset, saveToRepo, saving, reload, restoreVersion, applyPush, signOut],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
