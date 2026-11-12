"use client";

import { useMemo, useState } from "react";
import { cssFiles, serialiseDtcg } from "@/src/lib/tokens";
import { useStore } from "../_lib/store";

/** Local export, to check the CSS output before push arrives in phase 3. */
export default function ExportPage() {
  const { set } = useStore();
  const files = useMemo(() => cssFiles(set), [set]);
  const [active, setActive] = useState(0);
  const [msg, setMsg] = useState("");
  const file = files[Math.min(active, files.length - 1)];

  const download = (name: string, text: string, type: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="main">
      <div className="page-head">
        <h1>Export CSS</h1>
        <p className="sub">
          A preview of what push will write. Each file only changes inside the managed block. File paths are provisional until confirmed with developers.
        </p>
      </div>
      <div className="tabs" role="tablist">
        {files.map((f, i) => (
          <button key={f.path} type="button" role="tab" className="tab" aria-selected={i === active} onClick={() => setActive(i)}>
            {f.path}
          </button>
        ))}
      </div>
      <div className="bar">
        <button
          type="button"
          className="primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(file.block);
              setMsg("Copied");
            } catch {
              setMsg("Copy failed");
            }
            setTimeout(() => setMsg(""), 1500);
          }}
        >
          Copy
        </button>
        <button type="button" className="ghost" onClick={() => download(file.path.split("/").pop()!, file.block + "\n", "text/css")}>Download this file</button>
        <button type="button" className="ghost" onClick={() => download("tokens.json", JSON.stringify(serialiseDtcg(set), null, 2) + "\n", "application/json")}>
          Download token data (JSON)
        </button>
        <span role="status" className="sub">{msg}</span>
      </div>
      <pre className="code" tabIndex={0} aria-label={`Generated CSS for ${file.path}`}>{file.block}</pre>
    </main>
  );
}
