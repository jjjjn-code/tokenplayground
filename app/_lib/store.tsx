"use client";

/**
 * The tool's working copy of the token set.
 *
 * Until push arrives in phase 3, changes are kept in this browser
 * (localStorage) in the same DTCG format the token data repo will use.
 * "Reset" throws local changes away and reloads the dummy set.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import rawTokens from "@/data/dummy/tokens.json";
import rawHistory from "@/data/dummy/history.json";
import {
  parseDtcg,
  serialiseDtcg,
  type HistoryAction,
  type HistoryEntry,
  type Token,
  type TokenSet,
} from "@/src/lib/tokens";

const STORAGE_KEY = "token-tool:working-copy:v1";
const AUTHOR_KEY = "token-tool:author";

interface Saved {
  tokens: Record<string, unknown>;
  history: HistoryEntry[];
}

interface Store {
  set: TokenSet;
  history: HistoryEntry[];
  author: string;
  setAuthor: (name: string) => void;
  /** Number of local changes not yet pushed. */
  localChanges: number;
  /** Save new or edited tokens. `replacing` lists names being edited. */
  saveTokens: (tokens: Token[], replacing: string[], reason?: string) => void;
  deprecate: (name: string, reason: string) => void;
  reactivate: (name: string, reason: string) => void;
  reset: () => void;
}

const StoreContext = createContext<Store | null>(null);

const initialSet = () => parseDtcg(structuredClone(rawTokens));
const initialHistory = () => structuredClone(rawHistory) as HistoryEntry[];
const newId = () => `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function readStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // Storage can be blocked; the tool still works for this visit.
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [set, setSet] = useState<TokenSet>(initialSet);
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory);
  const [author, setAuthorState] = useState("designer");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = readStorage<Saved>(STORAGE_KEY);
    if (saved) {
      setSet(parseDtcg(saved.tokens));
      setHistory(saved.history);
    }
    try {
      const a = window.localStorage.getItem(AUTHOR_KEY);
      if (a) setAuthorState(a);
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) writeStorage(STORAGE_KEY, { tokens: serialiseDtcg(set), history } satisfies Saved);
  }, [set, history, loaded]);

  const setAuthor = useCallback((name: string) => {
    setAuthorState(name);
    writeStorage(AUTHOR_KEY, name);
  }, []);

  const log = useCallback(
    (entries: Omit<HistoryEntry, "id" | "at" | "by">[]) => {
      const at = new Date().toISOString();
      setHistory((h) => [...h, ...entries.map((e) => ({ ...e, id: newId(), at, by: author || "unknown" }))]);
    },
    [author],
  );

  const saveTokens = useCallback(
    (tokens: Token[], replacing: string[], reason?: string) => {
      const before = new Map(set.tokens.map((t) => [t.name, t]));
      setSet((s) => {
        const kept = s.tokens.filter((t) => !replacing.includes(t.name));
        // Keep an edited token in its original position.
        const out = [...kept];
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
      log([
        {
          token: name,
          action,
          reason,
          before: { values: prev.values, status: prev.status },
          after: { values: prev.values, status },
        },
      ]);
    },
    [set, log],
  );

  const deprecate = useCallback((name: string, reason: string) => changeStatus(name, "deprecated", "deprecated", reason), [changeStatus]);
  const reactivate = useCallback((name: string, reason: string) => changeStatus(name, "active", "edited", reason), [changeStatus]);

  const reset = useCallback(() => {
    setSet(initialSet());
    setHistory(initialHistory());
  }, []);

  const localChanges = history.length - rawHistory.length;

  const value = useMemo<Store>(
    () => ({ set, history, author, setAuthor, localChanges: Math.max(0, localChanges), saveTokens, deprecate, reactivate, reset }),
    [set, history, author, setAuthor, localChanges, saveTokens, deprecate, reactivate, reset],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
