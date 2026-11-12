"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "../_lib/store";

export function Header() {
  const { author, setAuthor, localChanges, reset } = useStore();
  const path = usePathname();
  const links = [
    { href: "/", label: "Overview" },
    { href: "/create", label: "Create" },
    { href: "/export", label: "Export CSS" },
  ];
  return (
    <header className="site">
      <div className="brand">
        <span className="title">Token tool</span>
        <nav aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>{l.label}</Link>
          ))}
        </nav>
      </div>
      <div className="who">
        <span className="sub" title="Changes are kept in this browser until push to the repo arrives in phase 3.">
          {localChanges ? `${localChanges} local ${localChanges === 1 ? "change" : "changes"}, not pushed` : "No local changes"}
        </span>
        <button
          type="button"
          className="link"
          onClick={() => {
            if (window.confirm("Throw away every local change and reload the dummy token set?")) reset();
          }}
        >
          Reset
        </button>
        <label className="sub" htmlFor="author">You are</label>
        <input id="author" type="text" value={author} onChange={(e) => setAuthor(e.target.value)} autoComplete="off" />
      </div>
    </header>
  );
}
